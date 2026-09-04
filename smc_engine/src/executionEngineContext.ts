import { ExecutionSessionResult } from './executionSessionResult';
import { ExecutionEngineMode, ExecutionEnginePolicy } from './executionEnginePolicy';
import { RuntimeMode } from './executionRuntimePolicy';

export const EXECUTION_ENGINE_CONTEXT_VERSION = 1 as const;

export interface ExecutionEngineContext {
  readonly engineId: string;
  readonly engineContextVersion: typeof EXECUTION_ENGINE_CONTEXT_VERSION;
  readonly engineMode: ExecutionEngineMode;
  readonly sessionReference: {
    readonly sessionId: string;
    readonly runtimeId: string;
    readonly sessionMode: RuntimeMode;
    readonly runtimeMode: RuntimeMode;
  };
  readonly sessionResultReference: {
    readonly sessionResultVersion: ExecutionSessionResult['metadata']['sessionResultVersion'];
    readonly runtimeResultVersion: number;
    readonly runtimePolicyVersion: number;
    readonly sessionPolicyVersion: number;
    readonly datasetFingerprint: string;
  };
  readonly enginePolicyReference: {
    readonly engineId: string;
    readonly version: number;
    readonly engineMode: ExecutionEngineMode;
  };
  readonly audit: {
    readonly createdFromSessionItems: number;
    readonly createdFromSessionWarnings: number;
  };
}

export function createExecutionEngineContext(
  sessionResult: ExecutionSessionResult,
  enginePolicy: ExecutionEnginePolicy
): ExecutionEngineContext {
  return Object.freeze({
    engineId: enginePolicy.engineId,
    engineContextVersion: EXECUTION_ENGINE_CONTEXT_VERSION,
    engineMode: enginePolicy.engineMode,
    sessionReference: Object.freeze({
      sessionId: sessionResult.sessionReference.sessionId,
      runtimeId: sessionResult.sessionReference.runtimeId,
      sessionMode: sessionResult.sessionReference.sessionMode,
      runtimeMode: sessionResult.sessionReference.runtimeMode,
    }),
    sessionResultReference: Object.freeze({
      sessionResultVersion: sessionResult.metadata.sessionResultVersion,
      runtimeResultVersion: sessionResult.metadata.runtimeResultVersion,
      runtimePolicyVersion: sessionResult.metadata.runtimePolicyVersion,
      sessionPolicyVersion: sessionResult.metadata.sessionPolicyVersion,
      datasetFingerprint: sessionResult.metadata.datasetFingerprint,
    }),
    enginePolicyReference: Object.freeze({
      engineId: enginePolicy.engineId,
      version: enginePolicy.version,
      engineMode: enginePolicy.engineMode,
    }),
    audit: Object.freeze({
      createdFromSessionItems: sessionResult.sessionItems.length,
      createdFromSessionWarnings: sessionResult.warnings.length,
    }),
  });
}

