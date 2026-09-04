export type ExecutionWarningType =
  | 'NO_SESSION_ITEMS'
  | 'ENGINE_DISABLED'
  | 'EXECUTION_DISABLED'
  | 'BROKER_ENGINE_RESERVED'
  | 'SESSION_WARNINGS_PRESENT'
  | 'SESSION_NOT_COMPLETED'
  | 'ENGINE_MODE_MISMATCH'
  | 'MAXIMUM_COMMANDS_EXCEEDED';

export interface ExecutionWarning {
  readonly type: ExecutionWarningType;
  readonly severity: 'INFO' | 'WARNING' | 'ERROR';
  readonly message: string;
}

export function createExecutionWarning(
  type: ExecutionWarningType,
  severity: ExecutionWarning['severity'],
  message: string
): ExecutionWarning {
  return Object.freeze({ type, severity, message });
}

