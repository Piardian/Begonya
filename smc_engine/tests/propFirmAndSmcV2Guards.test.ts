import { evaluateSignalValidationGate } from '../src/signalValidationGate';
import { SetupFamilyGuard } from '../server/setupFamilyGuard';
import { isRolloverSpreadWindow } from '../src/assetMetrics';
import { calculateTradeExpectancyPlan } from '../src/tradeExpectancyEngine';
import type { NotificationCandidate } from '../server/pipeline';

describe('Prop Firm & Advanced SMC Guards (3 Critical Weakness Fixes)', () => {
  function createBaseCandidate(overrides: Partial<NotificationCandidate> = {}): NotificationCandidate {
    return {
      symbol: 'EURUSD',
      tradeDirection: 'long',
      poiType: 'OB',
      poi: {
        direction: 'bullish',
        candleIndex: 10,
        high: 1.1010,
        low: 1.1000,
        formedAtIndex: 10,
        relatedEvent: {
          type: 'BOS',
          direction: 'bullish',
          brokenSwing: {} as any,
          breakCandleIndex: 12,
          breakTimestamp: 1717300000000,
          breakClosePrice: 1.1020,
        },
      } as any,
      gradeResult: {
        totalScore: 7,
        grade: 'A',
        entryAllowed: true,
        blockReasons: [],
        breakdown: {
          htfBiasPD: 2,
          displacement: 1,
          structure: 2,
          sweep: 2,
          poiQuality: 0,
        },
      },
      uniqueKey: 'test_cand_1',
      signalId: 'test_cand_1',
      currentPrice: 1.1005,
      poiFormedTimestamp: 1717290000000,
      bias4H: 'bullish',
      bias1H: 'bullish',
      poiTestCount: 0,
      pd4H: 'discount',
      pd1H: 'discount',
      pd15M: 'discount',
      atr15mPips: 10,
      ...overrides,
    };
  }

  const executionMock = {
    decisionCalibration: {
      status: 'ELIGIBLE',
      reason: { code: 'OK', message: 'eligible' },
      checks: [],
    },
  } as any;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('1. Exhaustion Sweep + Premature Shallow FVG Guard (Sığ FVG Tuzağı)', () => {
    it('rejects LONG setup formed on a shallow FVG in HTF Premium after an exhaustion high sweep', () => {
      const shallowFvgCandidate = createBaseCandidate({
        poiType: 'FVG',
        poi: {
          direction: 'bullish',
          gapHigh: 1.1010,
          gapLow: 1.1002,
          gapSizePips: 8,
          ratioToDisplacementCandle: 0.6,
          middleCandleIndex: 11,
          relatedEvent: {
            type: 'BOS',
            direction: 'bullish',
            brokenSwing: {} as any,
            breakCandleIndex: 12,
            breakTimestamp: 1717300000000,
            breakClosePrice: 1.1020,
          },
        } as any,
        pd1H: 'premium',
        pd4H: 'premium',
        pd15M: 'premium',
        triggerCandle: {
          timestamp: 1717300900000,
          open: 1.1008,
          high: 1.1030, // Big upper wick rejecting from the high
          low: 1.1005,
          close: 1.1009,
        },
      });

      const gateResult = evaluateSignalValidationGate(shallowFvgCandidate, executionMock);
      expect(gateResult.entryValidation).toBe('FAIL');
      expect(gateResult.rejectionReason.join(' ')).toContain('exhaustion sweep with premature shallow FVG');
    });

    it('rejects SHORT setup formed on a shallow FVG in HTF Discount after an exhaustion low sweep', () => {
      const shallowShortFvg = createBaseCandidate({
        tradeDirection: 'short',
        poiType: 'FVG',
        poi: {
          direction: 'bearish',
          gapHigh: 1.1010,
          gapLow: 1.1002,
          gapSizePips: 8,
          ratioToDisplacementCandle: 0.6,
          middleCandleIndex: 11,
          relatedEvent: {
            type: 'BOS',
            direction: 'bearish',
            brokenSwing: {} as any,
            breakCandleIndex: 12,
            breakTimestamp: 1717300000000,
            breakClosePrice: 1.0990,
          },
        } as any,
        bias4H: 'bearish',
        bias1H: 'bearish',
        pd1H: 'discount',
        pd4H: 'discount',
        pd15M: 'discount',
        triggerCandle: {
          timestamp: 1717300900000,
          open: 1.1005,
          high: 1.1008,
          low: 1.0980, // Big lower wick rejecting from the low
          close: 1.1004,
        },
      });

      const gateResult = evaluateSignalValidationGate(shallowShortFvg, executionMock);
      expect(gateResult.entryValidation).toBe('FAIL');
      expect(gateResult.rejectionReason.join(' ')).toContain('exhaustion sweep with premature shallow FVG');
    });

    it('passes normal FVG setup located in correct HTF Discount for Longs', () => {
      const validFvgCandidate = createBaseCandidate({
        poiType: 'FVG',
        poi: {
          direction: 'bullish',
          gapHigh: 1.1010,
          gapLow: 1.1002,
          gapSizePips: 8,
          ratioToDisplacementCandle: 0.6,
          middleCandleIndex: 11,
          relatedEvent: {
            type: 'BOS',
            direction: 'bullish',
            brokenSwing: {} as any,
            breakCandleIndex: 12,
            breakTimestamp: 1717300000000,
            breakClosePrice: 1.1020,
          },
        } as any,
        pd1H: 'discount',
        pd4H: 'discount',
        pd15M: 'discount',
        triggerCandle: {
          timestamp: 1717300900000,
          open: 1.1003,
          high: 1.1008,
          low: 1.1001,
          close: 1.1007,
        },
      });

      const gateResult = evaluateSignalValidationGate(validFvgCandidate, executionMock);
      expect(gateResult.entryValidation).toBe('PASS');
    });
  });

  describe('2. Stale / Depleted POI Filter (Tüketilmiş / Mükerrer Kutu Kalkanı)', () => {
    it('SetupFamilyGuard blocks duplicate overlapping zone (USDJPY #30 / BTC #25 pattern) within 16-hour session window', () => {
      const guard = new SetupFamilyGuard({ zoneOverlapCooldownMs: 16 * 60 * 60 * 1000 });
      const now = Date.now();

      // Signal 1 at 09:16 (zone: 158.089 - 158.177)
      const cand1 = createBaseCandidate({
        symbol: 'USDJPY',
        poi: {
          ...createBaseCandidate().poi,
          low: 158.089,
          high: 158.177,
          relatedEvent: { ...createBaseCandidate().poi.relatedEvent, breakTimestamp: 1000 },
        },
      });
      guard.recordNotification(cand1, now);

      // Signal 2 at 11:46 (2.5 hours later, zone: 158.105 - 158.204, >80% overlap from a newer impulse)
      const cand2 = createBaseCandidate({
        symbol: 'USDJPY',
        poi: {
          ...createBaseCandidate().poi,
          low: 158.105,
          high: 158.204,
          relatedEvent: { ...createBaseCandidate().poi.relatedEvent, breakTimestamp: 5000 },
        },
      });

      const check = guard.shouldAllow(cand2, now + (2.5 * 60 * 60 * 1000));
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('Duplicate/depleted zone overlap');
      expect(check.reason).toContain('Institutional orders depleted');
    });

    it('rejects candidate in signalValidationGate when POI has already been tested 2+ times (depleted orders)', () => {
      const depletedCandidate = createBaseCandidate({
        poiTestCount: 2,
      });

      const gateResult = evaluateSignalValidationGate(depletedCandidate, executionMock);
      expect(gateResult.entryValidation).toBe('FAIL');
      expect(gateResult.rejectionReason.join(' ')).toContain('entry zone depleted; POI has already been tested multiple times');
    });

    it('passes fresh unmitigated POI (0 tests) and first retest (1 test)', () => {
      const freshResult = evaluateSignalValidationGate(createBaseCandidate({ poiTestCount: 0 }), executionMock);
      expect(freshResult.entryValidation).toBe('PASS');

      const firstRetestResult = evaluateSignalValidationGate(createBaseCandidate({ poiTestCount: 1 }), executionMock);
      expect(firstRetestResult.entryValidation).toBe('PASS');
    });
  });

  describe('3. Prop Firm Spread & Slippage Guard (Gece Seansı & Dar Kutu Kalkanı)', () => {
    it('detects midnight rollover spread window (20:50 - 22:15 UTC)', () => {
      // 21:05 UTC (Midnight rollover)
      const rolloverDate = new Date('2026-10-02T21:05:00.000Z').getTime();
      expect(isRolloverSpreadWindow(rolloverDate)).toBe(true);

      // 14:30 UTC (London/NY overlap)
      const safeDate = new Date('2026-10-02T14:30:00.000Z').getTime();
      expect(isRolloverSpreadWindow(safeDate)).toBe(false);
    });

    it('signalValidationGate freezes execution during midnight rollover spread window', () => {
      const rolloverTimestamp = new Date('2026-10-02T21:15:00.000Z').getTime();
      jest.spyOn(Date, 'now').mockReturnValue(rolloverTimestamp);

      const rolloverCandidate = createBaseCandidate({
        marketDataTimestamp: rolloverTimestamp,
      });

      const gateResult = evaluateSignalValidationGate(rolloverCandidate, executionMock);
      expect(gateResult.entryValidation).toBe('FAIL');
      expect(gateResult.rejectionReason.join(' ')).toContain('prop firm midnight rollover spread spike window');
    });

    it('signalValidationGate rejects micro POI box (< 7 pips in Forex) to prevent spread friction stop-outs', () => {
      // EURUSD zone 1.1000 - 1.1003 is only 3 pips
      const narrowCandidate = createBaseCandidate({
        poi: {
          ...createBaseCandidate().poi,
          low: 1.1000,
          high: 1.1003,
        },
      });

      const gateResult = evaluateSignalValidationGate(narrowCandidate, executionMock);
      expect(gateResult.entryValidation).toBe('FAIL');
      expect(gateResult.rejectionReason.join(' ')).toContain('entry zone is too narrow to survive broker spread');
    });

    it('calculates dynamic slippage-adjusted stop buffer in tradeExpectancyEngine', () => {
      const plan = calculateTradeExpectancyPlan({
        symbol: 'EURUSD',
        direction: 'long',
        zoneLow: 1.1000,
        zoneHigh: 1.1010,
        currentPrice: 1.1005,
        grade: 'A',
        totalScore: 75,
        atr15mPips: 8, // 8 * 0.35 = 2.8 pips. EURUSD spread 0.8 * 1.5 + 1.0 = 2.2 pips.
      });

      expect(plan.smartStopBufferPips).toBeGreaterThanOrEqual(2.5);
      expect(plan.propFirmGuardPassed).toBe(true);
    });
  });
});
