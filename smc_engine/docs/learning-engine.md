# Learning Engine

Sprint 6 introduces an evidence-based learning layer for Swing BOS Core.

The Learning Engine is not AI, not an LLM, not a prediction engine, and not a Decision Engine. It converts historical segmented benchmark evidence into deterministic observations and explainable patterns.

## Data Flow

```text
SegmentedBenchmarkReport
        ↓
Observation Engine
        ↓
Learning Observations
        ↓
Pattern Detector
        ↓
LearningReport
```

## Public API

```ts
generateLearningReport(segmentedBenchmarkReport): LearningReport
```

This is the only public entry point.

## Architectural Boundary

The Learning Engine only reads `SegmentedBenchmarkReport`.

It does not:

- read snapshots or outcomes;
- validate datasets;
- calculate benchmarks;
- change grades;
- filter signals;
- write to Telegram;
- make trade recommendations.

## Observation vs Pattern

An observation is a direct segment-vs-overall comparison.

Example:

```text
grade:A+ TPRate is above overall benchmark.
```

A pattern is a deterministic interpretation of one or more observations.

Example:

```text
grade:A+ shows PERFORMANCE_ADVANTAGE on TPRate versus the overall historical benchmark.
```

Sprint 6 v1 keeps this deliberately conservative: every pattern is explainable from its source observation.

## Eligibility Rules

Learning is skipped unless evidence quality is sufficient:

```text
sampleSize >= 30
coverage >= 0.80
belowRecommendedSample == false
```

Segments that do not satisfy these rules produce typed warnings instead of patterns.

## Confidence

Confidence is not an AI score and not a probability of future success.

It only represents evidence quality:

```text
sample + coverage + stability
```

In Sprint 6 v1, stability is reserved in the contract as `UNKNOWN`.

## Explainability

Every observation and pattern includes:

- segment metric;
- overall benchmark metric;
- difference;
- sample size;
- coverage;
- dataset fingerprint;
- benchmark version.

`summary` is for humans. `explanation` is structured for UI, audits, and future agents.

## Non-goals

Learning does not act.

```text
Benchmark → Describe
Learning  → Infer
Decision  → Act
```

Sprint 6 stops at inference over historical evidence.

