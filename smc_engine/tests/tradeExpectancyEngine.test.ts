import { calculateTradeExpectancyPlan } from '../src/tradeExpectancyEngine';

describe('TradeExpectancyEngine', () => {
  it('should calculate valid long expectancy plan with smart stop buffer and 1:2.5 RR', () => {
    const plan = calculateTradeExpectancyPlan({
      symbol: 'EURUSD',
      direction: 'long',
      zoneLow: 1.1000,
      zoneHigh: 1.1020,
      currentPrice: 1.1010,
      grade: 'A+',
      totalScore: 90,
      atr15mPips: 15,
    });

    expect(plan.direction).toBe('long');
    expect(plan.entryPrice).toBe(1.1010);
    // Buffer = max(2, 15 * 0.35) = 5.25 -> 5.3 pips = 0.00053
    expect(plan.smartStopBufferPips).toBeGreaterThanOrEqual(5.0);
    expect(plan.stopLoss).toBeLessThan(1.1000);
    expect(plan.riskDistancePips).toBeGreaterThan(10);

    // Targets
    expect(plan.tp1.rr).toBe(1.5);
    expect(plan.tp1.price).toBeGreaterThan(plan.entryPrice);
    expect(plan.tp2.rr).toBeGreaterThanOrEqual(2.5);
    expect(plan.tp2.price).toBeGreaterThan(plan.tp1.price);
    expect(plan.tp3.rr).toBe(4.0);
    expect(plan.tp3.price).toBeGreaterThan(plan.tp2.price);

    // Expectancy
    expect(plan.winProbability).toBeGreaterThanOrEqual(0.55);
    expect(plan.expectedValueR).toBeGreaterThan(0.50);
    expect(plan.isAdmissible).toBe(true);
    expect(plan.rejectionReason).toBeUndefined();
  });

  it('should calculate valid short expectancy plan with smart stop buffer above zoneHigh', () => {
    const plan = calculateTradeExpectancyPlan({
      symbol: 'GBPUSD',
      direction: 'short',
      zoneLow: 1.3000,
      zoneHigh: 1.3025,
      currentPrice: 1.3015,
      grade: 'A',
      totalScore: 82,
      atr15mPips: 20,
    });

    expect(plan.direction).toBe('short');
    expect(plan.entryPrice).toBe(1.3015);
    // Stop must be above zoneHigh (1.3025) + buffer
    expect(plan.stopLoss).toBeGreaterThan(1.3025);
    // TP prices must be below entryPrice
    expect(plan.tp1.price).toBeLessThan(plan.entryPrice);
    expect(plan.tp2.price).toBeLessThan(plan.tp1.price);
    expect(plan.tp3.price).toBeLessThan(plan.tp2.price);

    expect(plan.primaryRR).toBeGreaterThanOrEqual(2.5);
    expect(plan.isAdmissible).toBe(true);
  });

  it('should reject plan if primary RR is below minimum threshold (e.g. 2.0)', () => {
    const plan = calculateTradeExpectancyPlan({
      symbol: 'EURUSD',
      direction: 'long',
      zoneLow: 1.1000,
      zoneHigh: 1.1020,
      currentPrice: 1.1010,
      grade: 'B',
      totalScore: 60,
      minimumAcceptableRR: 3.5, // Intentionally demanding higher RR than default 2.5
    });

    expect(plan.primaryRR).toBe(2.5);
    expect(plan.isAdmissible).toBe(false);
    expect(plan.rejectionReason).toContain('Asimetrik R:R yetersiz');
  });

  it('should align TP2 with liquidity magnet if active magnet provides >= 2.0R', () => {
    // Risk is roughly (1.1010 - 1.0990) = 20 pips
    // Magnet at 60 pips away = 3.0R
    const plan = calculateTradeExpectancyPlan({
      symbol: 'EURUSD',
      direction: 'long',
      zoneLow: 1.1000,
      zoneHigh: 1.1020,
      currentPrice: 1.1010,
      grade: 'A+',
      totalScore: 92,
      atr15mPips: 10,
      liquidityMagnet: {
        type: 'EQH',
        priceLevel: 1.1055,
        pointsCount: 3,
        distancePips: 45,
        isActive: true,
        description: 'Equal Highs Liquidity Pool',
      },
    });

    expect(plan.tp2.price).toBe(1.1055);
    expect(plan.tp2.pips).toBe(45);
    expect(plan.isAdmissible).toBe(true);
  });

  it('should dynamically select nearest liquidity pool >= 2.0R when closer magnet is < 2.0R', () => {
    // Risk is (1.1010 - 1.0990) = ~20 pips. 2.0R = 40 pips.
    // Near cluster at 1.1030 (20 pips away = 1.0R)
    // Far cluster at 1.1060 (50 pips away = 2.5R)
    const swings = [
      { type: 'high' as const, price: 1.1030, formedAtIndex: 5, confirmedAtIndex: 7, timestamp: 500 },
      { type: 'high' as const, price: 1.1031, formedAtIndex: 8, confirmedAtIndex: 10, timestamp: 800 },
      { type: 'high' as const, price: 1.1060, formedAtIndex: 15, confirmedAtIndex: 17, timestamp: 1500 },
      { type: 'high' as const, price: 1.1061, formedAtIndex: 20, confirmedAtIndex: 22, timestamp: 2000 },
    ];

    const plan = calculateTradeExpectancyPlan({
      symbol: 'EURUSD',
      direction: 'long',
      zoneLow: 1.1000,
      zoneHigh: 1.1020,
      currentPrice: 1.1010,
      grade: 'A+',
      totalScore: 90,
      atr15mPips: 10,
      swings15m: swings,
    });

    // The nearest pool >= 2.0R (40 pips) must be selected (1.10605, ~50 pips)
    expect(plan.tp2.rr).toBeGreaterThanOrEqual(2.0);
    expect(plan.tp2.pips).toBeGreaterThanOrEqual(40);
    expect(plan.tp2.price).toBeCloseTo(1.10605, 3);
    expect(plan.resolvedLiquidityMagnet).toBeDefined();
    expect(plan.resolvedLiquidityMagnet?.priceLevel).toBeCloseTo(1.10605, 3);
  });

  it('should enhance win probability and risk sizing when macroEvaluation has high begonya score', () => {
    const basePlan = calculateTradeExpectancyPlan({
      symbol: 'EURUSD',
      direction: 'long',
      zoneLow: 1.1000,
      zoneHigh: 1.1020,
      currentPrice: 1.1010,
      grade: 'A',
      totalScore: 80,
    });

    const macroEnhancedPlan = calculateTradeExpectancyPlan({
      symbol: 'EURUSD',
      direction: 'long',
      zoneLow: 1.1000,
      zoneHigh: 1.1020,
      currentPrice: 1.1010,
      grade: 'A',
      totalScore: 80,
      macroEvaluation: {
        allowed: true,
        begonyaScore: 85,
        scoreTier: 'YUKSEK_GUVEN',
        macroGateMultiplier: 1.25,
        primaryRegime: 'RISK_ON',
        gateStatusMessage: 'APPROVED',
        vetoReasons: [],
      } as any,
    });

    expect(macroEnhancedPlan.winProbability).toBeGreaterThan(basePlan.winProbability);
    expect(macroEnhancedPlan.expectedValueR).toBeGreaterThan(basePlan.expectedValueR);
    expect(macroEnhancedPlan.recommendedRiskPct).toBeGreaterThanOrEqual(basePlan.recommendedRiskPct);
  });
});
