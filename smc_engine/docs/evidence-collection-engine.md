# Sprint 2 — Evidence Collection Engine

## Core statement

**Sprint 2 DOES NOT analyze the market.**

**Sprint 2 organizes evidence.**

This sprint introduces the first reusable dataset layer for Signal Intelligence snapshots. It does not add trading logic, scoring rules, outcomes, ranking, Telegram changes, or learning behavior.

## Architecture Baseline v1.0

Sprint 1, Sprint 1.5, and Sprint 2 together define Architecture Baseline v1.0.

Principles:

1. Detection is deterministic.
2. Signal Quality is observational.
3. Snapshots are immutable.
4. Evidence is read-only.
5. Outcome is stored separately and linked via `candidateId`.
6. Grade is frozen until sufficient labeled evidence exists.
7. Learning never modifies historical evidence.

## Pipeline boundary

Production behavior remains unchanged.

This sprint must not:

- change Detection Engine
- change Grade Engine
- change Signal Quality Engine
- change Telegram formatting
- add candidate filtering
- add notification filtering
- rank candidates
- calculate outcomes
- perform benchmark analytics
- add new trading metrics

## Architecture

```text
Snapshot files
↓
SnapshotSource
↓
SignalIntelligenceSnapshotReader
↓
SignalIntelligenceDataset
↓
query / validate / statistics
```

## Reader responsibility

The reader reads raw snapshot entries and parses JSON.

It reports broken JSON as read errors instead of throwing. It does not perform full schema validation and does not mutate snapshot data.

Reader components:

- `SnapshotSource`
- `InMemorySnapshotSource`
- `FileSignalIntelligenceSnapshotSource`
- `SignalIntelligenceSnapshotReader`

## Dataset responsibility

`SignalIntelligenceDataset` is an immutable domain object built from snapshots.

```ts
const dataset = SignalIntelligenceDataset.fromSnapshots(snapshots);

const londonAPlus = dataset.query({
  where: {
    symbol: 'EURUSD',
    grade: 'A+',
    signalQualityStatus: 'excellent',
  },
  sort: { by: 'timestamp', direction: 'asc' },
  limit: 500,
});
```

The query contract is intentionally future-ready:

- `where`
- `sort`
- `limit`

Sprint 2 only uses snapshot fields. Outcome fields are intentionally not part of this sprint.

## Dataset immutability rule

Reader produces snapshots.

Dataset is created from snapshots.

After that, the dataset is read-only.

```text
Snapshot[]
↓
Dataset
↓
Read Only
```

Benchmark, Outcome, Learning, Regression, and Manual QA modules must read from datasets without mutating them.

## Snapshot immutability rule

Once a Signal Intelligence Snapshot is created, it must never be updated, rewritten, or patched.

```text
Snapshot
✅ Create

Snapshot
❌ Update
❌ Rewrite
❌ Patch
```

When Outcome Engine is introduced, it must not embed outcome data into existing snapshots.

Correct model:

```text
Snapshot(candidateId)
↓
Outcome(candidateId)
↓
Join
```

This preserves the event-sourcing style evidence chain and keeps historical observations stable.

## Outcome separation rule

Outcome must be an independent domain object.

Incorrect:

```text
Snapshot
  outcome
```

Correct:

```text
Snapshot(candidateId)

Outcome(candidateId)
```

This allows future re-labeling, alternate benchmark scenarios, and repeated outcome evaluation without mutating the original signal evidence.

## Validation responsibility

Validation reports dataset health.

It checks:

- broken JSON read errors
- invalid schema
- missing mandatory fields
- unsupported `snapshotVersion`
- duplicate `candidateId`
- version compatibility warnings

Version compatibility warnings are separate from hard schema errors. A future dataset may contain mixed engine versions, and validation must be able to report that clearly.

## Statistics responsibility

Statistics are deterministic distribution counts only.

Examples:

- total snapshots
- symbol distribution
- timeframe distribution
- grade distribution
- signal quality status distribution
- snapshot version distribution

Statistics are not benchmark analytics. They do not calculate winrate, loss rate, expectancy, RR, or any outcome-derived metric.

## Timestamp sorting invariant

Dataset query sorting uses ISO-8601 timestamp strings. Lexicographic ordering is valid only while snapshot timestamps remain canonical ISO-8601 strings.

Changing timestamp format requires revisiting dataset sort behavior.

## Storage abstraction

Dataset and reader logic are source-driven.

The file source is an adapter:

```ts
new FileSignalIntelligenceSnapshotSource('data/signal-intelligence/snapshots')
```

The reader can also work with any other `SnapshotSource`, including memory fixtures or future external storage adapters.

## Acceptance criteria

- Snapshot Reader reads valid snapshots.
- Snapshot Reader reports broken JSON.
- Dataset Query filters by core snapshot fields.
- Dataset Query supports future-ready `where/sort/limit`.
- Dataset is immutable.
- Dataset Validation reports invalid schema.
- Dataset Validation reports duplicate candidate IDs.
- Dataset Validation reports version compatibility warnings.
- Dataset Statistics returns deterministic distributions.
- Snapshot contract is unchanged.
- Production pipeline is unchanged.
- Telegram behavior is unchanged.
- Feature flag behavior is unchanged.
- Build passes.
- Tests pass.
