export type PlanningCheckStatus = 'PASS' | 'FAIL' | 'SKIPPED';
export type PlanningSeverity = 'INFO' | 'WARNING' | 'ERROR';

export type PlanningPreconditionType =
  | 'DECISION_ELIGIBLE'
  | 'EXECUTION_ELIGIBILITY_PRESENT'
  | 'EXECUTION_ELIGIBILITY_TRUE'
  | 'PLANNING_POLICY_ALLOWS_ACTION'
  | 'EXECUTION_MODE_SUPPORTED'
  | 'MAXIMUM_PLANNED_ACTIONS_NOT_EXCEEDED';

export type PlanningConstraintType =
  | 'EXECUTION_DISABLED'
  | 'LIVE_MODE_RESERVED'
  | 'DECISION_NOT_ELIGIBLE'
  | 'MISSING_EXECUTION_ELIGIBILITY'
  | 'EXECUTION_ELIGIBILITY_FALSE'
  | 'MAXIMUM_PLANNED_ACTIONS_EXCEEDED'
  | 'UNSUPPORTED_EXECUTION_MODE';

export interface PlanningPrecondition {
  readonly type: PlanningPreconditionType;
  readonly status: PlanningCheckStatus;
  readonly severity: PlanningSeverity;
  readonly message: string;
}

export interface PlanningConstraint {
  readonly type: PlanningConstraintType;
  readonly severity: PlanningSeverity;
  readonly message: string;
}

