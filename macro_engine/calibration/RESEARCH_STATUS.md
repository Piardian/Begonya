# Macro Event Research Status

## Canonical path

Use `market_response_validation_v3.py` and `historical_event_research.py` for new event-response research.

`event_horizon.py` defines the bar mapping used by both: for bar interval `I` and requested horizon `H`, the bar whose **close** represents exactly `H` minutes after the release opens at `event_time + H - I`.

Example on M30:

- `+30m` = close of the release bar itself.
- `+60m` = close of the next M30 bar.
- `+240m` = close of the bar opening 210 minutes after the release.

## Stale results

Earlier `market_response_validation_v2` and `falsification_stress_test` outputs used the bar at `event_time + H` and then its close. That makes the reported horizon one full bar later than its label. Those historical result JSON files must therefore be treated as **stale research artifacts** and must not be used as evidence for production parameter choices.

The historical findings remain useful as hypotheses, but all IC, hit-rate, and cost figures must be regenerated with the exact-horizon path before being re-used.

## Research workflow

1. Build the historical event dataset from aligned macro observations and MT5 bars.
2. Keep pre-event features separate from forward outcomes.
3. Cluster simultaneous releases by reconstructed event timestamp.
4. Fit MAD/STD strictly before each validation year.
5. Run the pre-registered filter lab on future years only.
6. Compare filters against the `cluster_signal != 0` baseline using gross and net metrics.
7. Do not promote a filter to production without an untouched OOS test and execution-cost validation.

No automatic filter activation is part of this research layer.
