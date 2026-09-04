import { createExecutionContext } from './executionContext';
import { EXECUTION_PLAN_VERSION, ExecutionPlan } from './executionPlan';
import { ExecutionPlanItem } from './executionPlanItem';
import { ExecutionRuntimePolicy, RuntimeAdapterType } from './executionRuntimePolicy';
import { BrokerRuntimeAdapter } from './brokerRuntimeAdapter';
import { PaperRuntimeAdapter } from './paperRuntimeAdapter';
import { RuntimeAdapter } from './runtimeAdapter';
import { RUNTIME_RESULT_VERSION, RuntimeResult, RuntimeWarning } from './runtimeResult';
import { SimulationRuntimeAdapter } from './simulationRuntimeAdapter';
import { createRuntimeItem } from './runtimeItemFactory';

export function executePlan(
  executionPlan: ExecutionPlan,
  runtimePolicy: ExecutionRuntimePolicy
): RuntimeResult {
  const context = createExecutionContext(executionPlan, runtimePolicy);
  const warnings: RuntimeWarning[] = [];
  const processedItems = [];
  const skippedItems = [];

  if (executionPlan.plannedActions.length === 0) {
    warnings.push(warning('NO_PLANNED_ACTIONS', 'WARNING', 'ExecutionPlan contains no planned actions to prepare.'));
  }

  if (!runtimePolicy.allowRuntime) {
    warnings.push(warning('RUNTIME_DISABLED', 'ERROR', 'Runtime is disabled by policy.'));
  }

  if (!runtimePolicy.allowExecution) {
    warnings.push(warning('EXECUTION_DISABLED', 'INFO', 'Execution is disabled by policy. Sprint 9 prepares only.'));
  }

  const adapter = resolveRuntimeAdapter(runtimePolicy.runtimeMode);

  if (!runtimePolicy.supportedAdapters.includes(runtimePolicy.runtimeMode)) {
    warnings.push(warning('UNSUPPORTED_ADAPTER', 'ERROR', 'Runtime mode is not listed in supportedAdapters.'));
  }

  if (runtimePolicy.runtimeMode === 'BROKER') {
    warnings.push(warning('BROKER_RUNTIME_RESERVED', 'ERROR', 'Broker runtime is reserved and cannot execute in Sprint 9.'));
  }

  for (const item of executionPlan.plannedActions) {
    if (processedItems.length >= runtimePolicy.maximumRuntimeItems) {
      skippedItems.push(createSkippedRuntimeItem(item, runtimePolicy));
      continue;
    }

    if (!runtimePolicy.allowRuntime || !runtimePolicy.supportedAdapters.includes(runtimePolicy.runtimeMode)) {
      skippedItems.push(createSkippedRuntimeItem(item, runtimePolicy));
      continue;
    }

    processedItems.push(adapter.prepare(item, context, runtimePolicy));
  }

  if (skippedItems.length > 0 && executionPlan.plannedActions.length > runtimePolicy.maximumRuntimeItems) {
    warnings.push(warning('MAXIMUM_RUNTIME_ITEMS_EXCEEDED', 'WARNING', 'Some planned actions were skipped by maximumRuntimeItems.'));
  }

  return Object.freeze({
    metadata: Object.freeze({
      runtimeResultVersion: RUNTIME_RESULT_VERSION,
      executionPlanVersion: EXECUTION_PLAN_VERSION,
      runtimePolicyVersion: runtimePolicy.version,
      datasetFingerprint: executionPlan.metadata.datasetFingerprint,
    }),
    runtimeReference: Object.freeze({
      runtimeId: runtimePolicy.runtimeId,
      runtimeMode: runtimePolicy.runtimeMode,
    }),
    processedItems: Object.freeze(processedItems),
    skippedItems: Object.freeze(skippedItems),
    warnings: Object.freeze(warnings),
    audit: Object.freeze({
      inputPlannedActions: executionPlan.plannedActions.length,
      inputBlockedActions: executionPlan.blockedActions.length,
      processedItems: processedItems.length,
      skippedItems: skippedItems.length,
      blockedItems: processedItems.filter(item => item.runtimeStatus === 'BLOCKED').length,
    }),
  });
}

function resolveRuntimeAdapter(runtimeMode: RuntimeAdapterType): RuntimeAdapter {
  if (runtimeMode === 'PAPER') return new PaperRuntimeAdapter();
  if (runtimeMode === 'SIMULATION') return new SimulationRuntimeAdapter();
  return new BrokerRuntimeAdapter();
}

function createSkippedRuntimeItem(
  item: ExecutionPlanItem,
  policy: ExecutionRuntimePolicy
) {
  const context = createExecutionContext({
    metadata: {
      executionPlanVersion: EXECUTION_PLAN_VERSION,
      decisionReportVersion: 1,
      datasetFingerprint: item.explanation.benchmarkReference?.datasetFingerprint ?? 'unknown',
      generatedFromPlanningId: item.explanation.planningPolicyReference.planningId,
      generatedFromPlanningPolicyVersion: item.explanation.planningPolicyReference.version,
    },
    planningPolicyReference: {
      planningId: item.explanation.planningPolicyReference.planningId,
      name: item.explanation.planningPolicyReference.planningId,
      version: item.explanation.planningPolicyReference.version,
      mode: item.explanation.planningPolicyReference.mode,
    },
    planningEvaluations: [],
    plannedActions: [item],
    blockedActions: [],
    warnings: [],
    audit: {
      evaluatedDecisions: 1,
      planningEvaluations: 1,
      plannedActions: 1,
      blockedActions: 0,
    },
  }, policy);

  return createRuntimeItem({
    item,
    context,
    policy,
    adapter: policy.runtimeMode,
    runtimeStatus: 'SKIPPED',
    reasonCode: 'RUNTIME_ITEM_SKIPPED',
    reasonMessage: 'Runtime item was skipped by runtime policy constraints.',
  });
}

function warning(
  type: RuntimeWarning['type'],
  severity: RuntimeWarning['severity'],
  message: string
): RuntimeWarning {
  return Object.freeze({ type, severity, message });
}
