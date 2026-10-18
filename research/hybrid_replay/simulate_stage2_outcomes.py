"""
Stage 2 Outcome Simulation Engine for Begonya & ChecklistTrigger Hybrid Replay
=============================================================================
Path: Begonya/research/hybrid_replay/simulate_stage2_outcomes.py

Strict Chronological Exit Evaluation Rules:
1. Only candles AFTER filled_timestamp (candle.timestamp > filled_timestamp) are processed.
2. If target_price is None / target not verified at signal time:
   Returns INSUFFICIENT_DATA_TARGET (no arbitrary TP or arbitrary max holding time).
3. If both stop and target levels are breached on the same M1 candle:
   Returns AMBIGUOUS_BAR (never optimistically assume target was hit first).
4. If stop is touched:
   Returns STOP_HIT with Gross R = -1.0.
5. If target is touched:
   Returns TARGET_HIT with Gross R = target_dist / risk_dist.
6. If data ends before either is reached:
   Returns DATA_END_UNRESOLVED.
7. Evaluates both:
   - Main Model: ENTRY_FILLED & VERIFIED_STRUCTURAL_STOP (25 trades)
   - Comparison Variant: VARIANT_POI_BOUNDARY_STOP (32 trades)
"""

import json
import os
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional


def load_json(path: str) -> Any:
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def simulate_trade_exit(
    trade_id: str,
    symbol: str,
    direction: str,
    entry_price: float,
    stop_price: float,
    target_price: Optional[float],
    filled_timestamp: int,
    subsequent_m1_candles: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Simulate chronological exit on subsequent M1 candles.
    """
    is_long = direction.lower() == 'long'
    risk_dist = abs(entry_price - stop_price)

    if target_price is None or target_price <= 0:
        return {
            'trade_id': trade_id,
            'symbol': symbol,
            'direction': direction,
            'entry_price': entry_price,
            'stop_price': stop_price,
            'target_price': None,
            'risk_distance': risk_dist,
            'outcome': 'INSUFFICIENT_DATA_TARGET',
            'gross_r': None,
            'exit_price': None,
            'exit_timestamp': None,
            'exit_bar_index': None,
            'holding_bars': None,
            'rationale': 'Target price was not verified or not known at signal timestamp; no arbitrary target assigned'
        }

    target_dist = abs(target_price - entry_price)

    # Directional sanity check
    if is_long and stop_price >= entry_price:
        return {
            'trade_id': trade_id,
            'symbol': symbol,
            'direction': direction,
            'entry_price': entry_price,
            'stop_price': stop_price,
            'target_price': target_price,
            'risk_distance': risk_dist,
            'outcome': 'INVALID_STOP_DIRECTION',
            'gross_r': None,
            'exit_price': None,
            'exit_timestamp': None,
            'exit_bar_index': None,
            'holding_bars': None,
            'rationale': f'Stop price ({stop_price}) >= entry price ({entry_price}) for Long trade'
        }

    if not is_long and stop_price <= entry_price:
        return {
            'trade_id': trade_id,
            'symbol': symbol,
            'direction': direction,
            'entry_price': entry_price,
            'stop_price': stop_price,
            'target_price': target_price,
            'risk_distance': risk_dist,
            'outcome': 'INVALID_STOP_DIRECTION',
            'gross_r': None,
            'exit_price': None,
            'exit_timestamp': None,
            'exit_bar_index': None,
            'holding_bars': None,
            'rationale': f'Stop price ({stop_price}) <= entry price ({entry_price}) for Short trade'
        }

    # Filter candles strictly after fill
    forward_candles = [c for c in subsequent_m1_candles if c['timestamp'] > filled_timestamp]
    if not forward_candles:
        return {
            'trade_id': trade_id,
            'symbol': symbol,
            'direction': direction,
            'entry_price': entry_price,
            'stop_price': stop_price,
            'target_price': target_price,
            'risk_distance': risk_dist,
            'outcome': 'DATA_END_UNRESOLVED',
            'gross_r': 0.0,
            'exit_price': entry_price,
            'exit_timestamp': filled_timestamp,
            'exit_bar_index': 0,
            'holding_bars': 0,
            'rationale': 'No subsequent M1 candles found after filled_timestamp'
        }

    for idx, bar in enumerate(forward_candles):
        b_high = bar['high']
        b_low = bar['low']
        ts = bar['timestamp']

        if is_long:
            hit_stop = b_low <= stop_price
            hit_target = b_high >= target_price
        else:
            hit_stop = b_high >= stop_price
            hit_target = b_low <= target_price

        # Same candle collision check
        if hit_stop and hit_target:
            return {
                'trade_id': trade_id,
                'symbol': symbol,
                'direction': direction,
                'entry_price': entry_price,
                'stop_price': stop_price,
                'target_price': target_price,
                'risk_distance': risk_dist,
                'outcome': 'AMBIGUOUS_BAR',
                'gross_r': None,
                'exit_price': None,
                'exit_timestamp': ts,
                'exit_bar_index': idx + 1,
                'holding_bars': idx + 1,
                'rationale': f'Both stop ({stop_price}) and target ({target_price}) breached within the range [{b_low}, {b_high}] of M1 bar {idx+1}'
            }

        if hit_stop:
            return {
                'trade_id': trade_id,
                'symbol': symbol,
                'direction': direction,
                'entry_price': entry_price,
                'stop_price': stop_price,
                'target_price': target_price,
                'risk_distance': risk_dist,
                'outcome': 'STOP_HIT',
                'gross_r': -1.0,
                'exit_price': stop_price,
                'exit_timestamp': ts,
                'exit_bar_index': idx + 1,
                'holding_bars': idx + 1,
                'rationale': f'Stop loss triggered on M1 bar {idx+1} (Price: {stop_price})'
            }

        if hit_target:
            gross_r = target_dist / risk_dist if risk_dist > 0 else 0.0
            return {
                'trade_id': trade_id,
                'symbol': symbol,
                'direction': direction,
                'entry_price': entry_price,
                'stop_price': stop_price,
                'target_price': target_price,
                'risk_distance': risk_dist,
                'outcome': 'TARGET_HIT',
                'gross_r': round(gross_r, 4),
                'exit_price': target_price,
                'exit_timestamp': ts,
                'exit_bar_index': idx + 1,
                'holding_bars': idx + 1,
                'rationale': f'Target reached on M1 bar {idx+1} (Target: {target_price}, Gross R: {round(gross_r, 4)})'
            }

    # Data ended without hitting stop or target
    last_bar = forward_candles[-1]
    unresolved_r = (
        (last_bar['close'] - entry_price) / risk_dist
        if is_long and risk_dist > 0
        else (entry_price - last_bar['close']) / risk_dist
    )
    return {
        'trade_id': trade_id,
        'symbol': symbol,
        'direction': direction,
        'entry_price': entry_price,
        'stop_price': stop_price,
        'target_price': target_price,
        'risk_distance': risk_dist,
        'outcome': 'DATA_END_UNRESOLVED',
        'gross_r': round(unresolved_r, 4),
        'exit_price': last_bar['close'],
        'exit_timestamp': last_bar['timestamp'],
        'exit_bar_index': len(forward_candles),
        'holding_bars': len(forward_candles),
        'rationale': f'Data ended after {len(forward_candles)} bars without touching stop or target'
    }


def run_stage2_simulation() -> Dict[str, Any]:
    # 1. Load Stage 1 logs and structural stop audit
    eval_log = load_json('research/hybrid_replay/hybrid_replay_evaluation_log.json')
    stop_audit = load_json('research/hybrid_replay/structural_stop_audit_results.json')
    b50 = eval_log['results_by_variant']['BODY_50']
    stop_map = {r['candidate_id']: r for r in stop_audit['records']}

    # 2. Load M1 candle datasets
    m1_cache = {}
    symbols = set(it['symbol'] for it in b50)
    for sym in symbols:
        p = f'../swing-bos-core/data/{sym}_1m.json'
        if os.path.exists(p):
            m1_cache[sym] = load_json(p)

    # 3. Model 1: Main Structural Stop Model
    # Valid trades: ENTRY_FILLED and VERIFIED_STRUCTURAL_STOP (25 trades)
    main_model_records = []
    # Excluded records tracking
    main_model_excluded = []

    # 4. Model 2: Comparison Variant (VARIANT_POI_BOUNDARY_STOP)
    # Valid trades: All ENTRY_FILLED (32 trades)
    poi_variant_records = []

    for it in b50:
        cid = it['candidate_id']
        sym = it['symbol']
        direction = it['trade_direction']
        status = it['final_status']
        entry_price = it.get('entry_price')
        target_price = it.get('target_price') if it.get('target_verified') else None
        filled_ts = it.get('filled_timestamp')

        st_info = stop_map.get(cid, {})
        stop_audit_status = st_info.get('stop_audit_status')
        struct_stop = st_info.get('structural_stop_price')
        poi_stop = st_info.get('alternative_poi_stop')

        candles = m1_cache.get(sym, [])

        # --- Main Model Evaluation ---
        if status != 'ENTRY_FILLED':
            main_model_excluded.append({
                'candidate_id': cid,
                'symbol': sym,
                'exclusion_reason': f'STAGE1_{status}'
            })
        elif stop_audit_status != 'VERIFIED_STRUCTURAL_STOP':
            main_model_excluded.append({
                'candidate_id': cid,
                'symbol': sym,
                'exclusion_reason': stop_audit_status
            })
        else:
            # Valid Main Model Trade!
            res = simulate_trade_exit(
                trade_id=cid,
                symbol=sym,
                direction=direction,
                entry_price=entry_price,
                stop_price=struct_stop,
                target_price=target_price,
                filled_timestamp=filled_ts,
                subsequent_m1_candles=candles
            )
            res['model'] = 'MAIN_STRUCTURAL_STOP'
            main_model_records.append(res)

        # --- POI Boundary Stop Variant Evaluation ---
        if status == 'ENTRY_FILLED':
            res_poi = simulate_trade_exit(
                trade_id=cid,
                symbol=sym,
                direction=direction,
                entry_price=entry_price,
                stop_price=poi_stop,
                target_price=target_price,
                filled_timestamp=filled_ts,
                subsequent_m1_candles=candles
            )
            res_poi['model'] = 'VARIANT_POI_BOUNDARY_STOP'
            poi_variant_records.append(res_poi)

    # Aggregations
    def summarize_results(records: List[Dict[str, Any]], excluded: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
        counts = {
            'TOTAL_TESTED': len(records),
            'TARGET_HIT': 0,
            'STOP_HIT': 0,
            'AMBIGUOUS_BAR': 0,
            'DATA_END_UNRESOLVED': 0,
            'INSUFFICIENT_DATA_TARGET': 0,
            'INVALID_STOP_DIRECTION': 0,
        }
        gross_r_resolved = []
        for r in records:
            out = r['outcome']
            counts[out] = counts.get(out, 0) + 1
            if out in ['TARGET_HIT', 'STOP_HIT']:
                gross_r_resolved.append(r['gross_r'])

        resolved_count = counts['TARGET_HIT'] + counts['STOP_HIT']
        win_rate = (counts['TARGET_HIT'] / resolved_count * 100) if resolved_count > 0 else None
        total_r = sum(gross_r_resolved) if gross_r_resolved else 0.0

        res = {
            'counts': counts,
            'resolved_trades_count': resolved_count,
            'target_verified_trades_count': counts['TARGET_HIT'] + counts['STOP_HIT'] + counts['AMBIGUOUS_BAR'] + counts['DATA_END_UNRESOLVED'],
            'win_rate_percent': round(win_rate, 2) if win_rate is not None else None,
            'sum_gross_r': round(total_r, 4),
            'avg_gross_r_per_resolved': round(total_r / resolved_count, 4) if resolved_count > 0 else None
        }
        if excluded is not None:
            res['excluded_count'] = len(excluded)
            res['excluded_by_reason'] = {}
            for ex in excluded:
                rsn = ex['exclusion_reason']
                res['excluded_by_reason'][rsn] = res['excluded_by_reason'].get(rsn, 0) + 1
        return res

    main_summary = summarize_results(main_model_records, main_model_excluded)
    poi_summary = summarize_results(poi_variant_records)

    output = {
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'main_structural_stop_model': {
            'summary': main_summary,
            'records': main_model_records,
            'excluded_records': main_model_excluded
        },
        'variant_poi_boundary_stop': {
            'summary': poi_summary,
            'records': poi_variant_records
        }
    }

    out_path = 'research/hybrid_replay/stage2_outcome_results.json'
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2)

    return output


if __name__ == '__main__':
    res = run_stage2_simulation()
    print('=== MAIN STRUCTURAL STOP MODEL SUMMARY ===')
    print(json.dumps(res['main_structural_stop_model']['summary'], indent=2))
    print('\n=== VARIANT POI BOUNDARY STOP SUMMARY ===')
    print(json.dumps(res['variant_poi_boundary_stop']['summary'], indent=2))
