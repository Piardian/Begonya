import { Candle, StructureEvent, DisplacementLeg } from './types';

/**
 * Finds the displacement leg that produced a structure event.
 * 
 * Rules:
 * - Walking backward from event.breakCandleIndex:
 *   - For 'bullish': continue while close > open.
 *   - For 'bearish': continue while close < open.
 *   - Stop at the first candle that is of opposite color or a doji (close === open).
 * - Leg is defined as [stoppedIndex + 1, breakCandleIndex].
 */
export function findDisplacementLeg(candles: Candle[], event: StructureEvent): DisplacementLeg {
  const endIndex = event.breakCandleIndex;
  const direction = event.direction;
  let startIndex = endIndex;

  for (let i = endIndex; i >= 0; i--) {
    const candle = candles[i];
    const isBullishCandle = candle.close > candle.open;
    const isBearishCandle = candle.close < candle.open;

    if (direction === 'bullish') {
      if (isBullishCandle) {
        startIndex = i;
      } else {
        break;
      }
    } else {
      if (isBearishCandle) {
        startIndex = i;
      } else {
        break;
      }
    }
  }

  return {
    startIndex,
    endIndex,
    direction,
  };
}
