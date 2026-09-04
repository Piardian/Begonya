import { ExecutionSessionItem } from './executionSessionItem';
import { ExecutionEngineContext } from './executionEngineContext';

export const EXECUTION_COMMAND_VERSION = 1 as const;

export type ExecutionCommandType =
  | 'PREPARE_EXECUTION'
  | 'BLOCK_EXECUTION'
  | 'SKIP_EXECUTION';

export type ExecutionCommandStatus = 'READY' | 'BLOCKED' | 'SKIPPED';

export interface ExecutionCommand {
  readonly id: string;
  readonly version: typeof EXECUTION_COMMAND_VERSION;
  readonly commandType: ExecutionCommandType;
  readonly commandStatus: ExecutionCommandStatus;
  readonly sessionItemReference: {
    readonly sessionItemId: string;
    readonly runtimeItemId: string;
    readonly executionPlanItemId: string;
    readonly planningEvaluationId: string;
    readonly decisionId: string;
  };
  readonly commandReason: {
    readonly code: string;
    readonly message: string;
  };
  readonly audit: {
    readonly validatedSessionItem: boolean;
    readonly executionReady: boolean;
    readonly executed: false;
  };
  readonly summary: string;
  readonly explanation: {
    readonly executionSessionItem: ExecutionSessionItem;
    readonly engineReference: {
      readonly engineId: string;
      readonly engineMode: string;
    };
  };
}

export function createExecutionCommand(input: {
  readonly sessionItem: ExecutionSessionItem;
  readonly context: ExecutionEngineContext;
  readonly commandType: ExecutionCommandType;
  readonly commandStatus: ExecutionCommandStatus;
  readonly reasonCode: string;
  readonly reasonMessage: string;
}): ExecutionCommand {
  const { sessionItem, context } = input;

  return Object.freeze({
    id: `execution-command:${context.engineId}:${sessionItem.id}`,
    version: EXECUTION_COMMAND_VERSION,
    commandType: input.commandType,
    commandStatus: input.commandStatus,
    sessionItemReference: Object.freeze({
      sessionItemId: sessionItem.id,
      runtimeItemId: sessionItem.runtimeItemReference.runtimeItemId,
      executionPlanItemId: sessionItem.runtimeItemReference.executionPlanItemId,
      planningEvaluationId: sessionItem.runtimeItemReference.planningEvaluationId,
      decisionId: sessionItem.runtimeItemReference.decisionId,
    }),
    commandReason: Object.freeze({
      code: input.reasonCode,
      message: input.reasonMessage,
    }),
    audit: Object.freeze({
      validatedSessionItem: true,
      executionReady: input.commandStatus === 'READY',
      executed: false as const,
    }),
    summary: `${sessionItem.id} mapped to ${input.commandType} with ${input.commandStatus} status by execution engine ${context.engineId}.`,
    explanation: Object.freeze({
      executionSessionItem: sessionItem,
      engineReference: Object.freeze({
        engineId: context.engineId,
        engineMode: context.engineMode,
      }),
    }),
  });
}

