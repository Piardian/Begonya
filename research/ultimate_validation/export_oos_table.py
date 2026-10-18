import json
from audit_var4_trades import oos_var4

headers = ['#', 'Signal Time (UTC)', 'Symbol', 'Dir', 'Entry', 'Stop', 'Risk', 'Target', 'PlanR', 'Exit Time (UTC)', 'Exit Reason', 'Spread', 'Net R (Nom)', 'Net R (Adj)']
row_fmt = '{:<2} | {:<16} | {:<6} | {:<5} | {:<9} | {:<9} | {:<7} | {:<9} | {:<5} | {:<16} | {:<14} | {:<6} | {:<11} | {:<11}'
print(row_fmt.format(*headers))
print('-' * 145)

for i, t in enumerate(oos_var4):
    spread_r = t['spread_value'] / t['risk_distance'] if t['risk_distance'] > 0 else 0
    adj_r = t['realized_r'] - spread_r if t['exit_status'] == 'TARGET_HIT' else -1.0 - spread_r
    row = [
        str(i+1),
        t['signal_time_utc'],
        t['symbol'],
        t['direction'].upper(),
        f"{t['entry_price']:.4f}",
        f"{t['structural_stop_price']:.4f}",
        f"{t['risk_distance']:.4f}",
        f"{t['session_target_price']:.4f}",
        f"{t['planned_r']:.1f}R",
        t['exit_time_utc'],
        t['exit_status'],
        f"{t['spread_pips']:.1f}p",
        f"{t['realized_r']:+.2f}R",
        f"{adj_r:+.2f}R"
    ]
    print(row_fmt.format(*row))
