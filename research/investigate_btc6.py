import json
from datetime import datetime, timezone

def check():
    with open('../swing-bos-core/data/BTCUSD_15m.json', 'r') as f:
        d15 = json.load(f)

    print("=== BTC #6 CANDLES INVESTIGATION (2026-10-12) ===")
    for c in d15:
        dt = datetime.fromtimestamp(c['timestamp']/1000, tz=timezone.utc).isoformat()
        if '2026-10-12T05' in dt or '2026-10-12T06' in dt or '2026-10-12T07' in dt or '2026-10-12T08' in dt or '2026-10-12T09' in dt:
            print(f"{dt} (ts={c['timestamp']}) | Open: {c['open']:.2f} | High: {c['high']:.2f} | Low: {c['low']:.2f} | Close: {c['close']:.2f}")

    # Check ledger record for BTC #6
    with open('smc_engine/evidence/outcomes/macro-outcome-evidence.jsonl', 'r') as f:
        for line in f:
            r = json.loads(line)
            if r.get('signalId') == 'BTCUSD_15m_OB_1791777600000_1791779400000':
                print("\n=== RECORD IN macro-outcome-evidence.jsonl ===")
                for k, v in r.items():
                    print(f"  {k}: {v}")

if __name__ == '__main__':
    check()
