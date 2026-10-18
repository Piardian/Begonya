import json
from corrected_replay_audit import correct_var4_oos
from audit_var4_trades import oos_var4

print("=== AUDIT OF OVERLAPPING POSITIONS AMONG 19 TRADES ===")

overlaps_found = []

for i in range(len(correct_var4_oos)):
    t1 = correct_var4_oos[i]
    o1 = oos_var4[i]
    for j in range(i + 1, len(correct_var4_oos)):
        t2 = correct_var4_oos[j]
        o2 = oos_var4[j]
        if t1['symbol'] == t2['symbol'] and t1['direction'] == t2['direction']:
            sig1 = t1['signal_time_utc']
            exit1 = t1['exit_time_utc']
            sig2 = t2['signal_time_utc']
            exit2 = t2['exit_time_utc']
            
            overlap = not (exit1 <= sig2 or exit2 <= sig1)
            if overlap:
                overlaps_found.append((i+1, j+1, t1['symbol'], t1['direction'], sig1, exit1, sig2, exit2, o1, o2))
                print(f"Overlap Found: Trade {i+1} and Trade {j+1}")
                print(f"  Symbol: {t1['symbol']}, Direction: {t1['direction']}")
                print(f"  Trade {i+1} Window: {sig1} -> {exit1} | Status: {t1['exit_status']} | R: {t1['realized_r']}")
                print(f"  Trade {j+1} Window: {sig2} -> {exit2} | Status: {t2['exit_status']} | R: {t2['realized_r']}")
                print(f"  Trade {i+1} Entry: {o1['entry_price']} | Stop: {o1['structural_stop_price']} | Target: {o1['session_target_price']}")
                print(f"  Trade {j+1} Entry: {o2['entry_price']} | Stop: {o2['structural_stop_price']} | Target: {o2['session_target_price']}")
                print(f"  Candidate IDs:")
                print(f"    T{i+1}: {o1['candidate_id']}")
                print(f"    T{j+1}: {o2['candidate_id']}")
                print("-" * 70)

print(f"Total overlapping pairs found: {len(overlaps_found)}")
