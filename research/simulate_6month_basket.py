"""
6-MONTH BASKET BACKTEST SIMULATION (1 APRIL 2026 - 30 SEPTEMBER 2026 UTC)
========================================================================
Path: research/simulate_6month_basket.py

Strict Frozen Rules:
1. Target Period: 2026-04-01 00:00:00 UTC to 2026-09-30 23:59:59 UTC
2. Target Symbols: BTCUSD, ETHUSD, SOLUSD, EURUSD, GBPUSD, XAUUSD
3. Stop Model: 1H Confirmed Structural Fractal Swing Stop (T_conf <= T_signal) with symbol buffer
4. C/R Filter: C/R <= 0.25R
5. Targets:
   - Scenario B: 2.0R Structural Target
   - Scenario C: Original Liquidity Target
6. Cost Model: Symbol-calibrated friction (Spread + Commission + Slippage)
7. Intracandle Conflict: Conservative (SL first)
8. Trade Lifecycle: 16-bar limit entry window, +1.0R BE arming
9. Sample Size Criterion: >= 50 filled trades across basket
"""

import os
import json
from datetime import datetime, timezone

def get_asset_cost(symbol, entry_p, risk_dist):
    sym = symbol.upper()
    if 'BTC' in sym:
        # 6.5 bps (4 comm, 1 spread, 1.5 slip)
        comm_usd = entry_p * 0.00040
        sprd_usd = entry_p * 0.00010
        slip_usd = entry_p * 0.00015
    elif 'ETH' in sym:
        # 7.5 bps (4 comm, 1.5 spread, 2 slip)
        comm_usd = entry_p * 0.00040
        sprd_usd = entry_p * 0.00015
        slip_usd = entry_p * 0.00020
    elif 'SOL' in sym:
        # 11.5 bps (5 comm, 3 spread, 3.5 slip)
        comm_usd = entry_p * 0.00050
        sprd_usd = entry_p * 0.00030
        slip_usd = entry_p * 0.00035
    elif 'EURUSD' in sym:
        # 1.45 pips (0.6 comm, 0.6 spread, 0.25 slip)
        comm_usd = 0.000060
        sprd_usd = 0.000060
        slip_usd = 0.000025
    elif 'GBPUSD' in sym:
        # 1.85 pips (0.6 comm, 0.95 spread, 0.30 slip)
        comm_usd = 0.000060
        sprd_usd = 0.000095
        slip_usd = 0.000030
    elif 'XAU' in sym:
        # $0.45 ($0.20 comm, $0.15 spread, $0.10 slip)
        comm_usd = 0.20
        sprd_usd = 0.15
        slip_usd = 0.10
    else:
        comm_usd = entry_p * 0.00030
        sprd_usd = entry_p * 0.00010
        slip_usd = entry_p * 0.00010

    total_cost_usd = comm_usd + sprd_usd + slip_usd
    cr = total_cost_usd / risk_dist if risk_dist > 0 else 999.0
    return {
        'total_cost_usd': total_cost_usd,
        'comm_usd': comm_usd,
        'sprd_usd': sprd_usd,
        'slip_usd': slip_usd,
        'cr': cr,
        'comm_r': comm_usd / risk_dist if risk_dist > 0 else 0.0,
        'sprd_r': sprd_usd / risk_dist if risk_dist > 0 else 0.0,
        'slip_r': slip_usd / risk_dist if risk_dist > 0 else 0.0,
    }

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

def run_6month_simulation():
    symbols = ['BTCUSD', 'ETHUSD', 'SOLUSD', 'EURUSD', 'GBPUSD', 'XAUUSD']
    data_dir = '../swing-bos-core/data/replay_1year'
    
    print("=" * 110)
    print("LOADING REPLAY DATASETS (15M and 1H)...")
    print("=" * 110)
    
    candles_15m = {}
    candles_1h = {}
    for sym in symbols:
        p15 = os.path.join(data_dir, f'{sym}_15m.json')
        p1h = os.path.join(data_dir, f'{sym}_1h.json')
        with open(p15, 'r') as f: candles_15m[sym] = json.load(f)
        with open(p1h, 'r') as f: candles_1h[sym] = json.load(f)
        print(f"Loaded {sym}: 15m={len(candles_15m[sym])} bars, 1h={len(candles_1h[sym])} bars")

    # Combine signals from signal_delivery_queue.json and smc_engine/evidence/signals/signal-evidence.jsonl
    start_ts = int(datetime(2026, 4, 1, 0, 0, 0, tzinfo=timezone.utc).timestamp() * 1000)
    end_ts = int(datetime(2026, 9, 30, 23, 59, 59, tzinfo=timezone.utc).timestamp() * 1000)

    signals_dict = {}

    # 1. From queue
    with open('../swing-bos-core/data/signal_delivery_queue.json', 'r', encoding='utf-8') as f:
        queue = json.load(f)

    for item in queue:
        sym = item.get('symbol')
        if sym not in symbols: continue
        ca = item.get('signalCreatedAt')
        if not ca: continue
        ts = int(datetime.fromisoformat(ca.replace('Z', '+00:00')).timestamp() * 1000)
        if start_ts <= ts <= end_ts:
            sig_id = item.get('signalId')
            cand = item.get('candidate', {})
            poi = cand.get('poi', {})
            zl = float(poi.get('low') or poi.get('gapLow'))
            zh = float(poi.get('high') or poi.get('gapHigh'))
            signals_dict[sig_id] = {
                'signal_id': sig_id, 'symbol': sym, 'timestamp': ts,
                'direction': cand.get('tradeDirection'), 'poi_type': cand.get('poiType'),
                'zone_low': zl, 'zone_high': zh, 'source': 'queue'
            }

    # 2. From smc_engine evidence
    with open('smc_engine/evidence/signals/signal-evidence.jsonl', 'r', encoding='utf-8') as f:
        lines = [json.loads(l) for l in f if l.strip()]

    for item in lines:
        meta = item.get('metadata', {})
        sym = meta.get('symbol')
        if sym not in symbols: continue
        ts = meta.get('timestamp')
        if not ts and meta.get('recordedAt'):
            ts = int(datetime.fromisoformat(meta['recordedAt'].replace('Z', '+00:00')).timestamp() * 1000)
        if start_ts <= ts <= end_ts:
            sig_id = meta.get('signalId')
            poi = item.get('poi', {})
            direction = meta.get('direction')
            pt = poi.get('poiType')
            zl = float(poi.get('zoneLow') or poi.get('low') or 0.0)
            zh = float(poi.get('zoneHigh') or poi.get('high') or 0.0)
            if sig_id not in signals_dict:
                signals_dict[sig_id] = {
                    'signal_id': sig_id, 'symbol': sym, 'timestamp': ts,
                    'direction': direction, 'poi_type': pt,
                    'zone_low': zl, 'zone_high': zh, 'source': 'evidence_jsonl'
                }

    all_signals = sorted(signals_dict.values(), key=lambda x: x['timestamp'])
    print(f"\nTotal unique signals in 6-month period (April 1 - Sept 30): {len(all_signals)}")

    simulation_results = []

    for sig in all_signals:
        sig_id = sig['signal_id']
        sym = sig['symbol']
        direction = sig['direction']
        pt = sig['poi_type']
        zl = sig['zone_low']
        zh = sig['zone_high']
        sig_ts = sig['timestamp']

        # Entry price: proximal boundary for FVG, midpoint for OB
        if pt == 'FVG':
            entry_p = zh if direction == 'long' else zl
        else:
            entry_p = (zl + zh) / 2.0

        buf = get_asset_buffer(sym)
        orig_sl = (zl - buf) if direction == 'long' else (zh + buf)
        orig_risk = abs(entry_p - orig_sl)

        # 1H confirmed structural swing stop
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

        cost_dict = get_asset_cost(sym, entry_p, struct_risk)
        cr_struct = cost_dict['cr']

        # Targets
        # Scenario B: 2.0R structural target
        tp_b = entry_p + (2.0 * struct_risk) if direction == 'long' else entry_p - (2.0 * struct_risk)
        # Scenario C: Original liquidity target (2.0R of original 15M risk)
        orig_target_dist = orig_risk * 2.0
        tp_c = entry_p + orig_target_dist if direction == 'long' else entry_p - orig_target_dist

        # Forward candles
        fwd_candles = [c for c in candles_15m[sym] if c['timestamp'] >= sig_ts]

        # Entry window: 16 bars
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
            simulation_results.append({
                'signal_id': sig_id, 'symbol': sym, 'direction': direction, 'poi_type': pt,
                'signal_ts': sig_ts, 'signal_dt': datetime.fromtimestamp(sig_ts/1000, tz=timezone.utc).strftime('%Y-%m-%d %H:%M'),
                'status': 'EXPIRED_UNFILLED', 'cost_dict': cost_dict, 'cr_pass': (cr_struct <= 0.25),
                'outcome_b': 'EXPIRED', 'outcome_c': 'EXPIRED', 'net_r_b': 0.0, 'net_r_c': 0.0
            })
            continue

        if cr_struct > 0.25:
            simulation_results.append({
                'signal_id': sig_id, 'symbol': sym, 'direction': direction, 'poi_type': pt,
                'signal_ts': sig_ts, 'signal_dt': datetime.fromtimestamp(sig_ts/1000, tz=timezone.utc).strftime('%Y-%m-%d %H:%M'),
                'status': 'FILTERED_CR_EXCEEDED', 'cost_dict': cost_dict, 'cr_pass': False,
                'outcome_b': 'FILTERED', 'outcome_c': 'FILTERED', 'net_r_b': 0.0, 'net_r_c': 0.0
            })
            continue

        # Replay trade candles
        trade_candles = fwd_candles[entry_bar_idx:]

        res_b = simulate_trade_replay(direction, entry_p, struct_sl, tp_b, trade_candles, is_scenario_c=False)
        net_r_b = res_b['gross_r'] - cr_struct

        res_c = simulate_trade_replay(direction, entry_p, struct_sl, tp_c, trade_candles, is_scenario_c=True, orig_target_dist=orig_target_dist)
        net_r_c = res_c['gross_r'] - cr_struct

        simulation_results.append({
            'signal_id': sig_id, 'symbol': sym, 'direction': direction, 'poi_type': pt,
            'signal_ts': sig_ts, 'signal_dt': datetime.fromtimestamp(sig_ts/1000, tz=timezone.utc).strftime('%Y-%m-%d %H:%M'),
            'entry_ts': entry_ts, 'entry_dt': datetime.fromtimestamp(entry_ts/1000, tz=timezone.utc).strftime('%Y-%m-%d %H:%M'),
            'status': 'FILLED',
            'entry_p': entry_p, 'struct_sl': struct_sl, 'struct_risk': struct_risk,
            'orig_sl': orig_sl, 'orig_risk': orig_risk,
            'cost_dict': cost_dict, 'cr_pass': True,
            'res_b': res_b, 'res_c': res_c,
            'net_r_b': net_r_b, 'net_r_c': net_r_c
        })

    # Save raw results
    out_file = 'research/6month_basket_simulation_results.json'
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(simulation_results, f, indent=2)
    print(f"Saved results to {out_file}")

    # Compute and display aggregates
    filled = [r for r in simulation_results if r['status'] == 'FILLED']
    filtered = [r for r in simulation_results if r['status'] == 'FILTERED_CR_EXCEEDED']
    expired = [r for r in simulation_results if r['status'] == 'EXPIRED_UNFILLED']

    print("\n" + "=" * 110)
    print("6-MONTH BASKET BACKTEST SUMMARY (1 APRIL - 30 SEPTEMBER 2026)")
    print("=" * 110)
    print(f"Total Signals:                 {len(simulation_results)}")
    print(f"Filtered (C/R > 0.25):         {len(filtered)}")
    print(f"Expired Unfilled (16 bars):    {len(expired)}")
    print(f"Valid Filled Trades Executed:  {len(filled)}")

    print("\n--- Breakdown by Symbol ---")
    for sym in symbols:
        s_tot = [r for r in simulation_results if r['symbol'] == sym]
        s_fil = [r for r in filled if r['symbol'] == sym]
        s_exp = [r for r in expired if r['symbol'] == sym]
        s_flt = [r for r in filtered if r['symbol'] == sym]
        print(f"  {sym:<8}: Total={len(s_tot):<3} | Filled={len(s_fil):<3} | Expired={len(s_exp):<3} | Filtered={len(s_flt):<3}")

    print("\n" + "=" * 110)
    print("SAMPLE SIZE VERIFICATION (CRITERION: >= 50 VALID FILLED TRADES)")
    print("=" * 110)
    print(f"Required: 50 | Executed: {len(filled)}")
    if len(filled) < 50:
        print(">>> VERDICT: INSUFFICIENT SAMPLE SIZE (YETERSİZ ÖRNEKLEM) <<<")
    else:
        print(f">>> VERDICT: SAMPLE SIZE SUFFICIENT ({len(filled)} >= 50) <<<")

    # Metrics calculation helper
    def calc_group_metrics(trades, scen_key):
        if not trades:
            return {'count': 0, 'tp': 0, 'sl': 0, 'be': 0, 'gross_r': 0.0, 'net_r': 0.0, 'cost_r': 0.0,
                    'comm_r': 0.0, 'sprd_r': 0.0, 'slip_r': 0.0, 'pf': 0.0, 'expectancy': 0.0, 'max_dd': 0.0}
        tp = sum(1 for r in trades if r[f'res_{scen_key}']['outcome'] == 'TP')
        sl = sum(1 for r in trades if r[f'res_{scen_key}']['outcome'] == 'SL')
        be = sum(1 for r in trades if r[f'res_{scen_key}']['outcome'] == 'BE')
        gross = sum(r[f'res_{scen_key}']['gross_r'] for r in trades)
        cost = sum(r['cost_dict']['cr'] for r in trades)
        comm = sum(r['cost_dict']['comm_r'] for r in trades)
        sprd = sum(r['cost_dict']['sprd_r'] for r in trades)
        slip = sum(r['cost_dict']['slip_r'] for r in trades)
        net = sum(r[f'net_r_{scen_key}'] for r in trades)

        gross_wins = sum(r[f'res_{scen_key}']['gross_r'] for r in trades if r[f'res_{scen_key}']['gross_r'] > 0)
        gross_losses = abs(sum(r[f'res_{scen_key}']['gross_r'] for r in trades if r[f'res_{scen_key}']['gross_r'] < 0))
        pf = (gross_wins / gross_losses) if gross_losses > 0 else (999.0 if gross_wins > 0 else 0.0)

        # Drawdown calculation
        peak = 0.0
        cum = 0.0
        max_dd = 0.0
        for r in trades:
            cum += r[f'net_r_{scen_key}']
            if cum > peak: peak = cum
            dd = peak - cum
            if dd > max_dd: max_dd = dd

        return {
            'count': len(trades), 'tp': tp, 'sl': sl, 'be': be,
            'gross_r': gross, 'net_r': net, 'cost_r': cost,
            'comm_r': comm, 'sprd_r': sprd, 'slip_r': slip,
            'pf': pf, 'expectancy': net / len(trades), 'max_dd': max_dd
        }

    for scen in ['b', 'c']:
        scen_name = "Scenario B (2.0R Structural Target)" if scen == 'b' else "Scenario C (Original Liquidity Target)"
        print("\n" + "=" * 110)
        print(f"METRICS FOR {scen_name.upper()}")
        print("=" * 110)
        
        all_m = calc_group_metrics(filled, scen)
        print(f"ALL BASKET ({all_m['count']} trades):")
        print(f"  Distribution:  {all_m['tp']} TP / {all_m['sl']} SL / {all_m['be']} BE")
        print(f"  Gross PnL:     {all_m['gross_r']:+.2f}R")
        print(f"  Total Cost:    {all_m['cost_r']:.3f}R (Comm: {all_m['comm_r']:.3f}R, Sprd: {all_m['sprd_r']:.3f}R, Slip: {all_m['slip_r']:.3f}R)")
        print(f"  Net PnL:       {all_m['net_r']:+.2f}R")
        print(f"  Expectancy:    {all_m['expectancy']:+.3f}R/trade")
        print(f"  Profit Factor: {all_m['pf']:.2f}")
        print(f"  Max Drawdown:  {all_m['max_dd']:.2f}R")

        # Two groups: Forex + Gold vs Crypto
        forex_gold = [r for r in filled if r['symbol'] in ['EURUSD', 'GBPUSD', 'XAUUSD']]
        crypto = [r for r in filled if r['symbol'] in ['BTCUSD', 'ETHUSD', 'SOLUSD']]

        fg_m = calc_group_metrics(forex_gold, scen)
        cr_m = calc_group_metrics(crypto, scen)

        print(f"\n  [Forex + XAUUSD] ({fg_m['count']} trades):")
        print(f"    Dist: {fg_m['tp']} TP / {fg_m['sl']} SL / {fg_m['be']} BE | Gross: {fg_m['gross_r']:+.2f}R | Net: {fg_m['net_r']:+.2f}R | E: {fg_m['expectancy']:+.3f}R | PF: {fg_m['pf']:.2f} | DD: {fg_m['max_dd']:.2f}R")

        print(f"\n  [BTC + ETH + SOL] ({cr_m['count']} trades):")
        print(f"    Dist: {cr_m['tp']} TP / {cr_m['sl']} SL / {cr_m['be']} BE | Gross: {cr_m['gross_r']:+.2f}R | Net: {cr_m['net_r']:+.2f}R | E: {cr_m['expectancy']:+.3f}R | PF: {cr_m['pf']:.2f} | DD: {cr_m['max_dd']:.2f}R")

        print("\n  [Per Symbol Breakdown]")
        for sym in symbols:
            s_m = calc_group_metrics([r for r in filled if r['symbol'] == sym], scen)
            print(f"    {sym:<8}: {s_m['count']:<2} trades | {s_m['tp']} TP / {s_m['sl']} SL / {s_m['be']} BE | Gross: {s_m['gross_r']:+.2f}R | Net: {s_m['net_r']:+.2f}R | E: {s_m['expectancy']:+.3f}R | PF: {s_m['pf']:.2f} | DD: {s_m['max_dd']:.2f}R")

if __name__ == '__main__':
    run_6month_simulation()
