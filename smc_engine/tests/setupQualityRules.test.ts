import { evaluateSetupIntelligenceV2 } from '../src/setupIntelligenceEvaluator';
import { evaluateSetupQualityRules } from '../src/setupQualityRules';
import type { GradeResult } from '../src/gradeCalculator';
import type { DetectorResult } from '../src/setupAssessment';
import type { StructureEvent } from '../src/types';

const structureEvent: StructureEvent = {
  type: 'BOS',
  direction: 'bearish',
  brokenSwing: {
    type: 'low',
    price: 1.1,
    formedAtIndex: 10,
    confirmedAtIndex: 12,
    timestamp: 1_785_000_000_000,
  },
  breakCandleIndex: 15,
  breakTimestamp: 1_785_000_900_000,
  breakClosePrice: 1.099,
};

const v1Grade: GradeResult = {
  totalScore: 5,
  grade: 'A',
  entryAllowed: true,
  blockReasons: [],
  breakdown: {
    htfBiasPD: 1,
    displacement: 1,
    structure: 1,
    sweep: 2,
    poiQuality: 0,
  },
};

function detector(overrides: any = {}): DetectorResult {
  const base: DetectorResult = {
    signalId: 'TEST_15m_OB',
    symbol: 'EURUSD',
    timeframe: '15m',
    direction: 'short',
    detectedAt: 1_785_000_900_000,
    htfBias: {
      fourHour: 'bearish',
      oneHour: 'bearish',
    },
    structure: {
      event: structureEvent,
      eventType: 'BOS',
      trend15m: 'bearish',
    },
    sweep: {
      present: true,
      type: 'Range High',
      timestamp: 1_785_000_600_000,
      source: 'detector',
    },
    poi: {
      type: 'Order Block',
      orderBlock: {
        direction: 'bearish',
        candleIndex: 12,
        high: 1.105,
        low: 1.104,
        formedAtIndex: 12,
        relatedEvent: structureEvent,
      },
      fairValueGap: null,
      zoneHigh: 1.105,
      zoneLow: 1.104,
      formedAt: 1_785_000_300_000,
      testCount: 1,
    },
    premiumDiscount: {
      fourHour: {
        status: 'premium',
        fibValue: 0.8,
        rangeHigh: 1.11,
        rangeLow: 1.1,
      },
      oneHour: {
        status: 'premium',
        fibValue: 0.8,
        rangeHigh: 1.11,
        rangeLow: 1.1,
      },
      fifteenMinute: {
        status: 'premium',
        fibValue: 0.8,
        rangeHigh: 1.11,
        rangeLow: 1.1,
      },
    },
    displacement: {
      legDirection: 'bearish',
      bodyRatioScore: 1,
      consecutiveScore: 1,
      fvgScore: 1,
      sizeScore: 1,
      totalScore: 4,
      quality: 'orta',
      gradePoints: 1,
    },
    session: {
      name: 'London',
      timestamp: 1_785_000_900_000,
      timezone: 'Europe/Istanbul',
    },
    liquidity: {
      events: ['Range High'],
      notes: [],
    },
  };

  return {
    ...base,
    ...overrides,
    htfBias: { ...base.htfBias, ...overrides.htfBias },
    structure: { ...base.structure, ...overrides.structure },
    sweep: { ...base.sweep, ...overrides.sweep },
    poi: { ...base.poi, ...overrides.poi },
    premiumDiscount: { ...base.premiumDiscount, ...overrides.premiumDiscount },
    session: { ...base.session, ...overrides.session },
    liquidity: { ...base.liquidity, ...overrides.liquidity },
  };
}

describe('Setup Quality Rulebook', () => {
  test('records grade cap rules separately from soft penalties', () => {
    const assessment = evaluateSetupIntelligenceV2({
      detector: detector({
        premiumDiscount: {
          fourHour: { status: 'discount', fibValue: 0.2, rangeHigh: 1.11, rangeLow: 1.1 },
          oneHour: { status: 'discount', fibValue: 0.2, rangeHigh: 1.11, rangeLow: 1.1 },
          fifteenMinute: { status: 'discount', fibValue: 0.2, rangeHigh: 1.11, rangeLow: 1.1 },
        },
      }),
      v1Grade,
    });

    expect(assessment.decision.hardReject).toBe(false);
    expect(assessment.decision.appliedRules?.gradeCaps.map(rule => rule.id)).toContain('SELL_IN_4H_DISCOUNT');
    expect(assessment.decision.appliedRules?.softPenalties.map(rule => rule.id)).toContain('MEDIUM_DISPLACEMENT');
    expect(assessment.explainability.weakenedBy).toContain('SELL_IN_4H_DISCOUNT: SELL setup is located in 4H Discount.');
  });

  test('hard rejects malformed POI zones', () => {
    const assessment = evaluateSetupIntelligenceV2({
      detector: detector({
        poi: {
          zoneHigh: 1.104,
          zoneLow: 1.105,
        },
      }),
      v1Grade,
    });

    expect(assessment.decision.hardReject).toBe(true);
    expect(assessment.grade.value).toBe('Reject');
    expect(assessment.decision.appliedRules?.hardRejects.map(rule => rule.id)).toContain('MALFORMED_POI_ZONE');
  });

  test('rulebook can be evaluated independently of grade assignment', () => {
    const assessment = evaluateSetupIntelligenceV2({
      detector: detector({ htfBias: { fourHour: 'bearish', oneHour: 'bullish' } }),
      v1Grade,
    });
    const ruleEvaluation = evaluateSetupQualityRules({
      detector: assessment.detector,
      context: assessment.context,
    });

    expect(ruleEvaluation.gradeCaps.map(rule => rule.id)).toContain('HTF_ALIGNMENT_MIXED');
    expect(ruleEvaluation.all.every(rule => typeof rule.recommendation === 'string')).toBe(true);
  });
});
