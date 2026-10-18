import json

with open('research/ultimate_validation/ultimate_validation_results.json', 'r') as f:
    d = json.load(f)

print("=== VARIANT COMPARISON (OUT-OF-SAMPLE / STANDARD RETAIL) ===")
print(f"{'Variant':<35} | {'Trades':<6} | {'Win%':<7} | {'Sum R':<9} | {'Expectancy':<10} | {'PF':<6} | {'MaxDD':<6}")
print("-" * 88)

for vname, vdata in d['results_by_variant'].items():
    oos = vdata['OUT_OF_SAMPLE']['STANDARD_RETAIL']
    print(f"{vname:<35} | {oos['total_trades']:^6} | {oos['win_rate_percent']:^7.1f} | {oos['sum_r']:^9.2f} | {oos['expectancy_r']:^10.2f} | {oos['profit_factor']:^6.2f} | {oos['max_drawdown_r']:^6.2f}")

print("\n=== VARIANT COMPARISON (OVERALL ALL 25 TRADES / STANDARD RETAIL) ===")
print(f"{'Variant':<35} | {'Trades':<6} | {'Win%':<7} | {'Sum R':<9} | {'Expectancy':<10} | {'PF':<6} | {'MaxDD':<6}")
print("-" * 88)

for vname, vdata in d['results_by_variant'].items():
    ov = vdata['OVERALL']['STANDARD_RETAIL']
    print(f"{vname:<35} | {ov['total_trades']:^6} | {ov['win_rate_percent']:^7.1f} | {ov['sum_r']:^9.2f} | {ov['expectancy_r']:^10.2f} | {ov['profit_factor']:^6.2f} | {ov['max_drawdown_r']:^6.2f}")

print("\n=== COST COMPARISON FOR VAR_4 (OUT-OF-SAMPLE) ===")
v4 = d['results_by_variant']['VAR_4_COMBINED_MACRO_AND_SESSION']['OUT_OF_SAMPLE']
for cost, met in v4.items():
    print(f"{cost:<20} | Trades: {met['total_trades']:<3} | Win%: {met['win_rate_percent']:<5} | SumR: {met['sum_r']:<7} | Exp: {met['expectancy_r']:<6} | PF: {met['profit_factor']:<5} | MaxDD: {met['max_drawdown_r']:<5}")

gb = d['granular_breakdowns_master_variant']
print("\n--- BY SYMBOL ---")
for s, m in gb['by_symbol'].items():
    print(f"{s:<10} | Trades: {m['total_trades']} | Win%: {m['win_rate_percent']} | SumR: {m['sum_r']} | Exp: {m['expectancy_r']}")

print("\n--- BY DIRECTION ---")
for dirn, m in gb['by_direction'].items():
    print(f"{dirn:<10} | Trades: {m['total_trades']} | Win%: {m['win_rate_percent']} | SumR: {m['sum_r']} | Exp: {m['expectancy_r']}")

print("\n--- BY SESSION ---")
for sess, m in gb['by_session'].items():
    print(f"{sess:<10} | Trades: {m['total_trades']} | Win%: {m['win_rate_percent']} | SumR: {m['sum_r']} | Exp: {m['expectancy_r']}")


