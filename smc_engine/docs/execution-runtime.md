# Sprint 9 — Execution Runtime

Execution Runtime is the Research Platform v0.8 preparation layer.

It consumes an immutable `ExecutionPlan` and an immutable `ExecutionRuntimePolicy`, then returns an immutable `RuntimeResult`.

```text
ExecutionPlan
        ↓
executePlan()
        ↓
ExecutionContext
        ↓
RuntimeAdapter
        ↓
RuntimeItem
        ↓
RuntimeResult
```

## Boundary

Runtime prepares. Runtime never acts.

Sprint 9 does not connect to:

- broker
- exchange
- MetaTrader
- Binance
- Telegram
- network
- database mutation

It also does not calculate:

- position sizing
- stop loss
- take profit
- risk management

## Public API

```ts
executePlan(
  executionPlan,
  runtimePolicy
): RuntimeResult
```

The same `ExecutionPlan` and `ExecutionRuntimePolicy` always produce the same `RuntimeResult`.

## Runtime Policy

`ExecutionRuntimePolicy` is required.

`allowExecution` is always `false` in Sprint 9.

`runtimeId` must be provided by the caller and must be deterministic. The runtime layer does not generate random UUIDs and does not read the system clock.

## Adapter Resolution

`ExecutionRuntime` resolves the runtime adapter from `runtimePolicy.runtimeMode`:

```text
PAPER      → PaperRuntimeAdapter
SIMULATION → SimulationRuntimeAdapter
BROKER     → BrokerRuntimeAdapter
```

`BrokerRuntimeAdapter` is reserved and returns blocked runtime items.

## Explainability

Each `RuntimeItem` preserves the chain:

```text
RuntimeItem
        ↓
ExecutionPlanItem
        ↓
PlanningEvaluation
        ↓
DecisionEvaluation
        ↓
Policy
        ↓
Pattern
        ↓
Observation
        ↓
Benchmark
```

## Immutability

The runtime layer freezes:

- `ExecutionRuntimePolicy`
- `ExecutionContext`
- `RuntimeItem`
- `RuntimeResult`
- warning arrays
- processed/skipped item arrays

The input `ExecutionPlan` is never mutated.
