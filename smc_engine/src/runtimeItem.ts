import { ExecutionPlanItem } from './executionPlanItem';
import { RuntimeAdapterType } from './executionRuntimePolicy';

export type RuntimeStatus = 'PREPARED' | 'SKIPPED' | 'BLOCKED';
export type PreparedAction = 'PLAN_ONLY';

export interface RuntimeItem {
  readonly id: string;
  readonly executionPlanReference: {
    readonly executionPlanItemId: string;
    readonly planningEvaluationId: string;
    readonly decisionId: string;
  };
  readonly runtimeStatus: RuntimeStatus;
  readonly adapter: RuntimeAdapterType;
  readonly preparedAction: PreparedAction;
  readonly runtimeReason: {
    readonly code: string;
    readonly message: string;
  };
  readonly summary: string;
  readonly explanation: {
    readonly executionPlanItem: ExecutionPlanItem;
    readonly planningEvaluationReference: ExecutionPlanItem['planningEvaluationReference'];
    readonly decisionReference: ExecutionPlanItem['decisionReference'];
    readonly decisionPolicyReference: ExecutionPlanItem['explanation']['decisionPolicyReference'];
    readonly patternReference?: ExecutionPlanItem['explanation']['patternReference'];
    readonly observationReference?: ExecutionPlanItem['explanation']['observationReference'];
    readonly benchmarkReference?: ExecutionPlanItem['explanation']['benchmarkReference'];
    readonly runtimePolicyReference: {
      readonly runtimeId: string;
      readonly version: number;
      readonly runtimeMode: string;
    };
  };
}
