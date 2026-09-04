export type SignalLifecycleState =
  | 'DETECTED'
  | 'GRADED'
  | 'ELIGIBLE'
  | 'WAIT'
  | 'LOW_CONFIDENCE'
  | 'FILTERED'
  | 'WAITING_RETEST'
  | 'TRIGGERED'
  | 'OPEN'
  | 'CLOSED'
  | 'PLANNED'
  | 'EXECUTION_READY'
  | 'SIMULATED'
  | 'RISK_ACCEPTED'
  | 'NOTIFIED'
  | 'WAITING_ENTRY'
  | 'ENTRY_TRIGGERED'
  | 'TAKE_PROFIT'
  | 'STOP_LOSS'
  | 'BREAK_EVEN'
  | 'INVALIDATED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'MANUAL_CANCELLED'
  | 'UNKNOWN';

export interface SignalLifecycle {
  readonly states: readonly SignalLifecycleState[];
  readonly currentState: SignalLifecycleState;
}

export function createSignalLifecycle(states: readonly SignalLifecycleState[]): SignalLifecycle {
  if (states.length === 0) {
    throw new Error('Signal lifecycle must contain at least one state.');
  }

  return Object.freeze({
    states: Object.freeze([...states]),
    currentState: states[states.length - 1],
  });
}
