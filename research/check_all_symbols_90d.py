import json
from datetime import datetime, timezone

with open('../swing-bos-core/data/signal_delivery_queue.json', 'r', encoding='utf-8') as f:
    queue = json.load(f)

ts_start = int(datetime(2026, 7, 1, 0, 0, 0, tzinfo=timezone.utc).timestamp() * 1000)
ts_end = int(datetime(2026, 9, 30, 23, 59, 59, tzinfo=timezone.utc).timestamp() * 1000)

signals_90d = []
sym_counts = {}
for item in queue:
    ca = item.get('signalCreatedAt')
    if not ca: continue
    dt = datetime.fromisoformat(ca.replace('Z', '+00:00'))
    ts = int(dt.timestamp() * 1000)
    if ts_start <= ts <= ts_end:
        signals_90d.append(item)
        s = item.get('symbol', 'UNKNOWN')
        sym_counts[s] = sym_counts.get(s, 0) + 1

print(f"Total 90-day signals across ALL symbols: {len(signals_90d)}")
print("Symbol breakdown:")
for s, c in sorted(sym_counts.items(), key=lambda x: x[1], reverse=True):
    print(f"  {s}: {c} signals")
