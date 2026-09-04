import { Candle, StructureEvent } from '../src/types';
import { findDisplacementLeg } from '../src/displacementLeg';
import { detectOrderBlock } from '../src/obDetector';

describe('Order Block Detector', () => {
  const dummyEvent = (idx: number, direction: 'bullish' | 'bearish'): StructureEvent => ({
    type: 'BOS',
    direction,
    brokenSwing: { type: 'high', price: 10, formedAtIndex: 0, confirmedAtIndex: 2, timestamp: 0 },
    breakCandleIndex: idx,
    breakTimestamp: 1000 * idx,
    breakClosePrice: 15,
  });

  test('should detect valid OB for bullish leg', () => {
    const candles: Candle[] = [
      { timestamp: 0, open: 12, high: 13, low: 9, close: 10 }, // Red/Bearish OB candle
      { timestamp: 1000, open: 10, high: 16, low: 10, close: 15 }, // Green/Bullish displacement
    ];

    const event = dummyEvent(1, 'bullish');
    const leg = findDisplacementLeg(candles, event);
    const ob = detectOrderBlock(candles, leg, event);

    expect(ob).not.toBeNull();
    expect(ob!.formedAtIndex).toBe(0);
    expect(ob!.high).toBe(13);
    expect(ob!.low).toBe(9);
    expect(ob!.direction).toBe('bullish');
  });

  test('should return null if leg startIndex has no preceding candle', () => {
    const candles: Candle[] = [
      { timestamp: 0, open: 10, high: 16, low: 10, close: 15 },
    ];

    const event = dummyEvent(0, 'bullish');
    const leg = findDisplacementLeg(candles, event);
    const ob = detectOrderBlock(candles, leg, event);

    expect(ob).toBeNull();
  });

  test('should return null if preceding candle is a doji', () => {
    const candles: Candle[] = [
      { timestamp: 0, open: 12, high: 12, low: 12, close: 12 }, // Doji at index 0
      { timestamp: 1000, open: 12, high: 16, low: 12, close: 15 }, // Bullish Y candle at index 1
      { timestamp: 2000, open: 15, high: 18, low: 14, close: 17 }, // Bullish break candle at index 2
    ];

    const event = dummyEvent(2, 'bullish');
    const leg = findDisplacementLeg(candles, event); // leg startIndex will be 1 (Y)
    const ob = detectOrderBlock(candles, leg, event); // obIndex is Y.index - 1 = 0 (doji)

    expect(ob).toBeNull();
  });
});
