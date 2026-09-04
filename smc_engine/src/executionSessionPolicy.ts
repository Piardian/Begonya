import { RuntimeMode } from './executionRuntimePolicy';

export const EXECUTION_SESSION_POLICY_VERSION = 1 as const;

export type ExecutionSessionMode = RuntimeMode;

export interface ExecutionSessionPolicy {
  readonly version: typeof EXECUTION_SESSION_POLICY_VERSION;
  readonly sessionId: string;
  readonly sessionMode: ExecutionSessionMode;
  readonly allowSession: true;
  readonly allowExecution: false;
  readonly closeImmediately: true;
  readonly maximumSessionItems: number;
}

export type CreateExecutionSessionPolicyInput = Omit<
  ExecutionSessionPolicy,
  'version' | 'allowSession' | 'allowExecution' | 'closeImmediately'
> & {
  readonly version?: typeof EXECUTION_SESSION_POLICY_VERSION;
  readonly allowSession?: true;
  readonly allowExecution?: false;
  readonly closeImmediately?: true;
};

export function createExecutionSessionPolicy(
  input: CreateExecutionSessionPolicyInput
): ExecutionSessionPolicy {
  return Object.freeze({
    sessionId: input.sessionId,
    version: input.version ?? EXECUTION_SESSION_POLICY_VERSION,
    sessionMode: input.sessionMode,
    allowSession: true as const,
    allowExecution: false as const,
    closeImmediately: true as const,
    maximumSessionItems: input.maximumSessionItems,
  });
}

