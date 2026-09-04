# Intelligence Pipeline Integration

The Intelligence Pipeline orchestrates existing intelligence foundations into one end-to-end report.

It does not add new analysis algorithms.
It does not add recommendation types.
It does not change policy.
It does not affect runtime trading behavior.

## Flow

```text
Repository
        ↓
Observation
        ↓
Pattern Discovery
        ↓
Hypothesis Generation
        ↓
Evidence Validation
        ↓
Recommendation Generation
        ↓
Intelligence Report
```

## Output

The pipeline produces `IntelligenceReport`, including:

- observation summary
- patterns found
- hypotheses generated
- evidence levels
- recommendations ready for review

## Non-Goals

- No runtime integration
- No detection changes
- No trading logic changes
- No notification changes
- No automatic recommendation application
- No policy update

## Logging

The orchestrator logs each stage:

- `Observation Complete`
- `Pattern Discovery Complete`
- `Hypothesis Complete`
- `Evidence Validation Complete`
- `Recommendation Complete`

## Determinism

For the same repository state, query, and timestamps, the same `IntelligenceReport` is produced.
