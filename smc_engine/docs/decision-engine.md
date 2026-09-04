# Policy-First Decision Engine

Sprint 7 introduces a policy-first decision evaluation layer.

This is not execution. It does not open trades, send Telegram messages, filter signals, or connect to a broker.

## Data Flow

```text
LearningReport
        ↓
Policy Engine
        ↓
Policy Results
        ↓
DecisionEvaluation
        ↓
DecisionReport
```

## Public API

```ts
generateDecisionReport(learningReport, decisionPolicy): DecisionReport
```

## Policy First Rule

The Decision Engine never interprets `LearningReport` directly. Every pattern must pass through an immutable `DecisionPolicy`.

The same `LearningReport` can be evaluated against multiple policies:

```text
LearningReport + Policy v1 → DecisionReport A
LearningReport + Policy v2 → DecisionReport B
```

## DecisionEvaluation Is Not Execution Intent

`DecisionEvaluation` means policy evaluation result.

`ELIGIBLE` means:

```text
This learned pattern satisfies the configured policy.
```

It does not mean:

```text
Open a trade.
Send a signal.
Execute an order.
```

## Policy Checks

Each check produces a typed result:

```text
PASS | FAIL | SKIPPED
INFO | WARNING | ERROR
```

`maximumRiskLevel` is intentionally reserved for a future risk model. In Sprint 7 it is always reported as:

```text
SKIPPED + INFO
```

## Execution Eligibility

Every `DecisionEvaluation` includes:

```ts
executionEligibility: {
  executable: false,
  reason: "Execution Engine not implemented"
}
```

This remains false throughout Sprint 7.

## Non-goals

- No execution.
- No broker connection.
- No Telegram changes.
- No signal filtering.
- No Learning changes.
- No Benchmark changes.
- No prediction.
- No AI/LLM/ML.

