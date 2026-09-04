import { DECISION_REPORT_VERSION } from './decisionReport';
import { ExecutionPlanItem } from './executionPlanItem';
import { PlanningEvaluation } from './planningEvaluation';
import { PlanningWarning } from './planningWarning';

export const EXECUTION_PLAN_VERSION = 1 as const;

export interface ExecutionPlan {
  readonly metadata: {
    readonly executionPlanVersion: typeof EXECUTION_PLAN_VERSION;
    readonly decisionReportVersion: typeof DECISION_REPORT_VERSION;
    readonly datasetFingerprint: string;
    readonly generatedFromPlanningId: string;
    readonly generatedFromPlanningPolicyVersion: number;
  };
  readonly planningPolicyReference: {
    readonly planningId: string;
    readonly name: string;
    readonly version: number;
    readonly mode: string;
  };
  readonly planningEvaluations: readonly PlanningEvaluation[];
  readonly plannedActions: readonly ExecutionPlanItem[];
  readonly blockedActions: readonly ExecutionPlanItem[];
  readonly warnings: readonly PlanningWarning[];
  readonly audit: {
    readonly evaluatedDecisions: number;
    readonly planningEvaluations: number;
    readonly plannedActions: number;
    readonly blockedActions: number;
  };
}

