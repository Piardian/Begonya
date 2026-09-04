import { SignalLifecycle, SignalLifecycleState, createSignalLifecycle } from './signalLifecycle';
import type { Symbol } from '../server/universe';

export type SignalDirection = 'long' | 'short';
export type SignalTimeframe = '15m' | '1h' | '4h';

export interface SignalContext {
  readonly signalId: string;
  readonly pair: Symbol;
  readonly direction: SignalDirection;
  readonly timeframe: SignalTimeframe;
  readonly grade?: string;
  readonly score?: number;
  readonly executionStatus?: string;
  readonly riskStatus?: string;
  readonly timestamp: number;
  readonly lifecycle: SignalLifecycle;
}

export function createSignalId(input: {
  readonly pair: Symbol;
  readonly timeframe: SignalTimeframe;
  readonly poiType: 'OB' | 'FVG';
  readonly formedTimestamp: number;
  readonly eventTimestamp: number;
}): string {
  return `${input.pair}_${input.timeframe}_${input.poiType}_${input.formedTimestamp}_${input.eventTimestamp}`;
}

export function createSignalContext(input: {
  readonly signalId: string;
  readonly pair: Symbol;
  readonly direction: SignalDirection;
  readonly timeframe: SignalTimeframe;
  readonly grade?: string;
  readonly score?: number;
  readonly executionStatus?: string;
  readonly riskStatus?: string;
  readonly timestamp: number;
  readonly lifecycleStates?: readonly SignalLifecycleState[];
}): SignalContext {
  return Object.freeze({
    signalId: input.signalId,
    pair: input.pair,
    direction: input.direction,
    timeframe: input.timeframe,
    grade: input.grade,
    score: input.score,
    executionStatus: input.executionStatus,
    riskStatus: input.riskStatus,
    timestamp: input.timestamp,
    lifecycle: createSignalLifecycle(input.lifecycleStates ?? ['DETECTED']),
  });
}
