# Pattern Discovery Foundation

Pattern Discovery Foundation reads historical signal records and produces descriptive repeated-pattern records.

It is not a decision engine.
It is not policy evolution.
It is not grade recalculation.
It is not trading logic.

## Responsibility

Observation answers:

```text
What happened?
```

Pattern Discovery answers:

```text
What repeats?
```

Future analysis may answer:

```text
Why does it happen?
```

These responsibilities must remain separate.

## Data Source

Pattern discovery reads only from `SignalRepository`.

```text
SignalRepository
        ↓
Pattern Discovery
        ↓
SignalPattern[]
```

It does not directly access Detection, Execution, Risk, Benchmark, Outcome, Telegram, or runtime pipeline modules.

## Initial Descriptive Patterns

Initial supported pattern families:

- pair outcome clusters
- grade outcome clusters
- timeframe outcome clusters
- outcome density
- grade clusters

These are descriptive counts and distributions only.

## Non-Goals

- No recommendation generation
- No policy change
- No grade change
- No benchmark mutation
- No outcome mutation
- No trading logic change
- No runtime pipeline integration

## Determinism

For the same repository state, query, and created timestamp, the same pattern discovery result is produced.

No random IDs, wall-clock dependency, or runtime side effects are used.

## Logging

When discovery completes, the foundation logs:

```text
Pattern Discovery Complete
Patterns Found: <count>
```
