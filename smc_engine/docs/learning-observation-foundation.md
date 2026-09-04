# Learning Observation Foundation

Learning Observation Foundation is a descriptive read model over stored signal evidence.

It does not implement a Learning Engine.
It does not make recommendations.
It does not change policy, grade, benchmark, risk, execution, or trading behavior.

## Data Source

Learning observations read only through the `SignalRepository` abstraction.

The foundation does not import or call Detection, Execution, Risk, Benchmark, Outcome, Telegram, or runtime pipeline modules.

```text
SignalRepository
        ↓
SignalLearningObservation
```

## Observation Is Descriptive

An observation is a neutral summary of repository records.

Initial metrics:

- total signal count
- grade distribution
- outcome distribution
- benchmark status distribution
- pair distribution
- timeframe distribution
- most frequent pair
- most frequent timeframe

## Non-Goals

- No recommendation generation
- No policy evolution
- No grade recalculation
- No benchmark decision
- No trading logic
- No runtime pipeline integration

## Determinism

For the same repository state, query, and observation timestamp, the same observation result is produced.

No randomness, UUID generation, or wall-clock dependency is used by default.

## Logging

When an observation is created, the foundation logs:

```text
Learning Observation Created
Signals Analysed: <count>
```
