import { ExecutionSessionContext } from './executionSessionContext';
import { ExecutionSessionLifecycle } from './executionSessionLifecycle';
import { ExecutionSessionItem } from './executionSessionItem';
import { SessionWarning } from './sessionWarning';

export const EXECUTION_SESSION_VERSION = 1 as const;

export interface ExecutionSession {
  readonly metadata: {
    readonly executionSessionVersion: typeof EXECUTION_SESSION_VERSION;
    readonly runtimeResultVersion: number;
    readonly sessionPolicyVersion: number;
    readonly datasetFingerprint: string;
  };
  readonly context: ExecutionSessionContext;
  readonly lifecycle: ExecutionSessionLifecycle;
  readonly items: readonly ExecutionSessionItem[];
  readonly warnings: readonly SessionWarning[];
}

export function createExecutionSession(input: {
  readonly context: ExecutionSessionContext;
  readonly lifecycle: ExecutionSessionLifecycle;
  readonly items: readonly ExecutionSessionItem[];
  readonly warnings: readonly SessionWarning[];
}): ExecutionSession {
  return Object.freeze({
    metadata: Object.freeze({
      executionSessionVersion: EXECUTION_SESSION_VERSION,
      runtimeResultVersion: input.context.runtimeResultReference.runtimeResultVersion,
      sessionPolicyVersion: input.context.sessionPolicyReference.version,
      datasetFingerprint: input.context.runtimeResultReference.datasetFingerprint,
    }),
    context: input.context,
    lifecycle: input.lifecycle,
    items: Object.freeze([...input.items]),
    warnings: Object.freeze([...input.warnings]),
  });
}

