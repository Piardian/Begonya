import { Candle, StructureEvent, DisplacementLeg } from '../src/types';
import { detectFVGsInLeg } from '../src/fvgDetector';

describe('FVG Detector', () => {
  const dummyEvent = (idx: number, direction: 'bullish' | 'bearish'): StructureEvent => ({
    type: 'BOS',
    direction,
    brokenSwing: { type: 'high', price: 10, formedAtIndex: 0, confirmedAtIndex: 2, timestamp: 0 },
    breakCandleIndex: idx,
    breakTimestamp: 1000 * idx,
    breakClosePrice: 15,
  });

  test('should detect valid FVG when both absolute and proportional thresholds are passed', () => {
    const candles: Candle[] = [
      { timestamp: 0, open: 1.0500, high: 1.0502, low: 1.0498, close: 1.0500 }, // i=0
      { timestamp: 1000, open: 1.0500, high: 1.0520, low: 1.0500, close: 1.0520 }, // i=1 (displacement, range=20 pips)
      { timestamp: 2000, open: 1.0520, high: 1.0530, low: 1.0510, close: 1.0525 }, // i=2 (break)
    ];

    const event = dummyEvent(2, 'bullish');
    const leg: DisplacementLeg = { startIndex: 1, endIndex: 2, direction: 'bullish' };
    const fvgs = detectFVGsInLeg(candles, leg, 'EURUSD', '15m', event);

    // Gap: 1.0510 - 1.0502 = 0.0008 (8 pips). 
    // Absolute limit = 5 pips. Proportional limit = 20 * 0.25 = 5 pips.
    // 8 pips passes both.
    expect(fvgs).toHaveLength(1);
    expect(fvgs[0].gapSizePips).toBeCloseTo(8);
  });

  test('should reject FVG if it only passes absolute pip threshold but fails proportional ratio', () => {
    const candles: Candle[] = [
      { timestamp: 0, open: 1.0500, high: 1.0502, low: 1.0498, close: 1.0500 }, // i=0
      { timestamp: 1000, open: 1.0500, high: 1.0550, low: 1.0500, close: 1.0550 }, // i=1 (displacement, range=50 pips)
      { timestamp: 2000, open: 1.0550, high: 1.0560, low: 1.0510, close: 1.0555 }, // i=2 (break)
    ];

    const event = dummyEvent(2, 'bullish');
    const leg: DisplacementLeg = { startIndex: 1, endIndex: 2, direction: 'bullish' };
    const fvgs = detectFVGsInLeg(candles, leg, 'EURUSD', '15m', event);

    // Gap: 1.0510 - 1.0502 = 0.0008 (8 pips).
    // Absolute limit = 5 pips (pass).
    // Proportional limit = 50 * 0.25 = 12.5 pips (fail).
    expect(fvgs).toHaveLength(0);
  });

  test('should reject FVG if it only passes proportional ratio but fails absolute pip threshold', () => {
    const candles: Candle[] = [
      { timestamp: 0, open: 1.0500, high: 1.0502, low: 1.0498, close: 1.0500 }, // i=0
      { timestamp: 1000, open: 1.0500, high: 1.0510, low: 1.0500, close: 1.0510 }, // i=1 (displacement, range=10 pips)
      { timestamp: 2000, open: 1.0510, high: 1.0520, low: 1.0506, close: 1.0515 }, // i=2 (break)
    ];

    const event = dummyEvent(2, 'bullish');
    const leg: DisplacementLeg = { startIndex: 1, endIndex: 2, direction: 'bullish' };
    const fvgs = detectFVGsInLeg(candles, leg, 'EURUSD', '15m', event);

    // Gap: 1.0506 - 1.0502 = 0.0004 (4 pips).
    // Absolute limit = 5 pips (fail).
    // Proportional limit = 10 * 0.25 = 2.5 pips (pass).
    expect(fvgs).toHaveLength(0);
  });

  test('should detect multiple FVGs in one leg', () => {
    const candles: Candle[] = [
      { timestamp: 0, open: 1.0500, high: 1.0500, low: 1.0500, close: 1.0500 }, // i=0
      { timestamp: 1000, open: 1.0500, high: 1.0520, low: 1.0500, close: 1.0520 }, // i=1 (displacement 1, range=20 pips)
      { timestamp: 2000, open: 1.0520, high: 1.0540, low: 1.0520, close: 1.0540 }, // i=2 (displacement 2, range=20 pips)
      { timestamp: 3000, open: 1.0540, high: 1.0560, low: 1.0535, close: 1.0550 }, // i=3 (break)
    ];

    const event = dummyEvent(3, 'bullish');
    const leg: DisplacementLeg = { startIndex: 1, endIndex: 3, direction: 'bullish' };
    const fvgs = detectFVGsInLeg(candles, leg, 'EURUSD', '15m', event);

    // Two FVGs should be detected:
    // 1. centered on i=1: gap [1.0500, 1.0520] (20 pips)
    // 2. centered on i=2: gap [1.0520, 1.0535] (15 pips)
    expect(fvgs).toHaveLength(2);
    expect(fvgs[0].middleCandleIndex).toBe(1);
    expect(fvgs[0].gapSizePips).toBeCloseTo(20);
    expect(fvgs[1].middleCandleIndex).toBe(2);
    expect(fvgs[1].gapSizePips).toBeCloseTo(15);
  });
});
