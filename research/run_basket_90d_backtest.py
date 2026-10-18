"""
BEGONYA 90-DAY BASKET AUDIT (BTC, ETH, SOL, EURUSD, GBPUSD, XAUUSD)
===================================================================
Path: Begonya/research/run_basket_90d_backtest.py

Strict frozen rules:
1. Data: 1 July - 30 September 2026 (replay_1year datasets).
2. Symbols: BTCUSD, ETHUSD, SOLUSD, EURUSD, GBPUSD, XAUUSD.
3. 1H Structural Stop: Fractal swing confirmed prior to signal (T_conf <= T_signal).
4. Targets:
   - Scenario B: 2.0R Structural Target (RiskReward = 2.0 on structural risk).
   - Scenario C: Original Liquidity Target (2.0R on original 15M zone risk).
5. Cost Model: Symbol-calibrated institutional friction (Spread + Commission + Slippage).
6. Filter: C/R <= 0.25R.
7. Conservative Execution: Intracandle conflict resolves to SL first.
8. Minimum Sample Size Check: Criterion >= 50 valid filled trades.
"""

import os
import json
from datetime import datetime, timezone

def get_asset_cost(symbol, entry_p, risk_dist):
    sym = symbol.upper()
    if 'BTC' in sym:
        cost_usd = entry_p * 0.00065 # 6.5 bps
    elif 'ETH' in sym:
        cost_usd = entry_p * 0.00075 # 7.5 bps
    elif 'SOL' in sym:
        cost_usd = entry_p * 0.00115 # 11.5 bps
    elif 'EURUSD' in sym:
        cost_usd = 0.000145 # 1.45 pips
    elif 'GBPUSD' in sym:
        cost_usd = 0.000185 # 1.85 pips
    elif 'XAU' in sym:
        cost_usd = 0.45 # 45 cents
    else:
        cost_usd = entry_p * 0.00050
        
    cr = cost_usd / risk_dist if risk_dist > 0 else 999.0
    return cost_usd, cr

def get_asset_buffer(symbol):
    sym = symbol.upper()
    if 'BTC' in sym: return 20.0
    if 'ETH' in sym: return 2.0
    if 'SOL' in sym: return 0.25
    if 'EURUSD' in sym: return 0.00020
    if 'GBPUSD' in sym: return 0.00025
    if 'XAU' in sym: return 1.50
    return 0.00020

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

def simulate_trade_replay(direction, entry_p, sl_p, tp_p, candles, is_scenario_c=False, orig_target_dist=None):
    risk_dist = abs(entry_p - sl_p)
    be_armed = False
    effective_sl = sl_p
    
    mfe_p = entry_p
    mae_p = entry_p
    
    for c in candles:
        h = c['high']
        l = c['low']
        ts = c['timestamp']
        
        if direction == 'long':
            if h > mfe_p: mfe_p = h
            if l < mae_p: mae_p = l
            
            # Arm BE at +1.0R
            if not be_armed and (h - entry_p) >= (1.0 * risk_dist):
                be_armed = True
                effective_sl = entry_p
                
            hit_sl = (l <= effective_sl)
            hit_tp = (h >= tp_p)
            
            if hit_sl and hit_tp:
                # Conservative conflict: SL first
                mfe_r = (mfe_p - entry_p) / risk_dist
                mae_r = (entry_p - mae_p) / risk_dist
                return {
                    'outcome': 'BE' if (be_armed and effective_sl == entry_p) else 'SL',
                    'gross_r': 0.0 if (be_armed and effective_sl == entry_p) else -1.0,
                    'mfe_r': mfe_r, 'mae_r': mae_r, 'exit_ts': ts, 'reason': 'CONFLICT_SL_FIRST'
                }
            elif hit_sl:
                mfe_r = (mfe_p - entry_p) / risk_dist
                mae_r = (entry_p - mae_p) / risk_dist
                return {
                    'outcome': 'BE' if (be_armed and effective_sl == entry_p) else 'SL',
                    'gross_r': 0.0 if (be_armed and effective_sl == entry_p) else -1.0,
                    'mfe_r': mfe_r, 'mae_r': mae_r, 'exit_ts': ts, 'reason': 'STOP_LOSS_HIT'
                }
            elif hit_tp:
                mfe_r = (tp_p - entry_p) / risk_dist
                mae_r = (entry_p - mae_p) / risk_dist
                gross_r = (orig_target_dist / risk_dist) if is_scenario_c else 2.0
                return {
                    'outcome': 'TP',
                    'gross_r': gross_r,
                    'mfe_r': mfe_r, 'mae_r': mae_r, 'exit_ts': ts, 'reason': 'TAKE_PROFIT_HIT'
                }
        else: # short
            if l < mfe_p: mfe_p = l
            if h > mae_p: mae_p = h
            
            if not be_armed and (entry_p - l) >= (1.0 * risk_dist):
                be_armed = True
                effective_sl = entry_p
                
            hit_sl = (h >= effective_sl)
            hit_tp = (l <= tp_p)
            
            if hit_sl and hit_tp:
                mfe_r = (entry_p - mfe_p) / risk_dist
                mae_r = (mae_p - entry_p) / risk_dist
                return {
                    'outcome': 'BE' if (be_armed and effective_sl == entry_p) else 'SL',
                    'gross_r': 0.0 if (be_armed and effective_sl == entry_p) else -1.0,
                    'mfe_r': mfe_r, 'mae_r': mae_r, 'exit_ts': ts, 'reason': 'CONFLICT_SL_FIRST'
                }
            elif hit_sl:
                mfe_r = (entry_p - mfe_p) / risk_dist
                mae_r = (mae_p - entry_p) / risk_dist
                return {
                    'outcome': 'BE' if (be_armed and effective_sl == entry_p) else 'SL',
                    'gross_r': 0.0 if (be_armed and effective_sl == entry_p) else -1.0,
                    'mfe_r': mfe_r, 'mae_r': mae_r, 'exit_ts': ts, 'reason': 'STOP_LOSS_HIT'
                }
            elif hit_tp:
                mfe_r = (entry_p - tp_p) / risk_dist
                mae_r = (mae_p - entry_p) / risk_dist
                gross_r = (orig_target_dist / risk_dist) if is_scenario_c else 2.0
                return {
                    'outcome': 'TP',
                    'gross_r': gross_r,
                    'mfe_r': mfe_r, 'mae_r': mae_r, 'exit_ts': ts, 'reason': 'TAKE_PROFIT_HIT'
                }
                
    # Open until end of data
    last_c = candles[-1]
    open_r = ((last_c['close'] - entry_p) if direction == 'long' else (entry_p - last_c['close'])) / risk_dist
    return {
        'outcome': 'OPEN_TIMEOUT',
        'gross_r': open_r,
        'mfe_r': ((mfe_p - entry_p) if direction == 'long' else (entry_p - mfe_p)) / risk_dist,
        'mae_r': ((entry_p - mae_p) if direction == 'long' else (mae_p - entry_p)) / risk_dist,
        'exit_ts': last_c['timestamp'],
        'reason': 'END_OF_DATA'
    }

def run_basket_audit():
    symbols = ['BTCUSD', 'ETHUSD', 'SOLUSD', 'EURUSD', 'GBPUSD', 'XAUUSD']
    data_dir = '../swing-bos-core/data/replay_1year'
    
    print("=" * 110)
    print("LOADING REPLAY DATASETS AND SIGNAL QUEUE...")
    print("=" * 110)
    
    candles_15m = {}
    candles_1h = {}
    for sym in symbols:
        p15 = os.path.join(data_dir, f'{sym}_15m.json')
        p1h = os.path.join(data_dir, f'{sym}_1h.json')
        with open(p15, 'r') as f: candles_15m[sym] = json.load(f)
        with open(p1h, 'r') as f: candles_1h[sym] = json.load(f)
        print(f"Loaded {sym}: 15m={len(candles_15m[sym])} bars, 1h={len(candles_1h[sym])} bars")

    with open('../swing-bos-core/data/signal_delivery_queue.json', 'r', encoding='utf-8') as f:
        queue = json.load(f)

    ts_start = int(datetime(2026, 7, 1, 0, 0, 0, tzinfo=timezone.utc).timestamp() * 1000)
    ts_end = int(datetime(2026, 9, 30, 23, 59, 59, tzinfo=timezone.utc).timestamp() * 1000)

    # Filter signals
    basket_signals = []
    for item in queue:
        sym = item.get('symbol')
        if sym not in symbols: continue
        ca = item.get('signalCreatedAt')
        if not ca: continue
        dt = datetime.fromisoformat(ca.replace('Z', '+00:00'))
        ts = int(dt.timestamp() * 1000)
        if ts_start <= ts <= ts_end:
            basket_signals.append((ts, item))

    basket_signals.sort(key=lambda x: x[0])
    print(f"\nTotal 90-day basket signals (July 1 - Sept 30): {len(basket_signals)}")
    
    audit_results = []
    
    for sig_ts, item in basket_signals:
        sig_id = item.get('signalId')
        sym = item.get('symbol')
        cand = item.get('candidate', {})
        poi = cand.get('poi', {})
        direction = cand.get('tradeDirection')
        pt = cand.get('poiType')
        zl = float(poi.get('low') or poi.get('gapLow'))
        zh = float(poi.get('high') or poi.get('gapHigh'))
        
        # Entry price: proximal boundary for FVG, midpoint for OB
        entry_p = zh if (direction == 'long' and pt == 'FVG') else (zl if (direction == 'short' and pt == 'FVG') else (zl + zh) / 2.0)
        
        # Original 15m zone stop and risk
        buf = get_asset_buffer(sym)
        orig_sl = zl - buf if direction == 'long' else zh + buf
        orig_risk = abs(entry_p - orig_sl)
        
        # 1H structural swing stop
        swings = get_confirmed_1h_swings(candles_1h[sym], sig_ts)
        if direction == 'short':
            valid_sw = [s for s in swings if s['type'] == 'HIGH' and s['price'] > entry_p]
            sel_sw = valid_sw[-1] if valid_sw else None
            struct_sl = sel_sw['price'] + buf if sel_sw else entry_p + (orig_risk * 3.0)
            struct_risk = abs(struct_sl - entry_p)
        else:
            valid_sw = [s for s in swings if s['type'] == 'LOW' and s['price'] < entry_p]
            sel_sw = valid_sw[-1] if valid_sw else None
            struct_sl = sel_sw['price'] - buf if sel_sw else entry_p - (orig_risk * 3.0)
            struct_risk = abs(entry_p - struct_sl)
            
        # Cost and C/R
        _, cr_orig = get_asset_cost(sym, entry_p, orig_risk)
        cost_usd, cr_struct = get_asset_cost(sym, entry_p, struct_risk)
        
        # Targets
        # Scenario B: 2.0R structural target
        tp_b = entry_p + (2.0 * struct_risk) if direction == 'long' else entry_p - (2.0 * struct_risk)
        # Scenario C: 2.0R of original 15M risk (original liquidity pool)
        orig_target_dist = orig_risk * 2.0
        tp_c = entry_p + orig_target_dist if direction == 'long' else entry_p - orig_target_dist
        
        # Forward candles
        fwd_candles = [c for c in candles_15m[sym] if c['timestamp'] >= sig_ts]
        
        # Entry check: 16 bars window
        entry_filled = False
        entry_bar_idx = None
        entry_ts = None
        
        for idx, c in enumerate(fwd_candles[:16]):
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
            audit_results.append({
                'signal_id': sig_id, 'symbol': sym, 'direction': direction, 'poi_type': pt,
                'signal_ts': sig_ts, 'status': 'EXPIRED_UNFILLED', 'cr': cr_struct, 'cr_pass': (cr_struct <= 0.25),
                'outcome_b': 'EXPIRED', 'outcome_c': 'EXPIRED', 'net_r_b': 0.0, 'net_r_c': 0.0
            })
            continue
            
        # C/R filter check
        if cr_struct > 0.25:
            audit_results.append({
                'signal_id': sig_id, 'symbol': sym, 'direction': direction, 'poi_type': pt,
                'signal_ts': sig_ts, 'status': 'FILTERED_CR_EXCEEDED', 'cr': cr_struct, 'cr_pass': False,
                'outcome_b': 'FILTERED', 'outcome_c': 'FILTERED', 'net_r_b': 0.0, 'net_r_c': 0.0
            })
            continue
            
        # Replay trade candles
        trade_candles = fwd_candles[entry_bar_idx:]
        
        # Replay Scenario B (2R structural target)
        res_b = simulate_trade_replay(direction, entry_p, struct_sl, tp_b, trade_candles, is_scenario_c=False)
        net_r_b = res_b['gross_r'] - cr_struct
        
        # Replay Scenario C (Original 15M target)
        res_c = simulate_trade_replay(direction, entry_p, struct_sl, tp_c, trade_candles, is_scenario_c=True, orig_target_dist=orig_target_dist)
        net_r_c = res_c['gross_r'] - cr_struct
        
        audit_results.append({
            'signal_id': sig_id, 'symbol': sym, 'direction': direction, 'poi_type': pt,
            'signal_ts': sig_ts, 'entry_ts': entry_ts, 'status': 'FILLED',
            'entry_p': entry_p, 'struct_sl': struct_sl, 'struct_risk': struct_risk,
            'cr': cr_struct, 'cr_pass': True,
            'res_b': res_b, 'res_c': res_c,
            'net_r_b': net_r_b, 'net_r_c': net_r_c
        })

    # Summary
    print("\n" + "=" * 110)
    print("90-DAY BASKET AUDIT RESULTS SUMMARY")
    print("=" * 110)
    
    filled = [r for r in audit_results if r['status'] == 'FILLED']
    filtered = [r for r in audit_results if r['status'] == 'FILTERED_CR_EXCEEDED']
    expired = [r for r in audit_results if r['status'] == 'EXPIRED_UNFILLED']
    
    print(f"Total Basket Signals:          {len(audit_results)}")
    print(f"Filtered (C/R > 0.25):         {len(filtered)}")
    print(f"Expired Unfilled:              {len(expired)}")
    print(f"Valid Filled Trades Executed:  {len(filled)}")
    
    # By symbol breakdown
    print("\n--- Breakdown by Symbol ---")
    for sym in symbols:
        sym_filled = [r for r in filled if r['symbol'] == sym]
        sym_exp = [r for r in expired if r['symbol'] == sym]
        sym_flt = [r for r in filtered if r['symbol'] == sym]
        print(f"  {sym:<8}: Total={len(sym_filled)+len(sym_exp)+len(sym_flt):<2} | Filled={len(sym_filled):<2} | Expired={len(sym_exp):<2} | Filtered={len(sym_flt):<2}")

    # Check sample size
    print("\n" + "=" * 110)
    print("SAMPLE SIZE VERIFICATION (CRITERION: >= 50 TRADES)")
    print("=" * 110)
    print(f"Gereken Minimum İşlem: 50 | Gerçekleşen Geçerli İşlem: {len(filled)}")
    if len(filled) < 50:
        print(f"\n>>> HÜKÜM: YETERSİZ ÖRNEKLEM (INSUFFICIENT SAMPLE SIZE) <<<")
        print(f"Toplam 6 sembolden oluşan sepetin 90 günlük out-of-sample penceresinde dahi yalnızca {len(filled)} işlem oluşmuştur.")
        print("Kabul kriteri olan 50 işleme ulaşılamadığı için test doğrulanmamış olarak kalacaktır.")
    else:
        print(f"\n>>> HÜKÜM: ÖRNEKLEM YETERLİ ({len(filled)} >= 50) <<<")

    # Metrics for Filled Trades
    def calc_metrics(trades, scen_key):
        if not trades: return {}
        net_key = f'net_r_{scen_key}'
        res_key = f'res_{scen_key}'
        gross = sum(r[res_key]['gross_r'] for r in trades)
        costs = sum(r['cr'] for r in trades)
        net = sum(r[net_key] for r in trades)
        n = len(trades)
        exp = net / n
        g_w = sum(r[res_key]['gross_r'] for r in trades if r[res_key]['gross_r'] > 0)
        g_l = abs(sum(r[res_key]['gross_r'] for r in trades if r[res_key]['gross_r'] < 0))
        pf = (g_w / g_l) if g_l > 0 else (999.0 if g_w > 0 else 0.0)
        
        tp_c = len([r for r in trades if r[res_key]['outcome'] == 'TP'])
        sl_c = len([r for r in trades if r[res_key]['outcome'] == 'SL'])
        be_c = len([r for r in trades if r[res_key]['outcome'] == 'BE'])
        
        eq, peak, max_dd = 0.0, 0.0, 0.0
        for r in trades:
            eq += r[net_key]
            if eq > peak: peak = eq
            dd = peak - eq
            if dd > max_dd: max_dd = dd
            
        return {
            'n': n, 'tp': tp_c, 'sl': sl_c, 'be': be_c,
            'gross': gross, 'costs': costs, 'net': net,
            'expectancy': exp, 'pf': pf, 'max_dd': max_dd
        }

    m_b = calc_metrics(filled, 'b')
    m_c = calc_metrics(filled, 'c')
    
    if m_b and m_c:
        print("\n--- Performance Metrics (Filled Trades) ---")
        print(f"{'Metrik':<25} | {'Senaryo B (2R Yapisal)':<25} | {'Senaryo C (Orig Likidite)':<25}")
        print("-" * 80)
        print(f"{'Islem Sayisi':<25} | {m_b['n']:<25} | {m_c['n']:<25}")
        dist_b = f"{m_b['tp']} TP / {m_b['sl']} SL / {m_b['be']} BE"
        dist_c = f"{m_c['tp']} TP / {m_c['sl']} SL / {m_c['be']} BE"
        print(f"{'Sonuc Dagilimi':<25} | {dist_b:<25} | {dist_c:<25}")
        print(f"{'Brut PnL (R)':<25} | {m_b['gross']:<+25.2f} | {m_c['gross']:<+25.2f}")
        print(f"{'Toplam Maliyet (R)':<25} | {m_b['costs']:<25.3f} | {m_c['costs']:<25.3f}")
        print(f"{'Net PnL (R)':<25} | {m_b['net']:<+25.2f} | {m_c['net']:<+25.2f}")
        print(f"{'Net Beklenti (R)':<25} | {m_b['expectancy']:<+25.3f} | {m_c['expectancy']:<+25.3f}")
        print(f"{'Profit Factor':<25} | {m_b['pf']:<25.2f} | {m_c['pf']:<25.2f}")
        print(f"{'Max Drawdown (R)':<25} | {m_b['max_dd']:<25.2f} | {m_c['max_dd']:<25.2f}")

    # Save to JSON
    with open('research/90d_basket_audit_results.json', 'w') as f:
        json.dump({
            'total_signals': len(audit_results),
            'filled_count': len(filled),
            'expired_count': len(expired),
            'filtered_count': len(filtered),
            'metrics_b': m_b,
            'metrics_c': m_c,
            'trades': filled
        }, f, indent=2)

if __name__ == '__main__':
    run_basket_audit()
