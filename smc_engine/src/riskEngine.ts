import { createRiskContext } from './riskContext';
import { createRiskEvaluation } from './riskEvaluation';
import { createRiskEvaluationItem } from './riskEvaluationItem';
import { createRiskEvaluationResult, RISK_EVALUATION_RESULT_VERSION, RiskEvaluationResult } from './riskEvaluationResult';
import { RiskPolicy } from './riskPolicy';
import { createRiskWarning, RiskWarning } from './riskWarning';
import { SimulationExecutionResult } from './simulationExecutionResult';

export function evaluateRisk(
  simulationResult: SimulationExecutionResult,
  riskPolicy: RiskPolicy
): RiskEvaluationResult {
  const context = createRiskContext(simulationResult, riskPolicy);
  const warnings = collectRiskWarnings(simulationResult, riskPolicy);
  const items = simulationResult.items
    .slice(0, riskPolicy.maximumRiskItems)
    .map(item => {
      const evaluation = createRiskEvaluation({
        item,
        policy: riskPolicy,
        riskPolicyId: riskPolicy.riskPolicyId,
      });
      return createRiskEvaluationItem({
        simulationItem: item,
        evaluation,
        context,
      });
    });

  return createRiskEvaluationResult({
    metadata: {
      riskEvaluationResultVersion: RISK_EVALUATION_RESULT_VERSION,
      simulationExecutionResultVersion: simulationResult.metadata.simulationExecutionResultVersion,
      simulationExecutionPolicyVersion: simulationResult.metadata.simulationExecutionPolicyVersion,
      scenarioPolicyVersion: simulationResult.metadata.scenarioPolicyVersion,
      riskPolicyVersion: riskPolicy.version,
      datasetFingerprint: simulationResult.metadata.datasetFingerprint,
    },
    riskReference: {
      riskPolicyId: riskPolicy.riskPolicyId,
      simulationExecutionId: simulationResult.simulationExecutionReference.simulationExecutionId,
      engineId: simulationResult.simulationExecutionReference.engineId,
      sessionId: simulationResult.simulationExecutionReference.sessionId,
      runtimeId: simulationResult.simulationExecutionReference.runtimeId,
      mode: riskPolicy.mode,
      riskType: riskPolicy.riskType,
    },
    items,
    warnings,
    audit: {
      inputSimulationItems: simulationResult.items.length,
      inputSimulationWarnings: simulationResult.warnings.length,
      generatedRiskItems: items.length,
      acceptedItems: items.filter(item => item.riskStatus === 'ACCEPTED').length,
      rejectedItems: items.filter(item => item.riskStatus === 'REJECTED').length,
      skippedItems: items.filter(item => item.riskStatus === 'SKIPPED').length,
      lotCalculations: 0 as const,
      marginCalculations: 0 as const,
      pnlCalculations: 0 as const,
      ordersCreated: 0 as const,
      positionsCreated: 0 as const,
      realExecutions: 0 as const,
    },
  });
}

function collectRiskWarnings(
  simulationResult: SimulationExecutionResult,
  riskPolicy: RiskPolicy
): RiskWarning[] {
  const warnings: RiskWarning[] = [];

  if (simulationResult.items.length === 0) {
    warnings.push(createRiskWarning('NO_SIMULATION_ITEMS', 'WARNING', 'SimulationExecutionResult contains no items to evaluate.'));
  }

  if (simulationResult.warnings.length > 0) {
    warnings.push(createRiskWarning('SIMULATION_WARNINGS_PRESENT', 'WARNING', 'SimulationExecutionResult contains warnings carried into Risk Engine.'));
  }

  if (simulationResult.items.some(item => item.simulationStatus !== 'SIMULATED')) {
    warnings.push(createRiskWarning('NON_SIMULATED_ITEM_REJECTED', 'WARNING', 'Non-SIMULATED items are rejected or skipped by policy-level risk evaluation.'));
  }

  if (simulationResult.items.length > riskPolicy.maximumRiskItems) {
    warnings.push(createRiskWarning('MAXIMUM_RISK_ITEMS_EXCEEDED', 'WARNING', 'Some simulation items were not converted to risk items because maximumRiskItems was exceeded.'));
  }

  if (!riskPolicy.allowExecution) {
    warnings.push(createRiskWarning('EXECUTION_DISABLED', 'INFO', 'Execution is disabled by policy. Risk Engine evaluates only.'));
  }

  warnings.push(createRiskWarning('POLICY_LEVEL_RISK_ONLY', 'INFO', 'Sprint 14 evaluates policy-level risk only. No lot, margin, PnL, order, or position logic is executed.'));

  return warnings;
}

