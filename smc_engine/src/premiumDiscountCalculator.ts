import { Candle, SwingPoint, PremiumDiscountState } from './types';

/**
 * Calculates Premium/Discount (Fib) status based on the latest confirmed swing high and swing low.
 * 
 * Rules:
 * 1. Filter swings confirmed up to currentIndex (confirmedAtIndex <= currentIndex).
 * 2. rangeHigh is the price of the latest confirmed swing high.
 * 3. rangeLow is the price of the latest confirmed swing low.
 * 4. Edge cases:
 *    - If there isn't at least 1 confirmed swing high AND 1 confirmed swing low -> status: 'undefined', other fields null.
 *    - If rangeHigh === rangeLow -> status: 'undefined', other fields null (prevents zero division).
 * 5. Classifications:
 *    - fibValue > 0.55 -> 'premium'
 *    - fibValue < 0.45 -> 'discount'
 *    - 0.45 <= fibValue <= 0.55 -> 'eq'
 */
export function calculatePremiumDiscount(
  candles: Candle[],
  swings: SwingPoint[],
  currentIndex: number
): PremiumDiscountState {
  if (currentIndex < 0 || currentIndex >= candles.length) {
    return { status: 'undefined', fibValue: null, rangeHigh: null, rangeLow: null };
  }

  // Filter confirmed swings up to currentIndex
  const confirmedSwings = swings.filter(s => s.confirmedAtIndex <= currentIndex);
  const confirmedHighs = confirmedSwings.filter(s => s.type === 'high');
  const confirmedLows = confirmedSwings.filter(s => s.type === 'low');

  // Verify we have at least one of each
  if (confirmedHighs.length === 0 || confirmedLows.length === 0) {
    return {
      status: 'undefined',
      fibValue: null,
      rangeHigh: null,
      rangeLow: null,
    };
  }

  // Get the latest confirmed swing high and low
  const latestHigh = confirmedHighs[confirmedHighs.length - 1];
  const latestLow = confirmedLows[confirmedLows.length - 1];

  const rangeHigh = Math.max(latestHigh.price, latestLow.price);
  const rangeLow = Math.min(latestHigh.price, latestLow.price);

  // Zero-division guard
  if (rangeHigh === rangeLow) {
    return {
      status: 'undefined',
      fibValue: null,
      rangeHigh: null,
      rangeLow: null,
    };
  }

  const currentPrice = candles[currentIndex].close;
  const fibValue = (currentPrice - rangeLow) / (rangeHigh - rangeLow);

  let status: 'premium' | 'discount' | 'eq';
  if (fibValue > 0.55) {
    status = 'premium';
  } else if (fibValue < 0.45) {
    status = 'discount';
  } else {
    status = 'eq';
  }

  return {
    status,
    fibValue,
    rangeHigh,
    rangeLow,
  };
}
