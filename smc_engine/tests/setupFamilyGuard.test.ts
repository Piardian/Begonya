import { SetupFamilyGuard } from '../server/setupFamilyGuard';
import type { NotificationCandidate } from '../server/pipeline';

function createMockCandidate(overrides: Partial<NotificationCandidate>): NotificationCandidate {
  const defaultEvent = {
    type: 'BOS' as const,
    direction: 'bullish' as const,
    brokenSwing: { type: 'high' as const, price: 1.055, formedAtIndex: 10, confirmedAtIndex: 12, timestamp: 1000 },
    breakCandleIndex: 15,
    breakTimestamp: 2000,
    breakClosePrice: 1.056,
  };

  return {
    symbol: 'BTCUSD',
    tradeDirection: 'long',
    poiType: 'OB',
    poi: {
      direction: 'bullish',
      candleIndex: 14,
      high: 64500,
      low: 64400,
      formedAtIndex: 14,
      relatedEvent: defaultEvent,
    },
    gradeResult: {
      totalScore: 8,
      grade: 'A+',
      entryAllowed: true,
      blockReasons: [],
      breakdown: { htfBiasPD: 2, displacement: 2, structure: 2, sweep: 2, poiQuality: 0 },
    },
    uniqueKey: 'btc_1',
    currentPrice: 79000,
    poiFormedTimestamp: 1500,
    bias4H: 'bullish',
    bias1H: 'bullish',
    poiTestCount: 0,
    pd4H: 'discount',
    pd1H: 'discount',
    ...overrides,
  };
}

describe('SetupFamilyGuard (Anti-Spam & Family Grouping)', () => {
  it('allows the first candidate in a family', () => {
    const guard = new SetupFamilyGuard();
    const cand = createMockCandidate({});
    const check = guard.shouldAllow(cand);
    expect(check.allowed).toBe(true);
  });

  it('blocks duplicate/inferior candidates from the same impulse within cooldown', () => {
    const guard = new SetupFamilyGuard({ cooldownMs: 45 * 60 * 1000 });
    const now = Date.now();
    const cand1 = createMockCandidate({
      uniqueKey: 'btc_cand_1',
      gradeResult: {
        totalScore: 8,
        grade: 'A+',
        entryAllowed: true,
        blockReasons: [],
        breakdown: { htfBiasPD: 2, displacement: 2, structure: 2, sweep: 2, poiQuality: 0 },
      },
    });

    guard.recordNotification(cand1, now);

    // 15 minutes later, another candidate from the same BOS is detected with lower/equal score
    const cand2 = createMockCandidate({
      uniqueKey: 'btc_cand_2',
      gradeResult: {
        totalScore: 6,
        grade: 'A',
        entryAllowed: true,
        blockReasons: [],
        breakdown: { htfBiasPD: 1, displacement: 1, structure: 2, sweep: 2, poiQuality: 0 },
      },
    });

    const check = guard.shouldAllow(cand2, now + 15 * 60 * 1000);
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('Duplicate setup family');
  });

  it('allows candidates for different symbols or after cooldown expires', () => {
    const guard = new SetupFamilyGuard({ cooldownMs: 45 * 60 * 1000 });
    const now = Date.now();
    const cand1 = createMockCandidate({ symbol: 'BTCUSD' });
    guard.recordNotification(cand1, now);

    const candEth = createMockCandidate({ symbol: 'ETHUSD' });
    expect(guard.shouldAllow(candEth, now + 5 * 60 * 1000).allowed).toBe(true);

    // After 50 minutes (cooldown passed)
    const candBtcLater = createMockCandidate({
      symbol: 'BTCUSD',
      poi: {
        ...cand1.poi,
        relatedEvent: { ...cand1.poi.relatedEvent, breakTimestamp: 5000000 },
      },
    });
    expect(guard.shouldAllow(candBtcLater, now + 50 * 60 * 1000).allowed).toBe(true);
  });

  it('allows higher quality upgrade (A+ after A) within cooldown', () => {
    const guard = new SetupFamilyGuard({ cooldownMs: 45 * 60 * 1000 });
    const now = Date.now();
    const candA = createMockCandidate({
      symbol: 'BTCUSD',
      gradeResult: {
        totalScore: 6,
        grade: 'A',
        entryAllowed: true,
        blockReasons: [],
        breakdown: { htfBiasPD: 1, displacement: 1, structure: 2, sweep: 2, poiQuality: 0 },
      },
    });

    guard.recordNotification(candA, now);

    // 10 minutes later, a genuine A+ setup appears
    const candAPlus = createMockCandidate({
      symbol: 'BTCUSD',
      gradeResult: {
        totalScore: 9,
        grade: 'A+',
        entryAllowed: true,
        blockReasons: [],
        breakdown: { htfBiasPD: 2, displacement: 2, structure: 2, sweep: 2, poiQuality: 1 },
      },
    });

    const check = guard.shouldAllow(candAPlus, now + 10 * 60 * 1000);
    expect(check.allowed).toBe(true);
  });
});
