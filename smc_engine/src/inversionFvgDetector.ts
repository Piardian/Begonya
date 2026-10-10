import { Candle, FVG } from './types';

export interface InversionFVG {
  originalDirection: 'bullish' | 'bearish';
  invertedDirection: 'bullish' | 'bearish';
  zoneHigh: number;
  zoneLow: number;
  originalMiddleIndex: number;
  inversionCandleIndex: number;
  inversionTimestamp: number;
  testCount: number;
  mitigated: boolean;
}

export interface BalancedPriceRange {
  zoneHigh: number;
  zoneLow: number;
  bullishFvgIndex: number;
  bearishFvgIndex: number;
  overlapDistance: number;
  timestamp: number;
}

/**
 * Detects Inversion Fair Value Gaps (iFVGs).
 * An Inversion FVG occurs when price aggressively trades through and closes beyond an existing FVG,
 * causing the zone to invert its polarity (e.g. Bullish FVG becomes Bearish resistance).
 */
export function detectInversionFVGs(
  candles: readonly Candle[],
  fvgs: readonly FVG[],
  currentIdx: number
): InversionFVG[] {
  const inversions: InversionFVG[] = [];

  for (const fvg of fvgs) {
    if (fvg.middleCandleIndex + 1 >= currentIdx) continue;

    let inverted = false;
    let inversionIndex = -1;

    for (let k = fvg.middleCandleIndex + 2; k <= currentIdx; k++) {
      const candle = candles[k];
      if (fvg.direction === 'bullish' && candle.close < fvg.gapLow) {
        inverted = true;
        inversionIndex = k;
        break;
      } else if (fvg.direction === 'bearish' && candle.close > fvg.gapHigh) {
        inverted = true;
        inversionIndex = k;
        break;
      }
    }

    if (inverted && inversionIndex !== -1) {
      const invertedDirection: 'bullish' | 'bearish' = fvg.direction === 'bullish' ? 'bearish' : 'bullish';
      let testCount = 0;
      let mitigated = false;

      for (let m = inversionIndex + 1; m <= currentIdx; m++) {
        const testCandle = candles[m];
        const touchesZone = testCandle.high >= fvg.gapLow && testCandle.low <= fvg.gapHigh;
        if (touchesZone) {
          testCount++;
          // If body closes completely through again, consider it mitigated
          if (invertedDirection === 'bearish' && testCandle.close > fvg.gapHigh) {
            mitigated = true;
          } else if (invertedDirection === 'bullish' && testCandle.close < fvg.gapLow) {
            mitigated = true;
          }
        }
      }

      inversions.push({
        originalDirection: fvg.direction,
        invertedDirection,
        zoneHigh: fvg.gapHigh,
        zoneLow: fvg.gapLow,
        originalMiddleIndex: fvg.middleCandleIndex,
        inversionCandleIndex: inversionIndex,
        inversionTimestamp: candles[inversionIndex]?.timestamp ?? 0,
        testCount,
        mitigated,
      });
    }
  }

  return inversions;
}

/**
 * Detects Balanced Price Ranges (BPR).
 * A BPR occurs when consecutive opposing FVGs (one bullish, one bearish) overlap in price space,
 * forming a high-efficiency institutional trading anchor.
 */
export function detectBalancedPriceRanges(
  candles: readonly Candle[],
  fvgs: readonly FVG[],
  maxBarDistance = 24
): BalancedPriceRange[] {
  const bprs: BalancedPriceRange[] = [];
  const bullishFvgs = fvgs.filter(f => f.direction === 'bullish');
  const bearishFvgs = fvgs.filter(f => f.direction === 'bearish');

  for (const bull of bullishFvgs) {
    for (const bear of bearishFvgs) {
      const barDistance = Math.abs(bull.middleCandleIndex - bear.middleCandleIndex);
      if (barDistance > maxBarDistance) continue;

      const overlapLow = Math.max(bull.gapLow, bear.gapLow);
      const overlapHigh = Math.min(bull.gapHigh, bear.gapHigh);

      if (overlapHigh > overlapLow) {
        const newerIndex = Math.max(bull.middleCandleIndex, bear.middleCandleIndex);
        bprs.push({
          zoneHigh: overlapHigh,
          zoneLow: overlapLow,
          bullishFvgIndex: bull.middleCandleIndex,
          bearishFvgIndex: bear.middleCandleIndex,
          overlapDistance: overlapHigh - overlapLow,
          timestamp: candles[newerIndex]?.timestamp ?? 0,
        });
      }
    }
  }

  return bprs;
}
