import json
from datetime import datetime, timezone

def inspect_basket():
    with open('../swing-bos-core/data/signal_delivery_queue.json', 'r', encoding='utf-8') as f:
        queue = json.load(f)

    target_symbols = ['BTCUSD', 'ETHUSD', 'SOLUSD', 'EURUSD', 'GBPUSD', 'XAUUSD']
    
    ts_start = int(datetime(2026, 7, 1, 0, 0, 0, tzinfo=timezone.utc).timestamp() * 1000)
    ts_end = int(datetime(2026, 9, 30, 23, 59, 59, tzinfo=timezone.utc).timestamp() * 1000)

    basket_signals = []
    counts_by_sym = {s: 0 for s in target_symbols}
    
    for item in queue:
        sym = item.get('symbol')
        if sym not in target_symbols:
            continue
        ca = item.get('signalCreatedAt')
        if not ca: continue
        dt = datetime.fromisoformat(ca.replace('Z', '+00:00'))
        ts = int(dt.timestamp() * 1000)
        if ts_start <= ts <= ts_end:
            basket_signals.append((ts, item))
            counts_by_sym[sym] += 1

    basket_signals.sort(key=lambda x: x[0])
    print(f"Total basket signals in 90-day window: {len(basket_signals)}")
    for sym, cnt in counts_by_sym.items():
        print(f"  {sym}: {cnt} signals")

if __name__ == '__main__':
    inspect_basket()
