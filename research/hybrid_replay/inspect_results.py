import json

with open('research/hybrid_replay/comprehensive_hypothesis_summary.json', 'r') as f:
    d = json.load(f)

trades = d['trade_details']
print(f"Total trades: {len(trades)}")
for i, t in enumerate(trades):
    entry = t['entry_price']
    stop = t['structural_stop_price']
    tgt = t['target_price']
    risk = abs(entry - stop) if entry and stop else 0
    rew = abs(tgt - entry) if entry and tgt else 0
    r_mult = rew / risk if risk > 0 else 0
    print(f"{i+1}. {t['symbol']} {t['direction']}: entry={entry}, stop={stop}, risk={risk:.3f}, tgt={tgt}, rew={rew:.3f}, R={r_mult:.1f}, src={t['target_source']}")
