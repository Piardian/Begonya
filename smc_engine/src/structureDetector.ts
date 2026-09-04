import { Candle, SwingPoint, StructureEvent, StructureState, RegimeTransition } from './types';

const EPSILON = 0.000001;

function isGreater(a: number, b: number): boolean {
  return a > b + EPSILON;
}

function isLess(a: number, b: number): boolean {
  return a < b - EPSILON;
}

/**
 * Detects BOS (Break of Structure) and CHoCH (Change of Character) events.
 * 
 * Logic:
 * 1. Initial State: trend is 'undefined' until we have >= 2 confirmed swing highs AND >= 2 confirmed swing lows.
 * 2. Initial trend determination:
 *    - Son 2 swing high yükseliyor VE son 2 swing low yükseliyor -> bullish
 *    - Son 2 swing high düşüyor VE son 2 swing low düşüyor -> bearish
 *    - Else -> range
 * 3. While trend is 'range', we re-evaluate trend at each candle as new swings confirm using the same rules.
 * 4. Once in 'bullish' or 'bearish' trend:
 *    - Bullish Trend:
 *      - Candle close > last confirmed swing high -> BOS (direction: bullish), trend remains bullish.
 *      - Candle close < last confirmed swing low -> CHoCH (direction: bearish), trend becomes bearish.
 *    - Bearish Trend:
 *      - Candle close < last confirmed swing low -> BOS (direction: bearish), trend remains bearish.
 *      - Candle close > last confirmed swing high -> CHoCH (direction: bullish), trend becomes bullish.
 * 
 * To prevent duplicate triggers and allow swing re-use:
 * - We track broken swing points in a `brokenSwings` set.
 * - When the trend changes (CHoCH occurs), we clear the `brokenSwings` set so that those levels can be broken again in the new regime.
 */
export function detectStructure(candles: Candle[], swings: SwingPoint[]): StructureState {
  const events: StructureEvent[] = [];
  let currentTrend: 'bullish' | 'bearish' | 'range' | 'undefined' = 'undefined';
  const regimeTransitions: RegimeTransition[] = [];
  let lastRecordedTrend: 'bullish' | 'bearish' | 'range' | 'undefined' = currentTrend;
  
  let brokenSwings = new Set<string>();
  const getSwingKey = (s: SwingPoint) => `${s.type}-${s.formedAtIndex}`;

  // Process candle by candle to avoid lookahead bias
  for (let idx = 0; idx < candles.length; idx++) {
    // 1. Get confirmed swings up to the current candle index
    const confirmedSwings = swings.filter(s => s.confirmedAtIndex <= idx);
    const confirmedHighs = confirmedSwings.filter(s => s.type === 'high');
    const confirmedLows = confirmedSwings.filter(s => s.type === 'low');

    // 2. Trend Initialization / Re-evaluation (if undefined or range)
    if (currentTrend === 'undefined' || currentTrend === 'range') {
      if (confirmedHighs.length >= 2 && confirmedLows.length >= 2) {
        const h1 = confirmedHighs[confirmedHighs.length - 2];
        const h2 = confirmedHighs[confirmedHighs.length - 1];
        const l1 = confirmedLows[confirmedLows.length - 2];
        const l2 = confirmedLows[confirmedLows.length - 1];

        if (isGreater(h2.price, h1.price) && isGreater(l2.price, l1.price)) {
          currentTrend = 'bullish';
        } else if (isLess(h2.price, h1.price) && isLess(l2.price, l1.price)) {
          currentTrend = 'bearish';
        } else {
          currentTrend = 'range';
        }
      }
    }

    // 3. Check for Structure events if we have a directional trend
    if (currentTrend === 'bullish') {
      if (confirmedHighs.length > 0 && confirmedLows.length > 0) {
        const lastHigh = confirmedHighs[confirmedHighs.length - 1];
        const lastLow = confirmedLows[confirmedLows.length - 1];
        const closePrice = candles[idx].close;

        // Check if last confirmed swing low is broken (CHoCH)
        if (isLess(closePrice, lastLow.price) && !brokenSwings.has(getSwingKey(lastLow))) {
          const event: StructureEvent = {
            type: 'CHoCH',
            direction: 'bearish',
            brokenSwing: lastLow,
            breakCandleIndex: idx,
            breakTimestamp: candles[idx].timestamp,
            breakClosePrice: closePrice,
          };
          events.push(event);
          currentTrend = 'bearish'; // Trend changes to bearish
          brokenSwings = new Set<string>(); // Reset broken swings on trend change
          brokenSwings.add(getSwingKey(lastLow));
        }
        // Check if last confirmed swing high is broken (BOS)
        else if (isGreater(closePrice, lastHigh.price) && !brokenSwings.has(getSwingKey(lastHigh))) {
          const event: StructureEvent = {
            type: 'BOS',
            direction: 'bullish',
            brokenSwing: lastHigh,
            breakCandleIndex: idx,
            breakTimestamp: candles[idx].timestamp,
            breakClosePrice: closePrice,
          };
          events.push(event);
          brokenSwings.add(getSwingKey(lastHigh));
        }
      }
    } else if (currentTrend === 'bearish') {
      if (confirmedHighs.length > 0 && confirmedLows.length > 0) {
        const lastHigh = confirmedHighs[confirmedHighs.length - 1];
        const lastLow = confirmedLows[confirmedLows.length - 1];
        const closePrice = candles[idx].close;

        // Check if last confirmed swing high is broken (CHoCH)
        if (isGreater(closePrice, lastHigh.price) && !brokenSwings.has(getSwingKey(lastHigh))) {
          const event: StructureEvent = {
            type: 'CHoCH',
            direction: 'bullish',
            brokenSwing: lastHigh,
            breakCandleIndex: idx,
            breakTimestamp: candles[idx].timestamp,
            breakClosePrice: closePrice,
          };
          events.push(event);
          currentTrend = 'bullish'; // Trend changes to bullish
          brokenSwings = new Set<string>(); // Reset broken swings on trend change
          brokenSwings.add(getSwingKey(lastHigh));
        }
        // Check if last confirmed swing low is broken (BOS)
        else if (isLess(closePrice, lastLow.price) && !brokenSwings.has(getSwingKey(lastLow))) {
          const event: StructureEvent = {
            type: 'BOS',
            direction: 'bearish',
            brokenSwing: lastLow,
            breakCandleIndex: idx,
            breakTimestamp: candles[idx].timestamp,
            breakClosePrice: closePrice,
          };
          events.push(event);
          brokenSwings.add(getSwingKey(lastLow));
        }
      }
    }

    // Record trend transitions at each candle index
    if (currentTrend !== lastRecordedTrend) {
      let windowStartIndex: number | undefined;
      if (currentTrend !== 'undefined' && confirmedHighs.length >= 2 && confirmedLows.length >= 2) {
        const h1 = confirmedHighs[confirmedHighs.length - 2];
        const l1 = confirmedLows[confirmedLows.length - 2];
        windowStartIndex = Math.min(h1.confirmedAtIndex, l1.confirmedAtIndex);
      }
      regimeTransitions.push({
        atIndex: idx,
        newTrend: currentTrend,
        windowStartIndex,
      });
      lastRecordedTrend = currentTrend;
    }
  }

  return {
    currentTrend,
    events,
    lastEvent: events.length > 0 ? events[events.length - 1] : null,
    regimeTransitions,
  };
}
