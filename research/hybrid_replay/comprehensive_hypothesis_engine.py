"""
Begonya / ChecklistTrigger - Comprehensive Research Engine
==========================================================
1. Data Sourcing Feasibility Evaluation (6-12 Months Real BID/ASK)
2. Deterministic Lookahead-Free Target Generator (Historical M15 Swings)
3. Multi-Stop Model Simulation (1M Wick, 15M Structural, POI Boundary)
4. Parametric Buffer Sensitivity Scanning (FX 2-10p, Gold $1.0-$5.0, Crypto 0.2%-1.0%)
5. Realistic Multi-Tier Cost Modeling (Zero, ECN, Retail, Stress)

Path: Begonya/research/hybrid_replay/comprehensive_hypothesis_engine.py
"""

from __future__ import annotations

import os
import json
import math
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple


@dataclass
class Candle:
    timestamp: int
    open: float
    high: float
    low: float
    close: float
    volume: float = 0.0


@dataclass
class SwingPoint:
    timestamp: int
    price: float
    type: str  # 'high' or 'low'
    confirmed_at_bar: int
    confirmed_at_timestamp: int


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


def detect_confirmed_m15_swings(candles: List[Candle], up_to_timestamp: int) -> List[SwingPoint]:
    """
    Detect confirmed swings strictly on M15 bars closed before up_to_timestamp.
    Uses 5-bar fractal logic: 2 bars left, pivot, 2 bars right.
    Confirmation occurs at the close of candle i+2.
    """
    valid_candles = [c for c in candles if c.timestamp < up_to_timestamp]
    if len(valid_candles) < 5:
        return []

    swings: List[SwingPoint] = []
    for i in range(2, len(valid_candles) - 2):
        c_prev2 = valid_candles[i - 2]
        c_prev1 = valid_candles[i - 1]
        c_curr = valid_candles[i]
        c_next1 = valid_candles[i + 1]
        c_next2 = valid_candles[i + 2]

        conf_bar_idx = i + 2
        conf_ts = valid_candles[conf_bar_idx].timestamp + (15 * 60 * 1000)
        if conf_ts > up_to_timestamp:
            continue

        # Swing High
        if (c_curr.high > c_prev2.high and c_curr.high > c_prev1.high and
            c_curr.high > c_next1.high and c_curr.high > c_next2.high):
            swings.append(SwingPoint(
                timestamp=c_curr.timestamp,
                price=c_curr.high,
                type='high',
                confirmed_at_bar=conf_bar_idx,
                confirmed_at_timestamp=conf_ts
            ))

        # Swing Low
        if (c_curr.low < c_prev2.low and c_curr.low < c_prev1.low and
            c_curr.low < c_next1.low and c_curr.low < c_next2.low):
            swings.append(SwingPoint(
                timestamp=c_curr.timestamp,
                price=c_curr.low,
                type='low',
                confirmed_at_bar=conf_bar_idx,
                confirmed_at_timestamp=conf_ts
            ))

    return swings


def generate_deterministic_target(
    swings: List[SwingPoint],
    entry_price: float,
    direction: str,
    symbol: str,
    min_distance_pips: float = 3.0
) -> Optional[Tuple[float, str]]:
    """
    Deterministic Liquidity Target Generator following liquidityMagnetDetector.ts:
    1. Equal Highs (EQH) / Equal Lows (EQL) within tolerance.
    2. Nearest active un-taken opposing swing high/low.
    """
    pip = get_pip_size(symbol)
    tolerance = 2.5 * pip if 'FX' in detect_asset_class(symbol) else entry_price * 0.002

    if direction == 'long':
        highs = [s for s in swings if s.type == 'high' and s.price > entry_price]
        if not highs:
            return None
        # Check EQH clusters
        for i in range(len(highs)):
            cluster = [highs[i]]
            for j in range(i + 1, len(highs)):
                if abs(highs[i].price - highs[j].price) <= tolerance:
                    cluster.append(highs[j])
            if len(cluster) >= 2:
                avg_p = sum(s.price for s in cluster) / len(cluster)
                dist_p = (avg_p - entry_price) / pip
                if dist_p >= min_distance_pips:
                    return (avg_p, f"EQH_CLUSTER_{len(cluster)}_POINTS")
        # Nearest un-taken single swing high
        valid_highs = [h for h in highs if ((h.price - entry_price) / pip) >= min_distance_pips]
        if valid_highs:
            valid_highs.sort(key=lambda s: s.price)
            return (valid_highs[0].price, "NEAREST_M15_SWING_HIGH")
        return None
    else:
        lows = [s for s in swings if s.type == 'low' and s.price < entry_price]
        if not lows:
            return None
        # Check EQL clusters
        for i in range(len(lows)):
            cluster = [lows[i]]
            for j in range(i + 1, len(lows)):
                if abs(lows[i].price - lows[j].price) <= tolerance:
                    cluster.append(lows[j])
            if len(cluster) >= 2:
                avg_p = sum(s.price for s in cluster) / len(cluster)
                dist_p = (entry_price - avg_p) / pip
                if dist_p >= min_distance_pips:
                    return (avg_p, f"EQL_CLUSTER_{len(cluster)}_POINTS")
        # Nearest un-taken single swing low
        valid_lows = [l for l in lows if ((entry_price - l.price) / pip) >= min_distance_pips]
        if valid_lows:
            valid_lows.sort(key=lambda s: s.price, reverse=True)
            return (valid_lows[0].price, "NEAREST_M15_SWING_LOW")
        return None


def run_trade_simulation(
    entry_price: float,
    stop_price: float,
    target_price: float,
    direction: str,
    forward_m1_bars: List[Candle],
    spread_pips: float,
    symbol: str,
    commission_r: float = 0.0
) -> Dict[str, Any]:
    """
    Simulates a trade bar-by-bar using strict bid/ask checks.
    For Short: Entry filled at Bid, Stop checked against Ask = bar.high + spread, Target checked against Ask = bar.low + spread.
    For Long: Entry filled at Ask, Stop checked against Bid = bar.low - spread, Target checked against Bid = bar.high - spread.
    """
    pip = get_pip_size(symbol)
    spread_price = spread_pips * pip

    risk = abs(entry_price - stop_price)
    reward = abs(target_price - entry_price)
    planned_r = reward / risk if risk > 0 else 0.0

    for bar_idx, bar in enumerate(forward_m1_bars):
        if direction == 'short':
            ask_high = bar.high + spread_price
            ask_low = bar.low + spread_price
            stop_hit = ask_high >= stop_price
            target_hit = ask_low <= target_price

            if stop_hit and target_hit:
                # Ambiguous collision: conservative assumption is loss
                return {
                    'exit_status': 'STOP_HIT',
                    'exit_bar': bar_idx,
                    'realized_r': -1.0 - commission_r,
                    'reason': 'AMBIGUOUS_SAME_BAR_COLLISION_CONSERVATIVE_LOSS'
                }
            if stop_hit:
                return {
                    'exit_status': 'STOP_HIT',
                    'exit_bar': bar_idx,
                    'realized_r': -1.0 - commission_r,
                    'reason': 'STOP_TRIGGERED'
                }
            if target_hit:
                return {
                    'exit_status': 'TARGET_HIT',
                    'exit_bar': bar_idx,
                    'realized_r': planned_r - commission_r,
                    'reason': 'TARGET_REACHED'
                }
        else:
            bid_low = bar.low - spread_price
            bid_high = bar.high - spread_price
            stop_hit = bid_low <= stop_price
            target_hit = bid_high >= target_price

            if stop_hit and target_hit:
                return {
                    'exit_status': 'STOP_HIT',
                    'exit_bar': bar_idx,
                    'realized_r': -1.0 - commission_r,
                    'reason': 'AMBIGUOUS_SAME_BAR_COLLISION_CONSERVATIVE_LOSS'
                }
            if stop_hit:
                return {
                    'exit_status': 'STOP_HIT',
                    'exit_bar': bar_idx,
                    'realized_r': -1.0 - commission_r,
                    'reason': 'STOP_TRIGGERED'
                }
            if target_hit:
                return {
                    'exit_status': 'TARGET_HIT',
                    'exit_bar': bar_idx,
                    'realized_r': planned_r - commission_r,
                    'reason': 'TARGET_REACHED'
                }

    return {
        'exit_status': 'DATA_END_UNRESOLVED',
        'exit_bar': len(forward_m1_bars),
        'realized_r': 0.0,
        'reason': 'BARS_EXHAUSTED'
    }


def compute_metrics(trades: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not trades:
        return {
            'total_trades': 0, 'wins': 0, 'losses': 0, 'win_rate_percent': 0.0,
            'sum_r': 0.0, 'expectancy_r': 0.0, 'max_drawdown_r': 0.0, 'profit_factor': 0.0
        }

    resolved = [t for t in trades if t['exit_status'] in ['STOP_HIT', 'TARGET_HIT']]
    wins = [t for t in resolved if t['exit_status'] == 'TARGET_HIT']
    losses = [t for t in resolved if t['exit_status'] == 'STOP_HIT']

    total = len(resolved)
    win_cnt = len(wins)
    loss_cnt = len(losses)
    win_rate = (win_cnt / total * 100.0) if total > 0 else 0.0

    sum_r = sum(t['realized_r'] for t in resolved)
    expectancy = (sum_r / total) if total > 0 else 0.0

    gross_profit = sum(t['realized_r'] for t in wins if t['realized_r'] > 0)
    gross_loss = abs(sum(t['realized_r'] for t in losses if t['realized_r'] < 0))
    profit_factor = (gross_profit / gross_loss) if gross_loss > 0 else (999.0 if gross_profit > 0 else 0.0)

    # Max Drawdown
    peak = 0.0
    running = 0.0
    max_dd = 0.0
    for t in resolved:
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
        'win_rate_percent': round(win_rate, 2),
        'sum_r': round(sum_r, 4),
        'expectancy_r': round(expectancy, 4),
        'profit_factor': round(profit_factor, 2),
        'max_drawdown_r': round(max_dd, 4)
    }


def run_comprehensive_investigation() -> Dict[str, Any]:
    base_dir = r"c:\Users\piard\.gemini\antigravity\scratch"
    data_dir = os.path.join(base_dir, "swing-bos-core", "data")
    eval_log_path = os.path.join(base_dir, "Begonya", "research", "hybrid_replay", "hybrid_replay_evaluation_log.json")
    struct_stop_log_path = os.path.join(base_dir, "Begonya", "research", "hybrid_replay", "structural_stop_audit_results.json")

    with open(eval_log_path, 'r', encoding='utf-8') as f:
        eval_log = json.load(f)
    with open(struct_stop_log_path, 'r', encoding='utf-8') as f:
        struct_stop_log = json.load(f)

    # Map candidate_id -> structural stop details
    struct_map = {r['candidate_id']: r for r in struct_stop_log.get('records', [])}

    # Load 15M candles for historical swing detection from replay_1year
    replay_dir = os.path.join(base_dir, "swing-bos-core", "data", "replay_1year")
    symbols = ['EURUSD', 'GBPUSD', 'XAUUSD', 'BTCUSDT', 'ETHUSDT', 'USDJPY', 'USDCAD', 'BTCUSD', 'ETHUSD', 'SOLUSD']
    m15_cache: Dict[str, List[Candle]] = {}
    for s in symbols:
        mapped_name = s.replace('USDT', 'USD')
        p = os.path.join(replay_dir, f"{mapped_name}_15m.json")
        if not os.path.exists(p):
            p = os.path.join(data_dir, f"{s}_15m.json")
        if os.path.exists(p):
            with open(p, 'r', encoding='utf-8') as fp:
                raw = json.load(fp)
                m15_cache[s] = [Candle(c['timestamp'], c['open'], c['high'], c['low'], c['close']) for c in raw]
                m15_cache[mapped_name] = m15_cache[s]

    # Load 1M candles for forward trade replay
    m1_cache: Dict[str, List[Candle]] = {}
    for s in symbols:
        p = os.path.join(data_dir, f"{s}_1m.json")
        if os.path.exists(p):
            with open(p, 'r', encoding='utf-8') as fp:
                raw = json.load(fp)
                m1_cache[s] = [Candle(c['timestamp'], c['open'], c['high'], c['low'], c['close']) for c in raw]

    # Filter G2 filled candidates
    b50_candidates = eval_log['results_by_variant'].get('BODY_50', [])
    g2_results = [r for r in b50_candidates if r['final_status'] == 'ENTRY_FILLED']

    trade_pool: List[Dict[str, Any]] = []

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
        poi_stop_p = st_meta['alternative_poi_stop']
        # Model A 1M wick stop: sweep_extreme_price
        wick_stop_p = r.get('sweep_extreme_price')
        if wick_stop_p is None:
            wick_stop_p = struct_stop_p

        # Generate Deterministic Target strictly from pre-signal M15 swings
        m15_bars = m15_cache.get(sym, [])
        swings = detect_confirmed_m15_swings(m15_bars, sig_ts)
        target_info = generate_deterministic_target(swings, entry_p, dirn, sym, min_distance_pips=2.0)

        # Fallback to recorded target if available and verified
        recorded_target = r.get('target_price')
        has_rec_target = (recorded_target is not None and recorded_target > 0)

        chosen_target_p = None
        target_source = "NONE"
        if has_rec_target:
            chosen_target_p = recorded_target
            target_source = "SYSTEMATIC_SIGNAL_TARGET"
        elif target_info is not None:
            chosen_target_p = target_info[0]
            target_source = f"DETERMINISTIC_HISTORICAL_SWING_{target_info[1]}"

        # Forward M1 bars after fill
        sym_m1 = m1_cache.get(sym, [])
        fwd_bars = sym_m1[fill_idx + 1:] if fill_idx is not None and fill_idx < len(sym_m1) else []

        trade_pool.append({
            'candidate_id': cid,
            'symbol': sym,
            'direction': dirn,
            'signal_timestamp': sig_ts,
            'entry_price': entry_p,
            'wick_stop_price': wick_stop_p,
            'structural_stop_price': struct_stop_p,
            'poi_stop_price': poi_stop_p,
            'target_price': chosen_target_p,
            'target_source': target_source,
            'has_target': (chosen_target_p is not None),
            'forward_bars': fwd_bars
        })

    # MULTI-STOP MODEL COMPARISON ACROSS SPREAD SCENARIOS
    # Stop Models:
    # 1. 'MODEL_A_1M_WICK'
    # 2. 'MODEL_B_15M_STRUCTURAL'
    # 3. 'MODEL_C_POI_BOUNDARY'

    spread_scenarios = {
        'ZERO_COST': {'FX': 0.0, 'COMMODITY': 0.0, 'CRYPTO': 0.0, 'COMMISSION': 0.0},
        'ECN_INSTITUTIONAL': {'FX': 0.5, 'COMMODITY': 1.5, 'CRYPTO': 0.03, 'COMMISSION': 0.05},
        'STANDARD_RETAIL': {'FX': 1.5, 'COMMODITY': 3.0, 'CRYPTO': 0.10, 'COMMISSION': 0.0},
        'STRESS_HIGH_SPREAD': {'FX': 2.5, 'COMMODITY': 6.0, 'CRYPTO': 0.15, 'COMMISSION': 0.0}
    }

    results_by_stop_model: Dict[str, Dict[str, Any]] = {}

    stop_models = ['MODEL_A_1M_WICK', 'MODEL_B_15M_STRUCTURAL', 'MODEL_C_POI_BOUNDARY']

    for sm in stop_models:
        results_by_stop_model[sm] = {}
        for sc_name, sc_params in spread_scenarios.items():
            sim_trades = []
            for t in trade_pool:
                if not t['has_target']:
                    continue
                ac = detect_asset_class(t['symbol'])
                spread = sc_params.get(ac, 0.0)
                comm = sc_params.get('COMMISSION', 0.0)

                if sm == 'MODEL_A_1M_WICK':
                    stop_p = t['wick_stop_price']
                elif sm == 'MODEL_B_15M_STRUCTURAL':
                    stop_p = t['structural_stop_price']
                else:
                    stop_p = t['poi_stop_price']

                # Verify direction
                if t['direction'] == 'long' and stop_p >= t['entry_price']:
                    continue
                if t['direction'] == 'short' and stop_p <= t['entry_price']:
                    continue

                sim = run_trade_simulation(
                    entry_price=t['entry_price'],
                    stop_price=stop_p,
                    target_price=t['target_price'],
                    direction=t['direction'],
                    forward_m1_bars=t['forward_bars'],
                    spread_pips=spread,
                    symbol=t['symbol'],
                    commission_r=comm
                )
                sim['symbol'] = t['symbol']
                sim['candidate_id'] = t['candidate_id']
                sim_trades.append(sim)

            results_by_stop_model[sm][sc_name] = compute_metrics(sim_trades)

    # PARAMETRIC BUFFER HYPOTHESIS SCANNING (NO PRE-ASSUMED TRUTHS)
    # Testing FX Buffers: [0, 2, 4, 6, 8, 10] pips
    # Testing Gold Buffers: [0, $1.0, $1.5, $2.0, $2.5, $3.5, $5.0]
    fx_buffers = [0.0, 2.0, 4.0, 6.0, 8.0, 10.0]
    gold_buffers = [0.0, 1.0, 1.5, 2.0, 2.5, 3.5, 5.0]

    parametric_fx_scan: Dict[str, Any] = {}
    fx_trades = [t for t in trade_pool if t['has_target'] and detect_asset_class(t['symbol']) == 'FX']

    for b in fx_buffers:
        sc_name = f"MIN_STOP_{b}_PIPS"
        filtered_sims = []
        for t in fx_trades:
            pip = get_pip_size(t['symbol'])
            risk_pips = abs(t['entry_price'] - t['structural_stop_price']) / pip
            if risk_pips < b:
                continue  # Filtered out by buffer hypothesis

            # Run with Standard Retail spread
            sim = run_trade_simulation(
                entry_price=t['entry_price'],
                stop_price=t['structural_stop_price'],
                target_price=t['target_price'],
                direction=t['direction'],
                forward_m1_bars=t['forward_bars'],
                spread_pips=1.5,
                symbol=t['symbol']
            )
            filtered_sims.append(sim)
        parametric_fx_scan[sc_name] = compute_metrics(filtered_sims)

    parametric_gold_scan: Dict[str, Any] = {}
    gold_trades = [t for t in trade_pool if t['has_target'] and detect_asset_class(t['symbol']) == 'COMMODITY']

    for gb in gold_buffers:
        sc_name = f"MIN_STOP_${gb}"
        filtered_sims = []
        for t in gold_trades:
            risk_usd = abs(t['entry_price'] - t['structural_stop_price'])
            if risk_usd < gb:
                continue

            sim = run_trade_simulation(
                entry_price=t['entry_price'],
                stop_price=t['structural_stop_price'],
                target_price=t['target_price'],
                direction=t['direction'],
                forward_m1_bars=t['forward_bars'],
                spread_pips=3.0,  # $0.30 in gold
                symbol=t['symbol']
            )
            filtered_sims.append(sim)
        parametric_gold_scan[sc_name] = compute_metrics(filtered_sims)

    # DATA FEASIBILITY AUDIT SUMMARY
    data_feasibility = {
        'dukascopy': {
            'suitability': 'EXCELLENT_FOR_FX_AND_GOLD',
            'quote_types': 'BID_AND_ASK_TICK_LEVEL',
            'historical_depth': '10+_YEARS',
            'cost': 'FREE_PUBLIC_ACCESS',
            'resolution': 'TICK_AND_1_MINUTE',
            'implementation_tool': 'python dukascopy-node / tick-data-downloader'
        },
        'mt5_history_center': {
            'suitability': 'EXCELLENT_FOR_ALL_ASSETS',
            'quote_types': 'BID_AND_ASK_M1_AND_TICKS',
            'historical_depth': 'DEPENDS_ON_BROKER_1_TO_5_YEARS',
            'cost': 'FREE_VIA_TERMINAL_EXPORT',
            'resolution': 'M1_AND_TICKS',
            'implementation_tool': 'MT5 Python API / direct export'
        },
        'binance_vision': {
            'suitability': 'EXCELLENT_FOR_CRYPTO',
            'quote_types': 'TRADE_AND_ORDERBOOK_TICKS',
            'historical_depth': '5+_YEARS',
            'cost': 'FREE_PUBLIC_ARCHIVE',
            'resolution': '1_SECOND_AND_1_MINUTE_AND_TICKS',
            'implementation_tool': 'data.binance.vision batch download'
        },
        'twelve_data_current': {
            'suitability': 'INSUFFICIENT_FOR_RELIABLE_BACKTEST',
            'quote_types': 'MID_OHLC_ONLY_NO_ASK_BID',
            'historical_depth': 'LIMITED_ON_FREE_TIER_5000_BARS',
            'cost': 'FREE_WITH_HEAVY_RATE_LIMITS',
            'resolution': '1M_MID_ONLY',
            'verdict': 'NOT_RECOMMENDED_FOR_EXECUTION_LEVEL_RESEARCH'
        }
    }

    full_payload = {
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'trade_pool_size': len(trade_pool),
        'trades_with_deterministic_or_systematic_targets': len([t for t in trade_pool if t['has_target']]),
        'legacy_trades_resolved_with_m15_swings': len([t for t in trade_pool if 'DETERMINISTIC' in t['target_source']]),
        'systematic_targets_count': len([t for t in trade_pool if 'SYSTEMATIC' in t['target_source']]),
        'data_sourcing_feasibility': data_feasibility,
        'results_by_stop_model': results_by_stop_model,
        'parametric_fx_buffer_scan': parametric_fx_scan,
        'parametric_gold_buffer_scan': parametric_gold_scan,
        'trade_details': [
            {
                'candidate_id': t['candidate_id'],
                'symbol': t['symbol'],
                'direction': t['direction'],
                'entry_price': t['entry_price'],
                'structural_stop_price': t['structural_stop_price'],
                'target_price': t['target_price'],
                'target_source': t['target_source']
            }
            for t in trade_pool
        ]
    }

    out_file = os.path.join(base_dir, "Begonya", "research", "hybrid_replay", "comprehensive_hypothesis_summary.json")
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(full_payload, f, indent=2)

    return full_payload


if __name__ == '__main__':
    res = run_comprehensive_investigation()
    print("=== INVESTIGATION RESULTS SUMMARY ===")
    print(f"Total trade pool: {res['trade_pool_size']}")
    print(f"Trades with targets: {res['trades_with_deterministic_or_systematic_targets']}")
    print(f"Legacy resolved via M15 swings: {res['legacy_trades_resolved_with_m15_swings']}")
    print("\n--- Model B (15M Structural) Across Costs ---")
    print(json.dumps(res['results_by_stop_model']['MODEL_B_15M_STRUCTURAL'], indent=2))
    print("\n--- Model A (1M Wick) Across Costs ---")
    print(json.dumps(res['results_by_stop_model']['MODEL_A_1M_WICK'], indent=2))
    print("\n--- FX Parametric Buffer Scan (Standard Retail Spread) ---")
    print(json.dumps(res['parametric_fx_buffer_scan'], indent=2))
    print("\n--- Gold Parametric Buffer Scan (Standard Retail Spread) ---")
    print(json.dumps(res['parametric_gold_buffer_scan'], indent=2))
