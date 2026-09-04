# Sprint 12 — Paper Execution

Paper Execution consumes `ExecutionEngineResult` and produces `PaperExecutionResult`.

It is not broker execution, order management, trade management, position management, or PnL calculation. It never communicates with a real market.

## Responsibility

```text
ExecutionEngineResult
        ↓
Paper Execution
        ↓
PaperExecutionResult
```

Execution Engine creates commands. Paper Execution consumes those commands and creates a paper-only lifecycle record.

## One-to-one item rule

```text
1 ExecutionCommand
        ↓
0 or 1 PaperExecutionItem
```

Commands beyond `maximumPaperItems` are not converted.

## Lifecycle

For a READY command:

```text
ACCEPTED
        ↓
PROCESSED
        ↓
COMPLETED
```

`PROCESSED` is not market simulation. It is only a paper execution lifecycle step. This name intentionally avoids conflict with the future Simulation Execution layer.

For a BLOCKED command:

```text
REJECTED
```

For a SKIPPED command:

```text
SKIPPED
```

`COMPLETED` means the paper lifecycle record was closed. It does not mean a trade was opened, an order was sent, a position exists, or PnL was calculated.

## Safety audit

Paper execution items explicitly report:

```text
realExecution: false
orderCreated: false
positionCreated: false
pnlCalculated: false
```

These are part of the domain contract, not comments.

## Determinism

The paper layer is reproducible:

```text
Same ExecutionEngineResult
+ same PaperExecutionPolicy
= same PaperExecutionResult
```

No random IDs, UUID generation, `Date.now()`, clock dependencies, network calls, or external mutable services are allowed. `paperExecutionId` is supplied by policy and must be deterministic.

## Explainability

The explainability chain is preserved by reference:

```text
PaperExecutionItem
        ↓
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

Paper Execution does not create new market explanations or policy decisions.

## Non-goals

Sprint 12 does not include:

- Broker integration
- Exchange integration
- REST API
- WebSocket
- MetaTrader
- FIX
- Network calls
- Telegram integration
- Database mutation
- Risk engine
- Position management
- Order management
- Trade management
- PnL
- Stop loss / take profit generation
- Slippage
- Commission
- Spread
- Market data
- Real execution

