import json
from datetime import datetime, timezone

def check_period():
    p15 = '../swing-bos-core/data/replay_1year/BTCUSD_15m.json'
    p1h = '../swing-bos-core/data/replay_1year/BTCUSD_1h.json'
    
    with open(p15, 'r') as f:
        d15 = json.load(f)
    with open(p1h, 'r') as f:
        d1h = json.load(f)

    # Filter 1 July to 30 September 2026 (inclusive)
    # 2026-07-01T00:00:00Z -> timestamp
    ts_start = int(datetime(2026, 7, 1, 0, 0, 0, tzinfo=timezone.utc).timestamp() * 1000)
    ts_end = int(datetime(2026, 9, 30, 23, 59, 59, tzinfo=timezone.utc).timestamp() * 1000)

    bars_15m = [b for b in d15 if ts_start <= b['timestamp'] <= ts_end]
    bars_1h = [b for b in d1h if ts_start <= b['timestamp'] <= ts_end]

    print(f"Target window: 2026-07-01 00:00 to 2026-09-30 23:59 (92 days)")
    print(f"BTCUSD 15m bars found: {len(bars_15m)}")
    print(f"BTCUSD 1h bars found:   {len(bars_1h)}")

    # Expected 15m bars in 92 days: 92 * 24 * 4 = 8,832 bars
    expected_15m = 92 * 24 * 4
    expected_1h = 92 * 24
    print(f"Expected 15m: {expected_15m} | Actual: {len(bars_15m)} | Diff: {len(bars_15m) - expected_15m}")
    print(f"Expected 1h:   {expected_1h} | Actual: {len(bars_1h)} | Diff: {len(bars_1h) - expected_1h}")

    # Check for gaps in 15m
    gaps_15m = []
    for i in range(1, len(bars_15m)):
        diff = bars_15m[i]['timestamp'] - bars_15m[i-1]['timestamp']
        if diff != 15 * 60 * 1000:
            gaps_15m.append((bars_15m[i-1]['timestamp'], bars_15m[i]['timestamp'], diff))

    print(f"15m gaps count: {len(gaps_15m)}")
    if gaps_15m:
        print(f"First 5 gaps: {gaps_15m[:5]}")

if __name__ == '__main__':
    check_period()
