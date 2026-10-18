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
OOS_CUTOFF_TIMESTAMP = 1787184000000

correct_var4_oos = []

for r in g2_results:
    cid = r['candidate_id']
    sym = r['symbol']
    dirn = r['trade_direction']
    entry_p = r['entry_price']
    fill_ts = r['filled_timestamp']
    sig_ts = r['signal_known_timestamp']

    st_meta = struct_map.get(cid)
    if not st_meta or st_meta.get('stop_audit_status') != 'VERIFIED_STRUCTURAL_STOP':
        continue
    struct_stop_p = st_meta['structural_stop_price']

    # Correct forward bars strictly after fill timestamp
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
    if sig_ts >= OOS_CUTOFF_TIMESTAMP:
        exit_bar = fwd_bars[sim['exit_bar']] if sim['exit_bar'] < len(fwd_bars) else fwd_bars[-1]
        sig_dt = datetime.fromtimestamp(sig_ts / 1000.0, timezone.utc)
        exit_dt = datetime.fromtimestamp(exit_bar.timestamp / 1000.0, timezone.utc)
        correct_var4_oos.append({
            'candidate_id': cid,
            'symbol': sym,
            'direction': dirn,
            'signal_time_utc': sig_dt.strftime('%Y-%m-%d %H:%M'),
            'exit_time_utc': exit_dt.strftime('%Y-%m-%d %H:%M'),
            'exit_status': sim['exit_status'],
            'realized_r': sim['realized_r'],
            'reason': sim['reason']
        })

print("=== CORRECTED OOS TRADES (CORRECT CHRONOLOGY) ===")
for i, t in enumerate(correct_var4_oos):
    print(f"{i+1:2d}. {t['signal_time_utc']} -> {t['exit_time_utc']} | {t['symbol']:>6} {t['direction']:>5} | {t['exit_status']:>10} | R: {t['realized_r']:>5.2f}")

metrics = compute_metrics(correct_var4_oos)
print("\nCORRECTED METRICS:")
print(json.dumps(metrics, indent=2))
