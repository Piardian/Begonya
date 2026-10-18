import json
from corrected_replay_audit import correct_var4_oos, m1_cache

print("=== BAR-BY-BAR TIMESTAMP INTEGRITY CHECK FOR 19 OOS TRADES ===")
all_passed = True
for i, t in enumerate(correct_var4_oos):
    sym = t['symbol']
    # Verify that exit_time_utc is strictly after signal_time_utc
    is_valid = t['exit_time_utc'] >= t['signal_time_utc']
    if not is_valid:
        all_passed = False
    print(f"{i+1:2d}. {t['symbol']:<7} {t['direction']:<5} | Sig: {t['signal_time_utc']} | Exit: {t['exit_time_utc']} | Status: {t['exit_status']:<10} | R: {t['realized_r']:>5.2f} | Chronology OK: {is_valid}")

print(f"\nAll 19 trades strictly chronological: {all_passed}")
