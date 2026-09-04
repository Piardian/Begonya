export const SIMULATION_EXECUTION_POLICY_VERSION = 1 as const;
export const SIMULATION_SCENARIO_POLICY_VERSION = 1 as const;

export type SimulationExecutionMode = 'SIMULATION';
export type SimulationScenarioType = 'COMMAND_ONLY';

export interface SimulationExecutionPolicy {
  readonly version: typeof SIMULATION_EXECUTION_POLICY_VERSION;
  readonly simulationExecutionId: string;
  readonly mode: SimulationExecutionMode;
  readonly allowSimulationExecution: true;
  readonly allowRealExecution: false;
  readonly maximumSimulationItems: number;
  readonly scenarioPolicy: {
    readonly version: typeof SIMULATION_SCENARIO_POLICY_VERSION;
    readonly scenarioType: SimulationScenarioType;
  };
}

export type CreateSimulationExecutionPolicyInput = Omit<
  SimulationExecutionPolicy,
  'version' | 'mode' | 'allowSimulationExecution' | 'allowRealExecution' | 'scenarioPolicy'
> & {
  readonly version?: typeof SIMULATION_EXECUTION_POLICY_VERSION;
  readonly mode?: SimulationExecutionMode;
  readonly allowSimulationExecution?: true;
  readonly allowRealExecution?: false;
  readonly scenarioPolicy?: Partial<SimulationExecutionPolicy['scenarioPolicy']>;
};

export function createSimulationExecutionPolicy(
  input: CreateSimulationExecutionPolicyInput
): SimulationExecutionPolicy {
  return Object.freeze({
    simulationExecutionId: input.simulationExecutionId,
    version: input.version ?? SIMULATION_EXECUTION_POLICY_VERSION,
    mode: 'SIMULATION' as const,
    allowSimulationExecution: true as const,
    allowRealExecution: false as const,
    maximumSimulationItems: input.maximumSimulationItems,
    scenarioPolicy: Object.freeze({
      version: input.scenarioPolicy?.version ?? SIMULATION_SCENARIO_POLICY_VERSION,
      scenarioType: input.scenarioPolicy?.scenarioType ?? 'COMMAND_ONLY',
    }),
  });
}

