export type SessionWarningType =
  | 'NO_RUNTIME_ITEMS'
  | 'SESSION_DISABLED'
  | 'EXECUTION_DISABLED'
  | 'BROKER_SESSION_RESERVED'
  | 'MAXIMUM_SESSION_ITEMS_EXCEEDED'
  | 'RUNTIME_WARNINGS_PRESENT'
  | 'SESSION_MODE_MISMATCH';

export interface SessionWarning {
  readonly type: SessionWarningType;
  readonly severity: 'INFO' | 'WARNING' | 'ERROR';
  readonly message: string;
}

export function createSessionWarning(
  type: SessionWarningType,
  severity: SessionWarning['severity'],
  message: string
): SessionWarning {
  return Object.freeze({ type, severity, message });
}

