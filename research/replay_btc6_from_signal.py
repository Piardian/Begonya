import json
from datetime import datetime, timezone

with open('../swing-bos-core/data/BTCUSD_15m.json', 'r') as f:
    d15 = json.load(f)

# Signal was at 1791784800000 (06:00:00 UTC)
# Entry price: 83613.20
# Stop loss: 83485.37 (15M dar), 83205.29 (1H yapisal)
# Target: 83868.86 (orig), 84429.02 (2R struct)
entry_p = 83613.20
sl_dar = 83485.37
sl_struct = 83205.29
tp_orig = 83868.86
tp_struct_2r = 84429.02

# Filter candles from 06:00 onwards
candles = [c for c in d15 if c['timestamp'] >= 1791784800000]

print("=== REPLAYING BTC #6 CANDLES FROM SIGNAL (06:00 UTC) ===")
in_trade = False
entry_bar_time = None

for c in candles[:20]:
    dt = datetime.fromtimestamp(c['timestamp']/1000, tz=timezone.utc).strftime('%H:%M')
    # Check entry
    if not in_trade:
        # Long entry triggers when low <= entry_p
        if c['low'] <= entry_p:
            in_trade = True
            entry_bar_time = dt
            print(f"[{dt}] ENTRY TRIGGERED! Low {c['low']:.2f} <= Entry {entry_p:.2f}. Candle: O={c['open']:.2f}, H={c['high']:.2f}, L={c['low']:.2f}, C={c['close']:.2f}")
        else:
            print(f"[{dt}] Waiting entry... Low {c['low']:.2f} > Entry {entry_p:.2f}")
    else:
        # Trade is open
        hit_sl_dar = c['low'] <= sl_dar
        hit_sl_struct = c['low'] <= sl_struct
        hit_tp_orig = c['high'] >= tp_orig
        hit_tp_struct = c['high'] >= tp_struct_2r
        print(f"[{dt}] Open... L={c['low']:.2f}, H={c['high']:.2f} | Hit TP_orig({tp_orig:.2f})={hit_tp_orig} | Hit SL_dar({sl_dar:.2f})={hit_sl_dar} | Hit SL_struct({sl_struct:.2f})={hit_sl_struct}")
        if hit_sl_dar:
            print(f"    -> SL Dar hit at {dt} (low {c['low']:.2f} <= {sl_dar:.2f})")
        if hit_tp_orig:
            print(f"    -> TP Orig hit at {dt} (high {c['high']:.2f} >= {tp_orig:.2f})")
