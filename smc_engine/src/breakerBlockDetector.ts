import { Candle, SwingPoint, StructureEvent, BreakerBlock } from './types';

export { BreakerBlock } from './types';

export interface ExtendedBreakerBlock extends BreakerBlock {
  bodyHigh: number;
  bodyLow: number;
}

/**
 * Detects Institutional Breaker Blocks (BB) following ICT / SMC Market Structure shifts.
 * 
 * Mechanics:
 * - Bullish Breaker Block:
 *   1. Sequence: Preceding Swing Low (L1) -> Swing High (H1) -> Lower Low (L2).
 *   2. Sell-Side Liquidity (SSL) Sweep: Price sweeps below L1 before breaking H1.
 *   3. Market Structure Break: Price violently breaks and closes above H1 (BOS / CHoCH).
 *   4. Trapped liquidity: The candle at H1 becomes a Bullish Breaker Block support zone.
 *   5. Subsequent retests of [low, high] act as high-probability support.
 * 
 * - Bearish Breaker Block:
 *   1. Sequence: Preceding Swing High (H1) -> Swing Low (L1) -> Higher High (H2).
 *   2. Buy-Side Liquidity (BSL) Sweep: Price sweeps above H1 before breaking L1.
 *   3. Market Structure Break: Price violently breaks and closes below L1 (BOS / CHoCH).
 *   4. Trapped liquidity: The candle at L1 becomes a Bearish Breaker Block resistance zone.
 *   5. Subsequent retests of [low, high] act as high-probability resistance.
 * 
 * Zero Lookahead Guarantee:
 * - Structure break is strictly validated up to currentIdx.
 * - Retests and mitigations are evaluated strictly on candles after breakCandleIndex up to currentIdx.
 */
export function detectBreakerBlocks(
  candles: readonly Candle[],
  swings: readonly SwingPoint[],
  structureEvents: readonly StructureEvent[],
  currentIdx: number = candles.length - 1
): ExtendedBreakerBlock[] {
  const breakerBlocks: ExtendedBreakerBlock[] = [];
  if (candles.length === 0 || structureEvents.length === 0) {
    return breakerBlocks;
  }

  // Filter events up to currentIdx
  const validEvents = structureEvents.filter(e => e.breakCandleIndex <= currentIdx);

  for (const event of validEvents) {
    const brokenSwing = event.brokenSwing;
    if (!brokenSwing) continue;

    if (event.direction === 'bullish') {
      // Bullish break: brokenSwing must be a swing high (H1)
      if (brokenSwing.type !== 'high') continue;
      const h1Idx = brokenSwing.formedAtIndex;

      // Find the most recent confirmed swing low (L1) formed prior to H1
      const precedingLows = swings.filter(
        s => s.type === 'low' && s.formedAtIndex < h1Idx && s.confirmedAtIndex <= event.breakCandleIndex
      );
      if (precedingLows.length === 0) continue;
      const l1 = precedingLows[precedingLows.length - 1];

      // Check whether price swept below L1 between H1 and breakCandleIndex
      let minLow = Infinity;
      let minLowIdx = -1;
      for (let i = h1Idx + 1; i <= event.breakCandleIndex; i++) {
        if (candles[i].low < minLow) {
          minLow = candles[i].low;
          minLowIdx = i;
        }
      }

      // Must be a true liquidity sweep below L1.price
      if (minLow < l1.price && minLowIdx !== -1) {
        const breakerCandle = candles[h1Idx];
        const breakerHigh = breakerCandle.high;
        const breakerLow = breakerCandle.low;
        const bodyHigh = Math.max(breakerCandle.open, breakerCandle.close);
        const bodyLow = Math.min(breakerCandle.open, breakerCandle.close);

        // Evaluate retests and mitigations from breakCandleIndex + 1 to currentIdx
        let testCount = 0;
        let mitigated = false;

        for (let k = event.breakCandleIndex + 1; k <= currentIdx; k++) {
          const testCandle = candles[k];
          const touchesZone = testCandle.low <= breakerHigh && testCandle.high >= breakerLow;
          if (touchesZone) {
            testCount++;
          }
          // Invalidation: candle closes below breaker low
          if (testCandle.close < breakerLow) {
            mitigated = true;
            break;
          }
        }

        breakerBlocks.push({
          direction: 'bullish',
          candleIndex: h1Idx,
          high: breakerHigh,
          low: breakerLow,
          bodyHigh,
          bodyLow,
          formedAtIndex: h1Idx,
          brokenAtIndex: event.breakCandleIndex,
          brokenTimestamp: event.breakTimestamp,
          sweptSwingPrice: l1.price,
          sweptCandleIndex: minLowIdx,
          sweepDepth: Math.max(0, l1.price - minLow),
          relatedEvent: event,
          testCount,
          mitigated,
          active: !mitigated,
        });
      }
    } else if (event.direction === 'bearish') {
      // Bearish break: brokenSwing must be a swing low (L1)
      if (brokenSwing.type !== 'low') continue;
      const l1Idx = brokenSwing.formedAtIndex;

      // Find the most recent confirmed swing high (H1) formed prior to L1
      const precedingHighs = swings.filter(
        s => s.type === 'high' && s.formedAtIndex < l1Idx && s.confirmedAtIndex <= event.breakCandleIndex
      );
      if (precedingHighs.length === 0) continue;
      const h1 = precedingHighs[precedingHighs.length - 1];

      // Check whether price swept above H1 between L1 and breakCandleIndex
      let maxHigh = -Infinity;
      let maxHighIdx = -1;
      for (let i = l1Idx + 1; i <= event.breakCandleIndex; i++) {
        if (candles[i].high > maxHigh) {
          maxHigh = candles[i].high;
          maxHighIdx = i;
        }
      }

      // Must be a true liquidity sweep above H1.price
      if (maxHigh > h1.price && maxHighIdx !== -1) {
        const breakerCandle = candles[l1Idx];
        const breakerHigh = breakerCandle.high;
        const breakerLow = breakerCandle.low;
        const bodyHigh = Math.max(breakerCandle.open, breakerCandle.close);
        const bodyLow = Math.min(breakerCandle.open, breakerCandle.close);

        // Evaluate retests and mitigations from breakCandleIndex + 1 to currentIdx
        let testCount = 0;
        let mitigated = false;

        for (let k = event.breakCandleIndex + 1; k <= currentIdx; k++) {
          const testCandle = candles[k];
          const touchesZone = testCandle.high >= breakerLow && testCandle.low <= breakerHigh;
          if (touchesZone) {
            testCount++;
          }
          // Invalidation: candle closes above breaker high
          if (testCandle.close > breakerHigh) {
            mitigated = true;
            break;
          }
        }

        breakerBlocks.push({
          direction: 'bearish',
          candleIndex: l1Idx,
          high: breakerHigh,
          low: breakerLow,
          bodyHigh,
          bodyLow,
          formedAtIndex: l1Idx,
          brokenAtIndex: event.breakCandleIndex,
          brokenTimestamp: event.breakTimestamp,
          sweptSwingPrice: h1.price,
          sweptCandleIndex: maxHighIdx,
          sweepDepth: Math.max(0, maxHigh - h1.price),
          relatedEvent: event,
          testCount,
          mitigated,
          active: !mitigated,
        });
      }
    }
  }

  return breakerBlocks;
}

/**
 * Filters for active (unmitigated) Breaker Blocks.
 */
export function findActiveBreakerBlocks(breakers: readonly ExtendedBreakerBlock[]): ExtendedBreakerBlock[] {
  return breakers.filter(b => b.active);
}

/**
 * Checks whether a given price is currently inside the Breaker Block zone.
 */
export function isPriceInBreakerZone(breaker: BreakerBlock, price: number): boolean {
  return price >= breaker.low && price <= breaker.high;
}

/**
 * Finds the nearest active Breaker Block in the specified direction.
 * - Bullish: nearest support below or at currentPrice.
 * - Bearish: nearest resistance above or at currentPrice.
 */
export function findNearestBreakerBlock(
  breakers: readonly ExtendedBreakerBlock[],
  currentPrice: number,
  direction: 'bullish' | 'bearish'
): ExtendedBreakerBlock | null {
  const activeBreakers = breakers.filter(b => b.active && b.direction === direction);
  if (activeBreakers.length === 0) return null;

  if (direction === 'bullish') {
    // Bullish support: highest high that is <= currentPrice, or proximal distance
    const below = activeBreakers.filter(b => b.high <= currentPrice);
    if (below.length > 0) {
      return below.reduce((prev, curr) => (curr.high > prev.high ? curr : prev));
    }
    // If inside or slightly above proximal edge
    return activeBreakers.reduce((prev, curr) =>
      Math.abs(curr.high - currentPrice) < Math.abs(prev.high - currentPrice) ? curr : prev
    );
  } else {
    // Bearish resistance: lowest low that is >= currentPrice, or proximal distance
    const above = activeBreakers.filter(b => b.low >= currentPrice);
    if (above.length > 0) {
      return above.reduce((prev, curr) => (curr.low < prev.low ? curr : prev));
    }
    return activeBreakers.reduce((prev, curr) =>
      Math.abs(curr.low - currentPrice) < Math.abs(prev.low - currentPrice) ? curr : prev
    );
  }
}
