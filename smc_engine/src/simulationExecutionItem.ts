import { ExecutionCommand } from './executionCommand';
import {
  createRejectedSimulationLifecycle,
  createSimulatedLifecycle,
  createSkippedSimulationLifecycle,
  SimulationExecutionLifecycle,
} from './simulationExecutionLifecycle';
import { SimulationScenario, SimulationScenarioStatus } from './simulationScenario';
import { SimulationExecutionContext } from './simulationExecutionContext';

export const SIMULATION_EXECUTION_ITEM_VERSION = 1 as const;

export type SimulationExecutionStatus = SimulationScenarioStatus;

export interface SimulationExecutionItem {
  readonly id: string;
  readonly version: typeof SIMULATION_EXECUTION_ITEM_VERSION;
  readonly commandReference: {
    readonly commandId: string;
    readonly commandType: string;
    readonly commandStatus: string;
    readonly sessionItemId: string;
    readonly runtimeItemId: string;
    readonly executionPlanItemId: string;
    readonly planningEvaluationId: string;
    readonly decisionId: string;
  };
  readonly scenario: SimulationScenario;
  readonly lifecycle: SimulationExecutionLifecycle;
  readonly simulationStatus: SimulationExecutionStatus;
  readonly simulationReason: {
    readonly code: string;
    readonly message: string;
  };
  readonly audit: {
    readonly scenarioAttached: true;
    readonly marketDataUsed: false;
    readonly realExecution: false;
    readonly orderCreated: false;
    readonly tradeCreated: false;
    readonly positionCreated: false;
    readonly pnlCalculated: false;
    readonly riskCalculated: false;
  };
  readonly summary: string;
  readonly explanation: {
    readonly executionCommand: ExecutionCommand;
    readonly simulationExecutionReference: {
      readonly simulationExecutionId: string;
      readonly mode: 'SIMULATION';
    };
  };
}

export function createSimulationExecutionItem(input: {
  readonly command: ExecutionCommand;
  readonly scenario: SimulationScenario;
  readonly context: SimulationExecutionContext;
}): SimulationExecutionItem {
  const { command, scenario, context } = input;

  return Object.freeze({
    id: `simulation-execution-item:${context.simulationExecutionId}:${command.id}`,
    version: SIMULATION_EXECUTION_ITEM_VERSION,
    commandReference: Object.freeze({
      commandId: command.id,
      commandType: command.commandType,
      commandStatus: command.commandStatus,
      sessionItemId: command.sessionItemReference.sessionItemId,
      runtimeItemId: command.sessionItemReference.runtimeItemId,
      executionPlanItemId: command.sessionItemReference.executionPlanItemId,
      planningEvaluationId: command.sessionItemReference.planningEvaluationId,
      decisionId: command.sessionItemReference.decisionId,
    }),
    scenario,
    lifecycle: lifecycleForScenario(scenario.scenarioResult.status),
    simulationStatus: scenario.scenarioResult.status,
    simulationReason: Object.freeze({
      code: scenario.scenarioResult.reasonCode,
      message: scenario.scenarioResult.reasonMessage,
    }),
    audit: Object.freeze({
      scenarioAttached: true as const,
      marketDataUsed: false as const,
      realExecution: false as const,
      orderCreated: false as const,
      tradeCreated: false as const,
      positionCreated: false as const,
      pnlCalculated: false as const,
      riskCalculated: false as const,
    }),
    summary: `${command.id} resolved as ${scenario.scenarioResult.status} by command-only simulation ${context.simulationExecutionId}.`,
    explanation: Object.freeze({
      executionCommand: command,
      simulationExecutionReference: Object.freeze({
        simulationExecutionId: context.simulationExecutionId,
        mode: 'SIMULATION' as const,
      }),
    }),
  });
}

function lifecycleForScenario(status: SimulationScenarioStatus): SimulationExecutionLifecycle {
  if (status === 'SIMULATED') return createSimulatedLifecycle();
  if (status === 'SKIPPED') return createSkippedSimulationLifecycle();
  return createRejectedSimulationLifecycle();
}

