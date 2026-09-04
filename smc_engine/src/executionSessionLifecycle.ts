import { ExecutionSessionState } from './executionSessionState';

export interface ExecutionSessionLifecycle {
  readonly initialState: Extract<ExecutionSessionState, 'CREATED'>;
  readonly readyState: Extract<ExecutionSessionState, 'READY'>;
  readonly currentState: ExecutionSessionState;
  readonly finalState: Extract<ExecutionSessionState, 'COMPLETED' | 'CANCELLED' | 'FAILED'>;
}

export function createCompletedSessionLifecycle(): ExecutionSessionLifecycle {
  return Object.freeze({
    initialState: 'CREATED' as const,
    readyState: 'READY' as const,
    currentState: 'COMPLETED' as const,
    finalState: 'COMPLETED' as const,
  });
}

export function createFailedSessionLifecycle(): ExecutionSessionLifecycle {
  return Object.freeze({
    initialState: 'CREATED' as const,
    readyState: 'READY' as const,
    currentState: 'FAILED' as const,
    finalState: 'FAILED' as const,
  });
}

