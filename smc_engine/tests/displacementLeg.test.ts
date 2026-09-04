import { Candle, StructureEvent } from '../src/types';
import { findDisplacementLeg } from '../src/displacementLeg';

describe('Displacement Leg Calculator', () => {
  const dummyEvent = (idx: number, direction: 'bullish' | 'bearish'): StructureEvent => ({
    type: 'BOS',
    direction,
    brokenSwing: { type: 'high', price: 10, formedAtIndex: 0, confirmedAtIndex: 2, timestamp: 0 },
    breakCandleIndex: idx,
    breakTimestamp: 1000 * idx,
    breakClosePrice: 15,
  });

  test('should detect single candle bullish leg when preceding candle is bearish', () => {
    const candles: Candle[] = [
      { timestamp: 0, open: 12, high: 14, low: 11, close: 10 }, // Red/Bearish at index 0
      { timestamp: 1000, open: 10, high: 16, low: 10, close: 15 }, // Green/Bullish at index 1 (break)
    ];

    const leg = findDisplacementLeg(candles, dummyEvent(1, 'bullish'));
    expect(leg.startIndex).toBe(1);
    expect(leg.endIndex).toBe(1);
    expect(leg.direction).toBe('bullish');
  });

  test('should detect multi-candle bearish leg', () => {
    const candles: Candle[] = [
      { timestamp: 0, open: 10, high: 12, low: 9, close: 11 }, // Green (index 0)
      { timestamp: 1000, open: 12, high: 12, low: 8, close: 9 }, // Red (index 1)
      { timestamp: 2000, open: 9, high: 9, low: 6, close: 7 }, // Red (index 2)
      { timestamp: 3000, open: 7, high: 8, low: 4, close: 5 }, // Red (index 3 - break)
    ];

    const leg = findDisplacementLeg(candles, dummyEvent(3, 'bearish'));
    expect(leg.startIndex).toBe(1);
    expect(leg.endIndex).toBe(3);
    expect(leg.direction).toBe('bearish');
  });

  test('should stop walking backward when a doji is encountered', () => {
    const candles: Candle[] = [
      { timestamp: 0, open: 10, high: 15, low: 10, close: 14 }, // Green
      { timestamp: 1000, open: 12, high: 12, low: 12, close: 12 }, // Doji (index 1)
      { timestamp: 2000, open: 12, high: 16, low: 12, close: 15 }, // Green (index 2)
      { timestamp: 3000, open: 15, high: 18, low: 14, close: 17 }, // Green (index 3 - break)
    ];

    const leg = findDisplacementLeg(candles, dummyEvent(3, 'bullish'));
    expect(leg.startIndex).toBe(2); // Stops before index 1 (doji)
    expect(leg.endIndex).toBe(3);
  });
});
