# Sprint 11 — Execution Engine

Execution Engine is an orchestration layer that consumes `ExecutionSessionResult` and produces `ExecutionEngineResult`.

It is not a broker. It is not order management. It is not trade management. It does not perform paper, simulation, or real execution.

## Responsibility

```text
ExecutionSessionResult
        ↓
Execution Engine
        ↓
ExecutionEngineResult
```

Planning creates a plan. Runtime prepares it. Session manages lifecycle. Execution Engine creates orchestration commands for a future execution layer.

## Command Model

Sprint 11 uses a strict one-to-one command rule:

```text
1 ExecutionSessionItem
        ↓
1 ExecutionCommand
```

An `ExecutionCommand` is not a market order. It is an engine-level orchestration object.

Allowed command types:

- `PREPARE_EXECUTION`
- `BLOCK_EXECUTION`
- `SKIP_EXECUTION`

Forbidden command concepts in Sprint 11:

- `BUY`
- `SELL`
- `OPEN_POSITION`
- `CLOSE_POSITION`
- `ORDER`
- `TRADE`
- `PLACE_ORDER`

## READY Semantics

`READY` does not mean executed.

```text
READY = a future execution layer may consume this command
READY ≠ order placed
READY ≠ trade opened
READY ≠ broker action
```

## Determinism

The engine layer is reproducible:

```text
Same ExecutionSessionResult
+ same ExecutionEnginePolicy
= same ExecutionEngineResult
```

The implementation must not use random IDs, UUID generation, `Date.now()`, clock dependencies, network calls, or external mutable services. `engineId` is supplied by policy and must be deterministic.

## Immutability

The public engine objects are immutable:

- `ExecutionEnginePolicy`
- `ExecutionEngineContext`
- `ExecutionCommand`
- `ExecutionEngineResult`

`ExecutionSessionResult` is never mutated.

## Explainability

The explainability chain is preserved by reference:

```text
ExecutionCommand
        ↓
ExecutionSessionItem
        ↓
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

The engine layer does not create new market explanations or policy decisions.

## Non-goals

Sprint 11 does not include:

- Broker integration
- Exchange integration
- MetaTrader integration
- REST API
- WebSocket
- Network calls
- Telegram integration
- Database mutation
- Risk engine
- Position management
- Order management
- Trade management
- PnL
- Stop loss / take profit generation
- Paper execution
- Simulation execution
- Real execution

