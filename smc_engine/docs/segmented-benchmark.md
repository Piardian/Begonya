# Sprint 5 — Advanced Benchmark Analytics (Segmentation)

## Core statement

Segmented Benchmark is descriptive.

It does not predict, infer, learn, rank, recommend, or decide.

```text
Benchmark
↓
Describe historical evidence

Learning
↓
Infer patterns

Decision
↓
Act
```

## Data flow

```text
ValidatedLabeledDataset
      │
      ▼
Segment Aggregator
      │
      ▼
Grouped Dataset
      │
      ▼
Benchmark Engine
      │
      ▼
SegmentedBenchmarkReport
```

## Responsibility boundaries

- `segmentAggregator` only groups datasets.
- `benchmarkEngine` calculates benchmark metrics.
- `segmentedBenchmark` orchestrates grouping and benchmark generation.

The aggregator must not know benchmark metrics.

## Public API

Existing API remains:

```ts
generateBenchmark(dataset): BenchmarkReport
```

New API:

```ts
generateSegmentedBenchmark(dataset): SegmentedBenchmarkReport
```

## Segment definitions

Each segment uses:

```ts
interface SegmentDefinition {
  key: SegmentKey;
  label: string;
  getSegmentKey(item: ValidatedLabeledSignal): string;
}
```

`getSegmentKey` intentionally supports future composite segments such as:

- Grade + Session
- Killzone + Direction
- HTF Bias + POI

Sprint 5 v1 supports these segment groups:

- Grade
- Session
- POI Type
- Signal Quality Status
- Direction
- Event Type

## Current contract values

Sprint 5 v1 uses values already present in `SignalIntelligenceSnapshot`.

Examples:

- Grade: `A+`, `A`, `B+`, `B`, `C`
- Session: `asian`, `london`, `new_york`, `overlap`, `off_session`
- POI Type: `OB`, `FVG`
- Signal Quality Status: `excellent`, `good`, `risky`, `invalid`
- Direction: `long`, `short`
- Event Type: `BOS`, `CHoCH`

Future values such as Breaker, Mitigation, Internal BOS, acceptable, or poor require upstream snapshot contract support before they can appear here.

## SegmentBenchmark metadata

Each segment entry includes:

```ts
interface SegmentBenchmark {
  segmentValue: string;
  sampleSize: number;
  belowRecommendedSample: boolean;
  benchmark: BenchmarkReport;
}
```

`benchmark` reuses the existing `BenchmarkReport` contract. No separate segment metric schema is introduced.

## Small sample warning

Small sample handling is descriptive metadata only.

Default threshold:

```text
sampleSize < 30
↓
belowRecommendedSample = true
```

This is not a prediction and not a decision rule.

Example:

```text
Breaker
1 signal
100% TP
belowRecommendedSample = true
```

The system reports the sample size; it does not infer that the segment is strong.

## Non-goals

Sprint 5 does not:

- use AI
- perform learning
- predict future outcomes
- recommend trades
- change grade
- change signal quality
- change outcome engine
- change validation
- change trading logic
- change Telegram
- change production pipeline
