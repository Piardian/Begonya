import { Candle, StructureEvent } from './types';
import { detectSwings } from './swingDetector';
import { detectStructure } from './structureDetector';

export interface Structure15mResult {
  trend: string;
  lastEvent: StructureEvent | null;
  isClosingConfirmed: boolean;
}

/**
 * Calculates 15m structure.
 * isClosingConfirmed is always true because we only evaluate structures based on candle close prices.
 */
export function calculate15mStructure(candles15m: Candle[]): Structure15mResult {
  const swings = detectSwings(candles15m);
  const state = detectStructure(candles15m, swings);

  return {
    trend: state.currentTrend,
    lastEvent: state.lastEvent,
    isClosingConfirmed: true,
  };
}
