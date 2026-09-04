# Historical Replay Foundation

Historical Replay Foundation answers one question:

> Can the system replay historical Signal records in the same order and verify Intelligence Pipeline behavior without changing history?

## Scope

Replay is a read-only validation layer.

It does not create new Signals, does not update Repository records, does not send notifications, and does not change trading logic.

## Flow

```text
SignalRepository
        ↓
Historical Replay Engine
        ↓
Chronological Signal Records
        ↓
Intelligence Pipeline
        ↓
ReplaySession
```

Each Signal is replayed through the existing Intelligence Pipeline using a signal-scoped query.

## ReplaySession

`ReplaySession` is immutable and contains:

- `replaySessionId`
- `replayVersion`
- `startedTimestamp`
- `finishedTimestamp`
- `signalCount`
- `replayStatus`
- `processedSignals`
- `duration`
- side-effect metadata

## Determinism

Replay does not use random IDs, wall-clock time, `Date.now()`, UUID generation, or external services.

When timestamps are not provided, replay timestamps are derived from the historical Signal records themselves.

The same Repository contents and replay input produce the same `ReplaySession`.

## Chronological Rule

Signals are sorted by:

1. `context.timestamp`
2. `signalId`

The `signalId` tie-breaker keeps ordering deterministic when multiple Signals share the same timestamp.

## Read-Only Rule

Replay may call:

- `repository.listSignals(...)`

The Intelligence Pipeline stages also read through Repository queries.

Replay must not call:

- `createSignalRecord`
- `updateSignalRecord`
- `saveOutcome`
- `saveBenchmark`

## Non-Goals

Replay does not:

- mutate Repository records
- connect to runtime
- send Telegram notifications
- change policies
- change outcomes
- change benchmarks
- change trading logic
- produce new recommendations beyond the existing Intelligence Pipeline output

## Principle

Replay does not change the past.

Replay only re-runs historical evidence through the current Intelligence Pipeline in deterministic order.
