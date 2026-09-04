import { Candle, SwingPoint, StructureState } from '../src/types';
import { calculateRange } from '../src/rangeCalculator';

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

describe('Range Calculator', () => {
  test('should return isRange: false before range is established', () => {
    const candles = createBaseCandles(10);
    const structureState: StructureState = {
      currentTrend: 'undefined',
      events: [],
      lastEvent: null,
      regimeTransitions: [],
    };
    const range = calculateRange(candles, [], structureState, 5);
    expect(range.isRange).toBe(false);
    expect(range.rangeHigh).toBeNull();
  });

  test('should calculate max/min high/low correctly once range is established', () => {
    // Range is established with multiple swings.
    const swings: SwingPoint[] = [
      { type: 'low', price: 10, formedAtIndex: 2, confirmedAtIndex: 4, timestamp: 2000 },
      { type: 'high', price: 20, formedAtIndex: 5, confirmedAtIndex: 7, timestamp: 5000 },
      { type: 'low', price: 8, formedAtIndex: 8, confirmedAtIndex: 10, timestamp: 8000 },
      { type: 'high', price: 22, formedAtIndex: 11, confirmedAtIndex: 13, timestamp: 11000 },
      // Confirmed within the range window:
      { type: 'low', price: 11, formedAtIndex: 14, confirmedAtIndex: 16, timestamp: 14000 },
      { type: 'high', price: 18, formedAtIndex: 17, confirmedAtIndex: 19, timestamp: 17000 },
      { type: 'low', price: 5, formedAtIndex: 20, confirmedAtIndex: 22, timestamp: 20000 },
      { type: 'high', price: 25, formedAtIndex: 23, confirmedAtIndex: 25, timestamp: 23000 },
      { type: 'low', price: 9, formedAtIndex: 26, confirmedAtIndex: 28, timestamp: 26000 },
      { type: 'high', price: 21, formedAtIndex: 29, confirmedAtIndex: 31, timestamp: 29000 },
    ];

    const candles = createBaseCandles(35);
    const structureState: StructureState = {
      currentTrend: 'range',
      events: [],
      lastEvent: null,
      regimeTransitions: [
        { atIndex: 13, newTrend: 'range', windowStartIndex: 4 }
      ]
    };

    const range = calculateRange(candles, swings, structureState, 32);
    expect(range.isRange).toBe(true);
    expect(range.rangeHigh).toBe(25);
    expect(range.rangeLow).toBe(5);
  });

  test('should return isRange: false once trend transitions out of range', () => {
    const candles = createBaseCandles(20);
    const structureState: StructureState = {
      currentTrend: 'bullish',
      events: [],
      lastEvent: null,
      regimeTransitions: [
        { atIndex: 5, newTrend: 'range', windowStartIndex: 2 },
        { atIndex: 12, newTrend: 'bullish' },
      ],
    };

    const range = calculateRange(candles, [], structureState, 15);
    expect(range.isRange).toBe(false);
    expect(range.rangeHigh).toBeNull();
  });

  test('regression: should include swings confirmed before transition index in range calculation', () => {
    // Bug verification: Swings confirmed before the transition index (but part of the pattern check)
    // must be included in the range calculation.
    // Transition to range happens at index 13, but the absolute minimum low (8) is confirmed at index 10.
    const swings: SwingPoint[] = [
      { type: 'low', price: 10, formedAtIndex: 2, confirmedAtIndex: 4, timestamp: 2000 },
      { type: 'high', price: 20, formedAtIndex: 5, confirmedAtIndex: 7, timestamp: 5000 },
      { type: 'low', price: 8, formedAtIndex: 8, confirmedAtIndex: 10, timestamp: 8000 }, // Confirmed before transition (atIndex 13)
      { type: 'high', price: 22, formedAtIndex: 11, confirmedAtIndex: 13, timestamp: 11000 }, // Confirms range
    ];

    const candles = createBaseCandles(15);
    const structureState: StructureState = {
      currentTrend: 'range',
      events: [],
      lastEvent: null,
      regimeTransitions: [
        { atIndex: 13, newTrend: 'range', windowStartIndex: 4 }
      ]
    };

    const range = calculateRange(candles, swings, structureState, 14);
    expect(range.isRange).toBe(true);
    expect(range.rangeLow).toBe(8); // Must correctly include the low confirmed at 10
    expect(range.rangeHigh).toBe(22);
  });
});
