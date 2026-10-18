"""
Begonya Ultimate Validation - Deduplicated & Cleaned Replay Audit
================================================================
Implements:
1. Ex-ante Setup Cluster / Concurrency Deduplication (FIFO / Single Position per Setup).
2. Clean BID/ASK Execution Accounting (No double-counting spread penalties).
3. Exact trade-by-trade metrics: Trade Count, Win Rate, Expectancy, Max Drawdown, Profit Factor.
"""

import json
import os
from datetime import datetime, timezone
from macro_gate import check_macro_gate, Candle as MacroCandle
from session_targets import detect_intraday_session_liquidity_target, Candle as SessionCandle
from ultimate_replay_engine import Candle, run_trade_simulation, get_pip_size, detect_asset_class, compute_metrics

base_dir = r"c:\Users\piard\.gemini\antigravity\scratch"
data_dir = os.path.join(base_dir, "swing-bos-core", "data")
replay_dir = os.path.join(data_dir, "replay_1year")

eval_log = json.load(open(os.path.join(base_dir, "Begonya", "research", "hybrid_replay", "hybrid_replay_evaluation_log.json"), 'r', encoding='utf-8'))
struct_stop_log = json.load(open(os.path.join(base_dir, "Begonya", "research", "hybrid_replay", "structural_stop_audit_results.json"), 'r', encoding='utf-8'))
struct_map = {r['candidate_id']: r for r in struct_stop_log.get('records', [])}

symbols = ['EURUSD', 'GBPUSD', 'XAUUSD', 'BTCUSD', 'ETHUSD', 'SOLUSD', 'USDCAD', 'USDJPY']
four_hour_cache = {}
m1_cache = {}

for s in symbols:
    p_4h = os.path.join(replay_dir, f"{s}_4h.json")
    if not os.path.exists(p_4h):
        p_4h = os.path.join(data_dir, f"{s}_4h.json")
    if os.path.exists(p_4h):
        raw = json.load(open(p_4h, 'r', encoding='utf-8'))
        four_hour_cache[s] = [MacroCandle(c['timestamp'], c['open'], c['high'], c['low'], c['close']) for c in raw]
        four_hour_cache[s.replace('USD', 'USDT')] = four_hour_cache[s]

    p_1m = os.path.join(data_dir, f"{s}_1m.json")
    if not os.path.exists(p_1m):
        p_1m = os.path.join(data_dir, f"{s.replace('USD', 'USDT')}_1m.json")
    if os.path.exists(p_1m):
        raw = json.load(open(p_1m, 'r', encoding='utf-8'))
        m1_cache[s] = [Candle(c['timestamp'], c['open'], c['high'], c['low'], c['close']) for c in raw]
        m1_cache[s.replace('USD', 'USDT')] = m1_cache[s]

b50 = eval_log['results_by_variant'].get('BODY_50', [])
g2_results = [r for r in b50 if r['final_status'] == 'ENTRY_FILLED']
OOS_CUTOFF_TIMESTAMP = 1787184000000 # 2026-08-20 00:00 UTC

raw_candidates = []

for r in g2_results:
    cid = r['candidate_id']
    sym = r['symbol']
    dirn = r['trade_direction']
    entry_p = r['entry_price']
    fill_ts = r['filled_timestamp']
    sig_ts = r['signal_known_timestamp']

    if sig_ts < OOS_CUTOFF_TIMESTAMP:
        continue

    st_meta = struct_map.get(cid)
    if not st_meta or st_meta.get('stop_audit_status') != 'VERIFIED_STRUCTURAL_STOP':
        continue
    struct_stop_p = st_meta['structural_stop_price']

    sym_m1 = m1_cache.get(sym, [])
    fwd_bars = [c for c in sym_m1 if c.timestamp > fill_ts]
    if not fwd_bars:
        continue

    sym_4h = four_hour_cache.get(sym, [])
    macro_gate_res = check_macro_gate(dirn, sym_4h, sig_ts)
    if not macro_gate_res['permitted']:
        continue

    session_candles = [SessionCandle(c.timestamp, c.open, c.high, c.low, c.close) for c in sym_m1 if c.timestamp <= fill_ts][-720:]
    session_tgt, session_tag = detect_intraday_session_liquidity_target(entry_p, struct_stop_p, dirn, sig_ts, session_candles)

    ac = detect_asset_class(sym)
    spread_pips = 1.5 if ac == 'FX' else (3.0 if ac == 'COMMODITY' else 0.10)

    sim = run_trade_simulation(
        entry_price=entry_p,
        stop_price=struct_stop_p,
        target_price=session_tgt,
        direction=dirn,
        forward_m1_bars=fwd_bars,
        spread_pips=spread_pips,
        symbol=sym,
        commission_r=0.0,
        max_holding_bars=1440
    )

    exit_bar = fwd_bars[sim['exit_bar']] if sim['exit_bar'] < len(fwd_bars) else fwd_bars[-1]
    sig_dt = datetime.fromtimestamp(sig_ts / 1000.0, timezone.utc)
    exit_dt = datetime.fromtimestamp(exit_bar.timestamp / 1000.0, timezone.utc)

    risk_dist = abs(entry_p - struct_stop_p)
    reward_dist = abs(session_tgt - entry_p)
    planned_r = reward_dist / risk_dist if risk_dist > 0 else 0.0

    raw_candidates.append({
        'candidate_id': cid,
        'symbol': sym,
        'direction': dirn,
        'signal_ts': sig_ts,
        'fill_ts': fill_ts,
        'exit_ts': exit_bar.timestamp,
        'signal_time_utc': sig_dt.strftime('%Y-%m-%d %H:%M'),
        'exit_time_utc': exit_dt.strftime('%Y-%m-%d %H:%M'),
        'entry_price': entry_p,
        'stop_price': struct_stop_p,
        'target_price': session_tgt,
        'risk_distance': risk_dist,
        'planned_r': planned_r,
        'spread_pips': spread_pips,
        'exit_status': sim['exit_status'],
        'realized_r': sim['realized_r'],
        'reason': sim['reason']
    })

# Sort chronologically by signal timestamp
raw_candidates.sort(key=lambda x: (x['signal_ts'], x['candidate_id']))

print(f"Total raw candidates generated: {len(raw_candidates)}")

# EX-ANTE DEDUPLICATION:
# Rule: A trader or automated execution engine cannot enter multiple concurrent positions on the same symbol/direction
# on the exact same setup cluster.
# If a trade on symbol S is already open [fill_ts, exit_ts], subsequent signals on symbol S with the same direction
# and same entry level are rejected as duplicate executions.

deduplicated_trades = []
rejected_duplicates = []

for cand in raw_candidates:
    is_duplicate = False
    for active in deduplicated_trades:
        # Check concurrency on same symbol & direction
        if cand['symbol'] == active['symbol'] and cand['direction'] == active['direction']:
            # Overlap in time window
            overlap = not (cand['fill_ts'] >= active['exit_ts'] or cand['exit_ts'] <= active['fill_ts'])
            # Same price zone / identical setup
            price_match = abs(cand['entry_price'] - active['entry_price']) / active['entry_price'] < 0.001
            if overlap and price_match:
                is_duplicate = True
                rejected_duplicates.append({
                    'duplicate_id': cand['candidate_id'],
                    'primary_id': active['candidate_id'],
                    'symbol': cand['symbol'],
                    'signal_time': cand['signal_time_utc'],
                    'r_impact': cand['realized_r'],
                    'reason': f"Concurrent duplicate of {active['candidate_id']} on {cand['symbol']}"
                })
                break
    if not is_duplicate:
        deduplicated_trades.append(cand)

print(f"Deduplicated trades count: {len(deduplicated_trades)}")
print(f"Rejected duplicate count: {len(rejected_duplicates)}")

print("\n--- REJECTED DUPLICATES ---")
for r in rejected_duplicates:
    print(f"Rejected: {r['duplicate_id']} (Primary: {r['primary_id']}) | R: {r['r_impact']:+0.2f} | {r['reason']}")

print("\n--- DEDUPLICATED TRADE LOG ---")
headers = ['#', 'Signal Time (UTC)', 'Symbol', 'Dir', 'Entry', 'Stop', 'Risk', 'Target', 'PlanR', 'Exit Time (UTC)', 'Exit Reason', 'Realized R']
row_fmt = '{:<2} | {:<16} | {:<6} | {:<5} | {:<9} | {:<9} | {:<7} | {:<9} | {:<5} | {:<16} | {:<14} | {:<10}'
print(row_fmt.format(*headers))
print('-' * 130)

cum_r = 0.0
peak_r = 0.0
max_dd = 0.0

for i, t in enumerate(deduplicated_trades):
    cum_r += t['realized_r']
    if cum_r > peak_r:
        peak_r = cum_r
    dd = peak_r - cum_r
    if dd > max_dd:
        max_dd = dd

    row = [
        str(i+1),
        t['signal_time_utc'],
        t['symbol'],
        t['direction'].upper(),
        f"{t['entry_price']:.4f}",
        f"{t['stop_price']:.4f}",
        f"{t['risk_distance']:.4f}",
        f"{t['target_price']:.4f}",
        f"{t['planned_r']:.1f}R",
        t['exit_time_utc'],
        t['exit_status'],
        f"{t['realized_r']:+.2f}R"
    ]
    print(row_fmt.format(*row))

metrics = compute_metrics(deduplicated_trades)
metrics['chronological_max_drawdown_r'] = round(max_dd, 2)

print("\n--- DEFINITIVE DEDUPLICATED METRICS ---")
print(json.dumps(metrics, indent=2))

output_path = os.path.join(base_dir, "Begonya", "research", "ultimate_validation", "deduplicated_validation_results.json")
with open(output_path, 'w', encoding='utf-8') as fp:
    json.dump({
        'metrics': metrics,
        'deduplicated_trades': deduplicated_trades,
        'rejected_duplicates': rejected_duplicates
    }, fp, indent=2)

print(f"\nSaved deduplicated results to: {output_path}")
