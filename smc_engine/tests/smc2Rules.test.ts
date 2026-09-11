import { MAX_POI_AGE_MS, isDistanceExcessive } from '../server/pipeline';
import { calculateGrade, GradeInput } from '../src/gradeCalculator';
import { SetupFamilyGuard } from '../server/setupFamilyGuard';
import type { NotificationCandidate } from '../server/pipeline';

function dummyInput(): GradeInput {
  return {
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
      gradePoints: 2,
    },
    modelState: {
      model: 'model2_continuation',
      regime: 'bullish',
      triggeringSweep: { timestamp: 1000, swingIndex: 1, level: 50, type: 'low', sweepCandleIndex: 2 } as any,
      triggeringBOS: {} as any,
    },
    poiTestResultForSweep: null,
    poiTimeframe: '15m',
    poiTestCount: 0,
    pd1H: { status: 'discount', fibValue: 0.2, rangeHigh: 100, rangeLow: 50 },
    pd15M: { status: 'discount', fibValue: 0.2, rangeHigh: 100, rangeLow: 50 },
  };
}

describe('SMC Engine 2.0 Hardening Rules (Benchmark Driven)', () => {
  describe('Rule 1: 48-Hour POI TTL', () => {
    it('should define MAX_POI_AGE_MS as 48 hours exactly', () => {
      expect(MAX_POI_AGE_MS).toBe(48 * 60 * 60 * 1000);
      expect(MAX_POI_AGE_MS).toBe(172800000);
    });
  });

  describe('Rule 2: Distance Cap Filter', () => {
    beforeAll(() => {
      process.env.ENABLE_DISTANCE_FILTER = 'true';
    });
    afterAll(() => {
      delete process.env.ENABLE_DISTANCE_FILTER;
    });

    it('should block Forex pairs when distance > 35 pips', () => {
      expect(isDistanceExcessive('EURUSD', 1.0550, 1.0500, 1.0510)).toBe(true);
      expect(isDistanceExcessive('EURUSD', 1.0520, 1.0500, 1.0510)).toBe(false);
    });

    it('should block Forex JPY pairs when distance > 50 points/pips', () => {
      expect(isDistanceExcessive('CHFJPY', 192.807, 195.412, 195.508)).toBe(true);
      expect(isDistanceExcessive('CHFJPY', 193.600, 193.300, 193.400)).toBe(false);
    });

    it('should block Crypto when percentage distance > 1.5%', () => {
      expect(isDistanceExcessive('BTCUSD', 62000, 60000, 60200)).toBe(true);
      expect(isDistanceExcessive('BTCUSD', 60500, 60000, 60200)).toBe(false);
    });
  });

  describe('Rule 3: Premium / Discount Hard-Lock', () => {
    it('should cap grade at B+ and block entry when Shorting in 1H & 15M Discount', () => {
      const input = dummyInput();
      input.tradeDirection = 'short';
      input.bias4H = 'bearish';
      input.pd4H = { status: 'premium', fibValue: 0.8, rangeHigh: 100, rangeLow: 50 };
      input.bias1H = 'bearish';
      input.modelState.regime = 'bearish';
      input.displacementQuality15m!.legDirection = 'bearish';
      // Shorting while 1H is in discount and 15M is in discount
      input.pd1H = { status: 'discount', fibValue: 0.2, rangeHigh: 100, rangeLow: 50 };
      input.pd15M = { status: 'discount', fibValue: 0.2, rangeHigh: 100, rangeLow: 50 };

      const result = calculateGrade(input);
      expect(result.grade).toBe('B+');
      expect(result.entryAllowed).toBe(false);
      expect(result.blockReasons).toContain('15M and 1H intraday premium/discount context conflicts with the trade');
    });

    it('should cap grade at B+ and block entry when Longing in 1H & 15M Premium', () => {
      const input = dummyInput();
      input.tradeDirection = 'long';
      // Longing while 1H is in premium and 15M is in premium
      input.pd1H = { status: 'premium', fibValue: 0.8, rangeHigh: 100, rangeLow: 50 };
      input.pd15M = { status: 'premium', fibValue: 0.8, rangeHigh: 100, rangeLow: 50 };

      const result = calculateGrade(input);
      expect(result.grade).toBe('B+');
      expect(result.entryAllowed).toBe(false);
      expect(result.blockReasons).toContain('15M and 1H intraday premium/discount context conflicts with the trade');
    });
  });

  describe('Rule 4: Elite Grade A+ Calibration', () => {
    it('demotes Grade A+ to Grade A if 1H is in equilibrium', () => {
      const input = dummyInput();
      input.pd1H = { status: 'eq', fibValue: 0.5, rangeHigh: 100, rangeLow: 50 };
      input.pd15M = { status: 'discount', fibValue: 0.2, rangeHigh: 100, rangeLow: 50 };

      const result = calculateGrade(input);
      expect(result.grade).toBe('A');
      expect(result.entryAllowed).toBe(true);
    });

    it('awards Grade A+ (8+) when all elite conditions (0 test, güçlü, sweep, clean PD) are met', () => {
      const input = dummyInput();
      input.pd1H = { status: 'discount', fibValue: 0.2, rangeHigh: 100, rangeLow: 50 };
      input.pd15M = { status: 'discount', fibValue: 0.2, rangeHigh: 100, rangeLow: 50 };

      const result = calculateGrade(input);
      expect(result.grade).toBe('A+');
      expect(result.totalScore).toBeGreaterThanOrEqual(8);
      expect(result.entryAllowed).toBe(true);
    });
  });

  describe('Rule 5: SetupFamilyGuard Anti-Spam & Minor Score Bump Prevention', () => {
    function createMockCandidate(overrides: Partial<NotificationCandidate>): NotificationCandidate {
      const defaultEvent = {
        type: 'BOS' as const,
        direction: 'bearish' as const,
        brokenSwing: { type: 'low' as const, price: 195.0, formedAtIndex: 10, confirmedAtIndex: 12, timestamp: 1000 },
        breakCandleIndex: 15,
        breakTimestamp: 2000,
        breakClosePrice: 194.9,
      };
      return {
        symbol: 'CHFJPY',
        tradeDirection: 'short',
        poiType: 'OB',
        poi: {
          direction: 'bearish',
          candleIndex: 14,
          high: 195.50,
          low: 195.40,
          formedAtIndex: 14,
          relatedEvent: defaultEvent,
        },
        gradeResult: {
          totalScore: 6,
          grade: 'A',
          entryAllowed: true,
          blockReasons: [],
          breakdown: { htfBiasPD: 1, displacement: 2, structure: 2, sweep: 1, poiQuality: 0 },
        },
        uniqueKey: 'chfjpy_1',
        currentPrice: 192.8,
        poiFormedTimestamp: 1500,
        bias4H: 'bearish',
        bias1H: 'bearish',
        poiTestCount: 0,
        pd4H: 'premium',
        pd1H: 'eq',
        ...overrides,
      };
    }

    it('blocks minor score bump from 6 to 7 within same grade during cooldown', () => {
      const guard = new SetupFamilyGuard({ cooldownMs: 45 * 60 * 1000 });
      const now = Date.now();
      const cand1 = createMockCandidate({
        uniqueKey: 'chfjpy_cand_1',
        gradeResult: {
          totalScore: 6,
          grade: 'A',
          entryAllowed: true,
          blockReasons: [],
          breakdown: { htfBiasPD: 1, displacement: 2, structure: 2, sweep: 1, poiQuality: 0 },
        },
      });
      const firstCheck = guard.shouldAllow(cand1, now);
      expect(firstCheck.allowed).toBe(true);
      guard.recordNotification(cand1, now);

      // 5 minutes later, same impulse/zone, score bumps to 7 (Grade A) - exactly benchmark #43 & #44
      const cand2 = createMockCandidate({
        uniqueKey: 'chfjpy_cand_2',
        gradeResult: {
          totalScore: 7,
          grade: 'A',
          entryAllowed: true,
          blockReasons: [],
          breakdown: { htfBiasPD: 2, displacement: 2, structure: 2, sweep: 1, poiQuality: 0 },
        },
      });
      const secondCheck = guard.shouldAllow(cand2, now + 5 * 60 * 1000);
      expect(secondCheck.allowed).toBe(false);
      expect(secondCheck.reason).toContain('Duplicate setup family');
    });

    it('allows genuine tier upgrade from Grade A to Grade A+ during cooldown', () => {
      const guard = new SetupFamilyGuard({ cooldownMs: 45 * 60 * 1000 });
      const now = Date.now();
      const cand1 = createMockCandidate({
        uniqueKey: 'chfjpy_cand_1',
        gradeResult: {
          totalScore: 6,
          grade: 'A',
          entryAllowed: true,
          blockReasons: [],
          breakdown: { htfBiasPD: 1, displacement: 2, structure: 2, sweep: 1, poiQuality: 0 },
        },
      });
      guard.shouldAllow(cand1, now);
      guard.recordNotification(cand1, now);

      const candUpgrade = createMockCandidate({
        uniqueKey: 'chfjpy_cand_upgraded',
        gradeResult: {
          totalScore: 8,
          grade: 'A+',
          entryAllowed: true,
          blockReasons: [],
          breakdown: { htfBiasPD: 2, displacement: 2, structure: 2, sweep: 2, poiQuality: 0 },
        },
      });
      const upgradeCheck = guard.shouldAllow(candUpgrade, now + 10 * 60 * 1000);
      expect(upgradeCheck.allowed).toBe(true);
    });
  });

  describe('Rule 6: Liquidity Magnet Bonus', () => {
    it('boosts totalScore by +1 when active liquidity magnet is detected', () => {
      const input = dummyInput();
      // Base score is 8 (Grade A+). Let's make base score 7 by setting pd1H to premium (poi=0)
      input.pd1H = { status: 'premium', fibValue: 0.8, rangeHigh: 100, rangeLow: 50 };
      const beforeResult = calculateGrade(input);
      expect(beforeResult.totalScore).toBe(8);

      input.liquidityMagnet = {
        type: 'EQH',
        priceLevel: 1.0600,
        pointsCount: 2,
        distancePips: 30,
        isActive: true,
        description: 'EQH BSL Magnet',
      };
      const afterResult = calculateGrade(input);
      expect(afterResult.totalScore).toBe(9);
      expect(afterResult.liquidityMagnet).not.toBeNull();
    });
  });

  describe('Rule 7: Opposing Obstacle Protection', () => {
    it('caps grade at B+ and warns when immediate opposing obstacle is detected within 15 pips', () => {
      const input = dummyInput();
      input.opposingObstacle = {
        hasObstacle: true,
        obstacleType: 'OB',
        timeframe: '15m',
        level: { low: 1.0520, high: 1.0530 },
        distancePips: 10,
        warningText: 'Karsi Engel: 10 pip yukarida 15M Bearish OB mevcut',
      };

      const result = calculateGrade(input);
      expect(result.grade).toBe('B+');
      expect(result.entryAllowed).toBe(false);
      expect(result.blockReasons).toContain('Karsi Engel: 10 pip yukarida 15M Bearish OB mevcut');
    });
  });
});

