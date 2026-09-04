import { ExecutionContext } from './executionContext';
import { ExecutionPlanItem } from './executionPlanItem';
import { ExecutionRuntimePolicy, RuntimeAdapterType } from './executionRuntimePolicy';
import { RuntimeItem, RuntimeStatus } from './runtimeItem';

export interface CreateRuntimeItemInput {
  readonly item: ExecutionPlanItem;
  readonly context: ExecutionContext;
  readonly policy: ExecutionRuntimePolicy;
  readonly adapter: RuntimeAdapterType;
  readonly runtimeStatus: RuntimeStatus;
  readonly reasonCode: string;
  readonly reasonMessage: string;
}

export function createRuntimeItem(input: CreateRuntimeItemInput): RuntimeItem {
  const { item, context, policy } = input;

  return Object.freeze({
    id: `runtime-item:${policy.runtimeId}:${item.id}`,
    executionPlanReference: Object.freeze({
      executionPlanItemId: item.id,
      planningEvaluationId: item.planningEvaluationReference.planningEvaluationId,
      decisionId: item.decisionReference.decisionId,
    }),
    runtimeStatus: input.runtimeStatus,
    adapter: input.adapter,
    preparedAction: 'PLAN_ONLY' as const,
    runtimeReason: Object.freeze({
      code: input.reasonCode,
      message: input.reasonMessage,
    }),
    summary: `${item.id} prepared as PLAN_ONLY by ${input.adapter} runtime adapter.`,
    explanation: Object.freeze({
      executionPlanItem: item,
      planningEvaluationReference: item.planningEvaluationReference,
      decisionReference: item.decisionReference,
      decisionPolicyReference: item.explanation.decisionPolicyReference,
      patternReference: item.explanation.patternReference,
      observationReference: item.explanation.observationReference,
      benchmarkReference: item.explanation.benchmarkReference,
      runtimePolicyReference: Object.freeze({
        runtimeId: context.runtimePolicyReference.runtimeId,
        version: context.runtimePolicyReference.version,
        runtimeMode: context.runtimePolicyReference.runtimeMode,
      }),
    }),
  });
}
