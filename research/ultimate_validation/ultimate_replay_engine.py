"""
Begonya Ultimate Validation Engine
==================================
Simulates all 4 variants across In-Sample (IS) and Out-of-Sample (OOS) periods,
evaluates realistic execution costs, and outputs comprehensive statistics.

Path: Begonya/research/ultimate_validation/ultimate_replay_engine.py
"""

from __future__ import annotations

import os
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from macro_gate import check_macro_gate, Candle as MacroCandle
from session_targets import compute_fixed_r_target, detect_intraday_session_liquidity_target, Candle as SessionCandle


@dataclass
class Candle:
    timestamp: int
    open: float
    high: float
    low: float
    close: float
    volume: float = 0.0


def get_pip_size(symbol: str) -> float:
    s = symbol.upper()
    if 'JPY' in s:
        return 0.01
    if any(fx in s for fx in ['EUR', 'GBP', 'AUD', 'NZD', 'CAD', 'CHF']):
        return 0.0001
    if 'XAU' in s or 'GOLD' in s:
        return 0.10  # 1 pip in XAU = $0.10
    if 'BTC' in s:
        return 1.0
    if 'ETH' in s:
        return 0.10
    if 'SOL' in s:
        return 0.01
    return 0.0001


def detect_asset_class(symbol: str) -> str:
    s = symbol.upper()
    if 'XAU' in s or 'GOLD' in s or 'XAG' in s or 'SILVER' in s:
        return 'COMMODITY'
    if 'BTC' in s or 'ETH' in s or 'SOL' in s or 'XRP' in s:
        return 'CRYPTO'
    if any(k in s for k in ['EUR', 'GBP', 'AUD', 'CAD', 'CHF', 'JPY', 'NZD']):
        return 'FX'
    return 'UNKNOWN'


def detect_session(timestamp: int) -> str:
    dt = datetime.fromtimestamp(timestamp / 1000.0, timezone.utc)
    h = dt.hour
    if 7 <= h < 13:
        return 'LONDON'
    elif 13 <= h < 21:
        return 'NEW_YORK'
    else:
        return 'ASIA'


def run_trade_simulation(
    entry_price: float,
    stop_price: float,
    target_price: float,
    direction: str,
    forward_m1_bars: List[Candle],
    spread_pips: float,
    symbol: str,
    commission_r: float = 0.0,
    max_holding_bars: Optional[int] = None
) -> Dict[str, Any]:
    """
    Simulates a trade strictly bar-by-bar using BID/ASK rules.
    Conservative collision handling: simultaneous touch = STOP_HIT.
    """
    pip = get_pip_size(symbol)
    spread_price = spread_pips * pip

    risk = abs(entry_price - stop_price)
    reward = abs(target_price - entry_price)
    planned_r = reward / risk if risk > 0 else 0.0

    bars_to_check = forward_m1_bars[:max_holding_bars] if max_holding_bars else forward_m1_bars

    running_mfe = 0.0
    running_mae = 0.0

    for bar_idx, bar in enumerate(bars_to_check):
        if direction.lower() == 'short':
            ask_high = bar.high + spread_price
            ask_low = bar.low + spread_price
            
            favorable = max(0.0, (entry_price - bar.low) / risk) if risk > 0 else 0.0
            adverse = max(0.0, (bar.high - entry_price) / risk) if risk > 0 else 0.0
            running_mfe = max(running_mfe, favorable)
            running_mae = max(running_mae, adverse)

            stop_hit = ask_high >= stop_price
            target_hit = ask_low <= target_price

            if stop_hit and target_hit:
                return {
                    'exit_status': 'STOP_HIT',
                    'exit_bar': bar_idx,
                    'realized_r': -1.0 - commission_r,
                    'mfe_r': round(running_mfe, 4),
                    'mae_r': round(running_mae, 4),
                    'reason': 'AMBIGUOUS_SAME_BAR_COLLISION_CONSERVATIVE_LOSS'
                }
            if stop_hit:
                return {
                    'exit_status': 'STOP_HIT',
                    'exit_bar': bar_idx,
                    'realized_r': -1.0 - commission_r,
                    'mfe_r': round(running_mfe, 4),
                    'mae_r': round(running_mae, 4),
                    'reason': 'STOP_TRIGGERED'
                }
            if target_hit:
                return {
                    'exit_status': 'TARGET_HIT',
                    'exit_bar': bar_idx,
                    'realized_r': planned_r - commission_r,
                    'mfe_r': round(running_mfe, 4),
                    'mae_r': round(running_mae, 4),
                    'reason': 'TARGET_REACHED'
                }
        else:
            bid_low = bar.low - spread_price
            bid_high = bar.high - spread_price

            favorable = max(0.0, (bar.high - entry_price) / risk) if risk > 0 else 0.0
            adverse = max(0.0, (entry_price - bar.low) / risk) if risk > 0 else 0.0
            running_mfe = max(running_mfe, favorable)
            running_mae = max(running_mae, adverse)

            stop_hit = bid_low <= stop_price
            target_hit = bid_high >= target_price

            if stop_hit and target_hit:
                return {
                    'exit_status': 'STOP_HIT',
                    'exit_bar': bar_idx,
                    'realized_r': -1.0 - commission_r,
                    'mfe_r': round(running_mfe, 4),
                    'mae_r': round(running_mae, 4),
                    'reason': 'AMBIGUOUS_SAME_BAR_COLLISION_CONSERVATIVE_LOSS'
                }
            if stop_hit:
                return {
                    'exit_status': 'STOP_HIT',
                    'exit_bar': bar_idx,
                    'realized_r': -1.0 - commission_r,
                    'mfe_r': round(running_mfe, 4),
                    'mae_r': round(running_mae, 4),
                    'reason': 'STOP_TRIGGERED'
                }
            if target_hit:
                return {
                    'exit_status': 'TARGET_HIT',
                    'exit_bar': bar_idx,
                    'realized_r': planned_r - commission_r,
                    'mfe_r': round(running_mfe, 4),
                    'mae_r': round(running_mae, 4),
                    'reason': 'TARGET_REACHED'
                }

    # If holding time or data ends
    last_close = bars_to_check[-1].close if bars_to_check else entry_price
    if direction.lower() == 'short':
        unrealized_r = (entry_price - (last_close + spread_price)) / risk if risk > 0 else 0.0
    else:
        unrealized_r = ((last_close - spread_price) - entry_price) / risk if risk > 0 else 0.0

    return {
        'exit_status': 'TIME_OR_DATA_END',
        'exit_bar': len(bars_to_check),
        'realized_r': round(unrealized_r - commission_r, 4),
        'mfe_r': round(running_mfe, 4),
        'mae_r': round(running_mae, 4),
        'reason': 'BARS_EXHAUSTED'
    }


def compute_metrics(trades: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not trades:
        return {
            'total_trades': 0, 'wins': 0, 'losses': 0, 'time_expired': 0,
            'win_rate_percent': 0.0, 'sum_r': 0.0, 'expectancy_r': 0.0,
            'max_drawdown_r': 0.0, 'profit_factor': 0.0
        }

    wins = [t for t in trades if t['exit_status'] == 'TARGET_HIT' or t.get('realized_r', 0) > 0]
    losses = [t for t in trades if t['exit_status'] == 'STOP_HIT' or t.get('realized_r', 0) < 0]
    time_ex = [t for t in trades if t['exit_status'] == 'TIME_OR_DATA_END']

    total = len(trades)
    win_cnt = len(wins)
    loss_cnt = len(losses)
    win_rate = (win_cnt / total * 100.0) if total > 0 else 0.0

    sum_r = sum(t['realized_r'] for t in trades)
    expectancy = (sum_r / total) if total > 0 else 0.0

    gross_profit = sum(t['realized_r'] for t in wins if t['realized_r'] > 0)
    gross_loss = abs(sum(t['realized_r'] for t in losses if t['realized_r'] < 0))
    profit_factor = (gross_profit / gross_loss) if gross_loss > 0 else (999.0 if gross_profit > 0 else 0.0)

    # Max Drawdown
    peak = 0.0
    running = 0.0
    max_dd = 0.0
    for t in trades:
        running += t['realized_r']
        if running > peak:
            peak = running
        dd = peak - running
        if dd > max_dd:
            max_dd = dd

    return {
        'total_trades': total,
        'wins': win_cnt,
        'losses': loss_cnt,
        'time_expired': len(time_ex),
        'win_rate_percent': round(win_rate, 2),
        'sum_r': round(sum_r, 4),
        'expectancy_r': round(expectancy, 4),
        'profit_factor': round(profit_factor, 2),
        'max_drawdown_r': round(max_dd, 4)
    }


def run_ultimate_validation_experiment() -> Dict[str, Any]:
    base_dir = r"c:\Users\piard\.gemini\antigravity\scratch"
    data_dir = os.path.join(base_dir, "swing-bos-core", "data")
    replay_dir = os.path.join(data_dir, "replay_1year")
    eval_log_path = os.path.join(base_dir, "Begonya", "research", "hybrid_replay", "hybrid_replay_evaluation_log.json")
    struct_stop_log_path = os.path.join(base_dir, "Begonya", "research", "hybrid_replay", "structural_stop_audit_results.json")

    with open(eval_log_path, 'r', encoding='utf-8') as f:
        eval_log = json.load(f)
    with open(struct_stop_log_path, 'r', encoding='utf-8') as f:
        struct_stop_log = json.load(f)

    struct_map = {r['candidate_id']: r for r in struct_stop_log.get('records', [])}

    # Load 4H datasets for Macro Gate
    symbols = ['EURUSD', 'GBPUSD', 'XAUUSD', 'BTCUSD', 'ETHUSD', 'SOLUSD', 'USDCAD', 'USDJPY']
    four_hour_cache: Dict[str, List[MacroCandle]] = {}
    m1_cache: Dict[str, List[Candle]] = {}

    for s in symbols:
        # 4H candles
        p_4h = os.path.join(replay_dir, f"{s}_4h.json")
        if not os.path.exists(p_4h):
            p_4h = os.path.join(data_dir, f"{s}_4h.json")
        if os.path.exists(p_4h):
            with open(p_4h, 'r', encoding='utf-8') as fp:
                raw_4h = json.load(fp)
                four_hour_cache[s] = [MacroCandle(c['timestamp'], c['open'], c['high'], c['low'], c['close']) for c in raw_4h]
                four_hour_cache[s.replace('USD', 'USDT')] = four_hour_cache[s]

        # 1M candles
        p_1m = os.path.join(data_dir, f"{s}_1m.json")
        if not os.path.exists(p_1m):
            p_1m = os.path.join(data_dir, f"{s.replace('USD', 'USDT')}_1m.json")
        if os.path.exists(p_1m):
            with open(p_1m, 'r', encoding='utf-8') as fp:
                raw_1m = json.load(fp)
                m1_cache[s] = [Candle(c['timestamp'], c['open'], c['high'], c['low'], c['close']) for c in raw_1m]
                m1_cache[s.replace('USD', 'USDT')] = m1_cache[s]

    # Filter G2 filled candidates
    b50_candidates = eval_log['results_by_variant'].get('BODY_50', [])
    g2_results = [r for r in b50_candidates if r['final_status'] == 'ENTRY_FILLED']

    trade_pool: List[Dict[str, Any]] = []

    # Median timestamp for In-Sample vs Out-of-Sample split (2026-08-20 UTC)
    # Split timestamp: 1787184000000 (2026-08-20 00:00:00 UTC)
    OOS_CUTOFF_TIMESTAMP = 1787184000000

    # Load previously verified targets
    hypo_summary_path = os.path.join(base_dir, "Begonya", "research", "hybrid_replay", "comprehensive_hypothesis_summary.json")
    hypo_target_map = {}
    if os.path.exists(hypo_summary_path):
        with open(hypo_summary_path, 'r', encoding='utf-8') as fp:
            hypo_data = json.load(fp)
            for td in hypo_data.get('trade_details', []):
                hypo_target_map[td['candidate_id']] = td['target_price']

    for r in g2_results:
        cid = r['candidate_id']
        sym = r['symbol']
        dirn = r['trade_direction']
        entry_p = r['entry_price']
        fill_idx = r['filled_bar_index']
        sig_ts = r['signal_known_timestamp']

        st_meta = struct_map.get(cid)
        if not st_meta or st_meta.get('stop_audit_status') != 'VERIFIED_STRUCTURAL_STOP':
            continue

        struct_stop_p = st_meta['structural_stop_price']
        unrestricted_target_p = hypo_target_map.get(cid) or r.get('target_price')
        if not unrestricted_target_p:
            continue

        # Forward M1 bars
        sym_m1 = m1_cache.get(sym, [])
        fwd_bars = sym_m1[fill_idx + 1:] if fill_idx is not None and fill_idx < len(sym_m1) else []
        if not fwd_bars:
            continue

        # Macro Gate Evaluation (Strictly no-lookahead on closed 4H bars)
        sym_4h = four_hour_cache.get(sym, [])
        macro_gate_res = check_macro_gate(dirn, sym_4h, sig_ts)

        # Session Target Evaluation
        session_candles = [SessionCandle(c.timestamp, c.open, c.high, c.low, c.close) for c in sym_m1[:fill_idx + 1]]
        session_tgt, session_tag = detect_intraday_session_liquidity_target(
            entry_price=entry_p,
            stop_price=struct_stop_p,
            direction=dirn,
            signal_timestamp=sig_ts,
            recent_m1_candles=session_candles
        )

        # Fixed R Targets
        tgt_2r = compute_fixed_r_target(entry_p, struct_stop_p, dirn, 2.0)
        tgt_3r = compute_fixed_r_target(entry_p, struct_stop_p, dirn, 3.0)
        tgt_4r = compute_fixed_r_target(entry_p, struct_stop_p, dirn, 4.0)
        tgt_5r = compute_fixed_r_target(entry_p, struct_stop_p, dirn, 5.0)

        is_oos = (sig_ts >= OOS_CUTOFF_TIMESTAMP)
        session_name = detect_session(sig_ts)

        trade_pool.append({
            'candidate_id': cid,
            'symbol': sym,
            'direction': dirn,
            'signal_timestamp': sig_ts,
            'sample_cohort': 'OUT_OF_SAMPLE' if is_oos else 'IN_SAMPLE',
            'session': session_name,
            'entry_price': entry_p,
            'structural_stop_price': struct_stop_p,
            'unrestricted_target_price': unrestricted_target_p,
            'session_target_price': session_tgt,
            'session_tag': session_tag,
            'tgt_2r': tgt_2r,
            'tgt_3r': tgt_3r,
            'tgt_4r': tgt_4r,
            'tgt_5r': tgt_5r,
            'macro_gate': macro_gate_res,
            'forward_bars': fwd_bars
        })

    # COST MODELS
    # ECN Institutional vs Standard Retail
    cost_models = {
        'ZERO_COST': {'FX': 0.0, 'COMMODITY': 0.0, 'CRYPTO': 0.0, 'COMMISSION': 0.0},
        'ECN_INSTITUTIONAL': {'FX': 0.5, 'COMMODITY': 1.5, 'CRYPTO': 0.03, 'COMMISSION': 0.05},
        'STANDARD_RETAIL': {'FX': 1.5, 'COMMODITY': 3.0, 'CRYPTO': 0.10, 'COMMISSION': 0.0}
    }

    # EXPERIMENTAL VARIANTS
    # Variant 0: Pure Begonya (Unrestricted Target, No Macro Gate)
    # Variant 1: Begonya + Macro Gate (Veto counter-trend, Unrestricted Target)
    # Variant 2A: Begonya + Fixed 2R Target
    # Variant 2B: Begonya + Fixed 3R Target
    # Variant 2C: Begonya + Fixed 5R Target
    # Variant 2D: Begonya + Intraday Session Target (Capped at 5R)
    # Variant 3: Combined Master (Macro Gate + Fixed 3R Target)
    # Variant 4: Combined Master (Macro Gate + Intraday Session Target)

    variant_definitions = {
        'VAR_0_PURE_BASELINE': {'macro_gate': False, 'target_type': 'unrestricted'},
        'VAR_1_MACRO_GATE_ONLY': {'macro_gate': True, 'target_type': 'unrestricted'},
        'VAR_2A_FIXED_2R': {'macro_gate': False, 'target_type': 'fixed_2r'},
        'VAR_2B_FIXED_3R': {'macro_gate': False, 'target_type': 'fixed_3r'},
        'VAR_2C_FIXED_5R': {'macro_gate': False, 'target_type': 'fixed_5r'},
        'VAR_2D_SESSION_TARGET': {'macro_gate': False, 'target_type': 'session_target'},
        'VAR_3_COMBINED_MACRO_AND_3R': {'macro_gate': True, 'target_type': 'fixed_3r'},
        'VAR_4_COMBINED_MACRO_AND_SESSION': {'macro_gate': True, 'target_type': 'session_target'}
    }

    results_by_variant: Dict[str, Any] = {}

    for var_name, var_cfg in variant_definitions.items():
        var_results = {'IN_SAMPLE': {}, 'OUT_OF_SAMPLE': {}, 'OVERALL': {}}
        for cost_name, cost_cfg in cost_models.items():
            simulated_trades = []
            for t in trade_pool:
                # 1. Macro Gate check
                if var_cfg['macro_gate']:
                    if not t['macro_gate']['permitted']:
                        continue  # Trade vetoed by macro trend!

                # 2. Target selection
                tt = var_cfg['target_type']
                if tt == 'unrestricted':
                    chosen_tgt = t['unrestricted_target_price']
                elif tt == 'fixed_2r':
                    chosen_tgt = t['tgt_2r']
                elif tt == 'fixed_3r':
                    chosen_tgt = t['tgt_3r']
                elif tt == 'fixed_5r':
                    chosen_tgt = t['tgt_5r']
                elif tt == 'session_target':
                    chosen_tgt = t['session_target_price']
                else:
                    chosen_tgt = t['tgt_3r']

                ac = detect_asset_class(t['symbol'])
                spread = cost_cfg.get(ac, 0.0)
                comm = cost_cfg.get('COMMISSION', 0.0)

                sim = run_trade_simulation(
                    entry_price=t['entry_price'],
                    stop_price=t['structural_stop_price'],
                    target_price=chosen_tgt,
                    direction=t['direction'],
                    forward_m1_bars=t['forward_bars'],
                    spread_pips=spread,
                    symbol=t['symbol'],
                    commission_r=comm,
                    max_holding_bars=1440  # 24-hour max holding limit for realistic session trading
                )
                sim['symbol'] = t['symbol']
                sim['direction'] = t['direction']
                sim['cohort'] = t['sample_cohort']
                sim['session'] = t['session']
                sim['macro_permitted'] = t['macro_gate']['permitted']
                simulated_trades.append(sim)

            # Compute metrics per cohort
            is_trades = [tr for tr in simulated_trades if tr['cohort'] == 'IN_SAMPLE']
            oos_trades = [tr for tr in simulated_trades if tr['cohort'] == 'OUT_OF_SAMPLE']

            var_results['IN_SAMPLE'][cost_name] = compute_metrics(is_trades)
            var_results['OUT_OF_SAMPLE'][cost_name] = compute_metrics(oos_trades)
            var_results['OVERALL'][cost_name] = compute_metrics(simulated_trades)

        results_by_variant[var_name] = var_results

    # GRANULAR BREAKDOWNS for the Combined Master Variant (VAR_4_COMBINED_MACRO_AND_SESSION) under Standard Retail
    master_sims = []
    for t in trade_pool:
        if not t['macro_gate']['permitted']:
            continue
        ac = detect_asset_class(t['symbol'])
        spread = cost_models['STANDARD_RETAIL'].get(ac, 0.0)
        sim = run_trade_simulation(
            entry_price=t['entry_price'],
            stop_price=t['structural_stop_price'],
            target_price=t['session_target_price'],
            direction=t['direction'],
            forward_m1_bars=t['forward_bars'],
            spread_pips=spread,
            symbol=t['symbol'],
            max_holding_bars=1440
        )
        sim['symbol'] = t['symbol']
        sim['direction'] = t['direction']
        sim['cohort'] = t['sample_cohort']
        sim['session'] = t['session']
        master_sims.append(sim)

    # Symbol breakdown
    symbol_breakdown = {}
    for s in set(m['symbol'] for m in master_sims):
        symbol_breakdown[s] = compute_metrics([m for m in master_sims if m['symbol'] == s])

    # Direction breakdown
    direction_breakdown = {
        'LONG': compute_metrics([m for m in master_sims if m['direction'].lower() == 'long']),
        'SHORT': compute_metrics([m for m in master_sims if m['direction'].lower() == 'short'])
    }

    # Session breakdown
    session_breakdown = {
        'ASIA': compute_metrics([m for m in master_sims if m['session'] == 'ASIA']),
        'LONDON': compute_metrics([m for m in master_sims if m['session'] == 'LONDON']),
        'NEW_YORK': compute_metrics([m for m in master_sims if m['session'] == 'NEW_YORK'])
    }

    # EVALUATE DECISION THRESHOLDS
    # Target criteria: OOS Net Expectancy >= +0.25 R, Profit Factor >= 1.40, Max DD <= 12 R
    # Under Standard Retail broker conditions
    oos_master_metrics = results_by_variant['VAR_4_COMBINED_MACRO_AND_SESSION']['OUT_OF_SAMPLE']['STANDARD_RETAIL']
    oos_expectancy = oos_master_metrics['expectancy_r']
    oos_pf = oos_master_metrics['profit_factor']
    oos_dd = oos_master_metrics['max_drawdown_r']
    oos_trades_count = oos_master_metrics['total_trades']

    if oos_trades_count < 10:
        verdict = 'INSUFFICIENT_EVIDENCE'
        verdict_reason = f'OOS trade sample size (n={oos_trades_count}) is below minimum statistical significance threshold (n>=20).'
    elif oos_expectancy >= 0.25 and oos_pf >= 1.40 and oos_dd <= 12.0:
        verdict = 'GO'
        verdict_reason = f'All 3 OOS research criteria met: Expectancy={oos_expectancy:.2f}R >= 0.25R, PF={oos_pf:.2f} >= 1.40, DD={oos_dd:.2f}R <= 12R.'
    else:
        verdict = 'NO-GO'
        verdict_reason = f'Failed OOS research criteria: Expectancy={oos_expectancy:.2f}R, PF={oos_pf:.2f}, DD={oos_dd:.2f}R.'

    output_payload = {
        'experiment_timestamp': datetime.now(timezone.utc).isoformat(),
        'total_evaluated_trades': len(trade_pool),
        'in_sample_trades_count': len([t for t in trade_pool if t['sample_cohort'] == 'IN_SAMPLE']),
        'out_of_sample_trades_count': len([t for t in trade_pool if t['sample_cohort'] == 'OUT_OF_SAMPLE']),
        'macro_gate_veto_rate_percent': round((len([t for t in trade_pool if not t['macro_gate']['permitted']]) / len(trade_pool) * 100.0), 2),
        'results_by_variant': results_by_variant,
        'granular_breakdowns_master_variant': {
            'by_symbol': symbol_breakdown,
            'by_direction': direction_breakdown,
            'by_session': session_breakdown
        },
        'decision_evaluation': {
            'target_thresholds': {
                'min_oos_expectancy_r': 0.25,
                'min_oos_profit_factor': 1.40,
                'max_oos_drawdown_r': 12.0,
                'min_sample_size': 20
            },
            'achieved_oos_metrics': oos_master_metrics,
            'verdict': verdict,
            'verdict_reason': verdict_reason
        }
    }

    out_file = os.path.join(base_dir, "Begonya", "research", "ultimate_validation", "ultimate_validation_results.json")
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(output_payload, f, indent=2)

    return output_payload


if __name__ == '__main__':
    res = run_ultimate_validation_experiment()
    print("=== ULTIMATE VALIDATION RESULTS ===")
    print(f"Total trades: {res['total_evaluated_trades']}")
    print(f"In-Sample: {res['in_sample_trades_count']}, Out-of-Sample: {res['out_of_sample_trades_count']}")
    print(f"Macro Gate Veto Rate: {res['macro_gate_veto_rate_percent']}%")
    print(f"\n--- DECISION: {res['decision_evaluation']['verdict']} ---")
    print(res['decision_evaluation']['verdict_reason'])
    print("\n--- Out-of-Sample Combined Master (Standard Retail) ---")
    print(json.dumps(res['decision_evaluation']['achieved_oos_metrics'], indent=2))
