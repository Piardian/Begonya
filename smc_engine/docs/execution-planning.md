# Execution Planning

Sprint 8 introduces execution planning.

Execution Planning is not execution.

```text
DecisionEvaluation
        ↓
PlanningEvaluation
        ↓
ExecutionPlan
```

No broker, Telegram, exchange, network, order, or database mutation is performed.

## Public API

```ts
generateExecutionPlan(decisionReport, executionPlanningPolicy): ExecutionPlan
```

## Mode vs Intent

Planning mode is the environment:

```text
PAPER | SIMULATION | LIVE
```

Execution intent is the planned action semantics:

```text
PLAN_ONLY | OPEN_POSITION | CLOSE_POSITION | IGNORE
```

Sprint 8 only emits plan-only items and never executes them.

## PlanningEvaluation

Each `DecisionEvaluation` becomes a `PlanningEvaluation`:

```text
PLANNED | BLOCKED
```

The evaluation contains preconditions, constraints, and the reason for the planning outcome.

## ExecutionPlanItem

ExecutionPlanItem is broker-agnostic.

It intentionally does not contain:

- symbol;
- order id;
- ticket;
- broker;
- exchange;
- account;
- network details.

## LIVE Mode

LIVE exists in the contract but is reserved.

In Sprint 8 it produces:

```text
LIVE_MODE_RESERVED
```

## Execution Disabled

`allowExecution` is always false in Sprint 8. The planner may create plan-only items, but it never acts.

## Non-goals

- No broker integration.
- No Telegram.
- No order placement.
- No execution.
- No network.
- No database mutation.
- No Learning changes.
- No Benchmark changes.
- No Decision changes.

