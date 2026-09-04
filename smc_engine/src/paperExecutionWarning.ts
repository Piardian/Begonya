export type PaperExecutionWarningType =
  | 'NO_EXECUTION_COMMANDS'
  | 'ENGINE_WARNINGS_PRESENT'
  | 'NON_READY_COMMAND_REJECTED'
  | 'MAXIMUM_PAPER_ITEMS_EXCEEDED'
  | 'REAL_EXECUTION_DISABLED'
  | 'NON_PAPER_ENGINE_MODE';

export interface PaperExecutionWarning {
  readonly type: PaperExecutionWarningType;
  readonly severity: 'INFO' | 'WARNING' | 'ERROR';
  readonly message: string;
}

export function createPaperExecutionWarning(
  type: PaperExecutionWarningType,
  severity: PaperExecutionWarning['severity'],
  message: string
): PaperExecutionWarning {
  return Object.freeze({ type, severity, message });
}

