import { SimulationExecutionResult } from './simulationExecutionResult';
import { RiskPolicy } from './riskPolicy';

export const RISK_CONTEXT_VERSION = 1 as const;

export interface RiskContext {
  readonly riskPolicyId: string;
  readonly riskContextVersion: typeof RISK_CONTEXT_VERSION;
  readonly simulationReference: SimulationExecutionResult['simulationExecutionReference'];
  readonly simulationResultReference: {
    readonly simulationExecutionResultVersion: SimulationExecutionResult['metadata']['simulationExecutionResultVersion'];
    readonly executionEngineResultVersion: number;
    readonly enginePolicyVersion: number;
    readonly sessionResultVersion: number;
    readonly simulationExecutionPolicyVersion: number;
    readonly scenarioPolicyVersion: number;
    readonly datasetFingerprint: string;
  };
  readonly riskPolicyReference: {
    readonly riskPolicyId: string;
    readonly version: number;
    readonly mode: 'SIMULATION_RISK';
    readonly riskType: 'POLICY_LEVEL_RISK';
  };
  readonly audit: {
    readonly createdFromSimulationItems: number;
    readonly createdFromSimulationWarnings: number;
  };
}

export function createRiskContext(
  simulationResult: SimulationExecutionResult,
  riskPolicy: RiskPolicy
): RiskContext {
  return Object.freeze({
    riskPolicyId: riskPolicy.riskPolicyId,
    riskContextVersion: RISK_CONTEXT_VERSION,
    simulationReference: simulationResult.simulationExecutionReference,
    simulationResultReference: Object.freeze({
      simulationExecutionResultVersion: simulationResult.metadata.simulationExecutionResultVersion,
      executionEngineResultVersion: simulationResult.metadata.executionEngineResultVersion,
      enginePolicyVersion: simulationResult.metadata.enginePolicyVersion,
      sessionResultVersion: simulationResult.metadata.sessionResultVersion,
      simulationExecutionPolicyVersion: simulationResult.metadata.simulationExecutionPolicyVersion,
      scenarioPolicyVersion: simulationResult.metadata.scenarioPolicyVersion,
      datasetFingerprint: simulationResult.metadata.datasetFingerprint,
    }),
    riskPolicyReference: Object.freeze({
      riskPolicyId: riskPolicy.riskPolicyId,
      version: riskPolicy.version,
      mode: riskPolicy.mode,
      riskType: riskPolicy.riskType,
    }),
    audit: Object.freeze({
      createdFromSimulationItems: simulationResult.items.length,
      createdFromSimulationWarnings: simulationResult.warnings.length,
    }),
  });
}

