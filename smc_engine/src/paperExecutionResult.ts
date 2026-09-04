import { PaperExecutionAudit } from './paperExecutionAudit';
import { PaperExecutionItem } from './paperExecutionItem';
import { PaperExecutionWarning } from './paperExecutionWarning';

export const PAPER_EXECUTION_RESULT_VERSION = 1 as const;

export interface PaperExecutionResult {
  readonly metadata: {
    readonly paperExecutionResultVersion: typeof PAPER_EXECUTION_RESULT_VERSION;
    readonly executionEngineResultVersion: number;
    readonly enginePolicyVersion: number;
    readonly sessionResultVersion: number;
    readonly paperExecutionPolicyVersion: number;
    readonly datasetFingerprint: string;
  };
  readonly paperExecutionReference: {
    readonly paperExecutionId: string;
    readonly engineId: string;
    readonly sessionId: string;
    readonly runtimeId: string;
    readonly mode: 'PAPER';
  };
  readonly items: readonly PaperExecutionItem[];
  readonly warnings: readonly PaperExecutionWarning[];
  readonly audit: PaperExecutionAudit;
}

export function createPaperExecutionResult(input: {
  readonly metadata: PaperExecutionResult['metadata'];
  readonly paperExecutionReference: PaperExecutionResult['paperExecutionReference'];
  readonly items: readonly PaperExecutionItem[];
  readonly warnings: readonly PaperExecutionWarning[];
  readonly audit: PaperExecutionAudit;
}): PaperExecutionResult {
  return Object.freeze({
    metadata: Object.freeze(input.metadata),
    paperExecutionReference: Object.freeze(input.paperExecutionReference),
    items: Object.freeze([...input.items]),
    warnings: Object.freeze([...input.warnings]),
    audit: Object.freeze(input.audit),
  });
}

