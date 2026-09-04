export const PAPER_EXECUTION_POLICY_VERSION = 1 as const;

export type PaperExecutionMode = 'PAPER';

export interface PaperExecutionPolicy {
  readonly version: typeof PAPER_EXECUTION_POLICY_VERSION;
  readonly paperExecutionId: string;
  readonly mode: PaperExecutionMode;
  readonly allowPaperExecution: true;
  readonly allowRealExecution: false;
  readonly maximumPaperItems: number;
}

export type CreatePaperExecutionPolicyInput = Omit<
  PaperExecutionPolicy,
  'version' | 'mode' | 'allowPaperExecution' | 'allowRealExecution'
> & {
  readonly version?: typeof PAPER_EXECUTION_POLICY_VERSION;
  readonly mode?: PaperExecutionMode;
  readonly allowPaperExecution?: true;
  readonly allowRealExecution?: false;
};

export function createPaperExecutionPolicy(
  input: CreatePaperExecutionPolicyInput
): PaperExecutionPolicy {
  return Object.freeze({
    paperExecutionId: input.paperExecutionId,
    version: input.version ?? PAPER_EXECUTION_POLICY_VERSION,
    mode: 'PAPER' as const,
    allowPaperExecution: true as const,
    allowRealExecution: false as const,
    maximumPaperItems: input.maximumPaperItems,
  });
}

