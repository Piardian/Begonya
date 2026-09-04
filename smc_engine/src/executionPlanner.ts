import { DecisionEvaluation } from './decisionEvaluation';
import { DECISION_REPORT_VERSION, DecisionReport } from './decisionReport';
import { ExecutionPlan, EXECUTION_PLAN_VERSION } from './executionPlan';
import { ExecutionPlanItem } from './executionPlanItem';
import { ExecutionPlanningPolicy } from './executionPlanningPolicy';
import { PlanningConstraint, PlanningPrecondition } from './planningConstraint';
import { PlanningEvaluation } from './planningEvaluation';
import { PlanningWarning } from './planningWarning';

export function generateExecutionPlan(
  decisionReport: DecisionReport,
  policy: ExecutionPlanningPolicy
): ExecutionPlan {
  const warnings: PlanningWarning[] = [];
  const evaluations: PlanningEvaluation[] = [];
  const plannedActions: ExecutionPlanItem[] = [];
  const blockedActions: ExecutionPlanItem[] = [];

  if (decisionReport.decisions.length === 0) {
    warnings.push(freezeWarning({
      type: 'NO_DECISIONS',
      severity: 'WARNING',
      message: 'DecisionReport contains no decisions to plan.',
    }));
  }

  for (const decision of decisionReport.decisions) {
    const evaluation = evaluatePlanning(decision, policy, plannedActions.length);
    const item = createExecutionPlanItem(decision, evaluation, policy);

    evaluations.push(evaluation);
    if (evaluation.status === 'PLANNED') {
      plannedActions.push(item);
    } else {
      blockedActions.push(item);
    }
  }

  if (policy.mode === 'LIVE') {
    warnings.push(freezeWarning({
      type: 'LIVE_MODE_RESERVED',
      severity: 'ERROR',
      message: 'LIVE planning mode is reserved and unsupported in Sprint 8.',
    }));
  }

  if (!policy.allowExecution) {
    warnings.push(freezeWarning({
      type: 'EXECUTION_DISABLED',
      severity: 'INFO',
      message: 'Execution is disabled by policy. Sprint 8 only creates plans.',
    }));
  }

  return Object.freeze({
    metadata: Object.freeze({
      executionPlanVersion: EXECUTION_PLAN_VERSION,
      decisionReportVersion: DECISION_REPORT_VERSION,
      datasetFingerprint: decisionReport.metadata.datasetFingerprint,
      generatedFromPlanningId: policy.planningId,
      generatedFromPlanningPolicyVersion: policy.version,
    }),
    planningPolicyReference: Object.freeze({
      planningId: policy.planningId,
      name: policy.name,
      version: policy.version,
      mode: policy.mode,
    }),
    planningEvaluations: Object.freeze(evaluations),
    plannedActions: Object.freeze(plannedActions),
    blockedActions: Object.freeze(blockedActions),
    warnings: Object.freeze(warnings),
    audit: Object.freeze({
      evaluatedDecisions: decisionReport.decisions.length,
      planningEvaluations: evaluations.length,
      plannedActions: plannedActions.length,
      blockedActions: blockedActions.length,
    }),
  });
}

function evaluatePlanning(
  decision: DecisionEvaluation,
  policy: ExecutionPlanningPolicy,
  currentPlannedActions: number
): PlanningEvaluation {
  const preconditions: PlanningPrecondition[] = [
    precondition(
      'DECISION_ELIGIBLE',
      !policy.requireEligibleDecision || decision.status === 'ELIGIBLE',
      policy.requireEligibleDecision
        ? 'Decision must be ELIGIBLE for planning.'
        : 'Eligible decision is not required by planning policy.'
    ),
    precondition(
      'EXECUTION_ELIGIBILITY_PRESENT',
      decision.executionEligibility !== undefined,
      'Decision must expose executionEligibility.'
    ),
    precondition(
      'EXECUTION_ELIGIBILITY_TRUE',
      !policy.requiredExecutionEligibility || decision.executionEligibility.executable,
      policy.requiredExecutionEligibility
        ? 'Decision executionEligibility must be executable.'
        : 'Executable decision eligibility is not required by planning policy.'
    ),
    precondition(
      'PLANNING_POLICY_ALLOWS_ACTION',
      !policy.allowExecution,
      'Sprint 8 requires planning policy allowExecution to remain false.'
    ),
    precondition(
      'EXECUTION_MODE_SUPPORTED',
      policy.allowedExecutionModes.includes(policy.mode) && policy.mode !== 'LIVE',
      'Planning mode must be allowed and LIVE must remain reserved.'
    ),
    precondition(
      'MAXIMUM_PLANNED_ACTIONS_NOT_EXCEEDED',
      currentPlannedActions < policy.maximumPlannedActions,
      'Maximum planned actions must not be exceeded.'
    ),
  ];
  const constraints = constraintsFrom(decision, policy, currentPlannedActions);
  const status = constraints.length === 0 ? 'PLANNED' : 'BLOCKED';

  return Object.freeze({
    id: `planning:${policy.planningId}:${decision.id}`,
    status,
    decisionReference: Object.freeze({
      decisionId: decision.id,
      status: decision.status,
      patternId: decision.patternId,
      observationId: decision.observationId,
    }),
    planningMode: policy.mode,
    executionIntent: policy.defaultExecutionIntent,
    preconditions: Object.freeze(preconditions),
    constraints: Object.freeze(constraints),
    planningReason: Object.freeze({
      code: status === 'PLANNED' ? 'PLAN_CREATED' : 'PLAN_BLOCKED',
      message: status === 'PLANNED'
        ? 'Decision evaluation satisfies planning policy for a plan-only item.'
        : 'Decision evaluation is blocked by one or more planning constraints.',
    }),
  });
}

function constraintsFrom(
  decision: DecisionEvaluation,
  policy: ExecutionPlanningPolicy,
  currentPlannedActions: number
): PlanningConstraint[] {
  const constraints: PlanningConstraint[] = [];

  if (policy.mode === 'LIVE') {
    constraints.push(constraint('LIVE_MODE_RESERVED', 'ERROR', 'LIVE mode is reserved and unsupported in Sprint 8.'));
  }

  if (policy.requireEligibleDecision && decision.status !== 'ELIGIBLE') {
    constraints.push(constraint('DECISION_NOT_ELIGIBLE', 'ERROR', 'Decision is not ELIGIBLE under its decision policy.'));
  }

  if (!decision.executionEligibility) {
    constraints.push(constraint('MISSING_EXECUTION_ELIGIBILITY', 'ERROR', 'Decision is missing executionEligibility.'));
  }

  if (policy.requiredExecutionEligibility && decision.executionEligibility && !decision.executionEligibility.executable) {
    constraints.push(constraint('EXECUTION_ELIGIBILITY_FALSE', 'ERROR', 'Decision executionEligibility is false.'));
  }

  if (currentPlannedActions >= policy.maximumPlannedActions) {
    constraints.push(constraint('MAXIMUM_PLANNED_ACTIONS_EXCEEDED', 'WARNING', 'Maximum planned actions exceeded.'));
  }

  if (!policy.allowedExecutionModes.includes(policy.mode)) {
    constraints.push(constraint('UNSUPPORTED_EXECUTION_MODE', 'ERROR', 'Planning mode is not allowed by policy.'));
  }

  return constraints;
}

function createExecutionPlanItem(
  decision: DecisionEvaluation,
  evaluation: PlanningEvaluation,
  policy: ExecutionPlanningPolicy
): ExecutionPlanItem {
  return Object.freeze({
    id: `plan-item:${evaluation.id}`,
    decisionReference: evaluation.decisionReference,
    planningEvaluationReference: Object.freeze({
      planningEvaluationId: evaluation.id,
      status: evaluation.status,
    }),
    executionIntent: evaluation.executionIntent,
    action: 'PLAN_ONLY' as const,
    preconditions: evaluation.preconditions,
    constraints: evaluation.constraints,
    executionEligibility: decision.executionEligibility,
    planningReason: evaluation.planningReason,
    summary: `${decision.id} produced a ${evaluation.status} plan-only item under planning policy ${policy.planningId}.`,
    explanation: Object.freeze({
      decisionReference: evaluation.decisionReference,
      decisionPolicyReference: decision.explanation.policyReference,
      patternReference: decision.explanation.patternReference,
      observationReference: decision.explanation.observationReference,
      benchmarkReference: decision.explanation.benchmarkReference,
      planningPolicyReference: Object.freeze({
        planningId: policy.planningId,
        version: policy.version,
        mode: policy.mode,
      }),
    }),
  });
}

function precondition(
  type: PlanningPrecondition['type'],
  passed: boolean,
  message: string
): PlanningPrecondition {
  return Object.freeze({
    type,
    status: passed ? 'PASS' : 'FAIL',
    severity: passed ? 'INFO' : 'ERROR',
    message,
  });
}

function constraint(
  type: PlanningConstraint['type'],
  severity: PlanningConstraint['severity'],
  message: string
): PlanningConstraint {
  return Object.freeze({ type, severity, message });
}

function freezeWarning(warning: PlanningWarning): PlanningWarning {
  return Object.freeze(warning);
}
