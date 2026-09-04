import { ExecutionEngineResult } from './executionEngineResult';
import { PaperExecutionPolicy } from './paperExecutionPolicy';

export const PAPER_EXECUTION_CONTEXT_VERSION = 1 as const;

export interface PaperExecutionContext {
  readonly paperExecutionId: string;
  readonly paperExecutionContextVersion: typeof PAPER_EXECUTION_CONTEXT_VERSION;
  readonly engineReference: ExecutionEngineResult['engineReference'];
  readonly engineResultReference: {
    readonly executionEngineResultVersion: ExecutionEngineResult['metadata']['executionEngineResultVersion'];
    readonly sessionResultVersion: number;
    readonly runtimeResultVersion: number;
    readonly sessionPolicyVersion: number;
    readonly enginePolicyVersion: number;
    readonly datasetFingerprint: string;
  };
  readonly paperPolicyReference: {
    readonly paperExecutionId: string;
    readonly version: number;
    readonly mode: 'PAPER';
  };
  readonly audit: {
    readonly createdFromCommands: number;
    readonly createdFromEngineWarnings: number;
  };
}

export function createPaperExecutionContext(
  engineResult: ExecutionEngineResult,
  policy: PaperExecutionPolicy
): PaperExecutionContext {
  return Object.freeze({
    paperExecutionId: policy.paperExecutionId,
    paperExecutionContextVersion: PAPER_EXECUTION_CONTEXT_VERSION,
    engineReference: engineResult.engineReference,
    engineResultReference: Object.freeze({
      executionEngineResultVersion: engineResult.metadata.executionEngineResultVersion,
      sessionResultVersion: engineResult.metadata.sessionResultVersion,
      runtimeResultVersion: engineResult.metadata.runtimeResultVersion,
      sessionPolicyVersion: engineResult.metadata.sessionPolicyVersion,
      enginePolicyVersion: engineResult.metadata.enginePolicyVersion,
      datasetFingerprint: engineResult.metadata.datasetFingerprint,
    }),
    paperPolicyReference: Object.freeze({
      paperExecutionId: policy.paperExecutionId,
      version: policy.version,
      mode: policy.mode,
    }),
    audit: Object.freeze({
      createdFromCommands: engineResult.commands.length,
      createdFromEngineWarnings: engineResult.warnings.length,
    }),
  });
}

