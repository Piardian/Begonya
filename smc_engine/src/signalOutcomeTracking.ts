import { SignalDirection } from './signalContext';
import { SignalLifecycleState } from './signalLifecycle';
import { assertSignalLifecycleTransition } from './signalLifecycleStateMachine';

export const SIGNAL_TRACKED_OUTCOME_VERSION = 1 as const;

export type TrackedSignalOutcomeStatus =
  | 'TAKE_PROFIT'
  | 'STOP_LOSS'
  | 'BREAK_EVEN'
  | 'INVALIDATED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'UNKNOWN';

export type TrackedSignalDecision = 'ELIGIBLE' | 'WAIT' | 'LOW_CONFIDENCE' | 'FILTERED' | 'NOT_ELIGIBLE';
export type TrackedSignalRiskResult = 'ACCEPTED' | 'REJECTED' | 'SKIPPED' | 'NO_RISK';

export interface TrackedSignalOutcome {
  readonly version: typeof SIGNAL_TRACKED_OUTCOME_VERSION;
  readonly signalId: string;
  readonly pair: 'EURUSD' | 'GBPUSD' | 'AUDUSD' | 'USDCAD';
  readonly direction: SignalDirection;
  readonly poiType: 'OB' | 'FVG';
  readonly grade: 'A+' | 'A' | 'B+' | 'B' | 'C' | 'UNKNOWN';
  readonly score: number;
  readonly decision: TrackedSignalDecision;
  readonly riskResult: TrackedSignalRiskResult;
  readonly triggered: boolean;
  readonly triggeredTime: number | null;
  readonly entryPrice: number | null;
  readonly exitPrice: number | null;
  readonly outcome: TrackedSignalOutcomeStatus;
  readonly holdingTimeMs: number | null;
  readonly maximumFavorableExcursionPips: number;
  readonly maximumAdverseExcursionPips: number;
  readonly session: 'London' | 'New York' | 'Asia' | 'Unknown';
  readonly htfBias: 'bullish' | 'bearish' | 'range' | 'undefined';
  readonly premiumDiscount: 'premium' | 'discount' | 'eq' | 'undefined';
  readonly createdAt: number;
  readonly closedAt: number | null;
  readonly lifecycle: {
    readonly states: readonly SignalLifecycleState[];
    readonly valid: boolean;
  };
}

export function createTrackedSignalOutcome(input: Omit<TrackedSignalOutcome, 'version' | 'lifecycle'> & {
  readonly lifecycleStates: readonly SignalLifecycleState[];
}): TrackedSignalOutcome {
  validateOutcomeInput(input);
  const validLifecycle = validateLifecyclePath(input.lifecycleStates);

  return Object.freeze({
    version: SIGNAL_TRACKED_OUTCOME_VERSION,
    signalId: input.signalId,
    pair: input.pair,
    direction: input.direction,
    poiType: input.poiType,
    grade: input.grade,
    score: input.score,
    decision: input.decision,
    riskResult: input.riskResult,
    triggered: input.triggered,
    triggeredTime: input.triggeredTime,
    entryPrice: input.entryPrice,
    exitPrice: input.exitPrice,
    outcome: input.outcome,
    holdingTimeMs: input.holdingTimeMs,
    maximumFavorableExcursionPips: input.maximumFavorableExcursionPips,
    maximumAdverseExcursionPips: input.maximumAdverseExcursionPips,
    session: input.session,
    htfBias: input.htfBias,
    premiumDiscount: input.premiumDiscount,
    createdAt: input.createdAt,
    closedAt: input.closedAt,
    lifecycle: Object.freeze({
      states: Object.freeze([...input.lifecycleStates]),
      valid: validLifecycle,
    }),
  });
}

function validateOutcomeInput(input: Omit<TrackedSignalOutcome, 'version' | 'lifecycle'> & {
  readonly lifecycleStates: readonly SignalLifecycleState[];
}): void {
  if (input.lifecycleStates.length === 0) {
    throw new Error('Tracked outcome lifecycle must contain at least one state.');
  }

  if (input.outcome === 'TAKE_PROFIT' || input.outcome === 'STOP_LOSS' || input.outcome === 'BREAK_EVEN') {
    if (!input.triggered || input.entryPrice === null || input.exitPrice === null || input.closedAt === null) {
      throw new Error(`${input.outcome} requires triggered=true, entryPrice, exitPrice, and closedAt.`);
    }
    if (!input.lifecycleStates.includes('OPEN')) {
      throw new Error(`${input.outcome} requires OPEN lifecycle state.`);
    }
  }

  if (!input.triggered && input.triggeredTime !== null) {
    throw new Error('triggeredTime must be null when triggered=false.');
  }

  if (input.closedAt !== null && input.closedAt < input.createdAt) {
    throw new Error('closedAt cannot be earlier than createdAt.');
  }
}

function validateLifecyclePath(states: readonly SignalLifecycleState[]): boolean {
  for (let index = 1; index < states.length; index++) {
    assertSignalLifecycleTransition(states[index - 1], states[index]);
  }

  return true;
}
