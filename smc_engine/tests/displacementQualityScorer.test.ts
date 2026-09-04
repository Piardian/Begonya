import { Candle, DisplacementLeg } from '../src/types';
import { scoreDisplacementQuality } from '../src/displacementQualityScorer';

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

describe('Displacement Quality Scorer', () => {
  test('should return null if there are fewer than 3 prior candles (insufficient data guard)', () => {
    const candles = createBaseCandles(5);
    const leg: DisplacementLeg = { startIndex: 2, endIndex: 3, direction: 'bullish' };
    const score = scoreDisplacementQuality(candles, leg, 'EURUSD', '15m');
    expect(score).toBeNull();
  });

  test('Kriter 1 (Body Ratio): should score strong, medium, and weak body ratios correctly', () => {
    const candles = createBaseCandles(10);
    // Prior ranges set to 20 pips (high-low = 0.0020)
    for (let i = 0; i < 5; i++) {
      candles[i] = { timestamp: i * 1000, open: 1.0500, high: 1.0510, low: 1.0490, close: 1.0500 };
    }

    // Bullish leg at index 5
    const leg: DisplacementLeg = { startIndex: 5, endIndex: 5, direction: 'bullish' };

    // Strong Body Ratio: body is 16 pips, range is 20 pips (80%) -> Score 1
    candles[5] = { timestamp: 5000, open: 1.0492, high: 1.0510, low: 1.0490, close: 1.0508 };
    let score = scoreDisplacementQuality(candles, leg, 'EURUSD', '15m');
    expect(score!.bodyRatioScore).toBe(1);

    // Medium Body Ratio: body is 12 pips, range is 20 pips (60%) -> Score 0.5
    candles[5] = { timestamp: 5000, open: 1.0494, high: 1.0510, low: 1.0490, close: 1.0506 };
    score = scoreDisplacementQuality(candles, leg, 'EURUSD', '15m');
    expect(score!.bodyRatioScore).toBe(0.5);

    // Weak Body Ratio: body is 6 pips, range is 20 pips (30%) -> Score 0
    candles[5] = { timestamp: 5000, open: 1.0497, high: 1.0510, low: 1.0490, close: 1.0503 };
    score = scoreDisplacementQuality(candles, leg, 'EURUSD', '15m');
    expect(score!.bodyRatioScore).toBe(0);
  });

  test('Kriter 2 (Consecutive Mum Count): should score based on leg length', () => {
    const candles = createBaseCandles(10);
    // 3 candles leg -> Score 1
    let leg: DisplacementLeg = { startIndex: 3, endIndex: 5, direction: 'bullish' };
    expect(scoreDisplacementQuality(candles, leg, 'EURUSD', '15m')!.consecutiveScore).toBe(1);

    // 2 candles leg -> Score 0.5
    leg = { startIndex: 3, endIndex: 4, direction: 'bullish' };
    expect(scoreDisplacementQuality(candles, leg, 'EURUSD', '15m')!.consecutiveScore).toBe(0.5);

    // 1 candle leg -> Score 0
    leg = { startIndex: 3, endIndex: 3, direction: 'bullish' };
    expect(scoreDisplacementQuality(candles, leg, 'EURUSD', '15m')!.consecutiveScore).toBe(0);
  });

  test('Kriter 3 (FVG) - Scenario A: should score 1 if a valid threshold-passing FVG exists', () => {
    const candles = createBaseCandles(10);
    // Setup candles centered on i=5 to have an 8-pip FVG
    candles[4].high = 1.0502;
    // displacement range is 20 pips, close-open body is 20 pips
    candles[5] = { timestamp: 5000, open: 1.0500, high: 1.0520, low: 1.0500, close: 1.0520 };
    candles[6].low = 1.0510;

    const leg: DisplacementLeg = { startIndex: 5, endIndex: 5, direction: 'bullish' };
    const score = scoreDisplacementQuality(candles, leg, 'EURUSD', '15m');
    expect(score!.fvgScore).toBe(1);
  });

  test('Kriter 3 (FVG) - Scenario B: should score 0.5 if raw imbalance exists but fails threshold', () => {
    const candles = createBaseCandles(10);
    // Center i=5. Setup a 3-pip raw gap (fails 5-pip threshold for EURUSD 15m)
    candles[4].high = 1.0502;
    candles[5] = { timestamp: 5000, open: 1.0500, high: 1.0520, low: 1.0500, close: 1.0520 };
    candles[6].low = 1.0505; // Gap = 3 pips

    const leg: DisplacementLeg = { startIndex: 5, endIndex: 5, direction: 'bullish' };
    const score = scoreDisplacementQuality(candles, leg, 'EURUSD', '15m');
    expect(score!.fvgScore).toBe(0.5);
  });

  test('Kriter 3 (FVG) - Scenario C: should score 0 if no imbalance exists', () => {
    const candles = createBaseCandles(10);
    const leg: DisplacementLeg = { startIndex: 5, endIndex: 5, direction: 'bullish' };
    const score = scoreDisplacementQuality(candles, leg, 'EURUSD', '15m');
    expect(score!.fvgScore).toBe(0);
  });

  test('Kriter 4 (Displacement Büyüklüğü): should score strong, medium, and weak size ratios', () => {
    const candles = createBaseCandles(10);
    // Prior ranges: 10 pips (high-low = 0.0010)
    for (let i = 0; i < 5; i++) {
      candles[i] = { timestamp: i * 1000, open: 1.0500, high: 1.0505, low: 1.0495, close: 1.0500 };
    }

    const leg: DisplacementLeg = { startIndex: 5, endIndex: 5, direction: 'bullish' };

    // Strong size: leg range = 16 pips (ratio = 1.6 >= 1.5) -> Score 1
    candles[5] = { timestamp: 5000, open: 1.0492, high: 1.0508, low: 1.0492, close: 1.0508 };
    let score = scoreDisplacementQuality(candles, leg, 'EURUSD', '15m');
    expect(score!.sizeScore).toBe(1);

    // Medium size: leg range = 12 pips (ratio = 1.2 >= 1.0) -> Score 0.5
    candles[5] = { timestamp: 5000, open: 1.0494, high: 1.0506, low: 1.0494, close: 1.0506 };
    score = scoreDisplacementQuality(candles, leg, 'EURUSD', '15m');
    expect(score!.sizeScore).toBe(0.5);

    // Weak size: leg range = 8 pips (ratio = 0.8 < 1.0) -> Score 0
    candles[5] = { timestamp: 5000, open: 1.0496, high: 1.0504, low: 1.0496, close: 1.0504 };
    score = scoreDisplacementQuality(candles, leg, 'EURUSD', '15m');
    expect(score!.sizeScore).toBe(0);
  });

  test('Quality Bands & Boundary Values: should assign correct quality grades at exact thresholds', () => {
    const candles = createBaseCandles(10);
    for (let i = 0; i < 5; i++) {
      candles[i] = { timestamp: i * 1000, open: 1.0500, high: 1.0505, low: 1.0495, close: 1.0500 };
    }

    const leg: DisplacementLeg = { startIndex: 5, endIndex: 7, direction: 'bullish' }; // consecutiveCount = 3 -> Score 1

    // Setup 1: Total = 3.5 (body = 1, consecutive = 1, size = 1, fvg = 0.5) -> güçlü (+2)
    // consecutiveCount = 3 -> Score 1
    // prior average range is 10 pips. Leg candles set to 15 pips -> ratio 1.5 -> size = 1
    // body ratio average set to 80% -> body = 1
    // raw imbalance only (no threshold FVG) -> Fvg = 0.5
    candles[4].high = 1.0502;
    for (let i = 5; i <= 7; i++) {
      candles[i] = { timestamp: i * 1000, open: 1.0492, high: 1.0507, low: 1.0492, close: 1.0505 };
    }
    candles[8].low = 1.0509; // Raw imbalance gap = 1.0509 - 1.0507 = 2 pips (< 5 pips)
    
    let result = scoreDisplacementQuality(candles, leg, 'EURUSD', '15m');
    expect(result!.totalScore).toBe(3.5);
    expect(result!.quality).toBe('güçlü');
    expect(result!.gradePoints).toBe(2);

    // Setup 2: Total = 2.5 (body = 0.5, consecutive = 1, size = 0.5, fvg = 0.5) -> orta (+1)
    // Change size to medium (range = 10 pips -> size = 0.5)
    // Change body to medium (body = 0.5)
    for (let i = 5; i <= 7; i++) {
      candles[i] = { timestamp: i * 1000, open: 1.0496, high: 1.0505, low: 1.0495, close: 1.0502 }; // body 60%
    }
    result = scoreDisplacementQuality(candles, leg, 'EURUSD', '15m');
    expect(result!.totalScore).toBe(2.5);
    expect(result!.quality).toBe('orta');
    expect(result!.gradePoints).toBe(1);

    // Setup 3: Total = 1.5 (body = 0, consecutive = 1, size = 0.5, fvg = 0) -> zayıf (0)
    // Remove raw imbalance
    candles[4].high = 1.0502; // restore to 1.0502 to avoid shrinking size score
    candles[8].low = 1.0500;  // no gap at index 7
    // body to weak
    for (let i = 5; i <= 7; i++) {
      candles[i] = { timestamp: i * 1000, open: 1.0498, high: 1.0505, low: 1.0495, close: 1.0500 }; // body 20%
    }
    result = scoreDisplacementQuality(candles, leg, 'EURUSD', '15m');
    expect(result!.totalScore).toBe(1.5);
    expect(result!.quality).toBe('zayıf');
    expect(result!.gradePoints).toBe(0);

    // Setup 4: Total = 1.0 (body = 0, consecutive = 0.5, size = 0.5, fvg = 0) -> yok (-2)
    const leg2: DisplacementLeg = { startIndex: 5, endIndex: 6, direction: 'bullish' }; // consecutive = 0.5
    result = scoreDisplacementQuality(candles, leg2, 'EURUSD', '15m');
    expect(result!.totalScore).toBe(1.0);
    expect(result!.quality).toBe('yok');
    expect(result!.gradePoints).toBe(-2);
  });

  test('lookahead bias simulation for displacement quality scorer', () => {
    const candles = createBaseCandles(20);
    for (let i = 0; i < 5; i++) {
      candles[i] = { timestamp: i * 1000, open: 1.0500, high: 1.0505, low: 1.0495, close: 1.0500 };
    }
    const leg: DisplacementLeg = { startIndex: 5, endIndex: 7, direction: 'bullish' };
    
    // Batch run
    const batchRes = scoreDisplacementQuality(candles, leg, 'EURUSD', '15m');

    // Simulation run (step-by-step)
    let simRes: any = null;
    for (let t = 1; t <= candles.length; t++) {
      const sliceCandles = candles.slice(0, t);
      // Leg is fully formed at t = 8 (index 7 is present)
      if (t >= 8) {
        simRes = scoreDisplacementQuality(sliceCandles, leg, 'EURUSD', '15m');
      }
    }

    expect(simRes).not.toBeNull();
    expect(simRes).toMatchObject(batchRes!);
  });
});
