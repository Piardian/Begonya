import { RiskAudit } from './riskAudit';
import { RiskEvaluationItem } from './riskEvaluationItem';
import { RiskWarning } from './riskWarning';

export const RISK_EVALUATION_RESULT_VERSION = 1 as const;

export interface RiskEvaluationResult {
  readonly metadata: {
    readonly riskEvaluationResultVersion: typeof RISK_EVALUATION_RESULT_VERSION;
    readonly simulationExecutionResultVersion: number;
    readonly simulationExecutionPolicyVersion: number;
    readonly scenarioPolicyVersion: number;
    readonly riskPolicyVersion: number;
    readonly datasetFingerprint: string;
  };
  readonly riskReference: {
    readonly riskPolicyId: string;
    readonly simulationExecutionId: string;
    readonly engineId: string;
    readonly sessionId: string;
    readonly runtimeId: string;
    readonly mode: 'SIMULATION_RISK';
    readonly riskType: 'POLICY_LEVEL_RISK';
  };
  readonly items: readonly RiskEvaluationItem[];
  readonly warnings: readonly RiskWarning[];
  readonly audit: RiskAudit;
}

export function createRiskEvaluationResult(input: {
  readonly metadata: RiskEvaluationResult['metadata'];
  readonly riskReference: RiskEvaluationResult['riskReference'];
  readonly items: readonly RiskEvaluationItem[];
  readonly warnings: readonly RiskWarning[];
  readonly audit: RiskAudit;
}): RiskEvaluationResult {
  return Object.freeze({
    metadata: Object.freeze(input.metadata),
    riskReference: Object.freeze(input.riskReference),
    items: Object.freeze([...input.items]),
    warnings: Object.freeze([...input.warnings]),
    audit: Object.freeze(input.audit),
  });
}

