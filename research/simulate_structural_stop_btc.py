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
    valid = [c for c in d1h if (c['timestamp'] + 3600*1000) <= cutoff_ts]
    swings = []
    for i in range(2, len(valid) - 2):
        c = valid[i]
        conf_ts = valid[i+2]['timestamp'] + 3600*1000
        if conf_ts > cutoff_ts:
            continue
        if (c['high'] > valid[i-1]['high'] and c['high'] > valid[i-2]['high'] and
            c['high'] > valid[i+1]['high'] and c['high'] > valid[i+2]['high']):
            swings.append({'type': 'HIGH', 'price': c['high'], 'time': c['timestamp']})
        if (c['low'] < valid[i-1]['low'] and c['low'] < valid[i-2]['low'] and
            c['low'] < valid[i+1]['low'] and c['low'] < valid[i+2]['low']):
            swings.append({'type': 'LOW', 'price': c['low'], 'time': c['timestamp']})
    return swings

def replay_candles_forward(d1m, d15, start_ts, end_ts_limit=None):
    # Combine 1m and 15m seamlessly
    # 1m up to 1791763080000 (2026-10-11T23:58:00Z)
    bars_1m = [c for c in d1m if c['timestamp'] >= start_ts]
    
    # For times after 1m data ends, use 15m
    last_1m_ts = d1m[-1]['timestamp'] if d1m else 0
    bars_15m = [c for c in d15 if c['timestamp'] > last_1m_ts and c['timestamp'] >= start_ts]
    
    combined = []
    for b in bars_1m:
        combined.append({'timestamp': b['timestamp'], 'high': b['high'], 'low': b['low'], 'close': b['close'], 'tf': '1m'})
    for b in bars_15m:
        combined.append({'timestamp': b['timestamp'], 'high': b['high'], 'low': b['low'], 'close': b['close'], 'tf': '15m'})
        
    if end_ts_limit:
        combined = [b for b in combined if b['timestamp'] <= end_ts_limit]
    return combined

def simulate_trade(direction, entry_price, sl_price, tp_price, candles, timeout_bars_15m=64):
    # Standard conservative replay: check SL and TP
    # Intracandle conflict: if both hit in same bar, conservative rule assumes SL first
    # Break-even rule: if price moves +1.0R in favor, move SL to entry + 0.1R (or breakeven)
    risk_dist = abs(entry_price - sl_price)
    
    be_armed = False
    effective_sl = sl_price
    
    mfe_price = entry_price
    mae_price = entry_price
    
    bars_elapsed = 0
    
    for b in candles:
        bars_elapsed += 1
        h = b['high']
        l = b['low']
        ts = b['timestamp']
        
        if direction == 'short':
            # Favorable is lower price, Adverse is higher price
            if l < mfe_price:
                mfe_price = l
            if h > mae_price:
                mae_price = h
                
            # Check BE trigger (+1.0R)
            if not be_armed and (entry_price - l) >= 1.0 * risk_dist:
                be_armed = True
                effective_sl = entry_price # breakeven
                
            # Check SL and TP
            sl_hit = (h >= effective_sl)
            tp_hit = (l <= tp_price)
            
            if sl_hit and tp_hit:
                # Conflict: conservative assumes SL
                return {
                    'outcome': 'BE' if be_armed and effective_sl == entry_price else 'SL',
                    'exit_price': effective_sl,
                    'realized_r': 0.0 if (be_armed and effective_sl == entry_price) else -1.0,
                    'exit_ts': ts,
                    'reason': 'Conflict / SL hit',
                    'mfe_r': (entry_price - mfe_price) / risk_dist,
                    'mae_r': (mae_price - entry_price) / risk_dist,
                    'bars': bars_elapsed
                }
            elif sl_hit:
                return {
                    'outcome': 'BE' if be_armed and effective_sl == entry_price else 'SL',
                    'exit_price': effective_sl,
                    'realized_r': 0.0 if (be_armed and effective_sl == entry_price) else -1.0,
                    'exit_ts': ts,
                    'reason': 'Stop loss hit',
                    'mfe_r': (entry_price - mfe_price) / risk_dist,
                    'mae_r': (mae_price - entry_price) / risk_dist,
                    'bars': bars_elapsed
                }
            elif tp_hit:
                return {
                    'outcome': 'TP',
                    'exit_price': tp_price,
                    'realized_r': 2.0, # Target reached
                    'exit_ts': ts,
                    'reason': 'Take profit hit',
                    'mfe_r': (entry_price - mfe_price) / risk_dist,
                    'mae_r': (mae_price - entry_price) / risk_dist,
                    'bars': bars_elapsed
                }
        else: # long
            if h > mfe_price:
                mfe_price = h
            if l < mae_price:
                mae_price = l
                
            if not be_armed and (h - entry_price) >= 1.0 * risk_dist:
                be_armed = True
                effective_sl = entry_price
                
            sl_hit = (l <= effective_sl)
            tp_hit = (h >= tp_price)
            
            if sl_hit and tp_hit:
                return {
                    'outcome': 'BE' if be_armed and effective_sl == entry_price else 'SL',
                    'exit_price': effective_sl,
                    'realized_r': 0.0 if (be_armed and effective_sl == entry_price) else -1.0,
                    'exit_ts': ts,
                    'reason': 'Conflict / SL hit',
                    'mfe_r': (mfe_price - entry_price) / risk_dist,
                    'mae_r': (entry_price - mae_price) / risk_dist,
                    'bars': bars_elapsed
                }
            elif sl_hit:
                return {
                    'outcome': 'BE' if be_armed and effective_sl == entry_price else 'SL',
                    'exit_price': effective_sl,
                    'realized_r': 0.0 if (be_armed and effective_sl == entry_price) else -1.0,
                    'exit_ts': ts,
                    'reason': 'Stop loss hit',
                    'mfe_r': (mfe_price - entry_price) / risk_dist,
                    'mae_r': (entry_price - mae_price) / risk_dist,
                    'bars': bars_elapsed
                }
            elif tp_hit:
                return {
                    'outcome': 'TP',
                    'exit_price': tp_price,
                    'realized_r': 2.0,
                    'exit_ts': ts,
                    'reason': 'Take profit hit',
                    'mfe_r': (mfe_price - entry_price) / risk_dist,
                    'mae_r': (entry_price - mae_price) / risk_dist,
                    'bars': bars_elapsed
                }
                
    # If open until end of data
    last_b = candles[-1]
    curr_p = last_b['close']
    open_r = ((entry_price - curr_p) if direction == 'short' else (curr_p - entry_price)) / risk_dist
    return {
        'outcome': 'OPEN/TIMEOUT',
        'exit_price': curr_p,
        'realized_r': open_r,
        'exit_ts': last_b['timestamp'],
        'reason': 'End of dataset reached without SL or TP',
        'mfe_r': ((entry_price - mfe_price) if direction == 'short' else (mfe_price - entry_price)) / risk_dist,
        'mae_r': ((mae_price - entry_price) if direction == 'short' else (entry_price - mae_price)) / risk_dist,
        'bars': bars_elapsed
    }

def main():
    d1h, d15, d1m = load_data()
    
    with open('smc_engine/evidence/outcomes/macro-outcome-evidence.jsonl', 'r', encoding='utf-8') as f:
        records = [json.loads(line) for line in f if line.strip()]

    btc_6 = [
        r for r in records 
        if ("BTC" in r.get("symbol", "") or "BTC" in r.get("signalId", "")) 
        and r.get("entryConfirmed") is True
        and r.get("signalGeneratedAt") >= "2026-10-07"
    ]
    
    print("=" * 80)
    print("BEGONYA: 6 SHADOW BTC TRADES - STRUCTURAL STOP EMPIRICAL SIMULATION")
    print("=" * 80)
    
    results_scenario_a = []
    results_scenario_b = [] # Structural Stop with 2R structural target
    results_scenario_c = [] # Structural Stop with Original Liquidity Target
    
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
        
        # Swings before signal
        swings = get_1h_swings(d1h, sig_ts)
        
        if direction == 'short':
            high_swings = [s for s in swings if s['type'] == 'HIGH' and s['price'] > entry_price]
            recent_high = high_swings[-1] if high_swings else None
            struct_sl = recent_high['price'] + 20.0 if recent_high else orig_sl + 400.0
            struct_risk = abs(struct_sl - entry_price)
            struct_tp_2r = entry_price - (2.0 * struct_risk)
            struct_tp_orig = orig_tp
        else:
            low_swings = [s for s in swings if s['type'] == 'LOW' and s['price'] < entry_price]
            recent_low = low_swings[-1] if low_swings else None
            struct_sl = recent_low['price'] - 20.0 if recent_low else orig_sl - 400.0
            struct_risk = abs(entry_price - struct_sl)
            struct_tp_2r = entry_price + (2.0 * struct_risk)
            struct_tp_orig = orig_tp
            
        cost_usd = entry_price * 0.00065
        cr_orig = cost_usd / orig_risk
        cr_struct = cost_usd / struct_risk
        
        # Forward candles from entry_ts onwards
        candles_forward = replay_candles_forward(d1m, d15, entry_ts)
        
        # Scenario B simulation (2R structural target)
        sim_b = simulate_trade(direction, entry_price, struct_sl, struct_tp_2r, candles_forward)
        gross_r_b = sim_b['realized_r']
        net_r_b = gross_r_b - cr_struct
        
        # Scenario C simulation (Original liquidity target, structural stop)
        # In Scenario C, if target is hit, realized R is (target distance / struct_risk)
        target_dist_orig = abs(entry_price - struct_tp_orig)
        target_r_c = target_dist_orig / struct_risk
        sim_c = simulate_trade(direction, entry_price, struct_sl, struct_tp_orig, candles_forward)
        if sim_c['outcome'] == 'TP':
            gross_r_c = target_r_c
        elif sim_c['outcome'] == 'BE':
            gross_r_c = 0.0
        else:
            gross_r_c = sim_c['realized_r']
        net_r_c = gross_r_c - cr_struct
        
        results_scenario_a.append({
            'trade': idx, 'gross_r': orig_gross_r, 'cost_r': orig_cost_r, 'net_r': orig_net_r,
            'outcome': orig_outcome, 'risk_usd': orig_risk, 'cr': cr_orig
        })
        results_scenario_b.append({
            'trade': idx, 'gross_r': gross_r_b, 'cost_r': cr_struct, 'net_r': net_r_b,
            'outcome': sim_b['outcome'], 'risk_usd': struct_risk, 'cr': cr_struct,
            'exit_ts': sim_b['exit_ts'], 'reason': sim_b['reason'], 'mfe_r': sim_b['mfe_r'], 'mae_r': sim_b['mae_r']
        })
        results_scenario_c.append({
            'trade': idx, 'gross_r': gross_r_c, 'cost_r': cr_struct, 'net_r': net_r_c,
            'outcome': sim_c['outcome'], 'risk_usd': struct_risk, 'cr': cr_struct,
            'target_r': target_r_c
        })
        
        dt_exit_b = datetime.fromtimestamp(sim_b['exit_ts']/1000, tz=timezone.utc).strftime('%m-%d %H:%M')
        print(f"\n--- TRADE #{idx} ({direction.upper()} @ ${entry_price:.2f}) ---")
        print(f"Scenario A (15M Dar Stop): SL=${orig_sl:.2f} (Risk=${orig_risk:.2f}) | TP=${orig_tp:.2f} | Out={orig_outcome} | Gross={orig_gross_r:+.2f}R | Net={orig_net_r:+.2f}R | C/R={orig_cost_r:.3f}R")
        print(f"Scenario B (1H Structural 2R): SL=${struct_sl:.2f} (Risk=${struct_risk:.2f}) | TP=${struct_tp_2r:.2f} (Dist=${2*struct_risk:.2f}) | Out={sim_b['outcome']} ({dt_exit_b}) | Reason={sim_b['reason']} | MFE={sim_b['mfe_r']:.2f}R | MAE={sim_b['mae_r']:.2f}R | Gross={gross_r_b:+.2f}R | Net={net_r_b:+.2f}R | C/R={cr_struct:.3f}R")
        print(f"Scenario C (1H Stop + Orig TP): TP=${struct_tp_orig:.2f} ({target_r_c:.2f}R) | Out={sim_c['outcome']} | Gross={gross_r_c:+.2f}R | Net={net_r_c:+.2f}R")

    # Aggregate summaries
    print("\n" + "=" * 80)
    print("AGGREGATE COMPARISON SUMMARY (6 BTC TRADES)")
    print("=" * 80)
    
    def calc_stats(results):
        gross = sum(r['gross_r'] for r in results)
        costs = sum(r['cost_r'] for r in results)
        net = sum(r['net_r'] for r in results)
        n = len(results)
        exp = net / n
        wins = [r for r in results if r['net_r'] > 0]
        losses = [r for r in results if r['net_r'] < 0]
        win_rate = len(wins) / n * 100
        gross_wins = sum(r['gross_r'] for r in results if r['gross_r'] > 0)
        gross_losses = abs(sum(r['gross_r'] for r in results if r['gross_r'] < 0))
        pf = (gross_wins / gross_losses) if gross_losses > 0 else 999.0
        avg_cr = sum(r['cr'] for r in results) / n
        
        # Max drawdown in R
        equity = 0.0
        peak = 0.0
        max_dd = 0.0
        for r in results:
            equity += r['net_r']
            if equity > peak:
                peak = equity
            dd = peak - equity
            if dd > max_dd:
                max_dd = dd
                
        return {
            'trades': n, 'gross_r': gross, 'costs_r': costs, 'net_r': net,
            'expectancy': exp, 'win_rate': win_rate, 'pf': pf, 'max_dd': max_dd, 'avg_cr': avg_cr
        }

    stats_a = calc_stats(results_scenario_a)
    stats_b = calc_stats(results_scenario_b)
    stats_c = calc_stats(results_scenario_c)
    
    print(f"{'Metric':<25} | {'Scenario A (15M Dar Stop)':<25} | {'Scenario B (1H Struct 2R)':<25} | {'Scenario C (1H Struct + Orig TP)':<25}")
    print("-" * 105)
    print(f"{'Total Trades':<25} | {stats_a['trades']:<25} | {stats_b['trades']:<25} | {stats_c['trades']:<25}")
    print(f"{'Gross PnL (R)':<25} | {stats_a['gross_r']:<+25.2f} | {stats_b['gross_r']:<+25.2f} | {stats_c['gross_r']:<+25.2f}")
    print(f"{'Total Costs (R)':<25} | {stats_a['costs_r']:<25.3f} | {stats_b['costs_r']:<25.3f} | {stats_c['costs_r']:<25.3f}")
    print(f"{'Net PnL (R)':<25} | {stats_a['net_r']:<+25.2f} | {stats_b['net_r']:<+25.2f} | {stats_c['net_r']:<+25.2f}")
    print(f"{'Expectancy (R/trade)':<25} | {stats_a['expectancy']:<+25.3f} | {stats_b['expectancy']:<+25.3f} | {stats_c['expectancy']:<+25.3f}")
    print(f"{'Profit Factor (gross)':<25} | {stats_a['pf']:<25.2f} | {stats_b['pf']:<25.2f} | {stats_c['pf']:<25.2f}")
    print(f"{'Max Drawdown (R)':<25} | {stats_a['max_dd']:<25.2f} | {stats_b['max_dd']:<25.2f} | {stats_c['max_dd']:<25.2f}")
    print(f"{'Avg Cost-to-Risk (C/R)':<25} | {stats_a['avg_cr']:<25.3f} | {stats_b['avg_cr']:<25.3f} | {stats_c['avg_cr']:<25.3f}")

if __name__ == '__main__':
    main()
