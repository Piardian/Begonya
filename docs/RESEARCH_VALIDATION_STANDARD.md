# Research and Validation Standard

This repository contains research/backtest artifacts and diagnostic tooling. A generated report is not proof that the live runtime is healthy or that a strategy has positive expectancy.

## Required provenance for each report

- Repository and exact commit SHA.
- Exact input file paths and requested date range.
- Actual record count, records excluded, and missing-field counts.
- Realized PnL and R only from explicitly recorded closed outcomes. Do not count no-entry, open, or active-runner records as realized trades.
- Risk percentage, execution model, symbol universe, spread/slippage/commission assumptions, and any macro gate state.
- Exact command executed and its exit code; preserve the actual test output.
- Clearly list unavailable metrics. Never substitute a constant, default zero, or an estimate for missing evidence.

## Current diagnostic command

From the repository root:

```bash
python run.py
python -m unittest discover -s tests -p 'test_diagnostic_engine.py' -v
```

The report reads `benchmark/benchmark_records.json` and the persisted POI watchlist. It compares the latest seven-day window with the preceding seven-day window. Because the benchmark ledger currently ends before the report date, a zero in the latest window may mean stale data rather than zero live signals.

## Strategy and production safety

- Diagnostics are read-only with respect to source ledgers and trading strategy logic.
- No live process should be restarted and no real order should be sent as part of a diagnostic run.
- A negative backtest result is not to be hidden by a high short-window win rate.
- Missing filter pass/reject telemetry must be reported as unavailable, not inferred from the existence of a gate configuration.
- Merge only after the relevant CI checks pass and the output is reviewed.
