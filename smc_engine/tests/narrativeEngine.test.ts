import { assessNarrativeV1 } from '../src/narrativeEngine';
import { evaluateSetupIntelligenceV2 } from '../src/setupIntelligenceEvaluator';

const structureEvent: any = {
  type: 'BOS',
  direction: 'bullish',
  brokenSwing: {
    type: 'high',
    price: 1,
    formedAtIndex: 1,
    confirmedAtIndex: 2,
    timestamp: 1_785_000_000_000,
  },
  breakCandleIndex: 3,
  breakTimestamp: 1_785_000_900_000,
  breakClosePrice: 1.01,
};

function detector(overrides: any = {}): any {
  const base: any = {
    signalId: 'NARRATIVE_TEST',
    symbol: 'AUDUSD',
    timeframe: '15m',
    direction: 'long',
    detectedAt: 1_785_000_900_000,
    htfBias: {
      fourHour: 'bullish',
      oneHour: 'bullish',
    },
    structure: {
      event: structureEvent,
      eventType: 'BOS',
      trend15m: 'bullish',
    },
    sweep: {
      present: true,
      type: 'Range Low',
      timestamp: 1_785_000_600_000,
      source: 'detector',
    },
    poi: {
      type: 'Order Block',
      orderBlock: {
        direction: 'bullish',
        candleIndex: 2,
        high: 0.7,
        low: 0.699,
        formedAtIndex: 2,
        relatedEvent: structureEvent,
      },
      fairValueGap: null,
      zoneHigh: 0.7,
      zoneLow: 0.699,
      formedAt: 1_785_000_300_000,
      testCount: 0,
    },
    premiumDiscount: {
      fourHour: { status: 'discount', fibValue: 0.2, rangeHigh: 0.71, rangeLow: 0.69 },
      oneHour: { status: 'discount', fibValue: 0.2, rangeHigh: 0.71, rangeLow: 0.69 },
      fifteenMinute: { status: 'discount', fibValue: 0.2, rangeHigh: 0.71, rangeLow: 0.69 },
    },
    displacement: {
      legDirection: 'bullish',
      bodyRatioScore: 2,
      consecutiveScore: 2,
      fvgScore: 2,
      sizeScore: 2,
      totalScore: 8,
      quality: 'güçlü',
      gradePoints: 2,
    },
    session: {
      name: 'London',
      timestamp: 1_785_000_900_000,
      timezone: 'Europe/Istanbul',
    },
    liquidity: {
      events: ['Range Low'],
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

function context(overrides: any = {}): any {
  const base: any = {
    htfAlignment: {
      quality: 'Aligned',
      supportsDirection: true,
      conflictReasons: [],
    },
    premiumDiscount: {
      quality: 'Ideal',
      supportsDirection: true,
      conflicts: [],
    },
    marketPhase: {
      value: 'Expansion',
      confidence: 'Medium',
    },
    zoneFreshness: {
      value: 'Fresh',
      testCount: 0,
      notes: [],
    },
    zoneState: {
      value: 'Active',
      invalidationReasons: [],
    },
    sessionQuality: {
      quality: 'Acceptable',
      notes: [],
    },
    summary: 'HTF=bullish/bullish | PD=discount/discount/discount | POI tests=0',
  };
  return {
    ...base,
    ...overrides,
    htfAlignment: { ...base.htfAlignment, ...overrides.htfAlignment },
    premiumDiscount: { ...base.premiumDiscount, ...overrides.premiumDiscount },
    zoneState: { ...base.zoneState, ...overrides.zoneState },
  };
}

describe('Narrative Intelligence Engine V1', () => {
  test('classifies aligned context, sweep, displacement and continuation as an elite narrative', () => {
    const result = assessNarrativeV1(detector(), context());

    expect(result.contextStory).toBe('Strong');
    expect(result.liquidityStory).toBe('Strong');
    expect(result.reactionStory).toBe('Strong');
    expect(result.continuationStory).toBe('Strong');
    expect(result.overallNarrative).toBe('Elite');
    expect(result.consistency).toBe(100);
  });

  test('downgrades narrative when liquidity and reaction are missing', () => {
    const result = assessNarrativeV1(
      detector({
        sweep: { present: false, type: 'Unknown', timestamp: null, source: 'unknown' },
        displacement: null,
        liquidity: { events: [], notes: [] },
      }),
      context()
    );

    expect(result.liquidityStory).toBe('Weak');
    expect(result.reactionStory).toBe('Weak');
    expect(result.overallNarrative).toBe('Low');
  });

  test('SetupAssessment carries NarrativeAssessment in shadow mode', () => {
    const assessment = evaluateSetupIntelligenceV2({
      detector: detector(),
      v1Grade: {
        totalScore: 7,
        grade: 'A+',
        entryAllowed: true,
        blockReasons: [],
        breakdown: {
          htfBiasPD: 2,
          displacement: 2,
          structure: 1,
          sweep: 2,
          poiQuality: 0,
        },
      },
    });

    expect(assessment.narrativeAssessment.version).toBe('NarrativeAssessment.v1');
    expect(assessment.explainability.summary).toContain('Narrative=');
  });
});
