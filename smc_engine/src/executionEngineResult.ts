import { ExecutionCommand } from './executionCommand';
import { ExecutionEngineAudit } from './executionEngineAudit';
import { ExecutionWarning } from './executionWarning';
import { RuntimeMode } from './executionRuntimePolicy';

export const EXECUTION_ENGINE_RESULT_VERSION = 1 as const;

export interface ExecutionEngineResult {
  readonly metadata: {
    readonly executionEngineResultVersion: typeof EXECUTION_ENGINE_RESULT_VERSION;
    readonly sessionResultVersion: number;
    readonly runtimeResultVersion: number;
    readonly sessionPolicyVersion: number;
    readonly enginePolicyVersion: number;
    readonly datasetFingerprint: string;
  };
  readonly engineReference: {
    readonly engineId: string;
    readonly sessionId: string;
    readonly runtimeId: string;
    readonly engineMode: RuntimeMode;
    readonly sessionMode: RuntimeMode;
    readonly runtimeMode: RuntimeMode;
  };
  readonly commands: readonly ExecutionCommand[];
  readonly warnings: readonly ExecutionWarning[];
  readonly audit: ExecutionEngineAudit;
}

export function createExecutionEngineResult(input: {
  readonly metadata: ExecutionEngineResult['metadata'];
  readonly engineReference: ExecutionEngineResult['engineReference'];
  readonly commands: readonly ExecutionCommand[];
  readonly warnings: readonly ExecutionWarning[];
  readonly audit: ExecutionEngineAudit;
}): ExecutionEngineResult {
  return Object.freeze({
    metadata: Object.freeze(input.metadata),
    engineReference: Object.freeze(input.engineReference),
    commands: Object.freeze([...input.commands]),
    warnings: Object.freeze([...input.warnings]),
    audit: Object.freeze(input.audit),
  });
}

