import json

with open('research/6month_basket_simulation_results.json', 'r', encoding='utf-8') as f:
    results = json.load(f)

gbp_trades = [r for r in results if r['symbol'] == 'GBPUSD' and r['status'] == 'FILLED']
print(f"Total GBPUSD filled trades: {len(gbp_trades)}")

print(f"{'#':<2} | {'Date & Time':<16} | {'Dir':<5} | {'POI':<3} | {'Entry':<8} | {'SL':<8} | {'Risk(p)':<7} | {'Out B':<5} | {'Out C':<5} | {'MFE(R)':<6} | {'MAE(R)':<6} | Exit Reason")
print("-" * 110)

short_count = 0
long_count = 0
sl_immediate = 0 # MAE hit before 0.5R MFE
be_turned_sl = 0

for i, t in enumerate(gbp_trades):
    b = t['res_b']
    c = t['res_c']
    risk_pips = t['struct_risk'] * 10000
    mfe = b['mfe_r']
    mae = b['mae_r']
    out_b = b['outcome']
    out_c = c['outcome']
    reason = b['reason']
    
    if t['direction'] == 'short': short_count += 1
    else: long_count += 1
    
    if out_b == 'SL' and mfe < 0.5:
        sl_immediate += 1
        
    print(f"{i+1:<2} | {t['entry_dt']:<16} | {t['direction'].upper():<5} | {t['poi_type']:<3} | {t['entry_p']:<8.5f} | {t['struct_sl']:<8.5f} | {risk_pips:<7.1f} | {out_b:<5} | {out_c:<5} | {mfe:<6.2f} | {mae:<6.2f} | {reason}")

print("-" * 110)
print(f"GBPUSD Direction Breakdown: Long={long_count}, Short={short_count}")
print(f"SL trades with MFE < 0.5R (immediate adverse move): {sl_immediate} / 19 SLs")
