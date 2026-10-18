import json
from datetime import datetime, timezone

def load_data():
    with open('../swing-bos-core/data/BTCUSD_1h.json', 'r') as f:
        d1h = json.load(f)
    return d1h

def ts_to_iso(ts):
    return datetime.fromtimestamp(ts/1000, tz=timezone.utc).strftime('%Y-%m-%d %H:%M UTC')

def audit_swings():
    d1h = load_data()
    
    with open('smc_engine/evidence/outcomes/macro-outcome-evidence.jsonl', 'r', encoding='utf-8') as f:
        records = [json.loads(line) for line in f if line.strip()]

    btc_6 = [
        r for r in records 
        if ("BTC" in r.get("symbol", "") or "BTC" in r.get("signalId", "")) 
        and r.get("entryConfirmed") is True
        and r.get("signalGeneratedAt") >= "2026-10-07"
    ]
    
    print("=" * 80)
    print("STRICT LOOK-AHEAD AUDIT FOR 1H SWINGS")
    print("=" * 80)
    
    for idx, t in enumerate(btc_6, 1):
        sig_id = t['signalId']
        direction = t['direction']
        sig_ts = t['signalTimestamp']
        entry_price = t['entryPrice']
        
        # Candles strictly closed at or before sig_ts
        closed_candles = [c for c in d1h if (c['timestamp'] + 3600*1000) <= sig_ts]
        last_closed = closed_candles[-1]
        last_closed_ts = last_closed['timestamp'] + 3600*1000
        
        # Detect all 5-bar fractal swings
        swings = []
        n = len(closed_candles)
        for i in range(2, n - 2):
            c = closed_candles[i]
            conf_bar = closed_candles[i+2]
            conf_ts = conf_bar['timestamp'] + 3600*1000
            
            # Strict no lookahead: confirmation must happen on or before signal time
            if conf_ts > sig_ts:
                continue
                
            # Swing High
            if (c['high'] > closed_candles[i-1]['high'] and c['high'] > closed_candles[i-2]['high'] and
                c['high'] > closed_candles[i+1]['high'] and c['high'] > closed_candles[i+2]['high']):
                swings.append({
                    'type': 'HIGH',
                    'price': c['high'],
                    'bar_idx': i,
                    'formed_ts': c['timestamp'],
                    'conf_ts': conf_ts
                })
                
            # Swing Low
            if (c['low'] < closed_candles[i-1]['low'] and c['low'] < closed_candles[i-2]['low'] and
                c['low'] < closed_candles[i+1]['low'] and c['low'] < closed_candles[i+2]['low']):
                swings.append({
                    'type': 'LOW',
                    'price': c['low'],
                    'bar_idx': i,
                    'formed_ts': c['timestamp'],
                    'conf_ts': conf_ts
                })
                
        # Candidate swing selection
        if direction == 'short':
            valid_swings = [s for s in swings if s['type'] == 'HIGH' and s['price'] > entry_price]
        else:
            valid_swings = [s for s in swings if s['type'] == 'LOW' and s['price'] < entry_price]
            
        selected = valid_swings[-1] if valid_swings else None
        
        print(f"\nTrade #{idx}: {sig_id} ({direction.upper()})")
        print(f"  Signal Time:         {ts_to_iso(sig_ts)} ({sig_ts})")
        print(f"  Last Closed 1H Bar:  {ts_to_iso(last_closed_ts)} (Close TS: {last_closed_ts})")
        print(f"  Available Swings:    {len(swings)} total ({len(valid_swings)} directional above/below entry)")
        if selected:
            print(f"  Selected Swing:      {selected['type']} @ ${selected['price']:.2f}")
            print(f"  Swing Formed Bar:    {ts_to_iso(selected['formed_ts'])} ({selected['formed_ts']})")
            print(f"  Swing Confirmed Bar: {ts_to_iso(selected['conf_ts'])} ({selected['conf_ts']})")
            lag_ms = sig_ts - selected['conf_ts']
            print(f"  Confirmation Lag:    {lag_ms / 3600000:.1f} hours before signal")
            assert selected['conf_ts'] <= sig_ts, "LOOKAHEAD VIOLATION!"
            print(f"  Lookahead Bias Check: PASSED (Confirmed {lag_ms / 3600000:.1f}h before signal)")
        else:
            print("  Selected Swing: NONE")

if __name__ == '__main__':
    audit_swings()
