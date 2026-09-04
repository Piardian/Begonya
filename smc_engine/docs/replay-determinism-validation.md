# Replay Determinism Validation

Replay Determinism Validation answers one question:

> Does the same historical Repository data always produce the same Intelligence Pipeline output when replayed repeatedly?

## Scope

This layer validates Historical Replay behavior.

It does not change Replay behavior, Intelligence Pipeline behavior, recommendation generation, policy, runtime, notification, or trading logic.

## Flow

```text
SignalRepository
        ↓
Replay Determinism Validation
        ↓
Historical Replay × N
        ↓
Result Hash + Structural Comparison
        ↓
ReplayValidationReport
```

## ReplayValidationReport

`ReplayValidationReport` is immutable and contains:

- `validationVersion`
- `replayCount`
- `signalsProcessed`
- `recommendationsProduced`
- `baselineResultHash`
- `resultHashes`
- `reportHash`
- `hashEquality`
- `structuralEquality`
- `passed`
- `durationSummary`
- `comparisons`
- side-effect metadata

## Hash Validation

Each replay run is normalized into a deterministic result structure and hashed.

Validation passes only when every run hash matches the baseline run hash.

## Structural Validation

Hash equality is not the only check.

Each normalized replay result is also structurally compared against the baseline replay result.

Validation passes only when:

- Replay session order is stable.
- Signal processing order is stable.
- Observation outputs are stable.
- Pattern outputs are stable.
- Hypothesis outputs are stable.
- Evidence outputs are stable.
- Recommendation outputs are stable.

## Determinism Rule

Validation does not use wall-clock time, random IDs, UUID generation, external services, runtime state, or notifications.

Durations are derived from deterministic `ReplaySession.duration` values, not measured with a live clock.

## Read-Only Rule

Validation may repeatedly run Historical Replay.

It must not call Repository write methods and must not mutate Signal records.

## Non-Goals

Validation does not:

- create new Signals
- update Repository data
- alter Replay behavior
- alter Intelligence Pipeline behavior
- alter Recommendation logic
- change Policy
- connect to Runtime
- send Telegram notifications
- change trading logic

## Principle

Historical Replay proves the replay path exists.

Replay Determinism Validation proves the replay path is repeatable.
