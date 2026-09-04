import { Candle } from '../src/types';
import { calculateHTFBias } from '../src/htfBiasCalculator';
import { calculate15mStructure } from '../src/structureCalculator';

// Helper to create basic candles
function createBaseCandles(length: number): Candle[] {
  const candles: Candle[] = [];
  for (let i = 0; i < length; i++) {
    candles.push({
      timestamp: 1000 + i * 1000,
      open: 15,
      high: 15,
      low: 15,
      close: 15,
    });
  }
  return candles;
}

function createBullishCandles(): Candle[] {
  const candles = createBaseCandles(20);
  // Low 1 at index 2 (trough = 5)
  candles[0].low = 10; candles[1].low = 8; candles[2].low = 5; candles[3].low = 7; candles[4].low = 9;
  // High 1 at index 5 (peak = 20)
  candles[3].high = 12; candles[4].high = 15; candles[5].high = 20; candles[6].high = 17; candles[7].high = 14;
  // Low 2 at index 8 (trough = 12)
  candles[6].low = 18; candles[7].low = 15; candles[8].low = 12; candles[9].low = 14; candles[10].low = 16;
  // High 2 at index 11 (peak = 25)
  candles[9].high = 18; candles[10].high = 21; candles[11].high = 25; candles[12].high = 23; candles[13].high = 20;
  return candles;
}

function createBearishCandles(): Candle[] {
  const candles = createBaseCandles(20);
  // High 1 at index 2 (peak = 25)
  candles[0].high = 15; candles[1].high = 18; candles[2].high = 25; candles[3].high = 22; candles[4].high = 20;
  // Low 1 at index 5 (trough = 10)
  candles[3].low = 18; candles[4].low = 14; candles[5].low = 10; candles[6].low = 12; candles[7].low = 15;
  // High 2 at index 8 (peak = 22, lower high)
  candles[6].high = 16; candles[7].high = 19; candles[8].high = 22; candles[9].high = 20; candles[10].high = 17;
  // Low 2 at index 11 (trough = 8, lower low)
  candles[9].low = 15; candles[10].low = 11; candles[11].low = 8; candles[12].low = 10; candles[13].low = 13;
  return candles;
}

describe('HTF Bias Calculator and 15m Structure Wrapper', () => {
  test('should return correct strength based on alignment', () => {
    // Both 4H and 1H starts as undefined due to lack of swings
    const candles4H = createBaseCandles(10);
    const candles1H = createBaseCandles(10);

    const result = calculateHTFBias(candles4H, candles1H);
    expect(result.tf4h.trend).toBe('undefined');
    expect(result.tf1h.trend).toBe('undefined');
    expect(result.aligned).toBe(false);
    expect(result.biasStrength).toBe('range');
  });

  test('should detect strong bullish bias when both 4H and 1H are bullish', () => {
    const candles4H = createBullishCandles();
    const candles1H = createBullishCandles();

    const result = calculateHTFBias(candles4H, candles1H);
    expect(result.tf4h.trend).toBe('bullish');
    expect(result.tf1h.trend).toBe('bullish');
    expect(result.aligned).toBe(true);
    expect(result.biasStrength).toBe('strong');
  });

  test('should detect weak bias when directions are different (bullish vs bearish)', () => {
    const candles4H = createBullishCandles();
    const candles1H = createBearishCandles();

    const result = calculateHTFBias(candles4H, candles1H);
    expect(result.tf4h.trend).toBe('bullish');
    expect(result.tf1h.trend).toBe('bearish');
    expect(result.aligned).toBe(false);
    expect(result.biasStrength).toBe('weak');
  });

  test('should verify 15m structure works', () => {
    const candles15m = createBaseCandles(10);
    const result = calculate15mStructure(candles15m);
    expect(result.isClosingConfirmed).toBe(true);
    expect(result.trend).toBe('undefined');
  });
});
