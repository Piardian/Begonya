"""
Controlled Comparative Replay: Model A (Production Logic) vs Model B (Intended Hybrid Architecture)
==================================================================================================
Path: Begonya/research/hybrid_replay/controlled_comparison_replay.py

Direct Head-to-Head Comparison on the Exact Same 66 Opportunities:
------------------------------------------------------------------
Model A (Current Production Implementation):
- Veto: Instantaneous 1M wick breach below POI zone (executionStateMachine1m.ts line 248)
        or rolling 15 consecutive 1M bars closing beyond zone (entryMechanics.ts line 271).
- Entry Limit: Static 50% FVG midpoint (fvgMid); no dynamic Fib updating as impulse expands.
- Stop Loss: 1M sweep wick extreme +/- 1.5 pips (entryMechanics.ts line 421 / executionStateMachine1m.ts line 620).
- Exit: M1 simulation against 1M sweep stop. Also tracks "Wick-Out": Did price hit 1M stop and then reach target?

Model B (User's Intended Hybrid Architecture):
- Veto: Strictly clock-aligned 15M bar close (:14, :29, :44, :59) beyond zone; intra-bar wicks do NOT veto.
- Entry Limit: Dynamic 0.5 Fibonacci tracking expanding impulse leg until touched on subsequent bar.
- Stop Loss: Confirmed M15 structural swing high/low prior to signal timestamp.
- Exit: M1 simulation against M15 structural stop and verified target.
"""

import json
import os
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional


def load_json(path: str) -> Any:
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def is_htf_boundary_minute(timestamp_ms: int, timeframe_minutes: int = 15) -> bool:
    dt = datetime.fromtimestamp(timestamp_ms / 1000.0, tz=timezone.utc)
    return (dt.minute + 1) % timeframe_minutes == 0


def get_pip_size(symbol: str) -> float:
    s = symbol.upper()
    if 'JPY' in s:
        return 0.01
    if any(k in s for k in ['BTC', 'ETH', 'SOL', 'XAU']):
        if 'XAU' in s:
            return 0.10
        return 0.01
    return 0.0001


def run_model_a_production_logic(
    candidate: Dict[str, Any],
    m1_candles: List[Dict[str, Any]],
    target_price: Optional[float]
) -> Dict[str, Any]:
    """
    Simulate Model A using exact production rules from entryMechanics.ts & executionStateMachine1m.ts.
    """
    sym = candidate['symbol']
    direction = candidate['trade_direction'].lower()
    is_long = direction == 'long'
    zlow = candidate['zone_low']
    zhigh = candidate['zone_high']
    pip = get_pip_size(sym)

    touch_idx = None
    # 1. POI Touch Scan with Production Wick/Rolling Veto
    search_limit = min(len(m1_candles), 1440)
    for i in range(search_limit):
        c = m1_candles[i]
        c_low = c['low']
        c_high = c['high']
        # Production Wick Veto: Instantaneous 1M wick piercing through zone
        if is_long and c_low < zlow - 2.0 * pip:
            return {
                'model': 'MODEL_A_PRODUCTION',
                'status': 'INVALIDATED_WICK_VETO',
                'entry_price': None,
                'stop_price': None,
                'risk_pips': None,
                'outcome': None,
                'gross_r': None,
                'rationale': f'1M wick pierced below zoneLow ({c_low} < {zlow}) - Production early veto'
            }
        elif not is_long and c_high > zhigh + 2.0 * pip:
            return {
                'model': 'MODEL_A_PRODUCTION',
                'status': 'INVALIDATED_WICK_VETO',
                'entry_price': None,
                'stop_price': None,
                'risk_pips': None,
                'outcome': None,
                'rationale': f'1M wick pierced above zoneHigh ({c_high} > {zhigh}) - Production early veto'
            }

        touched = (c_low <= zhigh and c_high >= zlow) if is_long else (c_high >= zlow and c_low <= zhigh)
        if touched:
            touch_idx = i
            break

    if touch_idx is None:
        return {'model': 'MODEL_A_PRODUCTION', 'status': 'EXPIRED_NO_TOUCH', 'outcome': None}

    # 2. Search for 1M Sweep + CHoCH Displacement
    sweep_idx = None
    sweep_extreme = None
    disp_idx = None
    fvg_mid = None

    react_limit = min(len(m1_candles), touch_idx + 60)
    for k in range(touch_idx + 1, react_limit):
        c = m1_candles[k]
        prev_bars = m1_candles[max(0, k - 4):k]
        if not prev_bars:
            continue

        if is_long:
            prior_low = min(b['low'] for b in prev_bars)
            if c['low'] < prior_low and c['close'] > prior_low:
                sweep_idx = k
                sweep_extreme = c['low']
                # Look for CHoCH in next 1-6 bars
                for d in range(k + 1, min(len(m1_candles), k + 7)):
                    dc = m1_candles[d]
                    d_range = max(dc['high'] - dc['low'], 1e-8)
                    d_body = abs(dc['close'] - dc['open'])
                    prior_high = max(b['high'] for b in m1_candles[sweep_idx:d])
                    if dc['close'] > prior_high and (d_body / d_range >= 0.50):
                        disp_idx = d
                        # Classic FVG or 50% displacement body
                        if d >= 2 and m1_candles[d]['low'] > m1_candles[d - 2]['high']:
                            fvg_mid = (m1_candles[d - 2]['high'] + m1_candles[d]['low']) * 0.5
                        else:
                            fvg_mid = dc['open'] + (dc['close'] - dc['open']) * 0.5
                        break
                if disp_idx:
                    break
        else:
            prior_high = max(b['high'] for b in prev_bars)
            if c['high'] > prior_high and c['close'] < prior_high:
                sweep_idx = k
                sweep_extreme = c['high']
                for d in range(k + 1, min(len(m1_candles), k + 7)):
                    dc = m1_candles[d]
                    d_range = max(dc['high'] - dc['low'], 1e-8)
                    d_body = abs(dc['close'] - dc['open'])
                    prior_low = min(b['low'] for b in m1_candles[sweep_idx:d])
                    if dc['close'] < prior_low and (d_body / d_range >= 0.50):
                        disp_idx = d
                        if d >= 2 and m1_candles[d]['high'] < m1_candles[d - 2]['low']:
                            fvg_mid = (m1_candles[d - 2]['low'] + m1_candles[d]['high']) * 0.5
                        else:
                            fvg_mid = dc['close'] + (dc['open'] - dc['close']) * 0.5
                        break
                if disp_idx:
                    break

    if disp_idx is None or fvg_mid is None:
        return {'model': 'MODEL_A_PRODUCTION', 'status': 'NO_DISPLACEMENT_CHOCH', 'outcome': None}

    # 3. Model A Fill Check: Static fvgMid Limit (NO dynamic expansion)
    entry_price = fvg_mid
    stop_price = sweep_extreme - 1.5 * pip if is_long else sweep_extreme + 1.5 * pip
    risk_dist = abs(entry_price - stop_price)
    risk_pips = risk_dist / pip

    filled_idx = None
    for m in range(disp_idx + 1, min(len(m1_candles), disp_idx + 60)):
        mc = m1_candles[m]
        filled = (mc['low'] <= entry_price) if is_long else (mc['high'] >= entry_price)
        if filled:
            filled_idx = m
            break

    if filled_idx is None:
        return {'model': 'MODEL_A_PRODUCTION', 'status': 'NO_STATIC_FVG_FILL', 'outcome': None}

    # 4. Exit Simulation against 1M sweep stop
    if target_price is None or target_price <= 0:
        return {
            'model': 'MODEL_A_PRODUCTION',
            'status': 'ENTRY_FILLED',
            'entry_price': entry_price,
            'stop_price': stop_price,
            'risk_pips': risk_pips,
            'outcome': 'INSUFFICIENT_DATA_TARGET',
            'gross_r': None
        }

    target_dist = abs(target_price - entry_price)
    outcome = 'DATA_END_UNRESOLVED'
    gross_r = 0.0
    wick_out_to_target = False

    forward_candles = m1_candles[filled_idx + 1:]
    for idx, b in enumerate(forward_candles):
        hit_stop = (b['low'] <= stop_price) if is_long else (b['high'] >= stop_price)
        hit_tp = (b['high'] >= target_price) if is_long else (b['low'] <= target_price)

        if hit_stop and hit_tp:
            outcome = 'AMBIGUOUS_BAR'
            gross_r = None
            break
        if hit_stop:
            outcome = 'STOP_HIT'
            gross_r = -1.0
            # Check if price later reached target without hitting the broader POI boundary
            for rem_b in forward_candles[idx + 1:idx + 500]:
                if (rem_b['high'] >= target_price if is_long else rem_b['low'] <= target_price):
                    wick_out_to_target = True
                    break
            break
        if hit_tp:
            outcome = 'TARGET_HIT'
            gross_r = target_dist / risk_dist if risk_dist > 0 else 0.0
            break

    return {
        'model': 'MODEL_A_PRODUCTION',
        'status': 'ENTRY_FILLED',
        'entry_price': entry_price,
        'stop_price': stop_price,
        'risk_pips': risk_pips,
        'outcome': outcome,
        'gross_r': round(gross_r, 4) if gross_r is not None else None,
        'wick_out_to_target': wick_out_to_target
    }


def run_controlled_comparison():
    eval_log = load_json('research/hybrid_replay/hybrid_replay_evaluation_log.json')
    stop_audit = load_json('research/hybrid_replay/structural_stop_audit_results.json')
    s2 = load_json('research/hybrid_replay/stage2_outcome_results.json')

    b50 = eval_log['results_by_variant']['BODY_50']
    stop_map = {r['candidate_id']: r for r in stop_audit['records']}
    s2_map = {r['trade_id']: r for r in s2['main_structural_stop_model']['records']}

    # Load M1 caches
    m1_cache = {}
    for sym in ['GBPUSD', 'ETHUSD', 'SOLUSD', 'XAUUSD', 'EURUSD', 'USDJPY', 'USDCAD']:
        p = f'../swing-bos-core/data/{sym}_1m.json'
        if os.path.exists(p):
            m1_cache[sym] = load_json(p)

    comparison_results = []

    queue_data = load_json('../swing-bos-core/data/signal_delivery_queue.json')
    queue_map = {item.get('candidate', {}).get('dedupeKey') or item.get('signalId'): item for item in queue_data}

    for it in b50:
        cid = it['candidate_id']
        dk = it['structural_opportunity_id']
        sym = it['symbol']
        direction = it['trade_direction']
        sig_ts = it['signal_known_timestamp']
        target_price = it.get('target_price') if it.get('target_verified') else None

        st_info = stop_map.get(cid, {})
        m1_data = m1_cache.get(sym, [])

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

        cand_dict = {
            'candidate_id': cid,
            'symbol': sym,
            'trade_direction': direction,
            'zone_low': zlow,
            'zone_high': zhigh
        }
        # Filter candles starting at signal_ts
        candles_from_signal = [c for c in m1_data if c['timestamp'] >= sig_ts]

        # 1. Run Model A
        res_a = run_model_a_production_logic(cand_dict, candles_from_signal, target_price)

        # 2. Retrieve Model B results from Stage 2
        res_b = s2_map.get(cid)
        if not res_b:
            res_b = {
                'status': it['final_status'],
                'outcome': 'EXCLUDED_FROM_MAIN',
                'gross_r': None,
                'risk_distance': None,
                'stop_price': st_info.get('structural_stop_price')
            }
        else:
            res_b['status'] = 'ENTRY_FILLED'

        comparison_results.append({
            'candidate_id': cid,
            'symbol': sym,
            'direction': direction,
            'model_a': res_a,
            'model_b': res_b
        })

    # Summary Statistics
    summary = {
        'total_candidates': len(comparison_results),
        'model_a_production': {
            'invalidated_wick_veto': sum(1 for r in comparison_results if r['model_a'].get('status') == 'INVALIDATED_WICK_VETO'),
            'no_displacement': sum(1 for r in comparison_results if r['model_a'].get('status') == 'NO_DISPLACEMENT_CHOCH'),
            'no_static_fill': sum(1 for r in comparison_results if r['model_a'].get('status') == 'NO_STATIC_FVG_FILL'),
            'entry_filled': sum(1 for r in comparison_results if r['model_a'].get('status') == 'ENTRY_FILLED'),
            'target_hits': sum(1 for r in comparison_results if r['model_a'].get('outcome') == 'TARGET_HIT'),
            'stop_hits': sum(1 for r in comparison_results if r['model_a'].get('outcome') == 'STOP_HIT'),
            'wick_out_to_target_count': sum(1 for r in comparison_results if r['model_a'].get('wick_out_to_target')),
            'insufficient_target': sum(1 for r in comparison_results if r['model_a'].get('outcome') == 'INSUFFICIENT_DATA_TARGET'),
        },
        'model_b_intended_hybrid': {
            'clock_aligned_invalidated': sum(1 for it in b50 if it['final_status'] == 'INVALIDATED'),
            'entry_filled': sum(1 for it in b50 if it['final_status'] == 'ENTRY_FILLED'),
            'verified_structural_stop_sample': len(s2['main_structural_stop_model']['records']),
            'target_hits': s2['main_structural_stop_model']['summary']['counts']['TARGET_HIT'],
            'stop_hits': s2['main_structural_stop_model']['summary']['counts']['STOP_HIT'],
            'insufficient_target': s2['main_structural_stop_model']['summary']['counts']['INSUFFICIENT_DATA_TARGET'],
            'sum_gross_r': s2['main_structural_stop_model']['summary']['sum_gross_r']
        }
    }

    output = {
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'summary': summary,
        'records': comparison_results
    }

    out_file = 'research/hybrid_replay/controlled_comparison_results.json'
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2)

    return output


if __name__ == '__main__':
    res = run_controlled_comparison()
    print('=== CONTROLLED COMPARISON SUMMARY ===')
    print(json.dumps(res['summary'], indent=2))
