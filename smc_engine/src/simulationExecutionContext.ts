import { ExecutionEngineResult } from './executionEngineResult';
import { SimulationExecutionPolicy } from './simulationExecutionPolicy';

export const SIMULATION_EXECUTION_CONTEXT_VERSION = 1 as const;

export interface SimulationExecutionContext {
  readonly simulationExecutionId: string;
  readonly simulationExecutionContextVersion: typeof SIMULATION_EXECUTION_CONTEXT_VERSION;
  readonly engineReference: ExecutionEngineResult['engineReference'];
  readonly engineResultReference: {
    readonly executionEngineResultVersion: ExecutionEngineResult['metadata']['executionEngineResultVersion'];
    readonly sessionResultVersion: number;
    readonly runtimeResultVersion: number;
    readonly sessionPolicyVersion: number;
    readonly enginePolicyVersion: number;
    readonly datasetFingerprint: string;
  };
  readonly simulationPolicyReference: {
    readonly simulationExecutionId: string;
    readonly version: number;
    readonly mode: 'SIMULATION';
    readonly scenarioPolicyVersion: number;
    readonly scenarioType: 'COMMAND_ONLY';
  };
  readonly audit: {
    readonly createdFromCommands: number;
    readonly createdFromEngineWarnings: number;
  };
}

export function createSimulationExecutionContext(
  engineResult: ExecutionEngineResult,
  policy: SimulationExecutionPolicy
): SimulationExecutionContext {
  return Object.freeze({
    simulationExecutionId: policy.simulationExecutionId,
    simulationExecutionContextVersion: SIMULATION_EXECUTION_CONTEXT_VERSION,
    engineReference: engineResult.engineReference,
    engineResultReference: Object.freeze({
      executionEngineResultVersion: engineResult.metadata.executionEngineResultVersion,
      sessionResultVersion: engineResult.metadata.sessionResultVersion,
      runtimeResultVersion: engineResult.metadata.runtimeResultVersion,
      sessionPolicyVersion: engineResult.metadata.sessionPolicyVersion,
      enginePolicyVersion: engineResult.metadata.enginePolicyVersion,
      datasetFingerprint: engineResult.metadata.datasetFingerprint,
    }),
    simulationPolicyReference: Object.freeze({
      simulationExecutionId: policy.simulationExecutionId,
      version: policy.version,
      mode: policy.mode,
      scenarioPolicyVersion: policy.scenarioPolicy.version,
      scenarioType: policy.scenarioPolicy.scenarioType,
    }),
    audit: Object.freeze({
      createdFromCommands: engineResult.commands.length,
      createdFromEngineWarnings: engineResult.warnings.length,
    }),
  });
}

