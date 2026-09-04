import { SignalLifecycleState } from './signalLifecycle';

export interface SignalLifecycleTransition {
  readonly from: SignalLifecycleState;
  readonly to: SignalLifecycleState;
  readonly valid: boolean;
  readonly reason: {
    readonly code: string;
    readonly message: string;
  };
}

const TERMINAL_STATES = new Set<SignalLifecycleState>([
  'TAKE_PROFIT',
  'STOP_LOSS',
  'BREAK_EVEN',
  'INVALIDATED',
  'EXPIRED',
  'CANCELLED',
  'MANUAL_CANCELLED',
  'UNKNOWN',
]);

const ALLOWED_TRANSITIONS: Record<SignalLifecycleState, readonly SignalLifecycleState[]> = {
  DETECTED: ['GRADED'],
  GRADED: ['ELIGIBLE', 'WAIT', 'LOW_CONFIDENCE', 'FILTERED', 'PLANNED'],
  ELIGIBLE: ['WAITING_RETEST', 'PLANNED'],
  WAIT: ['WAITING_RETEST', 'EXPIRED', 'CANCELLED'],
  LOW_CONFIDENCE: ['WAITING_RETEST', 'EXPIRED', 'CANCELLED'],
  FILTERED: ['CANCELLED', 'EXPIRED'],
  WAITING_RETEST: ['TRIGGERED', 'EXPIRED', 'INVALIDATED', 'CANCELLED'],
  TRIGGERED: ['OPEN', 'INVALIDATED', 'CANCELLED'],
  OPEN: ['CLOSED', 'TAKE_PROFIT', 'STOP_LOSS', 'BREAK_EVEN', 'INVALIDATED', 'CANCELLED'],
  CLOSED: ['TAKE_PROFIT', 'STOP_LOSS', 'BREAK_EVEN', 'INVALIDATED', 'CANCELLED', 'EXPIRED'],
  PLANNED: ['EXECUTION_READY', 'WAITING_RETEST'],
  EXECUTION_READY: ['SIMULATED', 'WAITING_RETEST'],
  SIMULATED: ['RISK_ACCEPTED', 'WAITING_RETEST'],
  RISK_ACCEPTED: ['NOTIFIED', 'WAITING_RETEST', 'WAITING_ENTRY'],
  NOTIFIED: ['WAITING_RETEST', 'WAITING_ENTRY'],
  WAITING_ENTRY: ['ENTRY_TRIGGERED', 'EXPIRED', 'CANCELLED'],
  ENTRY_TRIGGERED: ['OPEN', 'INVALIDATED', 'CANCELLED'],
  TAKE_PROFIT: [],
  STOP_LOSS: [],
  BREAK_EVEN: [],
  INVALIDATED: [],
  EXPIRED: [],
  CANCELLED: [],
  MANUAL_CANCELLED: [],
  UNKNOWN: [],
};

export function validateSignalLifecycleTransition(
  from: SignalLifecycleState,
  to: SignalLifecycleState
): SignalLifecycleTransition {
  const valid = !TERMINAL_STATES.has(from) && ALLOWED_TRANSITIONS[from].includes(to);

  return Object.freeze({
    from,
    to,
    valid,
    reason: Object.freeze({
      code: valid ? 'VALID_TRANSITION' : 'INVALID_TRANSITION',
      message: valid
        ? `${from} can transition to ${to}.`
        : `${from} cannot transition directly to ${to}.`,
    }),
  });
}

export function assertSignalLifecycleTransition(
  from: SignalLifecycleState,
  to: SignalLifecycleState
): SignalLifecycleTransition {
  const transition = validateSignalLifecycleTransition(from, to);
  if (!transition.valid) {
    throw new Error(transition.reason.message);
  }

  return transition;
}
