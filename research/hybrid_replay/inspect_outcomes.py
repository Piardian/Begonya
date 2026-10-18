import json
from research.hybrid_replay.comprehensive_hypothesis_engine import run_trade_simulation, get_pip_size

with open('research/hybrid_replay/comprehensive_hypothesis_summary.json', 'r') as f:
    d = json.load(f)

from research.hybrid_replay.comprehensive_hypothesis_engine import run_comprehensive_investigation
payload = run_comprehensive_investigation()

# Let's inspect the outcomes of all 25 trades under Model B Zero Cost and Standard Retail
with open('research/hybrid_replay/hybrid_replay_evaluation_log.json') as f:
    eval_log = json.load(f)
with open('research/hybrid_replay/structural_stop_audit_results.json') as f:
    stop_audit = json.load(f)

# Load m1 cache
m1_cache = {}
symbols = set(t['symbol'] for t in d['trade_details'])
import os
for sym in symbols:
    p = f'../swing-bos-core/data/{sym}_1m.json'
    if os.path.exists(p):
        with open(p) as fp:
            m1_cache[sym] = json.load(fp)

# Match with filled_bar_index
b50 = eval_log['results_by_variant']['BODY_50']
b50_map = {r['candidate_id']: r for r in b50}

from research.hybrid_replay.comprehensive_hypothesis_engine import Candle, run_trade_simulation

print("Trade-by-trade outcomes (Model B - Standard Retail):")
for i, t in enumerate(d['trade_details']):
    cid = t['candidate_id']
    sym = t['symbol']
    b_meta = b50_map.get(cid, {})
    fill_idx = b_meta.get('filled_bar_index')
    raw_m1 = m1_cache.get(sym, [])
    candles = [Candle(c['timestamp'], c['open'], c['high'], c['low'], c['close']) for c in raw_m1]
    fwd = candles[fill_idx + 1:] if fill_idx is not None else []
    
    sim = run_trade_simulation(
        entry_price=t['entry_price'],
        stop_price=t['structural_stop_price'],
        target_price=t['target_price'],
        direction=t['direction'],
        forward_m1_bars=fwd,
        spread_pips=1.5 if 'USD' in sym and sym != 'XAUUSD' else (3.0 if sym == 'XAUUSD' else 0.1),
        symbol=sym
    )
    print(f"{i+1}. {sym} {t['direction']}: status={sim['exit_status']}, R={sim['realized_r']:.2f}, reason={sim['reason']}")

