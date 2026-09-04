export const EXECUTION_PLANNING_POLICY_VERSION = 1 as const;

export type PlanningMode = 'PAPER' | 'SIMULATION' | 'LIVE';
export type ExecutionIntent = 'PLAN_ONLY' | 'OPEN_POSITION' | 'CLOSE_POSITION' | 'IGNORE';

export interface ExecutionPlanningPolicy {
  readonly version: typeof EXECUTION_PLANNING_POLICY_VERSION;
  readonly planningId: string;
  readonly name: string;
  readonly mode: PlanningMode;
  readonly allowExecution: false;
  readonly requireEligibleDecision: boolean;
  readonly requiredExecutionEligibility: boolean;
  readonly maximumPlannedActions: number;
  readonly allowedExecutionModes: readonly PlanningMode[];
  readonly defaultExecutionIntent: ExecutionIntent;
}

export type CreateExecutionPlanningPolicyInput = Omit<ExecutionPlanningPolicy, 'version' | 'allowExecution'> & {
  version?: typeof EXECUTION_PLANNING_POLICY_VERSION;
  allowExecution?: false;
};

export function createExecutionPlanningPolicy(input: CreateExecutionPlanningPolicyInput): ExecutionPlanningPolicy {
  return Object.freeze({
    version: input.version ?? EXECUTION_PLANNING_POLICY_VERSION,
    planningId: input.planningId,
    name: input.name,
    mode: input.mode,
    allowExecution: false as const,
    requireEligibleDecision: input.requireEligibleDecision,
    requiredExecutionEligibility: input.requiredExecutionEligibility,
    maximumPlannedActions: input.maximumPlannedActions,
    allowedExecutionModes: Object.freeze([...input.allowedExecutionModes]),
    defaultExecutionIntent: input.defaultExecutionIntent,
  });
}

