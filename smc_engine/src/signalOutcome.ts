import { SignalContext } from './signalContext';
import { SignalLifecycleState, createSignalLifecycle } from './signalLifecycle';

export const SIGNAL_OUTCOME_VERSION = 1 as const;

export type SignalOutcomeType =
  | 'WAITING_ENTRY'
  | 'ENTRY_TRIGGERED'
  | 'TAKE_PROFIT'
  | 'STOP_LOSS'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'MANUAL_CANCELLED'
  | 'UNKNOWN';

export type SignalOutcomeReasonCode =
  | 'WAITING_FOR_ENTRY_RETEST'
  | 'ENTRY_ZONE_TRIGGERED'
  | 'TAKE_PROFIT_REACHED'
  | 'STOP_LOSS_REACHED'
  | 'ENTRY_WINDOW_EXPIRED'
  | 'SIGNAL_CANCELLED'
  | 'SIGNAL_MANUALLY_CANCELLED'
  | 'OUTCOME_UNKNOWN';

export interface SignalOutcomeReason {
  readonly code: SignalOutcomeReasonCode;
  readonly message: string;
}

export interface SignalOutcomeMetadata {
  readonly lifecycleDurationMs: number;
  readonly sourceLifecycleState: SignalLifecycleState;
  readonly outcomeLifecycleState: SignalLifecycleState;
  readonly createdFromRuntime: boolean;
  readonly realExecutionTracked: false;
  readonly brokerStatusTracked: false;
}

export interface SignalOutcome {
  readonly version: typeof SIGNAL_OUTCOME_VERSION;
  readonly signalId: string;
  readonly outcomeType: SignalOutcomeType;
  readonly timestamp: number;
  readonly reason: SignalOutcomeReason;
  readonly lifecycleDurationMs: number;
  readonly metadata: SignalOutcomeMetadata;
}

export function createSignalOutcome(input: {
  readonly signalContext: SignalContext;
  readonly outcomeType: SignalOutcomeType;
  readonly timestamp?: number;
  readonly reason?: SignalOutcomeReason;
}): SignalOutcome {
  const timestamp = input.timestamp ?? input.signalContext.timestamp;
  const reason = input.reason ?? defaultReason(input.outcomeType);
  const lifecycleDurationMs = Math.max(0, timestamp - input.signalContext.timestamp);
  const outcomeLifecycle = createSignalLifecycle([
    ...input.signalContext.lifecycle.states,
    input.outcomeType,
  ]);

  return Object.freeze({
    version: SIGNAL_OUTCOME_VERSION,
    signalId: input.signalContext.signalId,
    outcomeType: input.outcomeType,
    timestamp,
    reason: Object.freeze(reason),
    lifecycleDurationMs,
    metadata: Object.freeze({
      lifecycleDurationMs,
      sourceLifecycleState: input.signalContext.lifecycle.currentState,
      outcomeLifecycleState: outcomeLifecycle.currentState,
      createdFromRuntime: true,
      realExecutionTracked: false as const,
      brokerStatusTracked: false as const,
    }),
  });
}

export function createWaitingEntryOutcome(signalContext: SignalContext): SignalOutcome {
  return createSignalOutcome({
    signalContext,
    outcomeType: 'WAITING_ENTRY',
    reason: {
      code: 'WAITING_FOR_ENTRY_RETEST',
      message: 'Signal passed risk evaluation and is waiting for entry-zone retest. No real TP/SL tracking is performed in this foundation sprint.',
    },
  });
}

function defaultReason(outcomeType: SignalOutcomeType): SignalOutcomeReason {
  switch (outcomeType) {
    case 'ENTRY_TRIGGERED':
      return { code: 'ENTRY_ZONE_TRIGGERED', message: 'Entry zone was triggered.' };
    case 'TAKE_PROFIT':
      return { code: 'TAKE_PROFIT_REACHED', message: 'Take-profit condition was reached.' };
    case 'STOP_LOSS':
      return { code: 'STOP_LOSS_REACHED', message: 'Stop-loss condition was reached.' };
    case 'EXPIRED':
      return { code: 'ENTRY_WINDOW_EXPIRED', message: 'Signal expired before entry trigger.' };
    case 'CANCELLED':
      return { code: 'SIGNAL_CANCELLED', message: 'Signal was cancelled by an invalidation rule.' };
    case 'MANUAL_CANCELLED':
      return { code: 'SIGNAL_MANUALLY_CANCELLED', message: 'Signal was manually cancelled.' };
    case 'UNKNOWN':
      return { code: 'OUTCOME_UNKNOWN', message: 'Signal outcome is unknown.' };
    case 'WAITING_ENTRY':
    default:
      return { code: 'WAITING_FOR_ENTRY_RETEST', message: 'Signal is waiting for entry-zone retest.' };
  }
}

