export type PlanningWarningType =
  | 'NO_DECISIONS'
  | 'LIVE_MODE_RESERVED'
  | 'EXECUTION_DISABLED'
  | 'MAXIMUM_PLANNED_ACTIONS_EXCEEDED';

export interface PlanningWarning {
  readonly type: PlanningWarningType;
  readonly severity: 'INFO' | 'WARNING' | 'ERROR';
  readonly message: string;
}

