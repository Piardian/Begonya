# Sprint 4 — Benchmark Analytics

## Core statement

**Benchmark is descriptive.**

**Benchmark is not predictive.**

Benchmark Analytics describes historical labeled evidence. It does not perform learning, prediction, ranking, or decision-making.

## Data flow

```text
Readers
      │
      ▼
Validation
      │
      ├──────────────► ValidationReport
      │                    │
      │                    └── Coverage
      │
      ▼
ValidatedLabeledDataset
      │
      ▼
Benchmark Engine
      │
      ▼
BenchmarkReport
```

## Responsibility boundaries

- Readers load data.
- Validation checks technical integrity.
- Coverage measures labeling completeness.
- Validated Dataset contains benchmark-safe labeled records.
- Benchmark produces descriptive analytics only.

## Validation is not completeness

Validation and coverage are separate concepts.

`MISSING_OUTCOME` is a warning, not an error.

Reason:

```text
live system
↓
snapshots may exist before outcome windows complete
↓
benchmark can still run on labeled subset
↓
coverage must be reported
```

Hard validation errors include:

- invalid JSON read errors
- invalid schema
- unsupported snapshot version
- unsupported outcome version
- unsupported labeling config version
- duplicate snapshot candidateId
- duplicate outcome candidateId
- orphan outcome
- invalid status/reason/metadata
- inconsistent timestamps

## Coverage

Coverage is reported with every validation and benchmark result:

```ts
coverage: {
  snapshotCount: number;
  labeledCount: number;
  missingOutcomeCount: number;
  coverageRate: number;
}
```

Benchmark rates are calculated over labeled records. Coverage explains how complete the dataset is.

## ValidatedLabeledDataset

Benchmark must not run on raw JSON, readers, raw snapshots, or raw outcomes.

It only accepts:

```ts
ValidatedLabeledDataset
```

This immutable object contains only records that have both:

- Snapshot
- Outcome

linked by `candidateId`.

## Public API

The public API is intentionally small:

```ts
validateDataset(input): ValidationReport

createValidatedDataset(input): ValidatedLabeledDataset

generateBenchmark(dataset): BenchmarkReport
```

## BenchmarkReport

The first benchmark version produces descriptive metrics:

- totals
- outcome counts
- outcome rates
- average/median evaluation duration
- average MFE/MAE
- coverage
- metadata

## Dataset fingerprint

Benchmark metadata includes a deterministic fingerprint:

```ts
datasetFingerprint: string
```

The fingerprint is derived from:

- sorted candidateIds
- snapshot versions
- outcome versions
- labeling config versions

This makes benchmark reports comparable in regression tests and CI.

## Non-goals

Sprint 4 does not:

- predict wins
- use AI
- perform learning
- change grade
- change signal quality
- change outcome engine
- change trading logic
- change candidate filtering
- change Telegram output
