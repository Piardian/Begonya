import { RuntimeItem } from './runtimeItem';
import { ExecutionSessionContext } from './executionSessionContext';
import { ExecutionSessionState } from './executionSessionState';

export interface ExecutionSessionItem {
  readonly id: string;
  readonly runtimeItemReference: {
    readonly runtimeItemId: string;
    readonly executionPlanItemId: string;
    readonly planningEvaluationId: string;
    readonly decisionId: string;
  };
  readonly sessionState: Extract<ExecutionSessionState, 'COMPLETED' | 'FAILED' | 'CANCELLED'>;
  readonly sessionReason: {
    readonly code: string;
    readonly message: string;
  };
  readonly summary: string;
  readonly explanation: {
    readonly runtimeItem: RuntimeItem;
    readonly sessionReference: {
      readonly sessionId: string;
      readonly sessionMode: string;
    };
  };
}

export function createExecutionSessionItem(
  runtimeItem: RuntimeItem,
  context: ExecutionSessionContext
): ExecutionSessionItem {
  const sessionState = runtimeItem.runtimeStatus === 'BLOCKED' ? 'FAILED' : 'COMPLETED';
  const reasonCode = runtimeItem.runtimeStatus === 'BLOCKED'
    ? 'RUNTIME_ITEM_BLOCKED_IN_SESSION'
    : 'RUNTIME_ITEM_SESSION_CLOSED';
  const reasonMessage = runtimeItem.runtimeStatus === 'BLOCKED'
    ? 'Runtime item was carried into the session as blocked; no execution was attempted.'
    : 'Runtime item lifecycle was closed by the session without execution.';

  return Object.freeze({
    id: `session-item:${context.sessionId}:${runtimeItem.id}`,
    runtimeItemReference: Object.freeze({
      runtimeItemId: runtimeItem.id,
      executionPlanItemId: runtimeItem.executionPlanReference.executionPlanItemId,
      planningEvaluationId: runtimeItem.executionPlanReference.planningEvaluationId,
      decisionId: runtimeItem.executionPlanReference.decisionId,
    }),
    sessionState,
    sessionReason: Object.freeze({
      code: reasonCode,
      message: reasonMessage,
    }),
    summary: `${runtimeItem.id} closed by execution session ${context.sessionId}.`,
    explanation: Object.freeze({
      runtimeItem,
      sessionReference: Object.freeze({
        sessionId: context.sessionId,
        sessionMode: context.sessionMode,
      }),
    }),
  });
}

