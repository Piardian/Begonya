import json
import os
from datetime import datetime, timezone

from macro_gate import check_macro_gate, Candle as MacroCandle
from session_targets import detect_intraday_session_liquidity_target, Candle as SessionCandle
from ultimate_replay_engine import Candle, run_trade_simulation, get_pip_size, detect_asset_class, detect_session

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

OOS_CUTOFF_TIMESTAMP = 1787184000000

var4_trades = []

for r in g2_results:
    cid = r['candidate_id']
    sym = r['symbol']
    dirn = r['trade_direction']
    entry_p = r['entry_price']
    fill_idx = r['filled_bar_index']
    fill_ts = r['filled_timestamp']
    sig_ts = r['signal_known_timestamp']

    st_meta = struct_map.get(cid)
    if not st_meta or st_meta.get('stop_audit_status') != 'VERIFIED_STRUCTURAL_STOP':
        continue

    struct_stop_p = st_meta['structural_stop_price']
    sym_m1 = m1_cache.get(sym, [])
    fwd_bars = sym_m1[fill_idx + 1:] if fill_idx is not None and fill_idx < len(sym_m1) else []
    if not fwd_bars:
        continue

    # 4H macro gate
    sym_4h = four_hour_cache.get(sym, [])
    macro_gate_res = check_macro_gate(dirn, sym_4h, sig_ts)

    # Session target
    session_candles = [SessionCandle(c.timestamp, c.open, c.high, c.low, c.close) for c in sym_m1[:fill_idx + 1]]
    session_tgt, session_tag = detect_intraday_session_liquidity_target(
        entry_price=entry_p,
        stop_price=struct_stop_p,
        direction=dirn,
        signal_timestamp=sig_ts,
        recent_m1_candles=session_candles
    )

    is_oos = (sig_ts >= OOS_CUTOFF_TIMESTAMP)

    # VAR_4 requires macro_gate_res['permitted'] == True
    if not macro_gate_res['permitted']:
        continue

    # Standard Retail cost
    ac = detect_asset_class(sym)
    spread_pips = 1.5 if ac == 'FX' else (3.0 if ac == 'COMMODITY' else 0.10)
    pip_size = get_pip_size(sym)
    spread_val = spread_pips * pip_size

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

    exit_bar_idx = sim['exit_bar']
    exit_bar = fwd_bars[exit_bar_idx] if exit_bar_idx < len(fwd_bars) else fwd_bars[-1]
    exit_ts = exit_bar.timestamp
    exit_dt = datetime.fromtimestamp(exit_ts / 1000.0, timezone.utc)
    sig_dt = datetime.fromtimestamp(sig_ts / 1000.0, timezone.utc)

    risk_dist = abs(entry_p - struct_stop_p)
    reward_dist = abs(session_tgt - entry_p)
    planned_r = reward_dist / risk_dist if risk_dist > 0 else 0

    var4_trades.append({
        'candidate_id': cid,
        'symbol': sym,
        'direction': dirn,
        'cohort': 'OUT_OF_SAMPLE' if is_oos else 'IN_SAMPLE',
        'signal_timestamp': sig_ts,
        'signal_time_utc': sig_dt.strftime('%Y-%m-%d %H:%M'),
        'entry_price': entry_p,
        'structural_stop_price': struct_stop_p,
        'risk_distance': risk_dist,
        'session_target_price': session_tgt,
        'session_tag': session_tag,
        'planned_r': planned_r,
        'exit_status': sim['exit_status'],
        'exit_reason': sim['reason'],
        'exit_time_utc': exit_dt.strftime('%Y-%m-%d %H:%M'),
        'exit_bar_index': exit_bar_idx,
        'realized_r': sim['realized_r'],
        'spread_pips': spread_pips,
        'spread_value': spread_val
    })

print(f"Total VAR_4 trades evaluated: {len(var4_trades)}")
oos_var4 = [t for t in var4_trades if t['cohort'] == 'OUT_OF_SAMPLE']
print(f"Total OOS VAR_4 trades: {len(oos_var4)}")

print("\n--- CHRONOLOGICALLY SORTED OOS TRADES & EQUITY CURVE ---")
sorted_oos = sorted(oos_var4, key=lambda x: x['signal_timestamp'])
peak = 0.0
running = 0.0
max_dd = 0.0

for i, t in enumerate(sorted_oos):
    r = t['realized_r']
    running += r
    if running > peak:
        peak = running
    dd = peak - running
    if dd > max_dd:
        max_dd = dd
    print(f"{i+1:2d}. {t['signal_time_utc']} | {t['symbol']:<7} {t['direction']:<5} | Exit: {t['exit_status']:<10} | R: {r:>5.2f} | Equity: {running:>6.2f} | DD: {dd:>5.2f}")

print(f"\nTotal Sum R: {running:.2f} R")
print(f"Chronologically Corrected Max Drawdown: {max_dd:.2f} R")

