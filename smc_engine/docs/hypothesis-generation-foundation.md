# Hypothesis Generation Foundation

Hypothesis Generation turns discovered signal patterns into testable research hypotheses.

It does not prove hypotheses.
It does not accept hypotheses as true.
It does not change policy, grade, benchmark, outcome, or trading behavior.

## Responsibility

Pattern Discovery answers:

```text
What repeats?
```

Hypothesis Generation answers:

```text
What possible explanation should be investigated?
```

Validation and analysis are intentionally outside this foundation.

## Data Source

Hypothesis Generation uses only `PatternDiscoveryResult`.

```text
PatternDiscoveryResult
        ↓
Hypothesis Generation
        ↓
SignalHypothesis[]
```

It does not read the repository directly and does not access runtime layers.

## Status

Initial statuses:

- `PROPOSED`
- `UNDER_REVIEW`
- `READY_FOR_VALIDATION`
- `REJECTED`

The foundation creates hypotheses with `PROPOSED` status only.

There is no `ACCEPTED` status in this sprint.

## Non-Goals

- No recommendation generation
- No policy update
- No grade update
- No trading decision
- No runtime pipeline integration
- No hypothesis validation

## Determinism

For the same `PatternDiscoveryResult` and created timestamp, the same hypotheses are produced.

No random IDs, wall-clock dependency, or external service dependency is used.
