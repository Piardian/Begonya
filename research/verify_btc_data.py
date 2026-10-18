import json
from datetime import datetime, timezone

def check():
    with open('../swing-bos-core/data/BTCUSD_15m.json', 'r') as f:
        d15 = json.load(f)
    with open('../swing-bos-core/data/BTCUSD_1h.json', 'r') as f:
        d1h = json.load(f)

    t0_15 = datetime.fromtimestamp(d15[0]['timestamp']/1000, tz=timezone.utc).isoformat()
    t1_15 = datetime.fromtimestamp(d15[-1]['timestamp']/1000, tz=timezone.utc).isoformat()
    print(f"15m candles: {len(d15)}, from {t0_15} to {t1_15}")

    t0_1h = datetime.fromtimestamp(d1h[0]['timestamp']/1000, tz=timezone.utc).isoformat()
    t1_1h = datetime.fromtimestamp(d1h[-1]['timestamp']/1000, tz=timezone.utc).isoformat()
    print(f"1h candles: {len(d1h)}, from {t0_1h} to {t1_1h}")

if __name__ == '__main__':
    check()
