import { RuntimeResult } from './runtimeResult';
import { ExecutionSessionPolicy, ExecutionSessionMode } from './executionSessionPolicy';
import { RuntimeMode } from './executionRuntimePolicy';

export const EXECUTION_SESSION_CONTEXT_VERSION = 1 as const;

export interface ExecutionSessionContext {
  readonly sessionId: string;
  readonly sessionContextVersion: typeof EXECUTION_SESSION_CONTEXT_VERSION;
  readonly sessionMode: ExecutionSessionMode;
  readonly runtimeReference: {
    readonly runtimeId: string;
    readonly runtimeMode: RuntimeMode;
  };
  readonly runtimeResultReference: {
    readonly runtimeResultVersion: RuntimeResult['metadata']['runtimeResultVersion'];
    readonly runtimePolicyVersion: number;
    readonly executionPlanVersion: RuntimeResult['metadata']['executionPlanVersion'];
    readonly datasetFingerprint: string;
  };
  readonly sessionPolicyReference: {
    readonly sessionId: string;
    readonly version: number;
    readonly sessionMode: ExecutionSessionMode;
  };
  readonly audit: {
    readonly createdFromProcessedItems: number;
    readonly createdFromSkippedItems: number;
    readonly createdFromRuntimeWarnings: number;
  };
}

export function createExecutionSessionContext(
  runtimeResult: RuntimeResult,
  sessionPolicy: ExecutionSessionPolicy
): ExecutionSessionContext {
  return Object.freeze({
    sessionId: sessionPolicy.sessionId,
    sessionContextVersion: EXECUTION_SESSION_CONTEXT_VERSION,
    sessionMode: sessionPolicy.sessionMode,
    runtimeReference: Object.freeze({
      runtimeId: runtimeResult.runtimeReference.runtimeId,
      runtimeMode: runtimeResult.runtimeReference.runtimeMode,
    }),
    runtimeResultReference: Object.freeze({
      runtimeResultVersion: runtimeResult.metadata.runtimeResultVersion,
      runtimePolicyVersion: runtimeResult.metadata.runtimePolicyVersion,
      executionPlanVersion: runtimeResult.metadata.executionPlanVersion,
      datasetFingerprint: runtimeResult.metadata.datasetFingerprint,
    }),
    sessionPolicyReference: Object.freeze({
      sessionId: sessionPolicy.sessionId,
      version: sessionPolicy.version,
      sessionMode: sessionPolicy.sessionMode,
    }),
    audit: Object.freeze({
      createdFromProcessedItems: runtimeResult.processedItems.length,
      createdFromSkippedItems: runtimeResult.skippedItems.length,
      createdFromRuntimeWarnings: runtimeResult.warnings.length,
    }),
  });
}

