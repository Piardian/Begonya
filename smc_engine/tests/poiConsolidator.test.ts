import { consolidateCandidates } from '../src/poiConsolidator';
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
    symbol: 'EURUSD',
    tradeDirection: 'long',
    poiType: 'OB',
    poi: {
      direction: 'bullish',
      candleIndex: 14,
      high: 1.054,
      low: 1.052,
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
    uniqueKey: 'test_1',
    currentPrice: 1.058,
    poiFormedTimestamp: 1500,
    bias4H: 'bullish',
    bias1H: 'bullish',
    poiTestCount: 0,
    pd4H: 'discount',
    pd1H: 'discount',
    ...overrides,
  };
}

describe('POI Consolidator & Zone Priority', () => {
  it('returns unchanged list if 0 or 1 candidate', () => {
    const candidate = createMockCandidate({ uniqueKey: 'cand1' });
    expect(consolidateCandidates([])).toEqual([]);
    expect(consolidateCandidates([candidate])).toEqual([candidate]);
  });

  it('filters out redundant overlapping zones from the same impulse and keeps highest grade', () => {
    // 3 zones from same breakTimestamp 2000
    const cand1 = createMockCandidate({
      uniqueKey: 'cand1_A_plus',
      poi: {
        direction: 'bullish',
        candleIndex: 14,
        high: 1.054,
        low: 1.052,
        formedAtIndex: 14,
        relatedEvent: {
          type: 'BOS',
          direction: 'bullish',
          brokenSwing: { type: 'high', price: 1.055, formedAtIndex: 10, confirmedAtIndex: 12, timestamp: 1000 },
          breakCandleIndex: 15,
          breakTimestamp: 2000,
          breakClosePrice: 1.056,
        },
      },
      gradeResult: {
        totalScore: 8,
        grade: 'A+',
        entryAllowed: true,
        blockReasons: [],
        breakdown: { htfBiasPD: 2, displacement: 2, structure: 2, sweep: 2, poiQuality: 0 },
      },
    });

    const cand2 = createMockCandidate({
      uniqueKey: 'cand2_overlap_A',
      poi: {
        direction: 'bullish',
        candleIndex: 13,
        high: 1.0538,
        low: 1.0522, // Heavy overlap with cand1
        formedAtIndex: 13,
        relatedEvent: {
          type: 'BOS',
          direction: 'bullish',
          brokenSwing: { type: 'high', price: 1.055, formedAtIndex: 10, confirmedAtIndex: 12, timestamp: 1000 },
          breakCandleIndex: 15,
          breakTimestamp: 2000,
          breakClosePrice: 1.056,
        },
      },
      gradeResult: {
        totalScore: 6,
        grade: 'A',
        entryAllowed: true,
        blockReasons: [],
        breakdown: { htfBiasPD: 1, displacement: 1, structure: 2, sweep: 2, poiQuality: 0 },
      },
    });

    const cand3 = createMockCandidate({
      uniqueKey: 'cand3_extreme',
      poi: {
        direction: 'bullish',
        candleIndex: 11,
        high: 1.048,
        low: 1.046, // Distinct lower extreme zone
        formedAtIndex: 11,
        relatedEvent: {
          type: 'BOS',
          direction: 'bullish',
          brokenSwing: { type: 'high', price: 1.055, formedAtIndex: 10, confirmedAtIndex: 12, timestamp: 1000 },
          breakCandleIndex: 15,
          breakTimestamp: 2000,
          breakClosePrice: 1.056,
        },
      },
      gradeResult: {
        totalScore: 7,
        grade: 'A',
        entryAllowed: true,
        blockReasons: [],
        breakdown: { htfBiasPD: 2, displacement: 1, structure: 2, sweep: 2, poiQuality: 0 },
      },
    });

    const result = consolidateCandidates([cand1, cand2, cand3]);
    // Should keep cand3 (extreme) and cand1 (A+), discarding cand2 (overlapping lower grade)
    expect(result.length).toBe(2);
    expect(result.map(c => c.uniqueKey)).toContain('cand1_A_plus');
    expect(result.map(c => c.uniqueKey)).toContain('cand3_extreme');
    expect(result.map(c => c.uniqueKey)).not.toContain('cand2_overlap_A');
  });
});
