import json
from datetime import datetime, timezone

def inspect_90d_btc():
    with open('../swing-bos-core/data/replay_1year/BTCUSD_15m.json', 'r') as f:
        d15 = json.load(f)
    with open('../swing-bos-core/data/replay_1year/BTCUSD_1h.json', 'r') as f:
        d1h = json.load(f)
    with open('../swing-bos-core/data/signal_delivery_queue.json', 'r', encoding='utf-8') as f:
        queue = json.load(f)

    ts_start = int(datetime(2026, 7, 1, 0, 0, 0, tzinfo=timezone.utc).timestamp() * 1000)
    ts_end = int(datetime(2026, 9, 30, 23, 59, 59, tzinfo=timezone.utc).timestamp() * 1000)

    btc_signals = []
    for item in queue:
        if 'BTC' not in item.get('symbol', ''):
            continue
        ca = item.get('signalCreatedAt')
        if not ca: continue
        dt = datetime.fromisoformat(ca.replace('Z', '+00:00'))
        ts = int(dt.timestamp() * 1000)
        if ts_start <= ts <= ts_end:
            btc_signals.append((ts, item))

    btc_signals.sort(key=lambda x: x[0])
    print(f"Total BTC signals in July 1 - Sept 30 window: {len(btc_signals)}")

    # Let's inspect each signal
    for i, (ts, sig) in enumerate(btc_signals, 1):
        dt_str = datetime.fromtimestamp(ts/1000, tz=timezone.utc).strftime('%Y-%m-%d %H:%M')
        cand = sig.get('candidate', {})
        poi = cand.get('poi', {})
        td = cand.get('tradeDirection')
        pt = cand.get('poiType')
        zl = poi.get('low') or poi.get('gapLow')
        zh = poi.get('high') or poi.get('gapHigh')
        print(f"#{i:02d} | {dt_str} | {td} {pt} | Zone: [{zl}, {zh}] | SignalId: {sig.get('signalId')}")

if __name__ == '__main__':
    inspect_90d_btc()
