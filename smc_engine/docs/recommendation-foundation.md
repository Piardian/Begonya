# Recommendation Foundation

Recommendation Foundation turns strong evidence into human-reviewable recommendations.

It does not apply recommendations.
It does not change policy.
It does not change grades.
It does not change trading logic.

## Responsibility

Evidence expresses available support strength.

Recommendation expresses that strong evidence should be reviewed by a human.

Recommendation is not a decision.

## Data Source

Recommendation Foundation consumes `EvidenceValidationResult`.

```text
EvidenceValidationResult
        ↓
Recommendation Foundation
        ↓
SignalRecommendation[]
```

It does not directly read Hypothesis, Pattern, Repository, runtime, Detection, Execution, Risk, Benchmark, Outcome, or Notification layers.

## Rule

Only `STRONG` evidence can generate a recommendation.

No recommendation is generated for:

- `MODERATE`
- `WEAK`
- `INSUFFICIENT_DATA`
- `REJECTED`

## Status

This foundation only creates:

- `PROPOSED`
- `READY_FOR_REVIEW`

It never creates `DISMISSED` or `IMPLEMENTED`.

## Human Review

Every recommendation requires human review before any policy evolution can be considered.

Policy Evolution can only happen after explicit human approval in a future layer.

## Non-Goals

- No automatic policy update
- No grade update
- No trading logic change
- No runtime pipeline integration
- No automatic execution

## Determinism

For the same evidence validation result and created timestamp, the same recommendations are produced.
