import { ExecutionPlan } from './executionPlan';
import { ExecutionRuntimePolicy, RuntimeMode } from './executionRuntimePolicy';

export const EXECUTION_CONTEXT_VERSION = 1 as const;

export interface ExecutionContext {
  readonly runtimeId: string;
  readonly runtimeVersion: typeof EXECUTION_CONTEXT_VERSION;
  readonly runtimeMode: RuntimeMode;
  readonly executionPlanReference: {
    readonly executionPlanVersion: ExecutionPlan['metadata']['executionPlanVersion'];
    readonly datasetFingerprint: string;
    readonly generatedFromPlanningId: string;
  };
  readonly planningPolicyReference: ExecutionPlan['planningPolicyReference'];
  readonly runtimePolicyReference: {
    readonly runtimeId: string;
    readonly version: number;
    readonly runtimeMode: RuntimeMode;
  };
  readonly audit: {
    readonly createdFromPlannedActions: number;
    readonly createdFromBlockedActions: number;
  };
}

export function createExecutionContext(
  executionPlan: ExecutionPlan,
  runtimePolicy: ExecutionRuntimePolicy
): ExecutionContext {
  return Object.freeze({
    runtimeId: runtimePolicy.runtimeId,
    runtimeVersion: EXECUTION_CONTEXT_VERSION,
    runtimeMode: runtimePolicy.runtimeMode,
    executionPlanReference: Object.freeze({
      executionPlanVersion: executionPlan.metadata.executionPlanVersion,
      datasetFingerprint: executionPlan.metadata.datasetFingerprint,
      generatedFromPlanningId: executionPlan.metadata.generatedFromPlanningId,
    }),
    planningPolicyReference: executionPlan.planningPolicyReference,
    runtimePolicyReference: Object.freeze({
      runtimeId: runtimePolicy.runtimeId,
      version: runtimePolicy.version,
      runtimeMode: runtimePolicy.runtimeMode,
    }),
    audit: Object.freeze({
      createdFromPlannedActions: executionPlan.plannedActions.length,
      createdFromBlockedActions: executionPlan.blockedActions.length,
    }),
  });
}
