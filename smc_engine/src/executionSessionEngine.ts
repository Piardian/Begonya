import { createExecutionSessionContext } from './executionSessionContext';
import { createCompletedSessionLifecycle, createFailedSessionLifecycle } from './executionSessionLifecycle';
import { createExecutionSession, ExecutionSession } from './executionSession';
import { createExecutionSessionItem } from './executionSessionItem';
import { createExecutionSessionResult, EXECUTION_SESSION_RESULT_VERSION, ExecutionSessionResult } from './executionSessionResult';
import { ExecutionSessionPolicy } from './executionSessionPolicy';
import { RuntimeResult } from './runtimeResult';
import { createSessionWarning, SessionWarning } from './sessionWarning';

export function createExecutionSessionFromRuntimeResult(
  runtimeResult: RuntimeResult,
  sessionPolicy: ExecutionSessionPolicy
): ExecutionSessionResult {
  const context = createExecutionSessionContext(runtimeResult, sessionPolicy);
  const warnings = collectSessionWarnings(runtimeResult, sessionPolicy);
  const runtimeItems = [...runtimeResult.processedItems, ...runtimeResult.skippedItems]
    .slice(0, sessionPolicy.maximumSessionItems);
  const sessionItems = runtimeItems.map(item => createExecutionSessionItem(item, context));
  const hasErrors = warnings.some(item => item.severity === 'ERROR');
  const lifecycle = hasErrors ? createFailedSessionLifecycle() : createCompletedSessionLifecycle();

  const session: ExecutionSession = createExecutionSession({
    context,
    lifecycle,
    items: sessionItems,
    warnings,
  });

  return createExecutionSessionResult({
    metadata: {
      sessionResultVersion: EXECUTION_SESSION_RESULT_VERSION,
      runtimeResultVersion: runtimeResult.metadata.runtimeResultVersion,
      runtimePolicyVersion: runtimeResult.metadata.runtimePolicyVersion,
      sessionPolicyVersion: sessionPolicy.version,
      datasetFingerprint: runtimeResult.metadata.datasetFingerprint,
    },
    sessionReference: {
      sessionId: sessionPolicy.sessionId,
      runtimeId: runtimeResult.runtimeReference.runtimeId,
      sessionMode: sessionPolicy.sessionMode,
      runtimeMode: runtimeResult.runtimeReference.runtimeMode,
    },
    lifecycle: session.lifecycle,
    sessionItems: session.items,
    warnings: session.warnings,
    audit: {
      inputRuntimeProcessedItems: runtimeResult.processedItems.length,
      inputRuntimeSkippedItems: runtimeResult.skippedItems.length,
      sessionItems: session.items.length,
      completedItems: session.items.filter(item => item.sessionState === 'COMPLETED').length,
      failedItems: session.items.filter(item => item.sessionState === 'FAILED').length,
      cancelledItems: session.items.filter(item => item.sessionState === 'CANCELLED').length,
    },
  });
}

function collectSessionWarnings(
  runtimeResult: RuntimeResult,
  sessionPolicy: ExecutionSessionPolicy
): SessionWarning[] {
  const warnings: SessionWarning[] = [];
  const totalRuntimeItems = runtimeResult.processedItems.length + runtimeResult.skippedItems.length;

  if (totalRuntimeItems === 0) {
    warnings.push(createSessionWarning('NO_RUNTIME_ITEMS', 'WARNING', 'RuntimeResult contains no runtime items to place into a session.'));
  }

  if (!sessionPolicy.allowSession) {
    warnings.push(createSessionWarning('SESSION_DISABLED', 'ERROR', 'Execution session is disabled by policy.'));
  }

  if (!sessionPolicy.allowExecution) {
    warnings.push(createSessionWarning('EXECUTION_DISABLED', 'INFO', 'Execution is disabled by policy. Sprint 10 manages session lifecycle only.'));
  }

  if (sessionPolicy.sessionMode === 'BROKER') {
    warnings.push(createSessionWarning('BROKER_SESSION_RESERVED', 'ERROR', 'Broker session is reserved and cannot execute in Sprint 10.'));
  }

  if (runtimeResult.runtimeReference.runtimeMode !== sessionPolicy.sessionMode) {
    warnings.push(createSessionWarning('SESSION_MODE_MISMATCH', 'WARNING', 'Session mode differs from the RuntimeResult runtime mode.'));
  }

  if (runtimeResult.warnings.length > 0) {
    warnings.push(createSessionWarning('RUNTIME_WARNINGS_PRESENT', 'WARNING', 'RuntimeResult contains warnings carried into the session.'));
  }

  if (totalRuntimeItems > sessionPolicy.maximumSessionItems) {
    warnings.push(createSessionWarning('MAXIMUM_SESSION_ITEMS_EXCEEDED', 'WARNING', 'Some runtime items were not included because maximumSessionItems was exceeded.'));
  }

  return warnings;
}

