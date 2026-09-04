import { evaluateSignalValidationGate } from '../src/signalValidationGate';
import { NotificationCandidate } from '../server/pipeline';

describe('Signal Validation Gate', () => {
  function candidate(overrides: Partial<NotificationCandidate> = {}): NotificationCandidate {
    const base: NotificationCandidate = {
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
        totalScore: 6,
        grade: 'A',
        entryAllowed: true,
        blockReasons: [],
        breakdown: {
          htfBiasPD: 2,
          displacement: 1,
          structure: 1,
          sweep: 2,
          poiQuality: 0,
        },
      },
      uniqueKey: 'signal',
      signalId: 'signal',
      signalContext: {
        signalId: 'signal',
        pair: 'EURUSD',
        direction: 'long',
        timeframe: '15m',
        grade: 'A',
        score: 6,
        timestamp: 1717300000000,
        lifecycle: {
          states: ['DETECTED', 'GRADED'],
          currentState: 'GRADED',
        },
      } as any,
      currentPrice: 1.1005,
      poiFormedTimestamp: 1717290000000,
      bias4H: 'bullish',
      bias1H: 'bullish',
      poiTestCount: 0,
      pd4H: 'discount',
      pd1H: 'discount',
      admissionProfile: 'PRODUCTION',
      ...overrides,
    };
    return base;
  }

  const execution = {
    decisionCalibration: {
      status: 'ELIGIBLE',
      reason: { code: 'OK', message: 'eligible' },
      checks: [],
    },
  } as any;

  test('passes a fresh actionable setup', () => {
    const result = evaluateSignalValidationGate(candidate(), execution);
    expect(result.version).toBe(2);
    expect(result.validationDecision).toBe('PASS');
    expect(result.entryValidation).toBe('PASS');
    expect(result.confirmationValidation).toBe('PASS');
    expect(result.htfConsistency).toBe('PASS');
  });

  test('allows setup even when price moved further from entry zone without invalidating', () => {
    const result = evaluateSignalValidationGate(candidate({ currentPrice: 1.1050 }), execution);
    expect(result.validationDecision).toBe('PASS');
    expect(result.entryValidation).toBe('PASS');
  });

  test('fails when HTF direction conflicts with trade direction', () => {
    const result = evaluateSignalValidationGate(candidate({ bias4H: 'bearish' }), execution);
    expect(result.validationDecision).toBe('FAIL');
    expect(result.htfConsistency).toBe('FAIL');
    expect(result.rejectionReason.join(' ')).toContain('HTF bias does not match');
  });

  test('fails stale market data before Telegram delivery', () => {
    const result = evaluateSignalValidationGate(candidate({
      marketDataTimestamp: Date.now() - 31 * 60 * 1000,
    }), execution);
    expect(result.entryValidation).toBe('FAIL');
    expect(result.rejectionReason).toContain('market data is stale or timestamp is invalid');
  });

  test('invalidates a BUY after price crosses below the zone', () => {
    const result = evaluateSignalValidationGate(candidate({ currentPrice: 1.0998 }), execution);
    expect(result.entryValidation).toBe('FAIL');
    expect(result.rejectionReason).toContain('completed candle close crossed the invalidation side of the entry zone');
  });

  test('invalidates a SELL after price crosses above the zone', () => {
    const setup = candidate({
      tradeDirection: 'short',
      currentPrice: 1.1012,
      bias4H: 'bearish',
      bias1H: 'bearish',
      pd4H: 'premium',
      pd1H: 'premium',
    });
    setup.poi.direction = 'bearish';
    setup.poi.relatedEvent.direction = 'bearish';
    const result = evaluateSignalValidationGate(setup, execution);
    expect(result.entryValidation).toBe('FAIL');
    expect(result.rejectionReason).toContain('completed candle close crossed the invalidation side of the entry zone');
  });

  test('does not invalidate a wick when the completed 15M close remains inside the zone', () => {
    const result = evaluateSignalValidationGate(candidate({
      currentPrice: 1.0995,
      validationClosePrice: 1.1001,
    }), execution);
    expect(result.entryValidation).toBe('PASS');
  });

  test('does not expire a valid POI solely based on calendar age window', () => {
    const now = Date.now();
    const result = evaluateSignalValidationGate(candidate({
      marketDataTimestamp: now,
      poiFormedTimestamp: now - (5 * 24 * 60 * 60 * 1000),
      poiTimeframe: '15m',
    }), execution);
    expect(result.entryValidation).toBe('PASS');
  });

  test('permits setups in 4H or 1H EQ context', () => {
    const result = evaluateSignalValidationGate(candidate({ pd4H: 'eq', pd1H: 'eq' }), execution);
    expect(result.validationDecision).toBe('PASS');
    expect(result.htfConsistency).toBe('PASS');
  });

  test('rejects POI and structure direction mismatches', () => {
    const poiMismatch = candidate();
    poiMismatch.poi.direction = 'bearish';
    expect(evaluateSignalValidationGate(poiMismatch, execution).rejectionReason)
      .toContain('POI direction conflicts with trade direction');

    const structureMismatch = candidate();
    structureMismatch.poi.relatedEvent.direction = 'bearish';
    expect(evaluateSignalValidationGate(structureMismatch, execution).rejectionReason)
      .toContain('structure direction conflicts with trade direction');
  });
});
