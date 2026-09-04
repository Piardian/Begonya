import { Candle } from '../src/types';
import { detectSwings } from '../src/swingDetector';
import { detectStructure } from '../src/structureDetector';

// Helper to create basic candles
function createBaseCandles(length: number): Candle[] {
  const candles: Candle[] = [];
  for (let i = 0; i < length; i++) {
    candles.push({
      timestamp: 1000 + i * 1000,
      open: 10,
      high: 10,
      low: 10,
      close: 10,
    });
  }
  return candles;
}

describe('Lookahead Bias Simulation Test', () => {
  test('should yield identical results in batch mode vs step-by-step real-time simulation', () => {
    // 1. Create a complex series of candles with multiple swings, BOS, and CHoCH
    const candles = createBaseCandles(30);

    // Setup swings:
    // Low 1 (i=2): price=5 (confirmed i=4)
    candles[0].low = 10;
    candles[1].low = 8;
    candles[2].low = 5; // Swing low
    candles[3].low = 7;
    candles[4].low = 9;

    // High 1 (i=5): price=20 (confirmed i=7)
    candles[3].high = 12;
    candles[4].high = 15;
    candles[5].high = 20; // Swing high
    candles[6].high = 17;
    candles[7].high = 14;

    // Low 2 (i=8): price=7 (confirmed i=10)
    candles[6].low = 12;
    candles[7].low = 10;
    candles[8].low = 7; // Swing low (higher low)
    candles[9].low = 11;
    candles[10].low = 13;

    // High 2 (i=11): price=25 (confirmed i=13)
    candles[9].high = 16;
    candles[10].high = 21;
    candles[11].high = 25; // Swing high (higher high)
    candles[12].high = 22;
    candles[13].high = 19;

    // Bullish Trend confirmed at index 13!
    // BOS test: close above 25 at index 15
    candles[15].close = 28;

    // Low 3 (i=16): price=9 (confirmed i=18)
    candles[14].low = 15;
    candles[15].low = 12;
    candles[16].low = 9; // Swing low
    candles[17].low = 11;
    candles[18].low = 14;

    // CHoCH test: close below 9 at index 20
    candles[20].close = 6;

    // 2. Batch Mode calculations
    const batchSwings = detectSwings(candles);
    const batchResult = detectStructure(candles, batchSwings);

    // 3. Real-time Simulation Mode:
    // Feed candles one by one, recalculating at each step.
    // The state and events at the final step MUST match the batch mode results.
    let simulatedTrend = 'undefined';
    let simulatedEventsLength = 0;

    for (let t = 1; t <= candles.length; t++) {
      const slice = candles.slice(0, t);
      const sliceSwings = detectSwings(slice);
      const sliceResult = detectStructure(slice, sliceSwings);

      simulatedTrend = sliceResult.currentTrend;
      simulatedEventsLength = sliceResult.events.length;

      // Verify that events detected so far match the prefix of the batch events
      const expectedEvents = batchResult.events.filter(e => e.breakCandleIndex < t);
      expect(sliceResult.events.length).toBe(expectedEvents.length);
      for (let i = 0; i < sliceResult.events.length; i++) {
        expect(sliceResult.events[i].type).toBe(expectedEvents[i].type);
        expect(sliceResult.events[i].breakCandleIndex).toBe(expectedEvents[i].breakCandleIndex);
      }
    }

    // Final checks
    expect(simulatedTrend).toBe(batchResult.currentTrend);
    expect(simulatedEventsLength).toBe(batchResult.events.length);
    expect(batchResult.currentTrend).toBe('bearish');
    expect(batchResult.events).toHaveLength(2); // 1 BOS (bullish) and 1 CHoCH (bearish)
  });
});
