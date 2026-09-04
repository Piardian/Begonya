import { DecisionEvaluation } from './decisionEvaluation';
import { PlanningEvaluation } from './planningEvaluation';

export interface ExecutionPlanItem {
  readonly id: string;
  readonly decisionReference: PlanningEvaluation['decisionReference'];
  readonly planningEvaluationReference: {
    readonly planningEvaluationId: string;
    readonly status: PlanningEvaluation['status'];
  };
  readonly executionIntent: PlanningEvaluation['executionIntent'];
  readonly action: 'PLAN_ONLY';
  readonly preconditions: PlanningEvaluation['preconditions'];
  readonly constraints: PlanningEvaluation['constraints'];
  readonly executionEligibility: DecisionEvaluation['executionEligibility'];
  readonly planningReason: PlanningEvaluation['planningReason'];
  readonly summary: string;
  readonly explanation: {
    readonly decisionReference: PlanningEvaluation['decisionReference'];
    readonly decisionPolicyReference: DecisionEvaluation['explanation']['policyReference'];
    readonly patternReference?: DecisionEvaluation['explanation']['patternReference'];
    readonly observationReference?: DecisionEvaluation['explanation']['observationReference'];
    readonly benchmarkReference?: DecisionEvaluation['explanation']['benchmarkReference'];
    readonly planningPolicyReference: {
      readonly planningId: string;
      readonly version: number;
      readonly mode: string;
    };
  };
}

