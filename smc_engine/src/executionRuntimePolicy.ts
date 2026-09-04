export const EXECUTION_RUNTIME_POLICY_VERSION = 1 as const;

export type RuntimeMode = 'PAPER' | 'SIMULATION' | 'BROKER';
export type RuntimeAdapterType = RuntimeMode;

export interface ExecutionRuntimePolicy {
  readonly runtimeId: string;
  readonly version: typeof EXECUTION_RUNTIME_POLICY_VERSION;
  readonly runtimeMode: RuntimeMode;
  readonly allowRuntime: true;
  readonly allowExecution: false;
  readonly supportedAdapters: readonly RuntimeAdapterType[];
  readonly maximumRuntimeItems: number;
}

export type CreateExecutionRuntimePolicyInput = Omit<
  ExecutionRuntimePolicy,
  'version' | 'allowRuntime' | 'allowExecution'
> & {
  readonly version?: typeof EXECUTION_RUNTIME_POLICY_VERSION;
  readonly allowRuntime?: true;
  readonly allowExecution?: false;
};

export function createExecutionRuntimePolicy(input: CreateExecutionRuntimePolicyInput): ExecutionRuntimePolicy {
  return Object.freeze({
    runtimeId: input.runtimeId,
    version: input.version ?? EXECUTION_RUNTIME_POLICY_VERSION,
    runtimeMode: input.runtimeMode,
    allowRuntime: true as const,
    allowExecution: false as const,
    supportedAdapters: Object.freeze([...input.supportedAdapters]),
    maximumRuntimeItems: input.maximumRuntimeItems,
  });
}
