import { StructureState, StructureEvent } from './types';
import { SweepEvent } from './sweepDetector';

export type ModelType = 'model1_reversal' | 'model2_continuation' | 'none';

export interface ModelState {
  model: ModelType;
  regime: 'range' | 'bullish' | 'bearish' | 'undefined';
  triggeringSweep: SweepEvent | null;
  triggeringBOS: StructureEvent | null;
}

/**
 * Determines whether Model 1 (Reversal) or Model 2 (Continuation) is active at the current index.
 * 
 * Rules:
 * 1. Find the active trend at currentIndex (latest regimeTransition at or before currentIndex).
 * 2. If the active trend is 'undefined', return none.
 * 3. Find the regimeStartIndex (the atIndex of the transition that established this active trend).
 * 4. Model 1 (reversal): Active trend is 'range' AND there is a SweepEvent in [regimeStartIndex, currentIndex].
 * 5. Model 2 (continuation): Active trend is 'bullish'/'bearish' AND there is a BOS event in the same direction in [regimeStartIndex, currentIndex].
 * 6. Otherwise, return none.
 * 7. Lookahead safety: Only evaluate events up to currentIndex.
 */
export function determineModel(
  structureState: StructureState,
  sweepEvents: SweepEvent[],
  currentIndex: number
): ModelState {
  // Filter transitions up to currentIndex
  const validTransitions = (structureState.regimeTransitions || []).filter(
    t => t.atIndex <= currentIndex
  );

  if (validTransitions.length === 0) {
    return {
      model: 'none',
      regime: 'undefined',
      triggeringSweep: null,
      triggeringBOS: null,
    };
  }

  const activeTransition = validTransitions[validTransitions.length - 1];
  const currentTrendAtIdx = activeTransition.newTrend;

  if (currentTrendAtIdx === 'undefined') {
    return {
      model: 'none',
      regime: 'undefined',
      triggeringSweep: null,
      triggeringBOS: null,
    };
  }

  // Find the start of this specific regime
  const matchingTransitions = validTransitions.filter(t => t.newTrend === currentTrendAtIdx);
  const regimeStartIndex = matchingTransitions[matchingTransitions.length - 1].atIndex;

  // Model 1: Range + Sweep
  if (currentTrendAtIdx === 'range') {
    const validSweeps = sweepEvents.filter(
      s => s.candleIndex >= regimeStartIndex && s.candleIndex <= currentIndex
    );

    if (validSweeps.length > 0) {
      const triggeringSweep = validSweeps[validSweeps.length - 1];
      return {
        model: 'model1_reversal',
        regime: 'range',
        triggeringSweep,
        triggeringBOS: null,
      };
    }
  }

  // Model 2: Trend + directional BOS
  if (currentTrendAtIdx === 'bullish' || currentTrendAtIdx === 'bearish') {
    const validBOS = (structureState.events || []).filter(
      e =>
        e.type === 'BOS' &&
        e.direction === currentTrendAtIdx &&
        e.breakCandleIndex >= regimeStartIndex &&
        e.breakCandleIndex <= currentIndex
    );

    if (validBOS.length > 0) {
      const triggeringBOS = validBOS[validBOS.length - 1];
      return {
        model: 'model2_continuation',
        regime: currentTrendAtIdx,
        triggeringSweep: null,
        triggeringBOS,
      };
    }
  }

  return {
    model: 'none',
    regime: currentTrendAtIdx,
    triggeringSweep: null,
    triggeringBOS: null,
  };
}
