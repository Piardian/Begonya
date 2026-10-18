import json
from datetime import datetime, timezone

def inspect_1m():
    with open('smc_engine/data/1m_backtest/BTCUSD_1m_30d.json', 'r') as f:
        d1m = json.load(f)

    # Let's check Trade #1: Signal 10-07 22:00, Entry recorded 10-07 23:30, Entry price 83406.30
    print("=== TRADE #1: Checking 1m candles around 10-07 23:30 ===")
    bars_t1 = [b for b in d1m if b['timestamp'] >= 1791410400000 and b['timestamp'] <= 1791418000000]
    entry_p = 83406.30
    print(f"Bars in window: {len(bars_t1)}")
    for b in bars_t1:
        dt = datetime.fromtimestamp(b['timestamp']/1000, tz=timezone.utc).strftime('%H:%M')
        if b['high'] >= entry_p:
            print(f"[{dt}] TOUCHED! High {b['high']} >= Entry {entry_p}")
            break

    # Let's check Trade #2: Signal 10-08 00:45, Entry recorded 10-08 01:15, Entry price 83334.76
    print("\n=== TRADE #2: Checking 1m candles around 10-08 01:15 ===")
    bars_t2 = [b for b in d1m if b['timestamp'] >= 1791420300000 and b['timestamp'] <= 1791425000000]
    entry_p2 = 83334.76
    print(f"Bars in window: {len(bars_t2)}")
    for b in bars_t2:
        dt = datetime.fromtimestamp(b['timestamp']/1000, tz=timezone.utc).strftime('%H:%M')
        if b['high'] >= entry_p2:
            print(f"[{dt}] TOUCHED! High {b['high']} >= Entry {entry_p2}")
            break

    # Let's check Trade #3: Signal 10-09 21:45, Entry recorded 10-09 22:30, Entry price 82624.48
    print("\n=== TRADE #3: Checking 1m candles around 10-09 22:30 ===")
    bars_t3 = [b for b in d1m if b['timestamp'] >= 1791582300000 and b['timestamp'] <= 1791590000000]
    entry_p3 = 82624.48
    print(f"Bars in window: {len(bars_t3)}")
    for b in bars_t3:
        dt = datetime.fromtimestamp(b['timestamp']/1000, tz=timezone.utc).strftime('%H:%M')
        if b['high'] >= entry_p3:
            print(f"[{dt}] TOUCHED! High {b['high']} >= Entry {entry_p3}")
            break

    # Let's check Trade #4: Signal 10-11 04:30, Entry recorded 10-11 05:00, Entry price 83042.99
    print("\n=== TRADE #4: Checking 1m candles around 10-11 05:00 ===")
    bars_t4 = [b for b in d1m if b['timestamp'] >= 1791693000000 and b['timestamp'] <= 1791700000000]
    entry_p4 = 83042.99
    print(f"Bars in window: {len(bars_t4)}")
    for b in bars_t4:
        dt = datetime.fromtimestamp(b['timestamp']/1000, tz=timezone.utc).strftime('%H:%M')
        if b['high'] >= entry_p4:
            print(f"[{dt}] TOUCHED! High {b['high']} >= Entry {entry_p4}")
            break

    # Let's check Trade #5: Signal 10-11 17:45, Entry recorded 10-11 21:15, Entry price 83400.00
    print("\n=== TRADE #5: Checking 1m candles around 10-11 21:15 ===")
    bars_t5 = [b for b in d1m if b['timestamp'] >= 1791740700000 and b['timestamp'] <= 1791760000000]
    entry_p5 = 83400.00
    print(f"Bars in window: {len(bars_t5)}")
    for b in bars_t5:
        dt = datetime.fromtimestamp(b['timestamp']/1000, tz=timezone.utc).strftime('%H:%M')
        if b['low'] <= entry_p5:
            print(f"[{dt}] TOUCHED! Low {b['low']} <= Entry {entry_p5}")
            break

if __name__ == '__main__':
    inspect_1m()
