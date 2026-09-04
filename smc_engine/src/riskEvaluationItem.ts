import { RiskContext } from './riskContext';
import { RiskEvaluation, RiskEvaluationStatus } from './riskEvaluation';
import {
  createAcceptedRiskLifecycle,
  createRejectedRiskLifecycle,
  createSkippedRiskLifecycle,
  RiskLifecycle,
} from './riskLifecycle';
import { SimulationExecutionItem } from './simulationExecutionItem';

export const RISK_EVALUATION_ITEM_VERSION = 1 as const;

export type RiskStatus = RiskEvaluationStatus;

export interface RiskEvaluationItem {
  readonly id: string;
  readonly version: typeof RISK_EVALUATION_ITEM_VERSION;
  readonly simulationItemReference: {
    readonly simulationItemId: string;
    readonly simulationStatus: string;
    readonly scenarioId: string;
    readonly commandId: string;
    readonly executionPlanItemId: string;
    readonly planningEvaluationId: string;
    readonly decisionId: string;
  };
  readonly lifecycle: RiskLifecycle;
  readonly evaluation: RiskEvaluation;
  readonly riskStatus: RiskStatus;
  readonly explanation: {
    readonly simulationExecutionItem: SimulationExecutionItem;
    readonly riskReference: {
      readonly riskPolicyId: string;
      readonly mode: 'SIMULATION_RISK';
      readonly riskType: 'POLICY_LEVEL_RISK';
    };
  };
}

export function createRiskEvaluationItem(input: {
  readonly simulationItem: SimulationExecutionItem;
  readonly evaluation: RiskEvaluation;
  readonly context: RiskContext;
}): RiskEvaluationItem {
  const { simulationItem, evaluation, context } = input;

  return Object.freeze({
    id: `risk-evaluation-item:${context.riskPolicyId}:${simulationItem.id}`,
    version: RISK_EVALUATION_ITEM_VERSION,
    simulationItemReference: Object.freeze({
      simulationItemId: simulationItem.id,
      simulationStatus: simulationItem.simulationStatus,
      scenarioId: simulationItem.scenario.id,
      commandId: simulationItem.commandReference.commandId,
      executionPlanItemId: simulationItem.commandReference.executionPlanItemId,
      planningEvaluationId: simulationItem.commandReference.planningEvaluationId,
      decisionId: simulationItem.commandReference.decisionId,
    }),
    lifecycle: lifecycleForStatus(evaluation.evaluationStatus),
    evaluation,
    riskStatus: evaluation.evaluationStatus,
    explanation: Object.freeze({
      simulationExecutionItem: simulationItem,
      riskReference: Object.freeze({
        riskPolicyId: context.riskPolicyId,
        mode: context.riskPolicyReference.mode,
        riskType: context.riskPolicyReference.riskType,
      }),
    }),
  });
}

function lifecycleForStatus(status: RiskEvaluationStatus): RiskLifecycle {
  if (status === 'ACCEPTED') return createAcceptedRiskLifecycle();
  if (status === 'SKIPPED') return createSkippedRiskLifecycle();
  return createRejectedRiskLifecycle();
}

