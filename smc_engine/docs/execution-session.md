# Sprint 10 — Execution Session

Execution Session is a lifecycle container for `RuntimeResult`.

It is not an execution engine. It does not place orders, contact a broker, send Telegram messages, calculate position sizing, or mutate any database state.

## Responsibility

```text
RuntimeResult
        ↓
ExecutionSession
        ↓
ExecutionSessionResult
```

Runtime prepares. Session manages lifecycle. Execution acts in a future layer.

## Lifecycle

Sprint 10 uses the minimal non-executing lifecycle:

```text
CREATED
        ↓
READY
        ↓
COMPLETED
```

`COMPLETED` means the session lifecycle was closed. It does not mean a trade was executed or completed.

`ACTIVE`, `CANCELLED`, and `FAILED` are part of the contract for future session state machine work. Sprint 10 does not perform real execution.

## Determinism

The session layer is reproducible:

```text
Same RuntimeResult
+ same ExecutionSessionPolicy
= same ExecutionSessionResult
```

The implementation must not use random IDs, UUID generation, `Date.now()`, clock dependencies, network calls, or external mutable services. `sessionId` is supplied by policy and must be deterministic.

## Immutability

The public session objects are immutable:

- `ExecutionSessionPolicy`
- `ExecutionSessionContext`
- `ExecutionSession`
- `ExecutionSessionResult`

RuntimeResult is never mutated.

## Explainability

The explainability chain is preserved by reference:

```text
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

The session layer does not create new market explanations or policy decisions. It only carries the existing chain forward.

## Non-goals

Sprint 10 does not include:

- Broker integration
- Exchange integration
- MetaTrader integration
- Telegram integration
- Network calls
- Database mutation
- Risk management
- Position sizing
- Stop loss / take profit generation
- Orders
- Trades
- Positions
- PnL
- Real execution

