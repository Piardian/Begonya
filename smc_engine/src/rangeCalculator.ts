import { Candle, SwingPoint, StructureState } from './types';

export interface RangeState {
  isRange: boolean;
  rangeHigh: number | null;
  rangeLow: number | null;
  regimeStartIndex: number | null;
}

/**
 * Calculates Range High and Range Low for the current range regime.
 * 
 * Rules:
 * 1. If currentTrend is not 'range' at the currentIndex, return isRange: false.
 * 2. Range Start Index: The atIndex of the latest regime transition to 'range' that occurred at or before currentIndex.
 * 3. Range High/Low are computed from confirmed swing points whose confirmedAtIndex lies between regimeStartIndex and currentIndex (inclusive).
 */
export function calculateRange(
  candles: Candle[],
  swings: SwingPoint[],
  structureState: StructureState,
  currentIndex: number
): RangeState {
  // To avoid lookahead bias, we evaluate the state up to currentIndex.
  // First, find the active trend at currentIndex.
  // Note: we can look at the transitions that happened at or before currentIndex.
  const activeTransitions = structureState.regimeTransitions.filter(t => t.atIndex <= currentIndex);
  
  const currentTrendAtIdx = activeTransitions.length > 0 
    ? activeTransitions[activeTransitions.length - 1].newTrend 
    : 'undefined';

  if (currentTrendAtIdx !== 'range') {
    return {
      isRange: false,
      rangeHigh: null,
      rangeLow: null,
      regimeStartIndex: null,
    };
  }

  // Find the latest transition to 'range' at or before currentIndex
  const rangeTransitions = activeTransitions.filter(t => t.newTrend === 'range');
  if (rangeTransitions.length === 0) {
    return {
      isRange: false,
      rangeHigh: null,
      rangeLow: null,
      regimeStartIndex: null,
    };
  }

  const latestRangeTransition = rangeTransitions[rangeTransitions.length - 1];
  const regimeStartIndex = latestRangeTransition.atIndex;
  const windowStartIndex = latestRangeTransition.windowStartIndex ?? latestRangeTransition.atIndex;

  // Filter confirmed swings in the window: [windowStartIndex, currentIndex]
  const windowSwings = swings.filter(s => 
    s.confirmedAtIndex >= windowStartIndex && 
    s.confirmedAtIndex <= currentIndex
  );

  const highs = windowSwings.filter(s => s.type === 'high').map(s => s.price);
  const lows = windowSwings.filter(s => s.type === 'low').map(s => s.price);

  return {
    isRange: true,
    rangeHigh: highs.length > 0 ? Math.max(...highs) : null,
    rangeLow: lows.length > 0 ? Math.min(...lows) : null,
    regimeStartIndex,
  };
}
