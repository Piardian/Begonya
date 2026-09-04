import { Candle, DisplacementLeg, DisplacementQuality, StructureEvent } from './types';
import { detectFVGsInLeg } from './fvgDetector';
import type { Symbol } from '../server/universe';

/**
 * Evaluates the quality of a displacement leg using a 4-criteria scoring system.
 * 
 * Scores for each criteria: Strong = 1, Medium = 0.5, Weak = 0.
 * Returns null if there are fewer than 3 prior candles before leg.startIndex (insufficient data).
 */
export function scoreDisplacementQuality(
  candles: Candle[],
  leg: DisplacementLeg,
  pair: Symbol,
  timeframe: '15m' | '1h' | '4h'
): DisplacementQuality | null {
  // Criterion 4 Insufficient Data Guard:
  // Must have at least 3 prior candles before leg.startIndex
  if (leg.startIndex < 3) {
    return null;
  }

  // ----------------------------------------------------
  // Criterion 1: Body Ratio (Average of |close - open| / (high - low) * 100)
  // ----------------------------------------------------
  let bodyRatioSum = 0;
  let nonFlatCount = 0;
  for (let i = leg.startIndex; i <= leg.endIndex; i++) {
    const candle = candles[i];
    const range = candle.high - candle.low;
    if (range > 0) {
      bodyRatioSum += (Math.abs(candle.close - candle.open) / range) * 100;
      nonFlatCount++;
    }
  }

  const avgBodyRatio = nonFlatCount > 0 ? bodyRatioSum / nonFlatCount : 0;
  let bodyRatioScore = 0;
  if (avgBodyRatio >= 70) {
    bodyRatioScore = 1;
  } else if (avgBodyRatio >= 50) {
    bodyRatioScore = 0.5;
  }

  // ----------------------------------------------------
  // Criterion 2: Consecutive Mum Count
  // ----------------------------------------------------
  const consecutiveCount = leg.endIndex - leg.startIndex + 1;
  let consecutiveScore = 0;
  if (consecutiveCount >= 3) {
    consecutiveScore = 1;
  } else if (consecutiveCount === 2) {
    consecutiveScore = 0.5;
  }

  // ----------------------------------------------------
  // Criterion 3: FVG Presence (Leg-based FVG vs Raw Imbalance)
  // ----------------------------------------------------
  const dummyEvent: StructureEvent = {
    type: 'BOS',
    direction: leg.direction,
    brokenSwing: { type: 'high', price: 0, formedAtIndex: 0, confirmedAtIndex: 0, timestamp: 0 },
    breakCandleIndex: leg.endIndex,
    breakTimestamp: 0,
    breakClosePrice: 0,
  };

  const fvgs = detectFVGsInLeg(candles, leg, pair, timeframe, dummyEvent);
  let fvgScore = 0;

  if (fvgs.length > 0) {
    fvgScore = 1;
  } else {
    // Check for raw imbalance
    let hasRawImbalance = false;
    for (let i = leg.startIndex; i <= leg.endIndex; i++) {
      if (i - 1 >= 0 && i + 1 < candles.length) {
        if (leg.direction === 'bullish') {
          if (candles[i + 1].low > candles[i - 1].high) {
            hasRawImbalance = true;
            break;
          }
        } else {
          if (candles[i + 1].high < candles[i - 1].low) {
            hasRawImbalance = true;
            break;
          }
        }
      }
    }
    if (hasRawImbalance) {
      fvgScore = 0.5;
    }
  }

  // ----------------------------------------------------
  // Criterion 4: Displacement Size Ratio (legAvgRange / priorAvgRange)
  // ----------------------------------------------------
  let legRangeSum = 0;
  for (let i = leg.startIndex; i <= leg.endIndex; i++) {
    legRangeSum += candles[i].high - candles[i].low;
  }
  const legAvgRange = legRangeSum / consecutiveCount;

  // Prior candles (up to 10 candles immediately before leg.startIndex)
  const priorStart = Math.max(0, leg.startIndex - 10);
  const priorEnd = leg.startIndex - 1;
  const priorCount = priorEnd - priorStart + 1;

  let priorRangeSum = 0;
  for (let i = priorStart; i <= priorEnd; i++) {
    priorRangeSum += candles[i].high - candles[i].low;
  }
  const priorAvgRange = priorRangeSum / priorCount;

  let sizeScore = 0;
  if (priorAvgRange > 0) {
    const ratio = legAvgRange / priorAvgRange;
    if (ratio >= 1.5) {
      sizeScore = 1;
    } else if (ratio >= 1.0) {
      sizeScore = 0.5;
    }
  }

  // ----------------------------------------------------
  // Total Score and Quality Grading
  // ----------------------------------------------------
  const totalScore = bodyRatioScore + consecutiveScore + fvgScore + sizeScore;

  let quality: 'güçlü' | 'orta' | 'zayıf' | 'yok';
  let gradePoints: 2 | 1 | 0 | -2;

  if (totalScore >= 3.5) {
    quality = 'güçlü';
    gradePoints = 2;
  } else if (totalScore >= 2.5) {
    quality = 'orta';
    gradePoints = 1;
  } else if (totalScore >= 1.5) {
    quality = 'zayıf';
    gradePoints = 0;
  } else {
    quality = 'yok';
    gradePoints = -2;
  }

  return {
    legDirection: leg.direction,
    bodyRatioScore,
    consecutiveScore,
    fvgScore,
    sizeScore,
    totalScore,
    quality,
    gradePoints,
  };
}
