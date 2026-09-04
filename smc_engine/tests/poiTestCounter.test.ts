import { Candle } from '../src/types';
import { countPOITests } from '../src/poiTestCounter';

function createBaseCandles(length: number): Candle[] {
  const candles: Candle[] = [];
  for (let i = 0; i < length; i++) {
    candles.push({
      timestamp: 1000 * i,
      open: 1.0500,
      high: 1.0510,
      low: 1.0490,
      close: 1.0500,
    });
  }
  return candles;
}

describe('POI Test Counter', () => {
  // Setup zone: High = 1.0600, Low = 1.0580.
  // Zone available from index 4.

  test('should return 0 testCount and false touching if price has never reached the zone', () => {
    const candles = createBaseCandles(10);
    const result = countPOITests(candles, 1.0600, 1.0580, 4, 9);
    expect(result.testCount).toBe(0);
    expect(result.isCurrentlyTouching).toBe(false);
  });

  test('should register a single touch and correct touched state', () => {
    const candles = createBaseCandles(10);
    // Candle 6 touches the zone
    candles[6].high = 1.0590;
    candles[6].low = 1.0585;

    let result = countPOITests(candles, 1.0600, 1.0580, 4, 6);
    expect(result.testCount).toBe(1);
    expect(result.isCurrentlyTouching).toBe(true);

    // Candle 7 moves away
    result = countPOITests(candles, 1.0600, 1.0580, 4, 7);
    expect(result.testCount).toBe(1);
    expect(result.isCurrentlyTouching).toBe(false);
  });

  test('should deduplicate multiple consecutive touches (price lingering in zone)', () => {
    const candles = createBaseCandles(10);
    // Candles 5, 6, 7 all linger inside the zone
    candles[5].high = 1.0590; candles[5].low = 1.0580;
    // Flat or small move
    candles[6].high = 1.0592; candles[6].low = 1.0582;
    candles[7].high = 1.0588; candles[7].low = 1.0581;

    const result = countPOITests(candles, 1.0600, 1.0580, 4, 9);
    expect(result.testCount).toBe(1);
  });

  test('should count multiple separate test entries/exits', () => {
    const candles = createBaseCandles(15);
    // Touch 1 at index 5
    candles[5].high = 1.0590; candles[5].low = 1.0585;
    // Exits index 6
    candles[6].high = 1.0510; candles[6].low = 1.0490;
    // Touch 2 at index 7
    candles[7].high = 1.0590; candles[7].low = 1.0585;
    // Exits index 8, 9
    candles[8].high = 1.0510; candles[9].high = 1.0510;
    // Touch 3 at index 10
    candles[10].high = 1.0590; candles[10].low = 1.0585;

    const result = countPOITests(candles, 1.0600, 1.0580, 4, 12);
    expect(result.testCount).toBe(3);
  });

  test('should ignore touches that occur before zoneAvailableFromIndex', () => {
    const candles = createBaseCandles(10);
    // Touch at index 2 (before index 4, e.g. during leg formation)
    candles[2].high = 1.0590;
    candles[2].low = 1.0585;

    // Touch at index 6 (valid)
    candles[6].high = 1.0590;
    candles[6].low = 1.0585;

    const result = countPOITests(candles, 1.0600, 1.0580, 4, 9);
    // Index 2 is ignored, so testCount should be 1, not 2
    expect(result.testCount).toBe(1);
  });

  test('lookahead bias simulation for POI test counter', () => {
    const candles = createBaseCandles(20);
    // Setup touches
    candles[5].high = 1.0590; candles[5].low = 1.0585;
    candles[6].high = 1.0510;
    candles[7].high = 1.0590; candles[7].low = 1.0585;

    const zoneHigh = 1.0600;
    const zoneLow = 1.0580;
    const availableIndex = 4;

    // Batch run
    const batchResults = candles.map((_, idx) => countPOITests(candles, zoneHigh, zoneLow, availableIndex, idx));

    // Simulation run (step-by-step)
    const simulatedResults: any[] = [];
    for (let t = 1; t <= candles.length; t++) {
      const sliceCandles = candles.slice(0, t);
      const res = countPOITests(sliceCandles, zoneHigh, zoneLow, availableIndex, t - 1);
      simulatedResults.push(res);
    }

    expect(simulatedResults).toHaveLength(batchResults.length);
    for (let i = 0; i < batchResults.length; i++) {
      expect(simulatedResults[i]).toMatchObject(batchResults[i]);
    }
  });
});
