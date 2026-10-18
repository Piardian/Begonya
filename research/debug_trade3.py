import json
from datetime import datetime, timezone

with open('smc_engine/data/1m_backtest/BTCUSD_1m_30d.json', 'r') as f:
    d1m = json.load(f)

entry_ts = 1791585000000 # 2026-10-09 22:30:00
bars = [b for b in d1m if b['timestamp'] >= entry_ts and b['timestamp'] <= 1791610200000]
print(f"Bars count: {len(bars)}")
entry_p = 82624.48
sl_p = 82783.01
tp_p = 81950.73
risk = sl_p - entry_p # 158.53

min_l = min(b['low'] for b in bars)
max_h = max(b['high'] for b in bars)
print(f"Min low: {min_l} (favorable: {entry_p - min_l:.2f} = {(entry_p - min_l)/risk:.3f}R)")
print(f"Max high: {max_h} (adverse: {max_h - entry_p:.2f} = {(max_h - entry_p)/risk:.3f}R)")

for i, b in enumerate(bars):
    dt = datetime.fromtimestamp(b['timestamp']/1000, tz=timezone.utc).isoformat()
    if b['high'] >= sl_p:
        print(f"SL hit at bar {i} ({dt}): high={b['high']} >= sl={sl_p}")
        break
    if b['low'] <= tp_p:
        print(f"TP hit at bar {i} ({dt}): low={b['low']} <= tp={tp_p}")
        break
