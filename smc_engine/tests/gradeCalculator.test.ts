import { Candle, SwingPoint, StructureState, StructureEvent } from '../src/types';
import { calculateGrade, scoreHTFBiasPD, scoreDisplacement, scoreStructure, scoreSweep, scorePOIQuality, GradeInput } from '../src/gradeCalculator';
import { detectSwings } from '../src/swingDetector';
import { detectStructure } from '../src/structureDetector';
import { detectSweeps } from '../src/sweepDetector';
import { determineModel } from '../src/modelDeterminer';
import { calculatePremiumDiscount } from '../src/premiumDiscountCalculator';
import { findDisplacementLeg } from '../src/displacementLeg';
import { scoreDisplacementQuality } from '../src/displacementQualityScorer';

describe('Grade Calculator - Sub-Scoring Helpers', () => {
  test('scoreHTFBiasPD branches', () => {
    // 1. Range/Undefined 4H -> score 0
    expect(scoreHTFBiasPD('range', { status: 'premium', fibValue: 0.8, rangeHigh: 100, rangeLow: 50 }, 'bullish', 'long')).toEqual({ score: 0, isEQBlocked: false });
    
    // 2. Counter-trend -> score -2
    expect(scoreHTFBiasPD('bullish', { status: 'premium', fibValue: 0.8, rangeHigh: 100, rangeLow: 50 }, 'bullish', 'short')).toEqual({ score: -2, isEQBlocked: false });

    // 3. EQ -> score 1 (-1 penalty vs discount score 2), isEQBlocked: false
    expect(scoreHTFBiasPD('bullish', { status: 'eq', fibValue: 0.5, rangeHigh: 100, rangeLow: 50 }, 'bullish', 'long')).toEqual({ score: 1, isEQBlocked: false });

    // 4. Undefined PD status -> score 0, EQBlocked: false
    expect(scoreHTFBiasPD('bullish', { status: 'undefined', fibValue: null, rangeHigh: null, rangeLow: null }, 'bullish', 'long')).toEqual({ score: 0, isEQBlocked: false });

    // 5. Correct PD -> score 2 (long + discount, no 1H mismatch)
    expect(scoreHTFBiasPD('bullish', { status: 'discount', fibValue: 0.2, rangeHigh: 100, rangeLow: 50 }, 'bullish', 'long')).toEqual({ score: 2, isEQBlocked: false });

    // 6. Incorrect PD -> score 1 (long + premium, no 1H mismatch)
    expect(scoreHTFBiasPD('bullish', { status: 'premium', fibValue: 0.8, rangeHigh: 100, rangeLow: 50 }, 'bullish', 'long')).toEqual({ score: 1, isEQBlocked: false });

    // 7. 1H Penalty (-1 penalty stacked)
    // base score (correct PD) = 2. 1H is bearish (mismatch) -> final score = 1
    expect(scoreHTFBiasPD('bullish', { status: 'discount', fibValue: 0.2, rangeHigh: 100, rangeLow: 50 }, 'bearish', 'long')).toEqual({ score: 1, isEQBlocked: false });
  });

  test('scoreDisplacement branches', () => {
    expect(scoreDisplacement(null)).toBe(-2);
    expect(scoreDisplacement({ legDirection: 'bullish', bodyRatioScore: 1, consecutiveScore: 1, fvgScore: 1, sizeScore: 1, totalScore: 4, quality: 'güçlü', gradePoints: 2 })).toBe(2);
  });

  test('scoreStructure branches', () => {
    // 1. No event -> -2
    expect(scoreStructure(false, null)).toBe(-2);
    // 2. Event + null quality -> 0
    expect(scoreStructure(true, null)).toBe(0);
    // 3. Event + quality: güçlü -> 2, orta -> 1, zayıf/yok -> 0
    const dq = (quality: 'güçlü' | 'orta' | 'zayıf' | 'yok') => ({
      legDirection: 'bullish' as const, bodyRatioScore: 1, consecutiveScore: 1, fvgScore: 1, sizeScore: 1, totalScore: 4, quality, gradePoints: 1 as any
    });
    expect(scoreStructure(true, dq('güçlü'))).toBe(2);
    expect(scoreStructure(true, dq('orta'))).toBe(1);
    expect(scoreStructure(true, dq('zayıf'))).toBe(0);
    expect(scoreStructure(true, dq('yok'))).toBe(0);
  });

  test('scoreSweep branches', () => {
    // 1. Model 1 + POI tested -> 2
    expect(scoreSweep({ model: 'model1_reversal', regime: 'range', triggeringSweep: {} as any, triggeringBOS: null }, { testCount: 1, isCurrentlyTouching: true })).toBe(2);
    // 2. Model 1 + POI untested -> 0
    expect(scoreSweep({ model: 'model1_reversal', regime: 'range', triggeringSweep: {} as any, triggeringBOS: null }, null)).toBe(0);
    // 3. Model 2 -> 2
    expect(scoreSweep({ model: 'model2_continuation', regime: 'bullish', triggeringSweep: null, triggeringBOS: {} as any }, null)).toBe(2);
    // 4. None -> -2
    expect(scoreSweep({ model: 'none', regime: 'undefined', triggeringSweep: null, triggeringBOS: null }, null)).toBe(-2);
  });

  test('scorePOIQuality branches', () => {
    const pd = (status: 'premium' | 'discount' | 'eq') => ({ status, fibValue: 0.5, rangeHigh: 100, rangeLow: 50 });
    // 1. 3+ tests -> -2
    expect(scorePOIQuality('15m', 3, pd('eq'), 'long')).toBe(-2);
    // 2. fresh POI + correct zone -> 1
    expect(scorePOIQuality('15m', 0, pd('discount'), 'long')).toBe(1);
    // 3. fresh POI + incorrect zone -> 0
    expect(scorePOIQuality('15m', 0, pd('premium'), 'long')).toBe(0);
    // 4. 1 test -> 0
    expect(scorePOIQuality('15m', 1, pd('discount'), 'long')).toBe(0);
    // 5. 2 tests -> -1 penalty
    expect(scorePOIQuality('15m', 2, pd('discount'), 'long')).toBe(-1);
  });
});

describe('Grade Calculator - Core Grading & Blocks', () => {
  const dummyInput = (): GradeInput => ({
    tradeDirection: 'long',
    bias4H: 'bullish',
    pd4H: { status: 'discount', fibValue: 0.2, rangeHigh: 100, rangeLow: 50 },
    bias1H: 'bullish',
    has15mEvent: true,
    displacementQuality15m: {
      legDirection: 'bullish',
      bodyRatioScore: 1,
      consecutiveScore: 1,
      fvgScore: 1,
      sizeScore: 1,
      totalScore: 4,
      quality: 'güçlü',
      gradePoints: 2
    },
    modelState: { model: 'model2_continuation', regime: 'bullish', triggeringSweep: null, triggeringBOS: {} as any },
    poiTestResultForSweep: null,
    poiTimeframe: '15m',
    poiTestCount: 0,
    pd1H: { status: 'discount', fibValue: 0.2, rangeHigh: 100, rangeLow: 50 }
  });

  test('should classify grade bands and check boundaries correctly', () => {
    // Base scores: htf=2, disp=2, struct=2, sweep=2, poi=1 -> Total = 9 (A+)
    const input = dummyInput();
    let result = calculateGrade(input);
    expect(result.totalScore).toBe(9);
    expect(result.grade).toBe('A+');
    expect(result.entryAllowed).toBe(true);

    // Exact Score = 7 -> A
    // Set poi to wrong zone (score becomes 0) -> Total = 8
    // Set displacement quality to orta (gradePoints=1, score=1) -> Total = 7
    input.pd1H.status = 'premium'; // poi = 0
    input.displacementQuality15m!.gradePoints = 1; // disp = 1
    // Keep quality as 'güçlü' so struct remains 2. Total score = 2 + 1 + 2 + 2 + 0 = 7
    result = calculateGrade(input);
    expect(result.totalScore).toBe(7);
    expect(result.grade).toBe('A');
    expect(result.entryAllowed).toBe(true);

    // Exact Score = 5 -> B+
    // Set sweep to model: none (-2) -> sweepScore reduces from 2 to -2 (Total = 3).
    // Let's set displacement quality to zayıf (gradePoints=0, quality='zayıf' -> struct=0). Total becomes 5.
    const inputA = dummyInput();
    inputA.pd1H.status = 'premium'; // poi = 0
    inputA.displacementQuality15m!.gradePoints = 0; // disp = 0
    inputA.displacementQuality15m!.quality = 'zayıf'; // struct = 0
    // HTF=2, disp=0, struct=0, sweep=2, poi=0 -> Total = 4. Let's make htf=2, sweep=2, poi=1 -> Total = 5.
    inputA.pd1H.status = 'discount'; // poi = 1
    result = calculateGrade(inputA);
    expect(result.totalScore).toBe(5);
    expect(result.grade).toBe('B+');
    expect(result.entryAllowed).toBe(false);

    // Exact Score = 3 -> B
    // HTF=1 (wrong pd), disp=0, struct=0, sweep=2, poi=0 -> Total = 3
    const inputBPlus = dummyInput();
    inputBPlus.pd4H.status = 'premium'; // htf = 1
    inputBPlus.displacementQuality15m!.gradePoints = 0; // disp = 0
    inputBPlus.displacementQuality15m!.quality = 'zayıf'; // struct = 0
    inputBPlus.pd1H.status = 'premium'; // poi = 0
    result = calculateGrade(inputBPlus);
    expect(result.totalScore).toBe(3);
    expect(result.grade).toBe('B');
    expect(result.entryAllowed).toBe(false);

    // Exact Score = 1 -> C (entry not allowed)
    // HTF=0 (range 4h), disp=0, struct=0, sweep=2, poi=-1 (2 tests) -> Total = 1
    const inputB = dummyInput();
    inputB.bias4H = 'range'; // htf = 0
    inputB.displacementQuality15m!.gradePoints = 0; // disp = 0
    inputB.displacementQuality15m!.quality = 'zayıf'; // struct = 0
    inputB.poiTestCount = 2; // poi = -1
    result = calculateGrade(inputB);
    expect(result.totalScore).toBe(1);
    expect(result.grade).toBe('C');
    expect(result.entryAllowed).toBe(false);

    // Score < 1 -> C
    // HTF=-2 (counter trend), disp=-2 (null), struct=-2 (no event), sweep=-2 (none), poi=0 -> Total = -8
    const inputC = dummyInput();
    inputC.tradeDirection = 'short'; // counter-trend -> htf = -1
    inputC.displacementQuality15m = null; // disp = -2, struct = 0 (wait, has15mEvent=true, dq=null -> struct = 0)
    inputC.has15mEvent = false; // struct = -2
    inputC.modelState.model = 'none'; // sweep = -2
    inputC.poiTestCount = 1; // poi = 0
    result = calculateGrade(inputC);
    expect(result.totalScore).toBe(-8);
    expect(result.grade).toBe('C');
    expect(result.entryAllowed).toBe(false);
  });

  test('should override entryAllowed to false on critical block conditions', () => {
    // Scenario 1: Direct Opposite 4H PD Blocked
    const inputOpposite = dummyInput();
    inputOpposite.pd4H.status = 'premium'; // Long in premium
    let result = calculateGrade(inputOpposite);
    expect(result.entryAllowed).toBe(false);
    expect(result.blockReasons).toContain('4H premium/discount context conflicts with the trade');

    // Scenario 1.1: 4H EQ caps A+ to A
    const inputEQ = dummyInput();
    inputEQ.pd4H.status = 'eq';
    result = calculateGrade(inputEQ);
    expect(result.totalScore).toBe(8); // 1 + 2 + 2 + 2 + 1 = 8
    expect(result.grade).toBe('A'); // Capped at A by equilibrium rule
    expect(result.entryAllowed).toBe(true);

    // Scenario 2: POI 3+ tests remain blocked by one POI-integrity decision.
    const inputPOI = dummyInput();
    inputPOI.poiTestCount = 3;
    result = calculateGrade(inputPOI);
    expect(result.entryAllowed).toBe(false);
    expect(result.blockReasons).toContain('POI integrity is below the minimum entry standard');
    expect(result.poiIntegrity).toEqual({
      decision: 'FAIL',
      contributingReasons: ['QUALITY_BELOW_MINIMUM', 'TEST_COUNT_GTE_3'],
    });
  });

  test('normalizes POI quality and test-count evidence into one integrity veto', () => {
    const fresh = calculateGrade(dummyInput());
    expect(fresh.poiIntegrity).toEqual({ decision: 'PASS', contributingReasons: [] });
    expect(fresh.blockReasons.some(reason => reason.includes('POI integrity'))).toBe(false);

    const twoTestsInput = dummyInput();
    twoTestsInput.poiTestCount = 2;
    const twoTests = calculateGrade(twoTestsInput);
    expect(twoTests.poiIntegrity).toEqual({ decision: 'PASS', contributingReasons: [] });
    expect(twoTests.breakdown.poiQuality).toBe(-1); // -1 penalty
    expect(twoTests.totalScore).toBe(7); // 9 - 2 = 7 (poi was 1, now -1)
    expect(twoTests.grade).toBe('B+'); // Capped at B+ because poiTestCount >= 2
    expect(twoTests.entryAllowed).toBe(false);

    const overTestedInput = dummyInput();
    overTestedInput.poiTestCount = 5;
    const overTested = calculateGrade(overTestedInput);
    expect(overTested.poiIntegrity).toEqual({
      decision: 'FAIL',
      contributingReasons: ['QUALITY_BELOW_MINIMUM', 'TEST_COUNT_GTE_3'],
    });
    expect(overTested.entryAllowed).toBe(false);
    expect(overTested.blockReasons.filter(reason => reason.includes('POI integrity'))).toHaveLength(1);
  });
});

describe('End-to-End Integration Verification', () => {
  // Scenario 1: Strong Bullish Continuation Setup (Expect A+)
  test('Integration Scenario 1: Strong Bullish Continuation Setup', () => {
    const candles: Candle[] = [
      { timestamp: 0, open: 100, high: 100, low: 90, close: 90 },     // index 0: Low 1
      { timestamp: 1000, open: 90, high: 120, low: 90, close: 120 },
      { timestamp: 2000, open: 120, high: 150, low: 120, close: 150 }, // index 2: High 1
      { timestamp: 3000, open: 150, high: 115, low: 105, close: 110 }, // index 3: discount zone
      { timestamp: 4000, open: 110, high: 110, low: 100, close: 100 }, // index 4: Low 2
      { timestamp: 5000, open: 100, high: 105, low: 95, close: 100 },
      { timestamp: 6000, open: 140, high: 170, low: 140, close: 170 }, // index 6: High 2 / start of leg
      { timestamp: 7000, open: 170, high: 200, low: 170, close: 200 }, // index 7: middle of leg
      { timestamp: 8000, open: 200, high: 310, low: 200, close: 310 }, // index 8: break High 2 (BOS)
    ];

    const swings: SwingPoint[] = [
      { type: 'low', price: 90, formedAtIndex: 0, confirmedAtIndex: 2, timestamp: 0 },
      { type: 'high', price: 150, formedAtIndex: 2, confirmedAtIndex: 3, timestamp: 2000 },
      { type: 'low', price: 100, formedAtIndex: 4, confirmedAtIndex: 6, timestamp: 4000 },
      { type: 'high', price: 300, formedAtIndex: 6, confirmedAtIndex: 8, timestamp: 6000 }, // Swing high used for BOS
    ];

    // Generate structures and models
    const structureState = detectStructure(candles, swings);
    const rangeStates = candles.map(() => ({ isRange: false, rangeHigh: null, rangeLow: null, regimeStartIndex: null }));
    const sweeps = detectSweeps(candles, rangeStates, 'EURUSD', '15m');
    const modelState = determineModel(structureState, sweeps, 8);

    // Calculate PD state using real module
    const pdReal = calculatePremiumDiscount(candles, swings, 3);

    // Calculate displacement quality
    const event = structureState.events[0];
    const leg = findDisplacementLeg(candles, event);
    const dq = scoreDisplacementQuality(candles, leg, 'EURUSD', '15m');

    // Build GradeInput with the real values
    const gradeInput: GradeInput = {
      tradeDirection: 'long',
      bias4H: 'bullish',
      pd4H: pdReal,
      bias1H: 'bullish',
      has15mEvent: true,
      displacementQuality15m: dq,
      modelState,
      poiTestResultForSweep: null,
      poiTimeframe: '15m',
      poiTestCount: 0,
      pd1H: pdReal
    };

    const result = calculateGrade(gradeInput);
    expect(result.grade).toBe('A+');
    expect(result.entryAllowed).toBe(true);
  });

  // Scenario 2: Weak Setup / Counter Trend (Expect C)
  test('Integration Scenario 2: Weak Setup / Counter Trend', () => {
    const candles: Candle[] = [
      { timestamp: 0, open: 100, high: 100, low: 90, close: 90 },     // index 0
      { timestamp: 1000, open: 90, high: 120, low: 90, close: 120 },
      { timestamp: 2000, open: 120, high: 150, low: 120, close: 150 }, // index 2
    ];

    const swings: SwingPoint[] = [
      { type: 'low', price: 90, formedAtIndex: 0, confirmedAtIndex: 2, timestamp: 0 },
    ];

    // Calculate PD state using real module (returns undefined since we only have 1 swing)
    const pdReal = calculatePremiumDiscount(candles, swings, 2);

    // Build GradeInput with the real values
    const gradeInput: GradeInput = {
      tradeDirection: 'short', // Counter-trend (Short vs Bullish HTF bias)
      bias4H: 'bullish',
      pd4H: pdReal,
      bias1H: 'bearish',
      has15mEvent: false, // No structure event
      displacementQuality15m: null,
      modelState: { model: 'none', regime: 'bullish', triggeringSweep: null, triggeringBOS: null },
      poiTestResultForSweep: null,
      poiTimeframe: '15m',
      poiTestCount: 4, // Too many tests -> Blocked + penalty
      pd1H: pdReal
    };

    const result = calculateGrade(gradeInput);
    expect(result.grade).toBe('C');
    expect(result.entryAllowed).toBe(false);
  });
});
