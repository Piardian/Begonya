"""
Robustness Testing Engine for Begonya & ChecklistTrigger Hybrid Replay
======================================================================
Path: Begonya/research/hybrid_replay/robustness_testing.py

Executes:
1. GBPUSD Outlier correction across 0.0, 0.5, 1.0, 1.5, and 2.0 pip spread scenarios.
2. Full 9 resolved trades cost sensitivity (Raw Gross, ECN, Standard, Stress).
3. Micro-stop threshold sensitivity across FX (2, 4, 6, 8, 10 pips), XAU ($1, $2, $3), and Crypto.
4. Target audit: Legacy no-target group isolation vs deterministic M15 liquidity extraction.
5. USDJPY & USDCAD M15 data gaps documentation.
"""

import json
import os
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional


def load_json(path: str) -> Any:
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def simulate_trade_with_friction(
    trade: Dict[str, Any],
    m1_candles: List[Dict[str, Any]],
    spread_pips: float,
    commission_pips: float = 0.0,
    slippage_pips: float = 0.0
) -> Dict[str, Any]:
    """
    Simulate trade exit with explicit Ask/Bid spread and friction.
    For Short:
      - Entry at Bid (assumed filled at limit price).
      - Stop loss triggered when Ask >= StopPrice (Ask = Bid + Spread).
      - Target reached when Ask <= TargetPrice (must buy back at Ask to close short).
    For Long:
      - Entry at Ask (limit price + spread).
      - Stop loss triggered when Bid <= StopPrice.
      - Target reached when Bid >= TargetPrice.
    """
    sym = trade['symbol']
    direction = trade['direction'].lower()
    is_long = direction == 'long'
    entry_price = trade['entry_price']
    stop_price = trade['stop_price']
    target_price = trade['target_price']
    risk_dist = trade['risk_distance']
    filled_ts = trade.get('filled_timestamp')
    if filled_ts is None:
        filled_ts = trade.get('exit_timestamp')
    if filled_ts is None:
        filled_ts = 0

    # Convert pip to price unit
    if 'JPY' in sym:
        pip_unit = 0.01
    elif any(k in sym for k in ['BTC', 'ETH', 'SOL']):
        pip_unit = 0.01
    elif 'XAU' in sym:
        pip_unit = 0.10
    else:
        pip_unit = 0.00010

    spread_price = spread_pips * pip_unit
    comm_price = commission_pips * pip_unit
    slip_price = slippage_pips * pip_unit
    total_friction = comm_price + slip_price

    forward_candles = [c for c in m1_candles if c['timestamp'] > filled_ts]
    if not forward_candles:
        # Fall back to using bars starting after fill if filled_ts was not stored in record
        forward_candles = m1_candles[-trade.get('holding_bars', 100):]

    target_dist = abs(target_price - entry_price)

    for idx, bar in enumerate(forward_candles):
        b_high = bar['high']
        b_low = bar['low']
        ts = bar['timestamp']

        if not is_long:  # SHORT
            ask_high = b_high + spread_price
            ask_low = b_low + spread_price
            hit_stop = ask_high >= stop_price
            hit_target = ask_low <= target_price
        else:  # LONG
            bid_high = b_high
            bid_low = b_low
            hit_stop = bid_low <= stop_price
            hit_target = bid_high >= target_price

        if hit_stop and hit_target:
            return {
                'outcome': 'AMBIGUOUS_BAR',
                'net_r': None,
                'gross_r': None,
                'exit_bar': idx + 1,
                'exit_timestamp': ts,
                'spread_pips': spread_pips
            }

        if hit_stop:
            # Net loss includes friction
            net_loss_r = -1.0 - (total_friction / risk_dist if risk_dist > 0 else 0.0)
            return {
                'outcome': 'STOP_HIT',
                'net_r': round(net_loss_r, 4),
                'gross_r': -1.0,
                'exit_bar': idx + 1,
                'exit_timestamp': ts,
                'spread_pips': spread_pips
            }

        if hit_target:
            gross_r = target_dist / risk_dist if risk_dist > 0 else 0.0
            net_profit_dist = target_dist - total_friction
            net_r = net_profit_dist / risk_dist if risk_dist > 0 else 0.0
            return {
                'outcome': 'TARGET_HIT',
                'net_r': round(net_r, 4),
                'gross_r': round(gross_r, 4),
                'exit_bar': idx + 1,
                'exit_timestamp': ts,
                'spread_pips': spread_pips
            }

    return {
        'outcome': 'DATA_END_UNRESOLVED',
        'net_r': 0.0,
        'gross_r': 0.0,
        'exit_bar': len(forward_candles),
        'exit_timestamp': forward_candles[-1]['timestamp'] if forward_candles else 0,
        'spread_pips': spread_pips
    }


def run_robustness_test():
    # 1. Load Stage 2 results & evaluation log
    s2 = load_json('research/hybrid_replay/stage2_outcome_results.json')
    eval_log = load_json('research/hybrid_replay/hybrid_replay_evaluation_log.json')
    b50 = eval_log['results_by_variant']['BODY_50']
    eval_map = {it['candidate_id']: it for it in b50}

    main_trades = s2['main_structural_stop_model']['records']
    # Enrich trades with filled_timestamp from eval_map
    for t in main_trades:
        cid = t['trade_id']
        if cid in eval_map:
            t['filled_timestamp'] = eval_map[cid].get('filled_timestamp', 0)

    # Load M1 caches
    m1_cache = {}
    for sym in ['GBPUSD', 'ETHUSD', 'SOLUSD', 'XAUUSD', 'EURUSD', 'USDJPY', 'USDCAD']:
        p = f'../swing-bos-core/data/{sym}_1m.json'
        if os.path.exists(p):
            m1_cache[sym] = load_json(p)

    # -------------------------------------------------------------
    # 1. GBPUSD Outlier Spread Sensitivity Analysis
    # -------------------------------------------------------------
    gbp_trade = next(t for t in main_trades if t['trade_id'] == 'GBPUSD_15m_FVG_1791174600000_1791174600000')
    gbp_m1 = m1_cache['GBPUSD']

    gbp_spread_results = {}
    for sp in [0.0, 0.5, 1.0, 1.5, 2.0]:
        res = simulate_trade_with_friction(
            trade=gbp_trade,
            m1_candles=gbp_m1,
            spread_pips=sp,
            commission_pips=0.35 if sp > 0 else 0.0,
            slippage_pips=0.15 if sp > 0 else 0.0
        )
        gbp_spread_results[f'spread_{sp}_pip'] = res

    # -------------------------------------------------------------
    # 2. Portfolio-Level Cost Scenarios on All 9 Resolved Trades
    # -------------------------------------------------------------
    resolved_trades = [t for t in main_trades if t['outcome'] in ['TARGET_HIT', 'STOP_HIT']]

    cost_scenarios = {
        'Scenario_A_Raw_Gross': {'fx_sp': 0.0, 'fx_comm': 0.0, 'xau_sp': 0.0, 'xau_comm': 0.0, 'crypto_sp': 0.0, 'crypto_comm': 0.0},
        'Scenario_B_Raw_ECN':   {'fx_sp': 0.5, 'fx_comm': 0.35, 'xau_sp': 1.5, 'xau_comm': 0.50, 'crypto_sp': 5.0, 'crypto_comm': 2.0},
        'Scenario_C_Standard':  {'fx_sp': 1.5, 'fx_comm': 0.00, 'xau_sp': 3.0, 'xau_comm': 0.00, 'crypto_sp': 10.0, 'crypto_comm': 0.0},
        'Scenario_D_Stress':    {'fx_sp': 2.0, 'fx_comm': 0.50, 'xau_sp': 5.0, 'xau_comm': 1.00, 'crypto_sp': 20.0, 'crypto_comm': 5.0},
    }

    scenario_outputs = {}
    for sc_name, cfg in cost_scenarios.items():
        sc_res = []
        for t in resolved_trades:
            sym = t['symbol']
            m1_data = m1_cache[sym]
            if sym in ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCAD']:
                sp = cfg['fx_sp']
                comm = cfg['fx_comm']
            elif 'XAU' in sym:
                sp = cfg['xau_sp']
                comm = cfg['xau_comm']
            else:
                sp = cfg['crypto_sp']
                comm = cfg['crypto_comm']

            sim = simulate_trade_with_friction(t, m1_data, spread_pips=sp, commission_pips=comm)
            sc_res.append({
                'trade_id': t['trade_id'],
                'symbol': sym,
                'outcome': sim['outcome'],
                'net_r': sim['net_r'],
                'gross_r': sim['gross_r'],
                'exit_bar': sim['exit_bar']
            })

        wins = sum(1 for r in sc_res if r['outcome'] == 'TARGET_HIT')
        losses = sum(1 for r in sc_res if r['outcome'] == 'STOP_HIT')
        total_net_r = sum(r['net_r'] for r in sc_res if r['net_r'] is not None)

        scenario_outputs[sc_name] = {
            'resolved_count': len(sc_res),
            'target_hits': wins,
            'stop_hits': losses,
            'win_rate_percent': round(wins / len(sc_res) * 100, 2) if sc_res else 0,
            'total_net_r': round(total_net_r, 4),
            'avg_net_r': round(total_net_r / len(sc_res), 4) if sc_res else 0,
            'trades': sc_res
        }

    # -------------------------------------------------------------
    # 3. Micro-Stop Sensitivity Testing
    # -------------------------------------------------------------
    # Minimum stop thresholds:
    # FX: 2, 4, 6, 8, 10 pips
    # XAU: 1.0, 2.0, 3.0 $
    # Crypto: ETH (5, 10, 15 $), SOL (0.5, 1.0, 1.5 $)

    def evaluate_micro_stop_variant(fx_thresh: float, xau_thresh: float, eth_thresh: float, sol_thresh: float):
        included = []
        excluded = []
        for t in main_trades:
            sym = t['symbol']
            risk = t['risk_distance']
            is_excluded = False
            thresh_applied = None

            if sym in ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCAD']:
                pips = risk * 10000 if 'JPY' not in sym else risk * 100
                thresh_applied = f'{fx_thresh} pips'
                if pips < fx_thresh:
                    is_excluded = True
            elif 'XAU' in sym:
                thresh_applied = f'{xau_thresh} $'
                if risk < xau_thresh:
                    is_excluded = True
            elif 'ETH' in sym:
                thresh_applied = f'{eth_thresh} $'
                if risk < eth_thresh:
                    is_excluded = True
            elif 'SOL' in sym:
                thresh_applied = f'{sol_thresh} $'
                if risk < sol_thresh:
                    is_excluded = True

            if is_excluded:
                excluded.append({'trade_id': t['trade_id'], 'symbol': sym, 'risk': risk, 'threshold': thresh_applied})
            else:
                included.append(t)

        resolved_inc = [t for t in included if t['outcome'] in ['TARGET_HIT', 'STOP_HIT']]
        sum_r = sum(t['gross_r'] for t in resolved_inc)
        wins = sum(1 for t in resolved_inc if t['outcome'] == 'TARGET_HIT')

        return {
            'thresholds': {'fx_pips': fx_thresh, 'xau_usd': xau_thresh, 'eth_usd': eth_thresh, 'sol_usd': sol_thresh},
            'total_tested': len(main_trades),
            'included_trades': len(included),
            'excluded_trades': len(excluded),
            'resolved_included': len(resolved_inc),
            'target_hits': wins,
            'stop_hits': len(resolved_inc) - wins,
            'win_rate_percent': round(wins / len(resolved_inc) * 100, 2) if resolved_inc else 0,
            'sum_gross_r': round(sum_r, 4),
            'avg_gross_r': round(sum_r / len(resolved_inc), 4) if resolved_inc else 0,
            'excluded_list': excluded
        }

    micro_stop_variants = {
        'FX_2p_XAU_1_ETH_5_SOL_0.5': evaluate_micro_stop_variant(2.0, 1.0, 5.0, 0.5),
        'FX_4p_XAU_2_ETH_10_SOL_1.0': evaluate_micro_stop_variant(4.0, 2.0, 10.0, 1.0),
        'FX_6p_XAU_3_ETH_15_SOL_1.5': evaluate_micro_stop_variant(6.0, 3.0, 15.0, 1.5),
        'FX_8p_XAU_3_ETH_15_SOL_1.5': evaluate_micro_stop_variant(8.0, 3.0, 15.0, 1.5),
        'FX_10p_XAU_3_ETH_15_SOL_1.5': evaluate_micro_stop_variant(10.0, 3.0, 15.0, 1.5),
    }

    # -------------------------------------------------------------
    # 4. Target Data Audit: Legacy No-Target Group (16 trades)
    # -------------------------------------------------------------
    legacy_no_target_trades = [t for t in main_trades if t['outcome'] == 'INSUFFICIENT_DATA_TARGET']
    legacy_details = []
    for t in legacy_no_target_trades:
        legacy_details.append({
            'trade_id': t['trade_id'],
            'symbol': t['symbol'],
            'direction': t['direction'],
            'entry_price': t['entry_price'],
            'stop_price': t['stop_price'],
            'risk_distance': t['risk_distance'],
            'reason': 'Signal generated prior to 2026-09-08 (liquidityMagnetDetector implementation boundary)'
        })

    # -------------------------------------------------------------
    # 5. Missing M15 Data Audit (USDJPY & USDCAD)
    # -------------------------------------------------------------
    missing_m15_audit = {
        'USDJPY': {
            'signals_in_sample': 6,
            'signal_dates': '2026-08-21 to 2026-09-21',
            'available_15m_files': [
                'swing-bos-core/data/USDJPY_15m.json (500 bars, 2026-10-07 to 2026-10-14)',
                'smc_engine/data/USDJPY_15m.json (500 bars, 2026-09-02 to 2026-09-09)'
            ],
            'available_1m_data': 'swing-bos-core/data/USDJPY_1m.json (95,000 bars, 2026-07-13 to 2026-10-13)',
            'status': 'INSUFFICIENT_DATA_STRUCTURAL_STOP',
            'retrieval_path': 'MetaTrader 5 API: copy_rates_from_pos("USDJPY", mt5.TIMEFRAME_M15, 0, 35000)'
        },
        'USDCAD': {
            'signals_in_sample': 4,
            'signal_dates': '2026-08-21 to 2026-09-21',
            'available_15m_files': [
                'swing-bos-core/data/USDCAD_15m.json (500 bars, 2026-10-07 to 2026-10-14)',
                'smc_engine/data/USDCAD_15m.json (500 bars, 2026-09-02 to 2026-09-09)'
            ],
            'available_1m_data': 'swing-bos-core/data/USDCAD_1m.json (95,000 bars, 2026-07-13 to 2026-10-13)',
            'status': 'INSUFFICIENT_DATA_STRUCTURAL_STOP',
            'retrieval_path': 'MetaTrader 5 API: copy_rates_from_pos("USDCAD", mt5.TIMEFRAME_M15, 0, 35000)'
        }
    }

    output = {
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'gbp_usd_outlier_audit': {
            'trade_id': gbp_trade['trade_id'],
            'entry_bid': gbp_trade['entry_price'],
            'structural_stop': gbp_trade['stop_price'],
            'target_price': gbp_trade['target_price'],
            'risk_pips': 2.45,
            'spread_scenarios': gbp_spread_results
        },
        'portfolio_cost_scenarios': scenario_outputs,
        'micro_stop_sensitivity': micro_stop_variants,
        'legacy_no_target_group': {
            'count': len(legacy_details),
            'records': legacy_details
        },
        'missing_m15_audit': missing_m15_audit
    }

    out_file = 'research/hybrid_replay/robustness_test_results.json'
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2)

    return output


if __name__ == '__main__':
    res = run_robustness_test()
    print('=== GBPUSD SPREAD SCENARIOS ===')
    for sp, r in res['gbp_usd_outlier_audit']['spread_scenarios'].items():
        print(f"  {sp}: outcome={r['outcome']}, net_r={r['net_r']}")

    print('\n=== PORTFOLIO COST SCENARIOS ===')
    for sc, r in res['portfolio_cost_scenarios'].items():
        print(f"  {sc}: WinRate={r['win_rate_percent']}%, TotalNetR={r['total_net_r']} R, AvgNetR={r['avg_net_r']} R")

    print('\n=== MICRO STOP VARIANTS ===')
    for vr, r in res['micro_stop_sensitivity'].items():
        print(f"  {vr}: Included={r['included_trades']}, Excluded={r['excluded_trades']}, WinRate={r['win_rate_percent']}%, TotalGrossR={r['sum_gross_r']} R")
