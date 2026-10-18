import json
from datetime import datetime, timezone

def verify_all_entries():
    with open('../swing-bos-core/data/BTCUSD_15m.json', 'r') as f:
        d15 = json.load(f)
    with open('smc_engine/data/1m_backtest/BTCUSD_1m_30d.json', 'r') as f:
        d1m = json.load(f)

    with open('smc_engine/evidence/outcomes/macro-outcome-evidence.jsonl', 'r') as f:
        records = [json.loads(line) for line in f if line.strip()]

    btc_6 = [
        r for r in records 
        if ("BTC" in r.get("symbol", "") or "BTC" in r.get("signalId", "")) 
        and r.get("entryConfirmed") is True
        and r.get("signalGeneratedAt") >= "2026-10-07"
    ]

    print("=" * 100)
    print("VERIFYING ALL 6 BTC TRADES AGAINST RAW 1M AND 15M CANDLES")
    print("=" * 100)

    for i, t in enumerate(btc_6, 1):
        sig_id = t['signalId']
        direction = t['direction']
        entry_p = float(t['entryPrice'])
        sl_dar = float(t['stopLoss'])
        tp_orig = float(t['takeProfit'])
        sig_ts = int(t['signalTimestamp'])
        rec_entry_ts = int(t['entryTimestamp'])
        rec_exit_ts = int(t['exitTimestamp'])
        rec_outcome = t['outcome']

        dt_sig = datetime.fromtimestamp(sig_ts/1000, tz=timezone.utc).strftime('%m-%d %H:%M')
        dt_rec_entry = datetime.fromtimestamp(rec_entry_ts/1000, tz=timezone.utc).strftime('%m-%d %H:%M')
        dt_rec_exit = datetime.fromtimestamp(rec_exit_ts/1000, tz=timezone.utc).strftime('%m-%d %H:%M')

        # Find first candle after sig_ts that touches entry_p
        # Check 1m first if available
        bars_1m = [b for b in d1m if b['timestamp'] >= sig_ts]
        first_touch_1m = None
        for b in bars_1m:
            if direction == 'short' and b['high'] >= entry_p:
                first_touch_1m = b['timestamp']
                break
            elif direction == 'long' and b['low'] <= entry_p:
                first_touch_1m = b['timestamp']
                break

        # Check 15m
        bars_15m = [b for b in d15 if b['timestamp'] >= sig_ts]
        first_touch_15m = None
        for b in bars_15m:
            if direction == 'short' and b['high'] >= entry_p:
                first_touch_15m = b['timestamp']
                break
            elif direction == 'long' and b['low'] <= entry_p:
                first_touch_15m = b['timestamp']
                break

        dt_touch_1m = datetime.fromtimestamp(first_touch_1m/1000, tz=timezone.utc).strftime('%m-%d %H:%M') if first_touch_1m else "N/A"
        dt_touch_15m = datetime.fromtimestamp(first_touch_15m/1000, tz=timezone.utc).strftime('%m-%d %H:%M') if first_touch_15m else "N/A"

        print(f"\n--- Trade #{i}: {sig_id} ({direction.upper()} @ ${entry_p:.2f}) ---")
        print(f"  Signal Time:           {dt_sig}")
        print(f"  First Candle Touch 1m: {dt_touch_1m}")
        print(f"  First Candle Touch 15m:{dt_touch_15m}")
        print(f"  Recorded Entry Time:   {dt_rec_entry}")
        print(f"  Recorded Exit Time:    {dt_rec_exit} ({rec_outcome})")
        
        # Check discrepancy
        if first_touch_15m and abs(first_touch_15m - rec_entry_ts) > 15 * 60 * 1000:
            print(f"  [DISCREPANCY DETECTED] Recorded entry differs from first candle touch by {(rec_entry_ts - first_touch_15m)/3600000:.2f} hours!")

if __name__ == '__main__':
    verify_all_entries()
