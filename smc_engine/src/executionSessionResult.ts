import { RuntimeMode } from './executionRuntimePolicy';
import { ExecutionSessionLifecycle } from './executionSessionLifecycle';
import { ExecutionSessionItem } from './executionSessionItem';
import { SessionWarning } from './sessionWarning';

export const EXECUTION_SESSION_RESULT_VERSION = 1 as const;

export interface ExecutionSessionResult {
  readonly metadata: {
    readonly sessionResultVersion: typeof EXECUTION_SESSION_RESULT_VERSION;
    readonly runtimeResultVersion: number;
    readonly runtimePolicyVersion: number;
    readonly sessionPolicyVersion: number;
    readonly datasetFingerprint: string;
  };
  readonly sessionReference: {
    readonly sessionId: string;
    readonly runtimeId: string;
    readonly sessionMode: RuntimeMode;
    readonly runtimeMode: RuntimeMode;
  };
  readonly lifecycle: ExecutionSessionLifecycle;
  readonly sessionItems: readonly ExecutionSessionItem[];
  readonly warnings: readonly SessionWarning[];
  readonly audit: {
    readonly inputRuntimeProcessedItems: number;
    readonly inputRuntimeSkippedItems: number;
    readonly sessionItems: number;
    readonly completedItems: number;
    readonly failedItems: number;
    readonly cancelledItems: number;
  };
}

export function createExecutionSessionResult(input: {
  readonly metadata: ExecutionSessionResult['metadata'];
  readonly sessionReference: ExecutionSessionResult['sessionReference'];
  readonly lifecycle: ExecutionSessionLifecycle;
  readonly sessionItems: readonly ExecutionSessionItem[];
  readonly warnings: readonly SessionWarning[];
  readonly audit: ExecutionSessionResult['audit'];
}): ExecutionSessionResult {
  return Object.freeze({
    metadata: Object.freeze(input.metadata),
    sessionReference: Object.freeze(input.sessionReference),
    lifecycle: input.lifecycle,
    sessionItems: Object.freeze([...input.sessionItems]),
    warnings: Object.freeze([...input.warnings]),
    audit: Object.freeze(input.audit),
  });
}

