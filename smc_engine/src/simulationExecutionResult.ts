import { SimulationExecutionAudit } from './simulationExecutionAudit';
import { SimulationExecutionItem } from './simulationExecutionItem';
import { SimulationExecutionWarning } from './simulationExecutionWarning';

export const SIMULATION_EXECUTION_RESULT_VERSION = 1 as const;

export interface SimulationExecutionResult {
  readonly metadata: {
    readonly simulationExecutionResultVersion: typeof SIMULATION_EXECUTION_RESULT_VERSION;
    readonly executionEngineResultVersion: number;
    readonly enginePolicyVersion: number;
    readonly sessionResultVersion: number;
    readonly simulationExecutionPolicyVersion: number;
    readonly scenarioPolicyVersion: number;
    readonly datasetFingerprint: string;
  };
  readonly simulationExecutionReference: {
    readonly simulationExecutionId: string;
    readonly engineId: string;
    readonly sessionId: string;
    readonly runtimeId: string;
    readonly mode: 'SIMULATION';
    readonly scenarioType: 'COMMAND_ONLY';
  };
  readonly items: readonly SimulationExecutionItem[];
  readonly warnings: readonly SimulationExecutionWarning[];
  readonly audit: SimulationExecutionAudit;
}

export function createSimulationExecutionResult(input: {
  readonly metadata: SimulationExecutionResult['metadata'];
  readonly simulationExecutionReference: SimulationExecutionResult['simulationExecutionReference'];
  readonly items: readonly SimulationExecutionItem[];
  readonly warnings: readonly SimulationExecutionWarning[];
  readonly audit: SimulationExecutionAudit;
}): SimulationExecutionResult {
  return Object.freeze({
    metadata: Object.freeze(input.metadata),
    simulationExecutionReference: Object.freeze(input.simulationExecutionReference),
    items: Object.freeze([...input.items]),
    warnings: Object.freeze([...input.warnings]),
    audit: Object.freeze(input.audit),
  });
}

