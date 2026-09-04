import { ExecutionCommand } from './executionCommand';
import { SimulationExecutionContext } from './simulationExecutionContext';

export const SIMULATION_SCENARIO_VERSION = 1 as const;

export type SimulationScenarioStatus = 'SIMULATED' | 'REJECTED' | 'SKIPPED';

export interface SimulationScenario {
  readonly id: string;
  readonly version: typeof SIMULATION_SCENARIO_VERSION;
  readonly scenarioType: 'COMMAND_ONLY';
  readonly scenarioVersion: number;
  readonly scenarioCapabilities: readonly string[];
  readonly commandReference: {
    readonly commandId: string;
    readonly commandType: string;
    readonly commandStatus: string;
  };
  readonly expectedPath: {
    readonly queued: boolean;
    readonly simulated: boolean;
    readonly rejected: boolean;
    readonly skipped: boolean;
  };
  readonly scenarioResult: {
    readonly status: SimulationScenarioStatus;
    readonly reasonCode: string;
    readonly reasonMessage: string;
  };
  readonly audit: {
    readonly marketDataUsed: false;
    readonly realExecution: false;
    readonly orderCreated: false;
    readonly tradeCreated: false;
    readonly positionCreated: false;
    readonly pnlCalculated: false;
    readonly riskCalculated: false;
  };
}

export function createSimulationScenario(
  command: ExecutionCommand,
  context: SimulationExecutionContext
): SimulationScenario {
  const status = resolveScenarioStatus(command);

  return Object.freeze({
    id: `simulation-scenario:${context.simulationExecutionId}:${command.id}`,
    version: SIMULATION_SCENARIO_VERSION,
    scenarioType: context.simulationPolicyReference.scenarioType,
    scenarioVersion: context.simulationPolicyReference.scenarioPolicyVersion,
    scenarioCapabilities: Object.freeze(['COMMAND_ONLY', 'NO_MARKET_DATA', 'NO_PNL', 'NO_RISK']),
    commandReference: Object.freeze({
      commandId: command.id,
      commandType: command.commandType,
      commandStatus: command.commandStatus,
    }),
    expectedPath: Object.freeze({
      queued: status === 'SIMULATED',
      simulated: status === 'SIMULATED',
      rejected: status === 'REJECTED',
      skipped: status === 'SKIPPED',
    }),
    scenarioResult: Object.freeze({
      status,
      reasonCode: reasonCode(status),
      reasonMessage: reasonMessage(status),
    }),
    audit: Object.freeze({
      marketDataUsed: false as const,
      realExecution: false as const,
      orderCreated: false as const,
      tradeCreated: false as const,
      positionCreated: false as const,
      pnlCalculated: false as const,
      riskCalculated: false as const,
    }),
  });
}

function resolveScenarioStatus(command: ExecutionCommand): SimulationScenarioStatus {
  if (command.commandStatus === 'READY') return 'SIMULATED';
  if (command.commandStatus === 'SKIPPED') return 'SKIPPED';
  return 'REJECTED';
}

function reasonCode(status: SimulationScenarioStatus): string {
  if (status === 'SIMULATED') return 'COMMAND_ONLY_SCENARIO_SIMULATED';
  if (status === 'SKIPPED') return 'COMMAND_ONLY_SCENARIO_SKIPPED';
  return 'COMMAND_ONLY_SCENARIO_REJECTED';
}

function reasonMessage(status: SimulationScenarioStatus): string {
  if (status === 'SIMULATED') return 'Command-only scenario was deterministically simulated without market data.';
  if (status === 'SKIPPED') return 'Command-only scenario was skipped because the execution command was skipped.';
  return 'Command-only scenario was rejected because the execution command was not READY.';
}

