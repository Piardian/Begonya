import { ExecutionEngineResult } from './executionEngineResult';
import { createSimulationExecutionContext } from './simulationExecutionContext';
import { createSimulationExecutionItem } from './simulationExecutionItem';
import { SimulationExecutionPolicy } from './simulationExecutionPolicy';
import { createSimulationExecutionResult, SIMULATION_EXECUTION_RESULT_VERSION, SimulationExecutionResult } from './simulationExecutionResult';
import { createSimulationExecutionWarning, SimulationExecutionWarning } from './simulationExecutionWarning';
import { createSimulationScenario } from './simulationScenario';

export function simulateExecution(
  engineResult: ExecutionEngineResult,
  policy: SimulationExecutionPolicy
): SimulationExecutionResult {
  const context = createSimulationExecutionContext(engineResult, policy);
  const warnings = collectSimulationExecutionWarnings(engineResult, policy);
  const items = engineResult.commands
    .slice(0, policy.maximumSimulationItems)
    .map(command => createSimulationExecutionItem({
      command,
      scenario: createSimulationScenario(command, context),
      context,
    }));

  return createSimulationExecutionResult({
    metadata: {
      simulationExecutionResultVersion: SIMULATION_EXECUTION_RESULT_VERSION,
      executionEngineResultVersion: engineResult.metadata.executionEngineResultVersion,
      enginePolicyVersion: engineResult.metadata.enginePolicyVersion,
      sessionResultVersion: engineResult.metadata.sessionResultVersion,
      simulationExecutionPolicyVersion: policy.version,
      scenarioPolicyVersion: policy.scenarioPolicy.version,
      datasetFingerprint: engineResult.metadata.datasetFingerprint,
    },
    simulationExecutionReference: {
      simulationExecutionId: policy.simulationExecutionId,
      engineId: engineResult.engineReference.engineId,
      sessionId: engineResult.engineReference.sessionId,
      runtimeId: engineResult.engineReference.runtimeId,
      mode: policy.mode,
      scenarioType: policy.scenarioPolicy.scenarioType,
    },
    items,
    warnings,
    audit: {
      inputCommands: engineResult.commands.length,
      inputEngineWarnings: engineResult.warnings.length,
      generatedSimulationItems: items.length,
      attachedScenarios: items.filter(item => item.audit.scenarioAttached).length,
      simulatedItems: items.filter(item => item.simulationStatus === 'SIMULATED').length,
      rejectedItems: items.filter(item => item.simulationStatus === 'REJECTED').length,
      skippedItems: items.filter(item => item.simulationStatus === 'SKIPPED').length,
      marketDataUsed: 0 as const,
      realExecutions: 0 as const,
      ordersCreated: 0 as const,
      tradesCreated: 0 as const,
      positionsCreated: 0 as const,
      pnlCalculations: 0 as const,
      riskCalculations: 0 as const,
    },
  });
}

function collectSimulationExecutionWarnings(
  engineResult: ExecutionEngineResult,
  policy: SimulationExecutionPolicy
): SimulationExecutionWarning[] {
  const warnings: SimulationExecutionWarning[] = [];

  if (engineResult.commands.length === 0) {
    warnings.push(createSimulationExecutionWarning('NO_EXECUTION_COMMANDS', 'WARNING', 'ExecutionEngineResult contains no commands to simulate.'));
  }

  if (engineResult.warnings.length > 0) {
    warnings.push(createSimulationExecutionWarning('ENGINE_WARNINGS_PRESENT', 'WARNING', 'ExecutionEngineResult contains warnings carried into Simulation Execution.'));
  }

  if (engineResult.commands.some(command => command.commandStatus !== 'READY')) {
    warnings.push(createSimulationExecutionWarning('NON_READY_COMMAND_REJECTED', 'WARNING', 'Non-READY execution commands are rejected or skipped by Simulation Execution.'));
  }

  if (engineResult.commands.length > policy.maximumSimulationItems) {
    warnings.push(createSimulationExecutionWarning('MAXIMUM_SIMULATION_ITEMS_EXCEEDED', 'WARNING', 'Some execution commands were not converted to simulation items because maximumSimulationItems was exceeded.'));
  }

  if (!policy.allowRealExecution) {
    warnings.push(createSimulationExecutionWarning('REAL_EXECUTION_DISABLED', 'INFO', 'Real execution is disabled by policy. Sprint 13 is simulation-only.'));
  }

  if (engineResult.engineReference.engineMode !== 'SIMULATION') {
    warnings.push(createSimulationExecutionWarning('NON_SIMULATION_ENGINE_MODE', 'WARNING', 'ExecutionEngineResult was not produced in SIMULATION mode.'));
  }

  warnings.push(createSimulationExecutionWarning('MARKET_DATA_NOT_AVAILABLE_BY_DESIGN', 'INFO', 'Sprint 13 command-only simulation does not use market data by design.'));

  return warnings;
}

