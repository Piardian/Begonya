import json
from datetime import datetime, timezone

def load_data():
    with open('../swing-bos-core/data/BTCUSD_1h.json', 'r') as f:
        d1h = json.load(f)
    with open('../swing-bos-core/data/BTCUSD_15m.json', 'r') as f:
        d15 = json.load(f)
    with open('smc_engine/data/1m_backtest/BTCUSD_1m_30d.json', 'r') as f:
        d1m = json.load(f)
    return d1h, d15, d1m

def get_1h_swings(d1h, cutoff_ts):
    # Only candles strictly closed at or before cutoff_ts
    # 1h candle open at ts closes at ts + 3600*1000
    valid = [c for c in d1h if (c['timestamp'] + 3600*1000) <= cutoff_ts]
    # Find fractal swing high/low (5-bar fractal confirmed 2 bars later)
    swings = []
    for i in range(2, len(valid) - 2):
        c = valid[i]
        conf_ts = valid[i+2]['timestamp'] + 3600*1000
        if conf_ts > cutoff_ts:
            continue
        # High
        if (c['high'] > valid[i-1]['high'] and c['high'] > valid[i-2]['high'] and
            c['high'] > valid[i+1]['high'] and c['high'] > valid[i+2]['high']):
            swings.append({'type': 'HIGH', 'price': c['high'], 'time': c['timestamp']})
        # Low
        if (c['low'] < valid[i-1]['low'] and c['low'] < valid[i-2]['low'] and
            c['low'] < valid[i+1]['low'] and c['low'] < valid[i+2]['low']):
            swings.append({'type': 'LOW', 'price': c['low'], 'time': c['timestamp']})
    return swings

def main():
    d1h, d15, d1m = load_data()
    
    # The 6 BTC trades from macro-outcome-evidence.jsonl
    with open('smc_engine/evidence/outcomes/macro-outcome-evidence.jsonl', 'r', encoding='utf-8') as f:
        records = [json.loads(line) for line in f if line.strip()]

    btc_6 = [
        r for r in records 
        if ("BTC" in r.get("symbol", "") or "BTC" in r.get("signalId", "")) 
        and r.get("entryConfirmed") is True
        and r.get("signalGeneratedAt") >= "2026-10-07"
    ]
    
    print(f"Loaded {len(btc_6)} BTC shadow trades from Oct 7-14 window.")
    
    for idx, t in enumerate(btc_6, 1):
        sig_id = t['signalId']
        direction = t['direction']
        entry_price = t['entryPrice']
        orig_sl = t['stopLoss']
        orig_tp = t['takeProfit']
        orig_risk = t['riskDistance']
        orig_outcome = t['outcome']
        orig_gross_r = t['realizedR']
        orig_net_r = t['netRealizedR']
        orig_cost_r = t['totalCostR']
        sig_ts = t['signalTimestamp']
        entry_ts = t['entryTimestamp']
        
        entry_dt = datetime.fromtimestamp(entry_ts/1000, tz=timezone.utc).isoformat()
        
        # Swings before signal
        swings = get_1h_swings(d1h, sig_ts)
        
        if direction == 'short':
            # Need swing high above entry
            high_swings = [s for s in swings if s['type'] == 'HIGH' and s['price'] > entry_price]
            recent_high = high_swings[-1] if high_swings else None
            struct_sl = recent_high['price'] + 20.0 if recent_high else orig_sl + 400.0
            struct_risk = abs(struct_sl - entry_price)
            struct_tp_2r = entry_price - (2.0 * struct_risk)
        else:
            # Need swing low below entry
            low_swings = [s for s in swings if s['type'] == 'LOW' and s['price'] < entry_price]
            recent_low = low_swings[-1] if low_swings else None
            struct_sl = recent_low['price'] - 20.0 if recent_low else orig_sl - 400.0
            struct_risk = abs(entry_price - struct_sl)
            struct_tp_2r = entry_price + (2.0 * struct_risk)
            
        # Cost calculation
        # Friction = 6.5 bps of entry price
        cost_usd = entry_price * 0.00065
        cr_orig = cost_usd / orig_risk
        cr_struct = cost_usd / struct_risk
        
        print(f"\n=======================================================")
        print(f"BTC Trade #{idx}: {sig_id}")
        print(f"Direction: {direction.upper()} | Entry: ${entry_price:.2f} ({entry_dt})")
        print(f"--- SENARYO A (Mevcut 15M Dar Stop) ---")
        print(f"  SL: ${orig_sl:.2f} (Risk: ${orig_risk:.2f}) | TP: ${orig_tp:.2f}")
        print(f"  Maliyet: ${cost_usd:.2f} -> C/R: {cr_orig:.3f}R (Gereken C/R: {orig_cost_r:.3f}R)")
        print(f"  Orijinal Sonuc: {orig_outcome} | Brut R: {orig_gross_r:+.2f}R | Net R: {orig_net_r:+.2f}R")
        
        print(f"--- SENARYO B (1H Yapisal Stop) ---")
        print(f"  Yapisal Swing: ${recent_high['price'] if direction == 'short' and recent_high else (recent_low['price'] if recent_low else 0):.2f}")
        print(f"  Yapisal SL: ${struct_sl:.2f} (Risk: ${struct_risk:.2f})")
        print(f"  2R Hedef: ${struct_tp_2r:.2f} (Hedef Mesafesi: ${2*struct_risk:.2f})")
        print(f"  Maliyet: ${cost_usd:.2f} -> C/R: {cr_struct:.3f}R")

if __name__ == '__main__':
    main()
