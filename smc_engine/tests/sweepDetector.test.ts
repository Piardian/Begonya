import { Candle } from '../src/types';
import { RangeState } from '../src/rangeCalculator';
import { detectSweeps } from '../src/sweepDetector';

// Helper to create basic candles
function createBaseCandles(length: number): Candle[] {
  const candles: Candle[] = [];
  for (let i = 0; i < length; i++) {
    candles.push({
      timestamp: 1000 * i,
      open: 1.0500,
      high: 1.0500,
      low: 1.0500,
      close: 1.0500,
    });
  }
  return candles;
}

describe('Sweep Detector', () => {
  test('should detect sweeps correctly with pip thresholds and duplicate prevention', () => {
    // EURUSD 15m threshold is 5 pips (0.0005)
    // Range high = 1.0600, Range low = 1.0400
    const candles = createBaseCandles(10);
    const rangeStates: RangeState[] = [];
    for (let i = 0; i < 10; i++) {
      rangeStates.push({
        isRange: true,
        rangeHigh: 1.0600,
        rangeLow: 1.0400,
        regimeStartIndex: 0,
      });
    }

    // Candle 2: low goes to 1.0397 (3 pips penetration, less than 5 pips) -> NO sweep
    candles[2].low = 1.0397;

    // Candle 3: low goes to 1.0392 (8 pips penetration) -> Sweep Low
    candles[3].low = 1.0392;

    // Candle 4: low goes to 1.0390 (10 pips penetration on same level) -> NO sweep (duplicate prevention)
    candles[4].low = 1.0390;

    // Candle 5: high goes to 1.0608 (8 pips penetration) -> Sweep High
    candles[5].high = 1.0608;

    const events = detectSweeps(candles, rangeStates, 'EURUSD', '15m');

    expect(events).toHaveLength(2);

    expect(events[0]).toMatchObject({
      type: 'sweep_low',
      sweptLevel: 1.0400,
      wickPrice: 1.0392,
      candleIndex: 3,
    });
    expect(events[0].penetrationDistance).toBeCloseTo(8);

    expect(events[1]).toMatchObject({
      type: 'sweep_high',
      sweptLevel: 1.0600,
      wickPrice: 1.0608,
      candleIndex: 5,
    });
    expect(events[1].penetrationDistance).toBeCloseTo(8);
  });

  test('should allow new sweep if range boundary updates', () => {
    const candles = createBaseCandles(5);
    const rangeStates: RangeState[] = [
      { isRange: true, rangeHigh: 1.0600, rangeLow: 1.0400, regimeStartIndex: 0 },
      { isRange: true, rangeHigh: 1.0600, rangeLow: 1.0400, regimeStartIndex: 0 },
      { isRange: true, rangeHigh: 1.0600, rangeLow: 1.0400, regimeStartIndex: 0 },
      // Range low updates to 1.0300
      { isRange: true, rangeHigh: 1.0600, rangeLow: 1.0300, regimeStartIndex: 0 },
      { isRange: true, rangeHigh: 1.0600, rangeLow: 1.0300, regimeStartIndex: 0 },
    ];

    // Sweep first low level (1.0400)
    candles[1].low = 1.0390; // sweep

    // Sweep second updated low level (1.0300)
    candles[4].low = 1.0290; // new sweep

    const events = detectSweeps(candles, rangeStates, 'EURUSD', '15m');
    expect(events).toHaveLength(2);
    expect(events[0].sweptLevel).toBe(1.0400);
    expect(events[1].sweptLevel).toBe(1.0300);
  });

  test('lookahead bias simulation test for sweeps', () => {
    const candles = createBaseCandles(10);
    const rangeStates: RangeState[] = [];
    for (let i = 0; i < 10; i++) {
      rangeStates.push({
        isRange: true,
        rangeHigh: 1.0600,
        rangeLow: 1.0400,
        regimeStartIndex: 0,
      });
    }

    candles[3].low = 1.0390; // sweep low
    candles[7].high = 1.0610; // sweep high

    // Batch mode
    const batchEvents = detectSweeps(candles, rangeStates, 'EURUSD', '15m');

    // Simulation mode
    const simEvents: any[] = [];
    for (let t = 1; t <= candles.length; t++) {
      const sliceCandles = candles.slice(0, t);
      const sliceRangeStates = rangeStates.slice(0, t);
      const sliceEvents = detectSweeps(sliceCandles, sliceRangeStates, 'EURUSD', '15m');

      // The last element of sliceEvents should match what was detected so far
      if (sliceEvents.length > simEvents.length) {
        simEvents.push(sliceEvents[sliceEvents.length - 1]);
      }
    }

    expect(simEvents).toHaveLength(batchEvents.length);
    for (let i = 0; i < batchEvents.length; i++) {
      expect(simEvents[i]).toMatchObject(batchEvents[i]);
    }
  });
});
