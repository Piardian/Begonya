import { ExecutionEngineResult } from './executionEngineResult';
import { createPaperExecutionContext } from './paperExecutionContext';
import { createPaperExecutionItem } from './paperExecutionItem';
import { PaperExecutionPolicy } from './paperExecutionPolicy';
import { createPaperExecutionResult, PAPER_EXECUTION_RESULT_VERSION, PaperExecutionResult } from './paperExecutionResult';
import { createPaperExecutionWarning, PaperExecutionWarning } from './paperExecutionWarning';

export function paperExecute(
  engineResult: ExecutionEngineResult,
  policy: PaperExecutionPolicy
): PaperExecutionResult {
  const context = createPaperExecutionContext(engineResult, policy);
  const warnings = collectPaperExecutionWarnings(engineResult, policy);
  const items = engineResult.commands
    .slice(0, policy.maximumPaperItems)
    .map(command => createPaperExecutionItem(command, context));

  return createPaperExecutionResult({
    metadata: {
      paperExecutionResultVersion: PAPER_EXECUTION_RESULT_VERSION,
      executionEngineResultVersion: engineResult.metadata.executionEngineResultVersion,
      enginePolicyVersion: engineResult.metadata.enginePolicyVersion,
      sessionResultVersion: engineResult.metadata.sessionResultVersion,
      paperExecutionPolicyVersion: policy.version,
      datasetFingerprint: engineResult.metadata.datasetFingerprint,
    },
    paperExecutionReference: {
      paperExecutionId: policy.paperExecutionId,
      engineId: engineResult.engineReference.engineId,
      sessionId: engineResult.engineReference.sessionId,
      runtimeId: engineResult.engineReference.runtimeId,
      mode: policy.mode,
    },
    items,
    warnings,
    audit: {
      inputCommands: engineResult.commands.length,
      inputEngineWarnings: engineResult.warnings.length,
      generatedPaperItems: items.length,
      completedItems: items.filter(item => item.paperStatus === 'COMPLETED').length,
      rejectedItems: items.filter(item => item.paperStatus === 'REJECTED').length,
      skippedItems: items.filter(item => item.paperStatus === 'SKIPPED').length,
      realExecutions: 0 as const,
      ordersCreated: 0 as const,
      positionsCreated: 0 as const,
      pnlCalculations: 0 as const,
    },
  });
}

function collectPaperExecutionWarnings(
  engineResult: ExecutionEngineResult,
  policy: PaperExecutionPolicy
): PaperExecutionWarning[] {
  const warnings: PaperExecutionWarning[] = [];

  if (engineResult.commands.length === 0) {
    warnings.push(createPaperExecutionWarning('NO_EXECUTION_COMMANDS', 'WARNING', 'ExecutionEngineResult contains no commands to paper execute.'));
  }

  if (engineResult.warnings.length > 0) {
    warnings.push(createPaperExecutionWarning('ENGINE_WARNINGS_PRESENT', 'WARNING', 'ExecutionEngineResult contains warnings carried into Paper Execution.'));
  }

  if (engineResult.commands.some(command => command.commandStatus !== 'READY')) {
    warnings.push(createPaperExecutionWarning('NON_READY_COMMAND_REJECTED', 'WARNING', 'Non-READY execution commands are rejected or skipped by Paper Execution.'));
  }

  if (engineResult.commands.length > policy.maximumPaperItems) {
    warnings.push(createPaperExecutionWarning('MAXIMUM_PAPER_ITEMS_EXCEEDED', 'WARNING', 'Some execution commands were not converted to paper items because maximumPaperItems was exceeded.'));
  }

  if (!policy.allowRealExecution) {
    warnings.push(createPaperExecutionWarning('REAL_EXECUTION_DISABLED', 'INFO', 'Real execution is disabled by policy. Sprint 12 is paper-only.'));
  }

  if (engineResult.engineReference.engineMode !== 'PAPER') {
    warnings.push(createPaperExecutionWarning('NON_PAPER_ENGINE_MODE', 'WARNING', 'ExecutionEngineResult was not produced in PAPER mode.'));
  }

  return warnings;
}

