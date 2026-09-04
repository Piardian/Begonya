import { createExecutionCommand, ExecutionCommand } from './executionCommand';
import { createExecutionEngineContext } from './executionEngineContext';
import { ExecutionEnginePolicy } from './executionEnginePolicy';
import { createExecutionEngineResult, EXECUTION_ENGINE_RESULT_VERSION, ExecutionEngineResult } from './executionEngineResult';
import { ExecutionSessionItem } from './executionSessionItem';
import { ExecutionSessionResult } from './executionSessionResult';
import { createExecutionWarning, ExecutionWarning } from './executionWarning';

export function executeSession(
  sessionResult: ExecutionSessionResult,
  enginePolicy: ExecutionEnginePolicy
): ExecutionEngineResult {
  const context = createExecutionEngineContext(sessionResult, enginePolicy);
  const warnings = collectExecutionWarnings(sessionResult, enginePolicy);
  const commands = sessionResult.sessionItems
    .slice(0, enginePolicy.maximumCommands)
    .map(item => createCommandForSessionItem(item, enginePolicy, context));

  return createExecutionEngineResult({
    metadata: {
      executionEngineResultVersion: EXECUTION_ENGINE_RESULT_VERSION,
      sessionResultVersion: sessionResult.metadata.sessionResultVersion,
      runtimeResultVersion: sessionResult.metadata.runtimeResultVersion,
      sessionPolicyVersion: sessionResult.metadata.sessionPolicyVersion,
      enginePolicyVersion: enginePolicy.version,
      datasetFingerprint: sessionResult.metadata.datasetFingerprint,
    },
    engineReference: {
      engineId: enginePolicy.engineId,
      sessionId: sessionResult.sessionReference.sessionId,
      runtimeId: sessionResult.sessionReference.runtimeId,
      engineMode: enginePolicy.engineMode,
      sessionMode: sessionResult.sessionReference.sessionMode,
      runtimeMode: sessionResult.sessionReference.runtimeMode,
    },
    commands,
    warnings,
    audit: {
      inputSessionItems: sessionResult.sessionItems.length,
      inputSessionWarnings: sessionResult.warnings.length,
      generatedCommands: commands.length,
      readyCommands: commands.filter(item => item.commandStatus === 'READY').length,
      blockedCommands: commands.filter(item => item.commandStatus === 'BLOCKED').length,
      skippedCommands: commands.filter(item => item.commandStatus === 'SKIPPED').length,
    },
  });
}

function createCommandForSessionItem(
  sessionItem: ExecutionSessionItem,
  enginePolicy: ExecutionEnginePolicy,
  context: ReturnType<typeof createExecutionEngineContext>
): ExecutionCommand {
  if (!enginePolicy.allowEngine) {
    return createExecutionCommand({
      sessionItem,
      context,
      commandType: 'SKIP_EXECUTION',
      commandStatus: 'SKIPPED',
      reasonCode: 'ENGINE_DISABLED',
      reasonMessage: 'Execution engine is disabled by policy.',
    });
  }

  if (enginePolicy.engineMode === 'BROKER') {
    return createExecutionCommand({
      sessionItem,
      context,
      commandType: 'BLOCK_EXECUTION',
      commandStatus: 'BLOCKED',
      reasonCode: 'BROKER_ENGINE_RESERVED',
      reasonMessage: 'Broker execution engine is reserved and cannot execute in Sprint 11.',
    });
  }

  if (sessionItem.sessionState === 'FAILED' || sessionItem.sessionState === 'CANCELLED') {
    return createExecutionCommand({
      sessionItem,
      context,
      commandType: 'BLOCK_EXECUTION',
      commandStatus: 'BLOCKED',
      reasonCode: 'SESSION_ITEM_NOT_EXECUTABLE',
      reasonMessage: 'Session item is not executable because its lifecycle did not complete successfully.',
    });
  }

  return createExecutionCommand({
    sessionItem,
    context,
    commandType: 'PREPARE_EXECUTION',
    commandStatus: 'READY',
    reasonCode: 'EXECUTION_READY_FOR_FUTURE_LAYER',
    reasonMessage: 'Session item is ready for a future execution layer. No execution was attempted.',
  });
}

function collectExecutionWarnings(
  sessionResult: ExecutionSessionResult,
  enginePolicy: ExecutionEnginePolicy
): ExecutionWarning[] {
  const warnings: ExecutionWarning[] = [];

  if (sessionResult.sessionItems.length === 0) {
    warnings.push(createExecutionWarning('NO_SESSION_ITEMS', 'WARNING', 'ExecutionSessionResult contains no session items to orchestrate.'));
  }

  if (!enginePolicy.allowEngine) {
    warnings.push(createExecutionWarning('ENGINE_DISABLED', 'ERROR', 'Execution engine is disabled by policy.'));
  }

  if (!enginePolicy.allowExecution) {
    warnings.push(createExecutionWarning('EXECUTION_DISABLED', 'INFO', 'Execution is disabled by policy. Sprint 11 orchestrates only.'));
  }

  if (enginePolicy.engineMode === 'BROKER') {
    warnings.push(createExecutionWarning('BROKER_ENGINE_RESERVED', 'ERROR', 'Broker execution engine is reserved and cannot execute in Sprint 11.'));
  }

  if (sessionResult.warnings.length > 0) {
    warnings.push(createExecutionWarning('SESSION_WARNINGS_PRESENT', 'WARNING', 'ExecutionSessionResult contains warnings carried into the execution engine.'));
  }

  if (sessionResult.lifecycle.finalState !== 'COMPLETED') {
    warnings.push(createExecutionWarning('SESSION_NOT_COMPLETED', 'ERROR', 'ExecutionSessionResult lifecycle is not completed.'));
  }

  if (sessionResult.sessionReference.sessionMode !== enginePolicy.engineMode) {
    warnings.push(createExecutionWarning('ENGINE_MODE_MISMATCH', 'WARNING', 'Execution engine mode differs from the session mode.'));
  }

  if (sessionResult.sessionItems.length > enginePolicy.maximumCommands) {
    warnings.push(createExecutionWarning('MAXIMUM_COMMANDS_EXCEEDED', 'WARNING', 'Some session items were not converted to commands because maximumCommands was exceeded.'));
  }

  return warnings;
}

