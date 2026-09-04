import { Candle, OrderBlock, FVG } from './types';

export interface POITestResult {
  testCount: number;
  isCurrentlyTouching: boolean;
}

/**
 * Tracks the number of independent test events (touches) on a POI zone.
 * 
 * Rules:
 * - A touch is registered when a candle overlaps the zone: low <= zoneHigh && high >= zoneLow.
 * - Touches are counted starting from zoneAvailableFromIndex up to currentIndex.
 * - Consecutive candles inside the zone are counted as a single test (deduplication).
 * - Exiting the zone and re-entering increments the test count.
 */
export function countPOITests(
  candles: Candle[],
  zoneHigh: number,
  zoneLow: number,
  zoneAvailableFromIndex: number,
  currentIndex: number
): POITestResult {
  if (currentIndex < zoneAvailableFromIndex || currentIndex < 0 || currentIndex >= candles.length) {
    return {
      testCount: 0,
      isCurrentlyTouching: false,
    };
  }

  let testCount = 0;
  let wasTouchingBefore = false;
  let isCurrentlyTouching = false;

  for (let i = zoneAvailableFromIndex; i <= currentIndex; i++) {
    const candle = candles[i];
    isCurrentlyTouching = candle.low <= zoneHigh && candle.high >= zoneLow;

    if (isCurrentlyTouching) {
      if (!wasTouchingBefore) {
        testCount++;
      }
    }
    wasTouchingBefore = isCurrentlyTouching;
  }

  return {
    testCount,
    isCurrentlyTouching,
  };
}

/**
 * Wrapper for OrderBlock test counting.
 */
export function countOBTests(candles: Candle[], ob: OrderBlock, currentIndex: number): POITestResult {
  return countPOITests(candles, ob.high, ob.low, ob.relatedEvent.breakCandleIndex + 1, currentIndex);
}

/**
 * Wrapper for FVG test counting.
 */
export function countFVGTests(candles: Candle[], fvg: FVG, currentIndex: number): POITestResult {
  return countPOITests(candles, fvg.gapHigh, fvg.gapLow, fvg.relatedEvent.breakCandleIndex + 1, currentIndex);
}
