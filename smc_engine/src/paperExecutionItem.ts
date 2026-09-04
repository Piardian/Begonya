import { ExecutionCommand } from './executionCommand';
import { PaperExecutionContext } from './paperExecutionContext';
import {
  createCompletedPaperLifecycle,
  createRejectedPaperLifecycle,
  createSkippedPaperLifecycle,
  PaperExecutionLifecycle,
} from './paperExecutionLifecycle';

export const PAPER_EXECUTION_ITEM_VERSION = 1 as const;

export type PaperExecutionStatus = 'COMPLETED' | 'REJECTED' | 'SKIPPED';

export interface PaperExecutionItem {
  readonly id: string;
  readonly version: typeof PAPER_EXECUTION_ITEM_VERSION;
  readonly commandReference: {
    readonly commandId: string;
    readonly commandType: string;
    readonly commandStatus: string;
    readonly sessionItemId: string;
    readonly runtimeItemId: string;
    readonly executionPlanItemId: string;
    readonly planningEvaluationId: string;
    readonly decisionId: string;
  };
  readonly lifecycle: PaperExecutionLifecycle;
  readonly paperStatus: PaperExecutionStatus;
  readonly paperReason: {
    readonly code: string;
    readonly message: string;
  };
  readonly audit: {
    readonly accepted: boolean;
    readonly processed: boolean;
    readonly completed: boolean;
    readonly realExecution: false;
    readonly orderCreated: false;
    readonly positionCreated: false;
    readonly pnlCalculated: false;
  };
  readonly summary: string;
  readonly explanation: {
    readonly executionCommand: ExecutionCommand;
    readonly paperExecutionReference: {
      readonly paperExecutionId: string;
      readonly mode: 'PAPER';
    };
  };
}

export function createPaperExecutionItem(
  command: ExecutionCommand,
  context: PaperExecutionContext
): PaperExecutionItem {
  if (command.commandStatus === 'SKIPPED') {
    return createItem({
      command,
      context,
      lifecycle: createSkippedPaperLifecycle(),
      paperStatus: 'SKIPPED',
      reasonCode: 'COMMAND_SKIPPED_BY_ENGINE',
      reasonMessage: 'Execution command was skipped by the execution engine; no paper lifecycle was processed.',
      accepted: false,
      processed: false,
      completed: false,
    });
  }

  if (command.commandStatus !== 'READY') {
    return createItem({
      command,
      context,
      lifecycle: createRejectedPaperLifecycle(),
      paperStatus: 'REJECTED',
      reasonCode: 'COMMAND_NOT_READY_FOR_PAPER_EXECUTION',
      reasonMessage: 'Execution command was not READY and was rejected by Paper Execution.',
      accepted: false,
      processed: false,
      completed: false,
    });
  }

  return createItem({
    command,
    context,
    lifecycle: createCompletedPaperLifecycle(),
    paperStatus: 'COMPLETED',
    reasonCode: 'PAPER_EXECUTION_LIFECYCLE_COMPLETED',
    reasonMessage: 'Execution command completed the paper-only lifecycle. No real execution was attempted.',
    accepted: true,
    processed: true,
    completed: true,
  });
}

function createItem(input: {
  readonly command: ExecutionCommand;
  readonly context: PaperExecutionContext;
  readonly lifecycle: PaperExecutionLifecycle;
  readonly paperStatus: PaperExecutionStatus;
  readonly reasonCode: string;
  readonly reasonMessage: string;
  readonly accepted: boolean;
  readonly processed: boolean;
  readonly completed: boolean;
}): PaperExecutionItem {
  const { command, context } = input;

  return Object.freeze({
    id: `paper-execution-item:${context.paperExecutionId}:${command.id}`,
    version: PAPER_EXECUTION_ITEM_VERSION,
    commandReference: Object.freeze({
      commandId: command.id,
      commandType: command.commandType,
      commandStatus: command.commandStatus,
      sessionItemId: command.sessionItemReference.sessionItemId,
      runtimeItemId: command.sessionItemReference.runtimeItemId,
      executionPlanItemId: command.sessionItemReference.executionPlanItemId,
      planningEvaluationId: command.sessionItemReference.planningEvaluationId,
      decisionId: command.sessionItemReference.decisionId,
    }),
    lifecycle: input.lifecycle,
    paperStatus: input.paperStatus,
    paperReason: Object.freeze({
      code: input.reasonCode,
      message: input.reasonMessage,
    }),
    audit: Object.freeze({
      accepted: input.accepted,
      processed: input.processed,
      completed: input.completed,
      realExecution: false as const,
      orderCreated: false as const,
      positionCreated: false as const,
      pnlCalculated: false as const,
    }),
    summary: `${command.id} closed as ${input.paperStatus} by paper execution ${context.paperExecutionId}.`,
    explanation: Object.freeze({
      executionCommand: command,
      paperExecutionReference: Object.freeze({
        paperExecutionId: context.paperExecutionId,
        mode: 'PAPER' as const,
      }),
    }),
  });
}

