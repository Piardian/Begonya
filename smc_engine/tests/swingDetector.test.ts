import { Candle } from '../src/types';
import { detectSwings } from '../src/swingDetector';

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

describe('Swing Detector', () => {
  test('should detect swing high and swing low in 5-candle fractal', () => {
    const candles = createBaseCandles(10);
    // Create a swing high at index 4 (requires i-2, i-1, i+1, i+2 to have lower highs)
    candles[2].high = 12;
    candles[3].high = 14;
    candles[4].high = 16; // Peak
    candles[5].high = 13;
    candles[6].high = 11;

    // Create a swing low at index 7
    candles[5].low = 8;
    candles[6].low = 6;
    candles[7].low = 4; // Trough
    candles[8].low = 7;
    candles[9].low = 9;

    const swings = detectSwings(candles);

    expect(swings).toHaveLength(2);

    const highSwing = swings.find(s => s.type === 'high');
    expect(highSwing).toBeDefined();
    expect(highSwing!.price).toBe(16);
    expect(highSwing!.formedAtIndex).toBe(4);
    expect(highSwing!.confirmedAtIndex).toBe(6);

    const lowSwing = swings.find(s => s.type === 'low');
    expect(lowSwing).toBeDefined();
    expect(lowSwing!.price).toBe(4);
    expect(lowSwing!.formedAtIndex).toBe(7);
    expect(lowSwing!.confirmedAtIndex).toBe(9);
  });

  test('should NOT detect swing if highs/lows are equal (strict inequality check)', () => {
    const candles = createBaseCandles(10);
    // Flat peaks at index 4 and 5
    candles[2].high = 12;
    candles[3].high = 15;
    candles[4].high = 15; // Equal high
    candles[5].high = 15; // Equal high
    candles[6].high = 12;
    candles[7].high = 10;

    const swings = detectSwings(candles);
    expect(swings.filter(s => s.type === 'high')).toHaveLength(0);
  });

  test('should NOT detect swing low if lows are equal (strict inequality check - symmetry test)', () => {
    const candles = createBaseCandles(10);
    // Flat troughs at index 4 and 5
    candles[2].low = 8;
    candles[3].low = 5;
    candles[4].low = 5; // Equal low
    candles[5].low = 5; // Equal low
    candles[6].low = 8;
    candles[7].low = 10;

    const swings = detectSwings(candles);
    expect(swings.filter(s => s.type === 'low')).toHaveLength(0);
  });
});
