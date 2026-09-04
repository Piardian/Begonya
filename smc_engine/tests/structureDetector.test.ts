import { Candle, SwingPoint } from '../src/types';
import { detectStructure } from '../src/structureDetector';

// Helper to create basic candles
function createBaseCandles(length: number): Candle[] {
  const candles: Candle[] = [];
  for (let i = 0; i < length; i++) {
    candles.push({
      timestamp: 1000 * i,
      open: 15,
      high: 15,
      low: 15,
      close: 15,
    });
  }
  return candles;
}

describe('Structure Detector', () => {
  test('should initialize trend correctly and detect BOS/CHoCH', () => {
    // Generate a sequence of confirmed swings to test trend initialization and structure changes.
    const swings: SwingPoint[] = [
      { type: 'low', price: 10, formedAtIndex: 2, confirmedAtIndex: 4, timestamp: 2000 },
      { type: 'high', price: 20, formedAtIndex: 5, confirmedAtIndex: 7, timestamp: 5000 },
      { type: 'low', price: 12, formedAtIndex: 8, confirmedAtIndex: 10, timestamp: 8000 },
      { type: 'high', price: 22, formedAtIndex: 11, confirmedAtIndex: 13, timestamp: 11000 },
    ];

    const candles = createBaseCandles(20);
    // At index 14, candles close at 25 (breaks the last confirmed swing high of 22 -> Bullish BOS)
    candles[14].close = 25;
    // At index 15, candles close at 9 (breaks the last confirmed swing low of 12 -> Bearish CHoCH)
    candles[15].close = 9;

    const result = detectStructure(candles, swings);
    expect(result.events.length).toBe(2);

    // First event at index 14 should be a Bullish BOS
    expect(result.events[0]).toMatchObject({
      type: 'BOS',
      direction: 'bullish',
      breakCandleIndex: 14,
      breakClosePrice: 25,
    });
    expect(result.events[0].brokenSwing.price).toBe(22);

    // Second event at index 15 should be a Bearish CHoCH
    expect(result.events[1]).toMatchObject({
      type: 'CHoCH',
      direction: 'bearish',
      breakCandleIndex: 15,
      breakClosePrice: 9,
    });
    expect(result.events[1].brokenSwing.price).toBe(12);
    expect(result.currentTrend).toBe('bearish');
  });

  test('should stay range and not produce events when range condition is met', () => {
    const swings: SwingPoint[] = [
      { type: 'low', price: 10, formedAtIndex: 2, confirmedAtIndex: 4, timestamp: 2000 },
      { type: 'high', price: 20, formedAtIndex: 5, confirmedAtIndex: 7, timestamp: 5000 },
      { type: 'low', price: 8, formedAtIndex: 8, confirmedAtIndex: 10, timestamp: 8000 },
      { type: 'high', price: 22, formedAtIndex: 11, confirmedAtIndex: 13, timestamp: 11000 },
    ];

    const candles = createBaseCandles(20);
    candles[14].close = 25; // Close above high
    candles[15].close = 5; // Close below low

    const result = detectStructure(candles, swings);
    expect(result.currentTrend).toBe('range');
    expect(result.events).toHaveLength(0);
  });

  test('should remain bullish if weak pattern forms but no CHoCH is triggered', () => {
    const swings: SwingPoint[] = [
      { type: 'low', price: 10, formedAtIndex: 2, confirmedAtIndex: 4, timestamp: 2000 },
      { type: 'high', price: 20, formedAtIndex: 5, confirmedAtIndex: 7, timestamp: 5000 },
      { type: 'low', price: 12, formedAtIndex: 8, confirmedAtIndex: 10, timestamp: 8000 },
      { type: 'high', price: 22, formedAtIndex: 11, confirmedAtIndex: 13, timestamp: 11000 },
      { type: 'high', price: 21, formedAtIndex: 14, confirmedAtIndex: 16, timestamp: 14000 },
    ];

    const candles = createBaseCandles(20);
    const result = detectStructure(candles, swings);
    expect(result.currentTrend).toBe('bullish');
    expect(result.events).toHaveLength(0);
  });

  test('should establish initial trend as bearish and detect bearish BOS', () => {
    // Bearish initial pattern:
    // High 1: 25, Low 1: 15, High 2: 23 (lower high), Low 2: 13 (lower low)
    const swings: SwingPoint[] = [
      { type: 'high', price: 25, formedAtIndex: 2, confirmedAtIndex: 4, timestamp: 2000 },
      { type: 'low', price: 15, formedAtIndex: 5, confirmedAtIndex: 7, timestamp: 5000 },
      { type: 'high', price: 23, formedAtIndex: 8, confirmedAtIndex: 10, timestamp: 8000 },
      { type: 'low', price: 13, formedAtIndex: 11, confirmedAtIndex: 13, timestamp: 11000 },
    ];

    const candles = createBaseCandles(20);
    // At index 14, close below 13 (breaks last confirmed low 13 -> Bearish BOS)
    candles[14].close = 10;

    const result = detectStructure(candles, swings);
    expect(result.currentTrend).toBe('bearish');
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      type: 'BOS',
      direction: 'bearish',
      breakCandleIndex: 14,
      breakClosePrice: 10,
    });
  });

  test('should handle swing reuse bug: Bearish -> Bullish CHoCH reuse', () => {
    // 1. Bullish trend established:
    // Low 1: 10, High 1: 20, Low 2: 12 (higher low), High 2: 22 (higher high)
    const swings: SwingPoint[] = [
      { type: 'low', price: 10, formedAtIndex: 2, confirmedAtIndex: 4, timestamp: 2000 },
      { type: 'high', price: 20, formedAtIndex: 5, confirmedAtIndex: 7, timestamp: 5000 },
      { type: 'low', price: 12, formedAtIndex: 8, confirmedAtIndex: 10, timestamp: 8000 },
      { type: 'high', price: 22, formedAtIndex: 11, confirmedAtIndex: 13, timestamp: 11000 },
    ];

    const candles = createBaseCandles(20);
    // 2. Candle 14 close = 25 (breaks High 2 (22) -> Bullish BOS)
    candles[14].close = 25;
    // 3. Candle 15 close = 11 (breaks Low 2 (12) -> Bearish CHoCH)
    candles[15].close = 11;
    // 4. Candle 16 close = 23 (breaks High 2 (22) again -> Bullish CHoCH)
    candles[16].close = 23;

    const result = detectStructure(candles, swings);
    // There should be 3 events: BOS (bullish), CHoCH (bearish), CHoCH (bullish)
    expect(result.events).toHaveLength(3);
    expect(result.events[0].type).toBe('BOS');
    expect(result.events[1].type).toBe('CHoCH');
    expect(result.events[1].direction).toBe('bearish');
    expect(result.events[2].type).toBe('CHoCH');
    expect(result.events[2].direction).toBe('bullish');
    expect(result.events[2].brokenSwing.price).toBe(22); // Reused swing high
    expect(result.currentTrend).toBe('bullish');
  });

  test('should resolve from Range to Trend dynamically as swings are confirmed', () => {
    // Swings timeline:
    // At t=4: Low 1 (10) confirmed
    // At t=7: High 1 (20) confirmed
    // At t=10: Low 2 (8) confirmed -> (Low 2 < Low 1, no trend yet)
    // At t=13: High 2 (22) confirmed -> (High 2 > High 1, different direction -> trend is range)
    // At t=16: Low 3 (9) confirmed -> We have last 2 highs [20, 22] (rising) and last 2 lows [8, 9] (rising) -> resolves to Bullish trend at t=16!
    const swings: SwingPoint[] = [
      { type: 'low', price: 10, formedAtIndex: 2, confirmedAtIndex: 4, timestamp: 2000 },
      { type: 'high', price: 20, formedAtIndex: 5, confirmedAtIndex: 7, timestamp: 5000 },
      { type: 'low', price: 8, formedAtIndex: 8, confirmedAtIndex: 10, timestamp: 8000 },
      { type: 'high', price: 22, formedAtIndex: 11, confirmedAtIndex: 13, timestamp: 11000 },
      { type: 'low', price: 9, formedAtIndex: 14, confirmedAtIndex: 16, timestamp: 14000 },
      { type: 'high', price: 24, formedAtIndex: 17, confirmedAtIndex: 19, timestamp: 17000 },
    ];

    const candles = createBaseCandles(25);

    // Run dynamic verification at each step
    const stateAt13 = detectStructure(candles.slice(0, 14), swings);
    expect(stateAt13.currentTrend).toBe('range');

    const stateAt16 = detectStructure(candles.slice(0, 17), swings);
    expect(stateAt16.currentTrend).toBe('bullish');

    const stateAt19 = detectStructure(candles, swings);
    expect(stateAt19.currentTrend).toBe('bullish');
  });

  test('should correctly compute windowStartIndex for range transition', () => {
    const swings: SwingPoint[] = [
      { type: 'low', price: 10, formedAtIndex: 2, confirmedAtIndex: 4, timestamp: 2000 },
      { type: 'high', price: 20, formedAtIndex: 5, confirmedAtIndex: 7, timestamp: 5000 },
      { type: 'low', price: 8, formedAtIndex: 8, confirmedAtIndex: 10, timestamp: 8000 },
      { type: 'high', price: 22, formedAtIndex: 11, confirmedAtIndex: 13, timestamp: 11000 },
      { type: 'low', price: 9, formedAtIndex: 14, confirmedAtIndex: 16, timestamp: 14000 },
      { type: 'high', price: 24, formedAtIndex: 17, confirmedAtIndex: 19, timestamp: 17000 },
    ];

    const candles = createBaseCandles(25);
    const result = detectStructure(candles, swings);
    const rangeTransition = result.regimeTransitions.find(t => t.newTrend === 'range');
    expect(rangeTransition?.windowStartIndex).toBe(4); // Min of h1(confirmedAt:7) and l1(confirmedAt:4)
  });
});
