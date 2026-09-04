import { DecisionEvaluationStatus } from './decisionEvaluation';
import { ExecutionIntent, PlanningMode } from './executionPlanningPolicy';
import { PlanningConstraint, PlanningPrecondition } from './planningConstraint';

export type PlanningEvaluationStatus = 'PLANNED' | 'BLOCKED';

export interface PlanningEvaluation {
  readonly id: string;
  readonly status: PlanningEvaluationStatus;
  readonly decisionReference: {
    readonly decisionId: string;
    readonly status: DecisionEvaluationStatus;
    readonly patternId?: string;
    readonly observationId?: string;
  };
  readonly planningMode: PlanningMode;
  readonly executionIntent: ExecutionIntent;
  readonly preconditions: readonly PlanningPrecondition[];
  readonly constraints: readonly PlanningConstraint[];
  readonly planningReason: {
    readonly code: string;
    readonly message: string;
  };
}

