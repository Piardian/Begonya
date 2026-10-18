import json
from datetime import datetime, timezone

with open('research/hybrid_replay/comprehensive_hypothesis_summary.json', 'r') as f:
    d = json.load(f)

trades = d['trade_details']
with open('research/hybrid_replay/hybrid_replay_evaluation_log.json', 'r') as f:
    eval_log = json.load(f)
b50 = eval_log['results_by_variant']['BODY_50']
b50_map = {r['candidate_id']: r for r in b50}

print("=== 25 TRADES DATES ===")
ts_list = []
for i, t in enumerate(trades):
    cid = t['candidate_id']
    meta = b50_map[cid]
    sig_ts = meta['signal_known_timestamp']
    dt = datetime.fromtimestamp(sig_ts / 1000.0, timezone.utc)
    ts_list.append((sig_ts, dt, t['symbol'], t['direction'], cid))
    print(f"{i+1:2d}. {dt.strftime('%Y-%m-%d %H:%M')} | {t['symbol']:<7} {t['direction']:<5} | ID: {cid}")

ts_list.sort(key=lambda x: x[0])
print("\nEarliest trade:", ts_list[0][1].strftime('%Y-%m-%d %H:%M'))
print("Latest trade:  ", ts_list[-1][1].strftime('%Y-%m-%d %H:%M'))
diff_days = (ts_list[-1][0] - ts_list[0][0]) / (1000 * 86400)
print(f"Total span across all 25 trades: {diff_days:.1f} days")

# Check In-Sample vs Out-of-Sample split
OOS_CUTOFF_TIMESTAMP = 1787184000000 # 2026-08-20 00:00:00 UTC
dt_cutoff = datetime.fromtimestamp(OOS_CUTOFF_TIMESTAMP / 1000.0, timezone.utc)
print(f"OOS Cutoff date: {dt_cutoff.strftime('%Y-%m-%d %H:%M')}")

is_trades = [t for t in ts_list if t[0] < OOS_CUTOFF_TIMESTAMP]
oos_trades = [t for t in ts_list if t[0] >= OOS_CUTOFF_TIMESTAMP]
print(f"In-Sample count (< {dt_cutoff.strftime('%Y-%m-%d')}): {len(is_trades)}")
if is_trades:
    print(f"  IS Range: {is_trades[0][1].strftime('%Y-%m-%d %H:%M')} to {is_trades[-1][1].strftime('%Y-%m-%d %H:%M')}")
print(f"Out-of-Sample count (>= {dt_cutoff.strftime('%Y-%m-%d')}): {len(oos_trades)}")
if oos_trades:
    print(f"  OOS Range: {oos_trades[0][1].strftime('%Y-%m-%d %H:%M')} to {oos_trades[-1][1].strftime('%Y-%m-%d %H:%M')}")
    oos_days = (oos_trades[-1][0] - oos_trades[0][0]) / (1000 * 86400)
    print(f"  OOS Span: {oos_days:.1f} days ({oos_days/30.41:.1f} months)")
