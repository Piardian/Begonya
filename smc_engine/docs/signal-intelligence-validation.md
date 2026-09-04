# Sprint 1.5 — Signal Intelligence Validation

## Purpose

This sprint introduces the first durable data layer for the Signal Intelligence Platform.

The output is not a debug log. It is a reusable domain object:

```text
Candidate
↓
SignalQualityResult
↓
Signal Intelligence Snapshot
↓
Storage
```

The snapshot is intended to be read later by:

- Benchmark Engine
- Outcome Engine
- Learning Engine
- Regression Test
- Dataset Generator
- Manual QA

## Non-decision rule

Snapshot creation must not affect production decisions.

It must not:

- change grade calculation
- filter candidates
- filter notifications
- change Telegram formatting
- rank candidates
- calculate outcomes
- run backtests
- add new trading metrics

## Feature flags

Snapshot persistence is controlled by:

```text
ENABLE_SIGNAL_INTELLIGENCE_SNAPSHOTS=true
```

Snapshot creation depends on the observer quality layer:

```text
ENABLE_SIGNAL_QUALITY_ENGINE=true
```

If snapshots are enabled but signal quality is disabled, the snapshot is skipped and the pipeline continues.

## Determinism

Snapshot format is deterministic.

The same candidate and same `SignalQualityResult` must produce the same snapshot. Snapshot timestamps are derived from domain event timestamps, not wall-clock time.

## Storage independence

Snapshot creation and snapshot storage are separate concerns.

- `src/signalIntelligenceSnapshot.ts` creates the domain object.
- `server/signalIntelligenceSnapshotStore.ts` persists it to disk.

The file writer is an adapter. Future storage backends can replace it without changing the snapshot contract.

## Snapshot contract

```ts
interface SignalIntelligenceSnapshot {
  snapshotVersion: 1;
  timestamp: string;
  symbol: 'EURUSD' | 'GBPUSD';
  timeframe: '15m';
  candidateId: string;
  candidate: {
    poiType: 'OB' | 'FVG';
    tradeDirection: 'long' | 'short';
    currentPrice: number;
    poiFormedTimestamp: number;
    relatedEventType: 'BOS' | 'CHoCH';
    relatedEventTimestamp: number;
  };
  signalQuality: SignalQualityResult;
  grade: GradeResult;
  engine: {
    signalQualityVersion: 1;
    gradeVersion: 1;
  };
}
```

## Candidate identity

`candidateId` must be deterministic. The current implementation uses the candidate `uniqueKey`, which is derived from symbol, timeframe, POI type, POI formation timestamp, and related structure event timestamp.

## Default file layout

```text
data/
  signal-intelligence/
    snapshots/
      EURUSD/
        15m/
          {candidateId}.json
```

## Write failure behavior

Snapshot write failures must not stop the pipeline.

The observer layer logs a warning and allows Telegram/message/photo flow to continue.

## Metric inflation rule

A new Signal Intelligence metric can be added only when both are true:

1. The metric has a clear definition and deterministic calculation method.
2. Outcome or benchmark data shows that the metric adds value.

This prevents uncontrolled growth of weak or redundant scores.

## Acceptance criteria

- Snapshot JSON is a deterministic domain object.
- Snapshot includes `snapshotVersion`.
- Snapshot includes engine versions.
- Snapshot includes `SignalQualityResult`.
- Snapshot includes `GradeResult`.
- Snapshot includes deterministic candidate identity.
- Snapshot creation is storage independent.
- Disk write failure does not stop production flow.
- Feature flag disabled behavior remains backward compatible.
- Build passes.
- Tests pass.
