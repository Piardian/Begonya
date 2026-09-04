import { Candle, StructureEvent } from './types';
import { detectSwings } from './swingDetector';
import { detectStructure } from './structureDetector';

export interface HTFBiasResult {
  tf4h: { trend: string; lastEvent: StructureEvent | null };
  tf1h: { trend: string; lastEvent: StructureEvent | null };
  aligned: boolean;
  biasStrength: 'strong' | 'weak' | 'range';
}

/**
 * Calculates HTF (High Timeframe) Bias using 4H and 1H candles.
 * biasStrength logic:
 * - aligned=true & both tf4h and tf1h are directional ('bullish' or 'bearish') -> 'strong'
 * - tf4h and tf1h have different directions -> 'weak'
 * - either of tf4h or tf1h is 'range' or 'undefined' -> 'range'
 */
export function calculateHTFBias(candles4H: Candle[], candles1H: Candle[]): HTFBiasResult {
  const swings4H = detectSwings(candles4H);
  const state4H = detectStructure(candles4H, swings4H);

  const swings1H = detectSwings(candles1H);
  const state1H = detectStructure(candles1H, swings1H);

  const trend4H = state4H.currentTrend;
  const trend1H = state1H.currentTrend;

  const directionalTrends = ['bullish', 'bearish'];
  const is4HDirectional = directionalTrends.includes(trend4H);
  const is1HDirectional = directionalTrends.includes(trend1H);

  const aligned = is4HDirectional && is1HDirectional && trend4H === trend1H;

  let biasStrength: 'strong' | 'weak' | 'range';
  if (trend4H === 'range' || trend1H === 'range' || trend4H === 'undefined' || trend1H === 'undefined') {
    biasStrength = 'range';
  } else if (aligned) {
    biasStrength = 'strong';
  } else {
    biasStrength = 'weak';
  }

  return {
    tf4h: {
      trend: trend4H,
      lastEvent: state4H.lastEvent,
    },
    tf1h: {
      trend: trend1H,
      lastEvent: state1H.lastEvent,
    },
    aligned,
    biasStrength,
  };
}
