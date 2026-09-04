# Historical Dataset Validation

Historical Dataset Validation answers one question:

> Does the current Intelligence Pipeline run reliably over historical Signal records?

## Scope

This validation layer measures existing behavior.

It does not improve, repair, rewrite, or mutate historical data.

It does not change trading logic, policy, Replay behavior, Recommendation logic, Runtime behavior, or Notification behavior.

## Flow

```text
SignalRepository
        ↓
Dataset Quality Scan
        ↓
Processable Signal Records
        ↓
Historical Replay
        ↓
Intelligence Pipeline
        ↓
HistoricalDatasetValidationReport
```

## Report Sections

The report contains:

- Dataset Summary
- Replay Summary
- Pipeline Summary
- Recommendation Summary
- Data Quality Findings
- Validation Result
- Architecture Impact

## Data Quality Findings

The validator reports:

- empty historical dataset
- duplicate Signal IDs
- missing context
- missing timestamp
- missing outcome
- missing benchmark
- invalid chronological ordering

No record is automatically fixed.

## Processing Rule

Only records with a Signal ID, context, and finite timestamp are replayable.

Records missing required replay fields are skipped and reported.

Outcome and Benchmark gaps are reported as warnings because they reduce research quality but do not prevent Replay from executing.

## Runtime State

Historical Dataset Validation does not connect to the live runtime.

It does not send Telegram notifications.

It does not write back to Repository.

## Current Repository Note

The current runtime can execute with `NoopSignalRepository` by default.

If no persistent SignalRepository-backed historical records exist on disk, validation correctly reports an empty historical Signal dataset rather than inventing data from candles or notified POI keys.

## Architecture Impact Rule

The report explicitly records that:

- Repository was not changed.
- Signals were not changed.
- Replay behavior was not changed.
- Recommendation algorithms were not changed.
- Runtime was not affected.
- Notifications were not sent.
- Trading logic was not changed.
