"""
Audit and Verification of Historical M15 Structural Stops for 66 Replay Opportunities
====================================================================================
Path: Begonya/research/hybrid_replay/audit_structural_stops.py

Strict No-Lookahead Rules:
1. Swings are detected ONLY using M15 candles closed at or before signal_known_timestamp.
2. A 5-bar fractal swing formed at index i is confirmed only when bar i+2 closes.
   Therefore, confirmed_timestamp = candle[i+2].timestamp + 15m.
   Constraint: confirmed_timestamp <= signal_known_timestamp.
3. For LONG:
   - Originating swing must be a SWING_LOW.
   - Price must be strictly below entry price (or below POI zone low).
4. For SHORT:
   - Originating swing must be a SWING_HIGH.
   - Price must be strictly above entry price (or above POI zone high).
5. If symbol has no native M15 data or candles missing: INSUFFICIENT_DATA_STRUCTURAL_STOP.
6. If swing is found but direction is inverted: INVALID_STRUCTURAL_STOP_DIRECTION.
7. If swing is not yet confirmed at signal time: UNCONFIRMED_STRUCTURAL_SWING.
8. Alternative Model: POI boundary (zone_low for Long, zone_high for Short).
"""

import json
import os
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional


def load_json(path: str) -> Any:
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def detect_m15_swings_strictly_before(candles: List[Dict[str, Any]], cutoff_ts: int) -> List[Dict[str, Any]]:
    """
    Detect confirmed 5-bar fractal swings strictly up to cutoff_ts.
    A 15M candle open at ts closes at ts + 15*60*1000.
    A swing formed at bar i is confirmed when bar i+2 closes (at ts[i+2] + 15m).
    """
    valid_candles = [c for c in candles if (c['timestamp'] + 15 * 60 * 1000) <= cutoff_ts]
    n = len(valid_candles)
    if n < 5:
        return []

    swings = []
    for i in range(2, n - 2):
        c = valid_candles[i]
        bar_conf = valid_candles[i + 2]
        conf_ts = bar_conf['timestamp'] + 15 * 60 * 1000

        # Swing High: strictly higher than 2 bars before and 2 bars after
        if (
            c['high'] > valid_candles[i - 1]['high']
            and c['high'] > valid_candles[i - 2]['high']
            and c['high'] > valid_candles[i + 1]['high']
            and c['high'] > valid_candles[i + 2]['high']
        ):
            swings.append({
                'type': 'high',
                'price': float(c['high']),
                'formed_idx': i,
                'confirmed_idx': i + 2,
                'formed_ts': c['timestamp'],
                'confirmed_ts': conf_ts,
            })

        # Swing Low: strictly lower than 2 bars before and 2 bars after
        if (
            c['low'] < valid_candles[i - 1]['low']
            and c['low'] < valid_candles[i - 2]['low']
            and c['low'] < valid_candles[i + 1]['low']
            and c['low'] < valid_candles[i + 2]['low']
        ):
            swings.append({
                'type': 'low',
                'price': float(c['low']),
                'formed_idx': i,
                'confirmed_idx': i + 2,
                'formed_ts': c['timestamp'],
                'confirmed_ts': conf_ts,
            })

    return swings


def run_structural_stop_audit() -> Dict[str, Any]:
    # 1. Load evaluation log (contains 66 verified opportunities)
    eval_log_path = 'research/hybrid_replay/hybrid_replay_evaluation_log.json'
    eval_log = load_json(eval_log_path)
    b50_candidates = eval_log['results_by_variant']['BODY_50']

    # 2. Load queue data for raw POI boundaries & relatedEvent
    queue_path = '../swing-bos-core/data/signal_delivery_queue.json'
    queue_data = load_json(queue_path)
    queue_map = {item.get('candidate', {}).get('dedupeKey') or item.get('signalId'): item for item in queue_data}

    # 3. Cache M15 datasets
    m15_cache = {}
    for sym in ['ETHUSD', 'EURUSD', 'GBPUSD', 'SOLUSD', 'XAUUSD']:
        p = f'../swing-bos-core/data/replay_1year/{sym}_15m.json'
        if os.path.exists(p):
            m15_cache[sym] = load_json(p)

    audit_records = []

    for it in b50_candidates:
        cid = it['candidate_id']
        dk = it['structural_opportunity_id']
        sym = it['symbol']
        direction = it['trade_direction'].lower()
        sig_ts = it['signal_known_timestamp']
        entry_price = it.get('entry_price')
        final_status = it['final_status']

        raw_item = queue_map.get(dk) or queue_map.get(cid)
        cand_meta = raw_item.get('candidate', {}) if raw_item else {}
        poi_meta = cand_meta.get('poi', {})
        poi_type = cand_meta.get('poiType', 'OB')

        if poi_type == 'OB':
            zlow = float(poi_meta.get('low', 0.0))
            zhigh = float(poi_meta.get('high', 0.0))
        else:
            zlow = float(poi_meta.get('gapLow', 0.0))
            zhigh = float(poi_meta.get('gapHigh', 0.0))

        # Check alternative model: POI boundary
        alt_poi_stop = zlow if direction == 'long' else zhigh
        alt_poi_risk = abs(entry_price - alt_poi_stop) if entry_price else None

        # Check native M15 availability
        if sym not in m15_cache:
            audit_records.append({
                'candidate_id': cid,
                'structural_opportunity_id': dk,
                'symbol': sym,
                'trade_direction': direction,
                'signal_known_timestamp': sig_ts,
                'final_status': final_status,
                'entry_price': entry_price,
                'stop_audit_status': 'INSUFFICIENT_DATA_STRUCTURAL_STOP',
                'failure_category': 'MISSING_M15_CANDLE_DATASET',
                'structural_stop_price': None,
                'risk_distance': None,
                'swing_formed_timestamp': None,
                'swing_confirmed_timestamp': None,
                'swing_timeframe': '15m',
                'alternative_poi_stop': alt_poi_stop,
                'alternative_poi_risk': alt_poi_risk,
                'audit_rationale': f'No native 1-year M15 candle dataset available for {sym} during signal window'
            })
            continue

        candles = m15_cache[sym]
        t0 = candles[0]['timestamp']
        t1 = candles[-1]['timestamp'] + 15 * 60 * 1000
        if not (t0 <= sig_ts <= t1):
            audit_records.append({
                'candidate_id': cid,
                'structural_opportunity_id': dk,
                'symbol': sym,
                'trade_direction': direction,
                'signal_known_timestamp': sig_ts,
                'final_status': final_status,
                'entry_price': entry_price,
                'stop_audit_status': 'INSUFFICIENT_DATA_STRUCTURAL_STOP',
                'failure_category': 'TIMESTAMP_OUT_OF_M15_BOUNDS',
                'structural_stop_price': None,
                'risk_distance': None,
                'swing_formed_timestamp': None,
                'swing_confirmed_timestamp': None,
                'swing_timeframe': '15m',
                'alternative_poi_stop': alt_poi_stop,
                'alternative_poi_risk': alt_poi_risk,
                'audit_rationale': f'Signal timestamp {sig_ts} lies outside M15 candle bounds [{t0}, {t1}]'
            })
            continue

        # Detect swings strictly up to signal_ts (strict no lookahead!)
        confirmed_swings = detect_m15_swings_strictly_before(candles, sig_ts)
        target_swing_type = 'low' if direction == 'long' else 'high'
        matching_swings = [s for s in confirmed_swings if s['type'] == target_swing_type]

        if not matching_swings:
            audit_records.append({
                'candidate_id': cid,
                'structural_opportunity_id': dk,
                'symbol': sym,
                'trade_direction': direction,
                'signal_known_timestamp': sig_ts,
                'final_status': final_status,
                'entry_price': entry_price,
                'stop_audit_status': 'INSUFFICIENT_DATA_STRUCTURAL_STOP',
                'failure_category': 'NO_CONFIRMED_SWING_PRIOR_TO_SIGNAL',
                'structural_stop_price': None,
                'risk_distance': None,
                'swing_formed_timestamp': None,
                'swing_confirmed_timestamp': None,
                'swing_timeframe': '15m',
                'alternative_poi_stop': alt_poi_stop,
                'alternative_poi_risk': alt_poi_risk,
                'audit_rationale': f'No confirmed M15 {target_swing_type} swing point found prior to signal'
            })
            continue

        # Look at relatedEvent for BOS break timestamp
        rel_evt = poi_meta.get('relatedEvent', {})
        break_ts = rel_evt.get('breakTimestamp') or sig_ts

        # Find the originating swing: the most recent confirmed swing of target type formed at or prior to break
        pre_break_swings = [s for s in matching_swings if s['formed_ts'] <= break_ts]
        if not pre_break_swings:
            # Fall back to the most recent confirmed swing prior to signal
            originating_swing = matching_swings[-1]
            selection_rationale = 'Most recent confirmed M15 swing prior to signal timestamp'
        else:
            originating_swing = pre_break_swings[-1]
            selection_rationale = 'Most recent confirmed M15 swing formed prior to BOS break candle'

        stop_price = originating_swing['price']
        ref_price = entry_price if entry_price is not None else (zlow if direction == 'long' else zhigh)

        # Directional validity check
        is_valid_direction = (stop_price < ref_price) if direction == 'long' else (stop_price > ref_price)

        if not is_valid_direction:
            audit_records.append({
                'candidate_id': cid,
                'structural_opportunity_id': dk,
                'symbol': sym,
                'trade_direction': direction,
                'signal_known_timestamp': sig_ts,
                'final_status': final_status,
                'entry_price': entry_price,
                'stop_audit_status': 'INVALID_STRUCTURAL_STOP_DIRECTION',
                'failure_category': 'STOP_ON_WRONG_SIDE_OF_PRICE',
                'structural_stop_price': stop_price,
                'reference_price': ref_price,
                'risk_distance': abs(ref_price - stop_price),
                'swing_formed_timestamp': originating_swing['formed_ts'],
                'swing_confirmed_timestamp': originating_swing['confirmed_ts'],
                'swing_timeframe': '15m',
                'alternative_poi_stop': alt_poi_stop,
                'alternative_poi_risk': alt_poi_risk,
                'audit_rationale': f'Originating swing ({stop_price}) violates direction against reference price ({ref_price})'
            })
        else:
            risk_dist = abs(ref_price - stop_price)
            audit_records.append({
                'candidate_id': cid,
                'structural_opportunity_id': dk,
                'symbol': sym,
                'trade_direction': direction,
                'signal_known_timestamp': sig_ts,
                'final_status': final_status,
                'entry_price': entry_price,
                'stop_audit_status': 'VERIFIED_STRUCTURAL_STOP',
                'failure_category': None,
                'structural_stop_price': stop_price,
                'reference_price': ref_price,
                'risk_distance': risk_dist,
                'swing_formed_timestamp': originating_swing['formed_ts'],
                'swing_confirmed_timestamp': originating_swing['confirmed_ts'],
                'swing_timeframe': '15m',
                'alternative_poi_stop': alt_poi_stop,
                'alternative_poi_risk': alt_poi_risk,
                'audit_rationale': f'Confirmed M15 fractal swing ({selection_rationale}) strictly prior to signal, correct directional orientation'
            })

    # Summary aggregation
    summary = {
        'total_audited': len(audit_records),
        'by_stop_status': {},
        'by_failure_category': {},
        'by_symbol': {},
        'entry_filled_subset': {
            'total_filled': sum(1 for r in audit_records if r['final_status'] == 'ENTRY_FILLED'),
            'verified_structural_stop': sum(1 for r in audit_records if r['final_status'] == 'ENTRY_FILLED' and r['stop_audit_status'] == 'VERIFIED_STRUCTURAL_STOP'),
            'insufficient_data': sum(1 for r in audit_records if r['final_status'] == 'ENTRY_FILLED' and r['stop_audit_status'] == 'INSUFFICIENT_DATA_STRUCTURAL_STOP'),
            'invalid_direction': sum(1 for r in audit_records if r['final_status'] == 'ENTRY_FILLED' and r['stop_audit_status'] == 'INVALID_STRUCTURAL_STOP_DIRECTION'),
        }
    }

    for r in audit_records:
        st = r['stop_audit_status']
        summary['by_stop_status'][st] = summary['by_stop_status'].get(st, 0) + 1

        fc = r['failure_category']
        if fc:
            summary['by_failure_category'][fc] = summary['by_failure_category'].get(fc, 0) + 1

        sym = r['symbol']
        if sym not in summary['by_symbol']:
            summary['by_symbol'][sym] = {'total': 0, 'verified': 0, 'insufficient_data': 0, 'invalid_direction': 0}
        summary['by_symbol'][sym]['total'] += 1
        if st == 'VERIFIED_STRUCTURAL_STOP':
            summary['by_symbol'][sym]['verified'] += 1
        elif st == 'INSUFFICIENT_DATA_STRUCTURAL_STOP':
            summary['by_symbol'][sym]['insufficient_data'] += 1
        elif st == 'INVALID_STRUCTURAL_STOP_DIRECTION':
            summary['by_symbol'][sym]['invalid_direction'] += 1

    output = {
        'audit_timestamp': datetime.now(timezone.utc).isoformat(),
        'summary': summary,
        'records': audit_records
    }

    out_file = 'research/hybrid_replay/structural_stop_audit_results.json'
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2)

    return output


if __name__ == '__main__':
    res = run_structural_stop_audit()
    print('Audit Summary:')
    print(json.dumps(res['summary'], indent=2))
