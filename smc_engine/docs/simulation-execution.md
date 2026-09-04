# Sprint 13 — Simulation Execution

Simulation Execution consumes `ExecutionEngineResult` and produces `SimulationExecutionResult`.

It is not Paper Execution, Broker Execution, market replay, backtesting, risk calculation, or PnL calculation.

## Responsibility

```text
ExecutionEngineResult
        ↓
Simulation Execution
        ↓
SimulationExecutionResult
```

Paper Execution and Simulation Execution are sibling strategies. Both consume `ExecutionEngineResult`; Simulation does not consume Paper output.

## Scenario model

Sprint 13 supports one scenario type:

```text
COMMAND_ONLY
```

`SimulationScenario` is a command-level deterministic scenario. It is not a price path, candle replay, tick simulation, order book model, or broker model.

The scenario contract includes future-facing metadata:

- `scenarioType`
- `scenarioVersion`
- `scenarioCapabilities`

These fields prepare the contract for future scenario types without expanding Sprint 13 scope.

## One-to-one item rule

```text
1 ExecutionCommand
        ↓
0 or 1 SimulationExecutionItem
        ↓
1 SimulationScenario
```

Commands beyond `maximumSimulationItems` are not converted.

## Lifecycle

For a READY command:

```text
QUEUED
        ↓
SIMULATING
        ↓
SIMULATED
```

`SIMULATING` is a logical intermediate lifecycle state in Sprint 13. It does not imply asynchronous work, market data replay, or a long-running simulation runtime.

For a BLOCKED command:

```text
REJECTED
```

For a SKIPPED command:

```text
SKIPPED
```

`SIMULATED` means the command-only scenario was resolved. It does not mean a trade was executed, a market path was replayed, or PnL was calculated.

## Safety audit

Simulation scenarios and items explicitly report:

```text
marketDataUsed: false
realExecution: false
orderCreated: false
tradeCreated: false
positionCreated: false
pnlCalculated: false
riskCalculated: false
```

These are part of the domain contract, not comments.

## Determinism

The simulation layer is reproducible:

```text
Same ExecutionEngineResult
+ same SimulationExecutionPolicy
= same SimulationExecutionResult
```

No random IDs, UUID generation, `Date.now()`, clock dependencies, network calls, or external mutable services are allowed. `simulationExecutionId` is supplied by policy and must be deterministic.

## Explainability

The explainability chain is preserved by reference:

```text
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

Simulation Execution does not create new market explanations or policy decisions.

## Non-goals

Sprint 13 does not include:

- Broker integration
- Exchange integration
- REST API
- WebSocket
- FIX
- MetaTrader
- Network calls
- Telegram integration
- Database mutation
- Position management
- Order management
- Trade management
- PnL
- Risk engine
- Stop loss / take profit generation
- Spread
- Commission
- Slippage
- Market data
- Real execution

