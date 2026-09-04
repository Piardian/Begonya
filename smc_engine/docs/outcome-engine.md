# Sprint 3 — Evidence Labeling Engine (Outcome Engine)

## Purpose

Outcome Engine labels previously created Signal Intelligence Snapshots with objective market outcomes.

It does not create new trading logic, change grade, change detection, alter Telegram behavior, rank candidates, or perform benchmark analytics.

## Core model

Snapshot is immutable.

Outcome is independent.

```text
Snapshot(candidateId)

Outcome(candidateId)

Join by candidateId
```

Outcome data must never be embedded into or written back to a Snapshot.

## Reproducibility guarantee

Outcome is reproducible.

```text
Same Snapshot
+
Same Future Candle Set
+
Same OutcomeLabelingConfig
=
Same OutcomeResult
```

The engine must not use randomness, wall-clock time, external services, or filesystem state.

## Public API rule

The public labeling API is intentionally small:

```ts
labelOutcome(input): OutcomeResult
```

TP, SL, BE, collision, expiry, and metadata calculations are internal implementation details.

## OutcomeLabelingConfig

Labeling rules are explicit and versioned.

```ts
interface OutcomeLabelingConfig {
  version: 1;
  takeProfitPips: number;
  stopLossPips: number;
  breakEvenPips?: number;
  expiryBars: number;
  sameCandleCollisionPolicy: 'SL_FIRST' | 'TP_FIRST' | 'UNKNOWN';
}
```

The config version is copied into `OutcomeResult.metadata.labelingConfigVersion`.

## Default same candle collision policy

**DEFAULT POLICY: SL_FIRST**

OHLC candles do not reveal whether TP or SL happened first inside the same candle. The conservative default is `SL_FIRST`.

Other supported policies:

- `TP_FIRST`
- `UNKNOWN`

## Outcome Window Rule

Outcome Engine does not read unlimited future data.

It evaluates only:

```text
snapshot.timestamp
↓
snapshot.timestamp + expiryBars
```

Future candles beyond the configured expiry window are ignored.

## UNKNOWN vs EXPIRED

`UNKNOWN` and `EXPIRED` are intentionally different.

```text
UNKNOWN
= insufficient future candles to complete the evaluation window
```

```text
EXPIRED
= evaluation window completed and no TP, SL, or BE was reached
```

This distinction is required for reliable benchmark analytics.

## OutcomeResult contract

```ts
interface OutcomeResult {
  outcomeVersion: 1;
  candidateId: string;
  labeledAt: string;
  outcomeStatus: 'TP' | 'SL' | 'BE' | 'EXPIRED' | 'UNKNOWN';
  completionReason: string;
  reason: {
    reasonCode: string;
    reasonMessage: string;
  };
  metadata: {
    labelingConfigVersion: 1;
    evaluatedCandles: number;
    startTimestamp: number;
    endTimestamp: number | null;
    resolvedAtTimestamp: number | null;
    resolvedAtIndex: number | null;
    maxFavorableExcursionPips: number;
    maxAdverseExcursionPips: number;
    evaluationDurationBars: number;
    evaluationCompleted: boolean;
  };
}
```

`labeledAt` is derived from evaluated candle timestamps, not wall-clock time.

## Storage separation

Outcome storage is separate from snapshot storage:

```text
data/signal-intelligence/outcomes/{symbol}/{timeframe}/{candidateId}.json
```

The file writer is an adapter. Core outcome labeling does not depend on filesystem.

## Candidate identity

`candidateId` is the only join key.

```text
Snapshot
↓ candidateId
Outcome
↓ candidateId
Benchmark
↓ candidateId
Learning
```

## Provenance backlog note

Future versions may add:

```ts
provenance: {
  engineVersion: 1;
  generatedBy: 'OutcomeEngine';
}
```

This is intentionally not implemented in Sprint 3.

## Non-goals

Sprint 3 does not:

- calculate winrate
- perform benchmark analytics
- run learning
- change grade
- change signal quality
- change candidate filtering
- change notification filtering
- change Telegram output
- mutate snapshots
