# Sprint 14 — Risk Engine

Risk Engine consumes `SimulationExecutionResult` and produces `RiskEvaluationResult`.

It is not a broker, order manager, position manager, margin engine, lot sizing engine, PnL engine, or real execution layer.

## Responsibility

```text
SimulationExecutionResult
        ↓
Risk Engine
        ↓
RiskEvaluationResult
```

Sprint 14 implements only:

```text
POLICY_LEVEL_RISK
```

## Semantics

```text
ACCEPTED = policy gate passed
ACCEPTED ≠ order allowed
ACCEPTED ≠ broker execution
ACCEPTED ≠ position created
```

Risk Engine does not open positions, generate orders, calculate lot size, calculate margin, or calculate PnL.

## Lifecycle

For a SIMULATED item:

```text
QUEUED
        ↓
EVALUATING
        ↓
ACCEPTED
```

For a REJECTED item:

```text
REJECTED
```

For a SKIPPED item:

```text
SKIPPED
```

## Checks

Risk Engine creates `RiskCheck` entries for explainability:

- `SIMULATION_STATUS_SIMULATED`
- `SCENARIO_ATTACHED`
- `NO_MARKET_DATA_USED`
- `NO_REAL_EXECUTION`
- `NO_ORDER_CREATED`
- `NO_TRADE_CREATED`
- `NO_POSITION_CREATED`
- `NO_PNL_CALCULATED`
- `NO_RISK_CALCULATED`

## Safety audit

Risk evaluations and results explicitly report:

```text
lotCalculated: false
marginCalculated: false
pnlCalculated: false
orderCreated: false
positionCreated: false
realExecution: false
```

or aggregate zero counters:

```text
lotCalculations: 0
marginCalculations: 0
pnlCalculations: 0
ordersCreated: 0
positionsCreated: 0
realExecutions: 0
```

These fields are part of the domain contract.

## Determinism

The risk layer is reproducible:

```text
Same SimulationExecutionResult
+ same RiskPolicy
= same RiskEvaluationResult
```

No random IDs, UUID generation, `Date.now()`, clock dependencies, network calls, or external mutable services are allowed.

## Explainability

The explainability chain is preserved by reference:

```text
RiskEvaluationItem
        ↓
SimulationExecutionItem
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

## Non-goals

Sprint 14 does not include:

- Broker
- Exchange
- REST
- WebSocket
- Network
- Database mutation
- Order
- Position
- Trade
- Lot calculation
- Margin calculation
- PnL calculation
- Stop loss
- Take profit
- Commission
- Spread
- Slippage
- Real execution

