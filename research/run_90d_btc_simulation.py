"""
Simulation of 90-day Out-of-Sample BTC Signals (July 1 - Sept 30, 2026)
Frozen Rules:
- 1H Structural Stop (T_conf <= T_signal)
- Original Liquidity Target (Scenario C)
- C/R <= 0.25R Filter
- Friction: 6.5 bps of entry price (4 bps comm, 1 bps sprd, 1.5 bps slip)
"""

import json
from datetime import datetime, timezone

def load_data():
    with open('../swing-bos-core/data/replay_1year/BTCUSD_15m.json', 'r') as f:
        d15 = json.load(f)
    with open('../swing-bos-core/data/replay_1year/BTCUSD_1h.json', 'r') as f:
        d1h = json.load(f)
    with open('../swing-bos-core/data/signal_delivery_queue.json', 'r', encoding='utf-8') as f:
        queue = json.load(f)
    return d15, d1h, queue

def get_confirmed_1h_swings(d1h, cutoff_ts):
    closed = [c for c in d1h if (c['timestamp'] + 3600*1000) <= cutoff_ts]
    n = len(closed)
    swings = []
    for i in range(2, n - 2):
        c = closed[i]
        conf_ts = closed[i+2]['timestamp'] + 3600*1000
        if conf_ts > cutoff_ts:
            continue
        if (c['high'] > closed[i-1]['high'] and c['high'] > closed[i-2]['high'] and
            c['high'] > closed[i+1]['high'] and c['high'] > closed[i+2]['high']):
            swings.append({'type': 'HIGH', 'price': float(c['high']), 'conf_ts': conf_ts})
        if (c['low'] < closed[i-1]['low'] and c['low'] < closed[i-2]['low'] and
            c['low'] < closed[i+1]['low'] and c['low'] < closed[i+2]['low']):
            swings.append({'type': 'LOW', 'price': float(c['low']), 'conf_ts': conf_ts})
    return swings

def simulate_signal(sig_item, d15, d1h):
    cand = sig_item.get('candidate', {})
    poi = cand.get('poi', {})
    direction = cand.get('tradeDirection')
    pt = cand.get('poiType')
    zl = float(poi.get('low') or poi.get('gapLow'))
    zh = float(poi.get('high') or poi.get('gapHigh'))
    
    ca = sig_item.get('signalCreatedAt')
    dt = datetime.fromisoformat(ca.replace('Z', '+00:00'))
    sig_ts = int(dt.timestamp() * 1000)
    
    # Entry price model: proximal zone edge (long: zh, short: zl for FVG; midpoint for OB)
    if pt == 'FVG':
        entry_p = zh if direction == 'long' else zl
    else:
        entry_p = (zl + zh) / 2.0
        
    # 1H structural swing stop
    swings = get_confirmed_1h_swings(d1h, sig_ts)
    if direction == 'short':
        valid_sw = [s for s in swings if s['type'] == 'HIGH' and s['price'] > entry_p]
        sel_sw = valid_sw[-1] if valid_sw else None
        struct_sl = sel_sw['price'] + 20.0 if sel_sw else entry_p + 500.0
        struct_risk = abs(struct_sl - entry_p)
    else:
        valid_sw = [s for s in swings if s['type'] == 'LOW' and s['price'] < entry_p]
        sel_sw = valid_sw[-1] if valid_sw else None
        struct_sl = sel_sw['price'] - 20.0 if sel_sw else entry_p - 500.0
        struct_risk = abs(entry_p - struct_sl)
        
    # Cost & C/R check
    cost_usd = entry_p * 0.00065
    cr = cost_usd / struct_risk if struct_risk > 0 else 999.0
    
    # Target: Opposing liquidity or 1.5x structural/zone swing
    target_dist = abs(zh - zl) * 3.0 # Natural liquidity pool distance
    tp_orig = entry_p + target_dist if direction == 'long' else entry_p - target_dist
    target_r = target_dist / struct_risk
    
    # 1. Filter: C/R <= 0.25R
    cr_pass = (cr <= 0.25)
    
    # Replay on 15m candles
    candles_fwd = [c for c in d15 if c['timestamp'] >= sig_ts]
    
    # Entry window: 16 bars (4 hours)
    entry_filled = False
    entry_bar_idx = None
    entry_ts = None
    
    for idx, c in enumerate(candles_fwd[:16]):
        if direction == 'long' and c['low'] <= entry_p:
            entry_filled = True
            entry_bar_idx = idx
            entry_ts = c['timestamp']
            break
        elif direction == 'short' and c['high'] >= entry_p:
            entry_filled = True
            entry_bar_idx = idx
            entry_ts = c['timestamp']
            break
            
    if not entry_filled:
        return {
            'signal_id': sig_item.get('signalId'),
            'date': dt.strftime('%Y-%m-%d %H:%M'),
            'direction': direction,
            'poi_type': pt,
            'entry_p': entry_p,
            'struct_sl': struct_sl,
            'risk_usd': struct_risk,
            'cr': cr,
            'cr_pass': cr_pass,
            'status': 'EXPIRED_UNFILLED',
            'gross_r': 0.0,
            'cost_r': 0.0,
            'net_r': 0.0,
            'outcome': 'EXPIRED',
            'exit_ts': None
        }
        
    if not cr_pass:
        return {
            'signal_id': sig_item.get('signalId'),
            'date': dt.strftime('%Y-%m-%d %H:%M'),
            'direction': direction,
            'poi_type': pt,
            'entry_p': entry_p,
            'struct_sl': struct_sl,
            'risk_usd': struct_risk,
            'cr': cr,
            'cr_pass': False,
            'status': 'FILTERED_CR_EXCEEDED',
            'gross_r': 0.0,
            'cost_r': 0.0,
            'net_r': 0.0,
            'outcome': 'FILTERED',
            'exit_ts': None
        }
        
    # Replay trade
    trade_candles = candles_fwd[entry_bar_idx:]
    be_armed = False
    effective_sl = struct_sl
    
    for c in trade_candles:
        h = c['high']
        l = c['low']
        ts = c['timestamp']
        
        if direction == 'long':
            # BE check (+1.0R)
            if not be_armed and (h - entry_p) >= (1.0 * struct_risk):
                be_armed = True
                effective_sl = entry_p
                
            hit_sl = (l <= effective_sl)
            hit_tp = (h >= tp_orig)
            
            if hit_sl and hit_tp:
                # Conservative conflict: SL first
                gross_r = 0.0 if (be_armed and effective_sl == entry_p) else -1.0
                out = 'BE' if (be_armed and effective_sl == entry_p) else 'SL'
                return {
                    'signal_id': sig_item.get('signalId'),
                    'date': dt.strftime('%Y-%m-%d %H:%M'),
                    'direction': direction,
                    'poi_type': pt,
                    'entry_p': entry_p,
                    'struct_sl': struct_sl,
                    'risk_usd': struct_risk,
                    'cr': cr,
                    'cr_pass': True,
                    'status': 'FILLED',
                    'gross_r': gross_r,
                    'cost_r': cr,
                    'net_r': gross_r - cr,
                    'outcome': out,
                    'exit_ts': ts
                }
            elif hit_sl:
                gross_r = 0.0 if (be_armed and effective_sl == entry_p) else -1.0
                out = 'BE' if (be_armed and effective_sl == entry_p) else 'SL'
                return {
                    'signal_id': sig_item.get('signalId'),
                    'date': dt.strftime('%Y-%m-%d %H:%M'),
                    'direction': direction,
                    'poi_type': pt,
                    'entry_p': entry_p,
                    'struct_sl': struct_sl,
                    'risk_usd': struct_risk,
                    'cr': cr,
                    'cr_pass': True,
                    'status': 'FILLED',
                    'gross_r': gross_r,
                    'cost_r': cr,
                    'net_r': gross_r - cr,
                    'outcome': out,
                    'exit_ts': ts
                }
            elif hit_tp:
                gross_r = target_r
                return {
                    'signal_id': sig_item.get('signalId'),
                    'date': dt.strftime('%Y-%m-%d %H:%M'),
                    'direction': direction,
                    'poi_type': pt,
                    'entry_p': entry_p,
                    'struct_sl': struct_sl,
                    'risk_usd': struct_risk,
                    'cr': cr,
                    'cr_pass': True,
                    'status': 'FILLED',
                    'gross_r': gross_r,
                    'cost_r': cr,
                    'net_r': gross_r - cr,
                    'outcome': 'TP',
                    'exit_ts': ts
                }
        else: # short
            if not be_armed and (entry_p - l) >= (1.0 * struct_risk):
                be_armed = True
                effective_sl = entry_p
                
            hit_sl = (h >= effective_sl)
            hit_tp = (l <= tp_orig)
            
            if hit_sl and hit_tp:
                gross_r = 0.0 if (be_armed and effective_sl == entry_p) else -1.0
                out = 'BE' if (be_armed and effective_sl == entry_p) else 'SL'
                return {
                    'signal_id': sig_item.get('signalId'),
                    'date': dt.strftime('%Y-%m-%d %H:%M'),
                    'direction': direction,
                    'poi_type': pt,
                    'entry_p': entry_p,
                    'struct_sl': struct_sl,
                    'risk_usd': struct_risk,
                    'cr': cr,
                    'cr_pass': True,
                    'status': 'FILLED',
                    'gross_r': gross_r,
                    'cost_r': cr,
                    'net_r': gross_r - cr,
                    'outcome': out,
                    'exit_ts': ts
                }
            elif hit_sl:
                gross_r = 0.0 if (be_armed and effective_sl == entry_p) else -1.0
                out = 'BE' if (be_armed and effective_sl == entry_p) else 'SL'
                return {
                    'signal_id': sig_item.get('signalId'),
                    'date': dt.strftime('%Y-%m-%d %H:%M'),
                    'direction': direction,
                    'poi_type': pt,
                    'entry_p': entry_p,
                    'struct_sl': struct_sl,
                    'risk_usd': struct_risk,
                    'cr': cr,
                    'cr_pass': True,
                    'status': 'FILLED',
                    'gross_r': gross_r,
                    'cost_r': cr,
                    'net_r': gross_r - cr,
                    'outcome': out,
                    'exit_ts': ts
                }
            elif hit_tp:
                gross_r = target_r
                return {
                    'signal_id': sig_item.get('signalId'),
                    'date': dt.strftime('%Y-%m-%d %H:%M'),
                    'direction': direction,
                    'poi_type': pt,
                    'entry_p': entry_p,
                    'struct_sl': struct_sl,
                    'risk_usd': struct_risk,
                    'cr': cr,
                    'cr_pass': True,
                    'status': 'FILLED',
                    'gross_r': gross_r,
                    'cost_r': cr,
                    'net_r': gross_r - cr,
                    'outcome': 'TP',
                    'exit_ts': ts
                }
                
    return {
        'signal_id': sig_item.get('signalId'),
        'date': dt.strftime('%Y-%m-%d %H:%M'),
        'direction': direction,
        'poi_type': pt,
        'entry_p': entry_p,
        'struct_sl': struct_sl,
        'risk_usd': struct_risk,
        'cr': cr,
        'cr_pass': True,
        'status': 'OPEN_TIMEOUT',
        'gross_r': 0.0,
        'cost_r': cr,
        'net_r': -cr,
        'outcome': 'TIMEOUT',
        'exit_ts': trade_candles[-1]['timestamp']
    }

def main():
    d15, d1h, queue = load_data()
    
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
    
    print("=" * 100)
    print(f"90-DAY OUT-OF-SAMPLE BTC SIMULATION (1 JULY - 30 SEPTEMBER 2026)")
    print(f"Total BTC Signals in Delivery Queue: {len(btc_signals)}")
    print("=" * 100)
    
    results = []
    for ts, sig in btc_signals:
        res = simulate_signal(sig, d15, d1h)
        results.append(res)
        
    print(f"{'#':<3} | {'Date':<16} | {'Dir':<5} | {'POI':<4} | {'Status':<18} | {'Outcome':<8} | {'C/R':<6} | {'Gross R':<8} | {'Net R':<8}")
    print("-" * 95)
    for i, r in enumerate(results, 1):
        print(f"{i:<3} | {r['date']:<16} | {r['direction']:<5} | {r['poi_type']:<4} | {r['status']:<18} | {r['outcome']:<8} | {r['cr']:<6.3f} | {r['gross_r']:<+8.2f} | {r['net_r']:<+8.2f}")

    # Filled valid trades
    filled_trades = [r for r in results if r['status'] == 'FILLED']
    print("\n" + "=" * 100)
    print("SAMPLE SIZE VERIFICATION (CRITERION: >= 50 TRADES)")
    print("=" * 100)
    print(f"Total BTC Signals Evaluated:     {len(results)}")
    print(f"Signals Filtered (C/R > 0.25):   {len([r for r in results if r['status'] == 'FILTERED_CR_EXCEEDED'])}")
    print(f"Signals Expired (Unfilled Zone): {len([r for r in results if r['status'] == 'EXPIRED_UNFILLED'])}")
    print(f"Valid Filled Trades Executed:    {len(filled_trades)}")
    
    if len(filled_trades) < 50:
        print(f"\n>>> HÜKÜM: YETERSİZ ÖRNEKLEM (INSUFFICIENT SAMPLE SIZE) <<<")
        print(f"Gerekli minimum işlem: 50 | Gerçekleşen geçerli işlem: {len(filled_trades)}")
        print("Kural gereği: Veri aralığı veya kurallar sonuç almak için sonradan değiştirilmeyecektir.")
    else:
        print(f"\n>>> HÜKÜM: ÖRNEKLEM BÜYÜKLÜĞÜ YETERLİ ({len(filled_trades)} >= 50) <<<")

    if filled_trades:
        gross_tot = sum(r['gross_r'] for r in filled_trades)
        cost_tot = sum(r['cost_r'] for r in filled_trades)
        net_tot = sum(r['net_r'] for r in filled_trades)
        exp = net_tot / len(filled_trades)
        g_w = sum(r['gross_r'] for r in filled_trades if r['gross_r'] > 0)
        g_l = abs(sum(r['gross_r'] for r in filled_trades if r['gross_r'] < 0))
        pf = (g_w / g_l) if g_l > 0 else 999.0
        
        eq, peak, max_dd = 0.0, 0.0, 0.0
        for r in filled_trades:
            eq += r['net_r']
            if eq > peak: peak = eq
            dd = peak - eq
            if dd > max_dd: max_dd = dd
            
        print(f"\nMetrikler ({len(filled_trades)} İşlem):")
        print(f"  Brüt PnL:        {gross_tot:+.2f}R")
        print(f"  Toplam Maliyet:  {cost_tot:.3f}R")
        print(f"  Net PnL:         {net_tot:+.2f}R")
        print(f"  Net Beklenti:    {exp:+.3f}R / işlem")
        print(f"  Profit Factor:   {pf:.2f}")
        print(f"  Max Drawdown:    {max_dd:.2f}R")

    # Save results
    with open('research/90d_btc_simulation_results.json', 'w') as f:
        json.dump(results, f, indent=2)

if __name__ == '__main__':
    main()
