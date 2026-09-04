# Evidence Validation Foundation

Evidence Validation evaluates the strength of generated hypotheses using neutral criteria.

It does not prove hypotheses.
It does not verify hypotheses.
It does not accept hypotheses as true.
It does not generate recommendations.
It does not change trading behavior.

## Responsibility

Hypothesis is a possible explanation.

Evidence is not a truth claim.

Evidence only expresses the current strength of available support.

## Data Source

Evidence Validation consumes `HypothesisGenerationResult`.

```text
HypothesisGenerationResult
        ↓
Evidence Validation
        ↓
SignalEvidence[]
```

It does not access runtime, repository, detection, execution, risk, benchmark, outcome, or notification layers directly.

## Validation Status

Supported statuses:

- `INSUFFICIENT_DATA`
- `WEAK`
- `MODERATE`
- `STRONG`
- `REJECTED`

There is no `VERIFIED` or `ACCEPTED` status in this foundation.

## Initial Criteria

Initial validation uses:

- supporting sample size
- contradicting sample size
- confidence score

These criteria are descriptive gates, not trading rules.

## Non-Goals

- No recommendation generation
- No policy update
- No grade update
- No trading decision
- No runtime pipeline integration
- No hypothesis acceptance

## Determinism

For the same hypothesis generation result, criteria, and created timestamp, the same evidence validation result is produced.
