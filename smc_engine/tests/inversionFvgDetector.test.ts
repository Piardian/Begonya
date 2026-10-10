import { Candle, FVG, StructureEvent } from '../src/types';
import { detectInversionFVGs, detectBalancedPriceRanges } from '../src/inversionFvgDetector';

function dummyEvent(): StructureEvent {
  return {
    type: 'BOS',
    direction: 'bullish',
    brokenSwing: { type: 'high', price: 1.05, formedAtIndex: 0, confirmedAtIndex: 1, timestamp: 0 },
    breakCandleIndex: 1,
    breakTimestamp: 0,
    breakClosePrice: 1.05,
  };
}

describe('Inversion FVG & BPR Detector', () => {
  test('should detect Inversion FVG when a Bullish FVG is pierced and closed below', () => {
    const candles: Candle[] = [];
    for (let i = 0; i < 15; i++) {
      candles.push({ timestamp: i * 1000, open: 1.0500, high: 1.0520, low: 1.0480, close: 1.0500 });
    }

    // Bullish FVG at middle index 2: gap between candle 1.high (1.0500) and candle 3.low (1.0550)
    const bullFvg: FVG = {
      direction: 'bullish',
      gapLow: 1.0500,
      gapHigh: 1.0550,
      gapSizePips: 50,
      ratioToDisplacementCandle: 0.5,
      middleCandleIndex: 2,
      relatedEvent: dummyEvent(),
    };

    // Candle 6 aggressively closes below gapLow (close = 1.0470 < 1.0500)
    candles[6] = { timestamp: 6000, open: 1.0510, high: 1.0510, low: 1.0460, close: 1.0470 };

    // Candles 7, 9, 10 stay below 1.0500
    candles[7] = { timestamp: 7000, open: 1.0470, high: 1.0490, low: 1.0460, close: 1.0475 };
    candles[9] = { timestamp: 9000, open: 1.0480, high: 1.0495, low: 1.0460, close: 1.0470 };
    candles[10] = { timestamp: 10000, open: 1.0470, high: 1.0490, low: 1.0450, close: 1.0460 };

    // Candle 8 tests the inverted zone (high reaches 1.0520)
    candles[8] = { timestamp: 8000, open: 1.0480, high: 1.0520, low: 1.0470, close: 1.0490 };

    const ifvgs = detectInversionFVGs(candles, [bullFvg], 10);
    expect(ifvgs).toHaveLength(1);
    expect(ifvgs[0].originalDirection).toBe('bullish');
    expect(ifvgs[0].invertedDirection).toBe('bearish');
    expect(ifvgs[0].inversionCandleIndex).toBe(6);
    expect(ifvgs[0].testCount).toBe(1);
    expect(ifvgs[0].mitigated).toBe(false);
  });

  test('should detect Balanced Price Range (BPR) when Bullish and Bearish FVGs overlap', () => {
    const candles: Candle[] = [];
    for (let i = 0; i < 20; i++) {
      candles.push({ timestamp: i * 1000, open: 1.0500, high: 1.0520, low: 1.0480, close: 1.0500 });
    }

    // Bullish FVG: [1.0500, 1.0540] at index 3
    const bullFvg: FVG = {
      direction: 'bullish',
      gapLow: 1.0500,
      gapHigh: 1.0540,
      gapSizePips: 40,
      ratioToDisplacementCandle: 0.5,
      middleCandleIndex: 3,
      relatedEvent: dummyEvent(),
    };

    // Bearish FVG: [1.0520, 1.0560] at index 7 (overlaps with Bullish FVG between 1.0520 and 1.0540)
    const bearFvg: FVG = {
      direction: 'bearish',
      gapLow: 1.0520,
      gapHigh: 1.0560,
      gapSizePips: 40,
      ratioToDisplacementCandle: 0.5,
      middleCandleIndex: 7,
      relatedEvent: dummyEvent(),
    };

    const bprs = detectBalancedPriceRanges(candles, [bullFvg, bearFvg], 15);
    expect(bprs).toHaveLength(1);
    expect(bprs[0].zoneLow).toBe(1.0520);
    expect(bprs[0].zoneHigh).toBe(1.0540);
    expect(bprs[0].overlapDistance).toBeCloseTo(0.0020);
  });
});
