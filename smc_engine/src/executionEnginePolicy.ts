import { RuntimeMode } from './executionRuntimePolicy';

export const EXECUTION_ENGINE_POLICY_VERSION = 1 as const;

export type ExecutionEngineMode = RuntimeMode;

export interface ExecutionEnginePolicy {
  readonly version: typeof EXECUTION_ENGINE_POLICY_VERSION;
  readonly engineId: string;
  readonly engineMode: ExecutionEngineMode;
  readonly allowEngine: true;
  readonly allowExecution: false;
  readonly maximumCommands: number;
}

export type CreateExecutionEnginePolicyInput = Omit<
  ExecutionEnginePolicy,
  'version' | 'allowEngine' | 'allowExecution'
> & {
  readonly version?: typeof EXECUTION_ENGINE_POLICY_VERSION;
  readonly allowEngine?: true;
  readonly allowExecution?: false;
};

export function createExecutionEnginePolicy(
  input: CreateExecutionEnginePolicyInput
): ExecutionEnginePolicy {
  return Object.freeze({
    engineId: input.engineId,
    version: input.version ?? EXECUTION_ENGINE_POLICY_VERSION,
    engineMode: input.engineMode,
    allowEngine: true as const,
    allowExecution: false as const,
    maximumCommands: input.maximumCommands,
  });
}

