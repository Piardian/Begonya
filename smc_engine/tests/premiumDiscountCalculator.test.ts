import { Candle, SwingPoint } from '../src/types';
import { calculatePremiumDiscount } from '../src/premiumDiscountCalculator';

// Helper to create basic candles
function createBaseCandles(length: number): Candle[] {
  const candles: Candle[] = [];
  for (let i = 0; i < length; i++) {
    candles.push({
      timestamp: 1000 * i,
      open: 100,
      high: 100,
      low: 100,
      close: 100,
    });
  }
  return candles;
}

describe('Premium / Discount (Fib) Calculator', () => {
  const swings: SwingPoint[] = [
    { type: 'low', price: 100, formedAtIndex: 2, confirmedAtIndex: 4, timestamp: 2000 },
    { type: 'high', price: 200, formedAtIndex: 5, confirmedAtIndex: 7, timestamp: 5000 },
  ];

  test('should return undefined if there are not enough confirmed swings', () => {
    const candles = createBaseCandles(10);
    // At index 5, swing high (conf 7) is not confirmed yet
    const result = calculatePremiumDiscount(candles, swings, 5);
    expect(result.status).toBe('undefined');
    expect(result.fibValue).toBeNull();
  });

  test('should return undefined and guard against zero-division if rangeHigh equals rangeLow', () => {
    const candles = createBaseCandles(10);
    const flatSwings: SwingPoint[] = [
      { type: 'low', price: 150, formedAtIndex: 2, confirmedAtIndex: 4, timestamp: 2000 },
      { type: 'high', price: 150, formedAtIndex: 5, confirmedAtIndex: 7, timestamp: 5000 },
    ];
    const result = calculatePremiumDiscount(candles, flatSwings, 8);
    expect(result.status).toBe('undefined');
    expect(result.fibValue).toBeNull();
  });

  test('should return null for rangeHigh and rangeLow during zero-division to strictly follow specification', () => {
    const candles = createBaseCandles(10);
    const flatSwings: SwingPoint[] = [
      { type: 'low', price: 150, formedAtIndex: 2, confirmedAtIndex: 4, timestamp: 2000 },
      { type: 'high', price: 150, formedAtIndex: 5, confirmedAtIndex: 7, timestamp: 5000 },
    ];
    const result = calculatePremiumDiscount(candles, flatSwings, 8);
    expect(result.rangeHigh).toBeNull();
    expect(result.rangeLow).toBeNull();
  });

  test('should classify premium, discount, and eq correctly based on fib values', () => {
    const candles = createBaseCandles(10);

    // rangeLow = 100, rangeHigh = 200. Fib formula: (close - 100) / 100
    
    // Premium: close = 160 -> fibValue = 0.6 (> 0.55)
    candles[8].close = 160;
    const premiumState = calculatePremiumDiscount(candles, swings, 8);
    expect(premiumState.status).toBe('premium');
    expect(premiumState.fibValue).toBeCloseTo(0.6);

    // Discount: close = 140 -> fibValue = 0.4 (< 0.45)
    candles[8].close = 140;
    const discountState = calculatePremiumDiscount(candles, swings, 8);
    expect(discountState.status).toBe('discount');
    expect(discountState.fibValue).toBeCloseTo(0.4);

    // EQ: close = 150 -> fibValue = 0.5 (between 0.45 and 0.55)
    candles[8].close = 150;
    const eqState = calculatePremiumDiscount(candles, swings, 8);
    expect(eqState.status).toBe('eq');
    expect(eqState.fibValue).toBeCloseTo(0.5);
  });

  test('should evaluate boundary values correctly', () => {
    const candles = createBaseCandles(10);

    // Boundary: 0.45 exactly -> eq
    candles[8].close = 145;
    expect(calculatePremiumDiscount(candles, swings, 8).status).toBe('eq');

    // Boundary: 0.55 exactly -> eq
    candles[8].close = 155;
    expect(calculatePremiumDiscount(candles, swings, 8).status).toBe('eq');

    // Boundary: 0.4499 -> discount
    candles[8].close = 144.99;
    expect(calculatePremiumDiscount(candles, swings, 8).status).toBe('discount');

    // Boundary: 0.5501 -> premium
    candles[8].close = 155.01;
    expect(calculatePremiumDiscount(candles, swings, 8).status).toBe('premium');
  });

  test('lookahead bias simulation for premium/discount calculator', () => {
    const candles = createBaseCandles(20);
    // Low: 100, High: 200
    const swingsList: SwingPoint[] = [
      { type: 'low', price: 100, formedAtIndex: 2, confirmedAtIndex: 4, timestamp: 2000 },
      { type: 'high', price: 200, formedAtIndex: 5, confirmedAtIndex: 7, timestamp: 5000 },
    ];

    candles[8].close = 160;
    candles[9].close = 130;

    // Batch run
    const batchResults = candles.map((_, idx) => calculatePremiumDiscount(candles, swingsList, idx));

    // Simulation run (step-by-step)
    const simulatedResults: any[] = [];
    for (let t = 1; t <= candles.length; t++) {
      const sliceCandles = candles.slice(0, t);
      const res = calculatePremiumDiscount(sliceCandles, swingsList, t - 1);
      simulatedResults.push(res);
    }

    expect(simulatedResults).toHaveLength(batchResults.length);
    for (let i = 0; i < batchResults.length; i++) {
      expect(simulatedResults[i]).toMatchObject(batchResults[i]);
    }
  });
});
