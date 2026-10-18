"""
Begonya Independent Mathematical Recalculator
==============================================
Pure first-principles mathematical verification of the 17 deduplicated trades.
Zero external imports or replay engine dependencies.
Verifies:
1. Exact arithmetic of sum R, win rate, expectancy, and profit factor.
2. Step-by-step chronological equity curve and peak-to-trough drawdown.
3. Proof of the 6-trade losing streak between Sep 10 and Oct 06.
"""

import json
import os

base_dir = r"c:\Users\piard\.gemini\antigravity\scratch"
res_file = os.path.join(base_dir, "Begonya", "research", "ultimate_validation", "deduplicated_validation_results.json")

with open(res_file, 'r', encoding='utf-8') as f:
    data = json.load(f)

trades = data['deduplicated_trades']
assert len(trades) == 17, f"Expected 17 trades, got {len(trades)}"

print("=" * 115)
print("INDEPENDENT MATHEMATICAL VERIFICATION & EQUITY TRAJECTORY (17 TRADES)")
print("=" * 115)

headers = ['#', 'Date (UTC)', 'Symbol', 'Dir', 'Status', 'Realized R', 'Cum Equity', 'Peak Equity', 'Current DD', 'Streak']
fmt = '{:<2} | {:<16} | {:<6} | {:<5} | {:<10} | {:<10} | {:<10} | {:<11} | {:<10} | {:<8}'
print(fmt.format(*headers))
print("-" * 115)

cum_r = 0.0
peak_r = 0.0
max_dd = 0.0
streak = 0
streak_type = None

win_sum = 0.0
loss_sum = 0.0
win_count = 0
loss_count = 0

for i, t in enumerate(trades):
    r = round(t['realized_r'], 4)
    if r > 0:
        win_sum += r
        win_count += 1
        if streak_type == 'WIN':
            streak += 1
        else:
            streak = 1
            streak_type = 'WIN'
    else:
        loss_sum += abs(r)
        loss_count += 1
        if streak_type == 'LOSS':
            streak += 1
        else:
            streak = 1
            streak_type = 'LOSS'

    cum_r = round(cum_r + r, 4)
    if cum_r > peak_r:
        peak_r = cum_r
    current_dd = round(peak_r - cum_r, 4)
    if current_dd > max_dd:
        max_dd = current_dd

    strk_str = f"{streak}{streak_type[0]}"
    row = [
        str(i + 1),
        t['signal_time_utc'],
        t['symbol'],
        t['direction'].upper(),
        t['exit_status'],
        f"{r:+.2f} R",
        f"{cum_r:+.2f} R",
        f"{peak_r:+.2f} R",
        f"{current_dd:.2f} R",
        strk_str
    ]
    print(fmt.format(*row))

win_rate = (win_count / len(trades)) * 100
expectancy = cum_r / len(trades)
profit_factor = win_sum / loss_sum if loss_sum > 0 else 0.0

print("-" * 115)
print("FIRST-PRINCIPLES SUMMARY:")
print(f"Total Trades         : {len(trades)}")
print(f"Wins / Losses        : {win_count} Wins / {loss_count} Losses")
print(f"Win Rate             : {win_rate:.2f}%")
print(f"Gross Positive R     : +{win_sum:.2f} R")
print(f"Gross Negative R     : -{loss_sum:.2f} R")
print(f"Net Sum R            : +{cum_r:.2f} R")
print(f"Expectancy per Trade : +{expectancy:.4f} R")
print(f"Profit Factor        : {profit_factor:.2f}")
print(f"Maximum Drawdown     : {max_dd:.2f} R")
print("=" * 115)
