import { createSmartScreenshotPlan, refineSmartScreenshotPlan } from '../server/smartScreenshotEngine';
import { StoredCandle } from '../server/candleStore';
import { NotificationCandidate } from '../server/pipeline';
import { PresentationAssessment } from '../src/presentationAssessment';

function candles(length: number): StoredCandle[] {
  return Array.from({ length }, (_, index) => ({
    timestamp: 1_780_000_000_000 + index * 900_000,
    open: 1 + index * 0.0001,
    high: 1.001 + index * 0.0001,
    low: 0.999 + index * 0.0001,
    close: 1.0005 + index * 0.0001,
  }));
}

function candidate(formedAtIndex: number, breakCandleIndex: number): NotificationCandidate {
  return {
    symbol: 'EURUSD',
    tradeDirection: 'short',
    poiType: 'OB',
    poi: {
      direction: 'bearish',
      candleIndex: formedAtIndex,
      high: 1.14,
      low: 1.1395,
      formedAtIndex,
      relatedEvent: {
        type: 'BOS',
        direction: 'bearish',
        brokenSwing: {} as any,
        breakCandleIndex,
        breakTimestamp: 1_780_000_000_000 + breakCandleIndex * 900_000,
        breakClosePrice: 1.138,
      },
    },
    gradeResult: {
      totalScore: 5,
      grade: 'A',
      entryAllowed: true,
      blockReasons: [],
      breakdown: { htfBiasPD: 1, displacement: 1, structure: 1, sweep: 2, poiQuality: 0 },
    },
    uniqueKey: 'smart_screenshot_test',
    signalId: 'smart_screenshot_test',
    currentPrice: 1.137,
    poiFormedTimestamp: 1_780_000_000_000 + formedAtIndex * 900_000,
    bias4H: 'bearish',
    bias1H: 'bearish',
    poiTestCount: 0,
    pd4H: 'premium',
    pd1H: 'premium',
    pd15M: 'premium',
  } as NotificationCandidate;
}

function assessment(overrides: Partial<PresentationAssessment>): PresentationAssessment {
  return {
    version: 'PresentationAssessment.v1',
    timeframe: '15m',
    composition: 'Acceptable',
    visibility: 'Acceptable',
    overlayQuality: 'Good',
    drawingQuality: 'Good',
    readability: 'Good',
    presentationScore: 80,
    warnings: [],
    metrics: {
      annotationCount: 6,
      labelCount: 3,
      priceLineCount: 3,
      structuralMarkerCount: 1,
      poiOverlayCount: 1,
      plotAreaRatio: 0.7,
      visibleBarCount: 90,
      overlayDensity: 0.6667,
      priorityCoverage: 1,
      hiddenAnnotations: 0,
      hiddenLabels: 0,
      visiblePriorityRatio: 0.4444,
      clutterScore: 0,
      hierarchyScore: 100,
    },
    ...overrides,
  };
}

describe('SmartScreenshotEngine V1', () => {
  test('centers the screenshot around POI and structure anchors', () => {
    const plan = createSmartScreenshotPlan(candles(180), candidate(135, 145), '15m', 100);

    expect(plan.version).toBe('SmartScreenshotEngine.v1');
    expect(plan.visibleRange.from).toBeLessThanOrEqual(135);
    expect(plan.visibleRange.to).toBeGreaterThanOrEqual(145);
    expect(plan.warnings).toEqual([]);
    expect(plan.padding.rightBars).toBeGreaterThanOrEqual(10);
  });

  test('keeps late-session setup away from the right edge with dynamic padding', () => {
    const plan = createSmartScreenshotPlan(candles(180), candidate(165, 174), '15m', 100);

    expect(plan.visibleRange.to).toBe(179);
    expect(plan.visibleRange.from).toBeLessThan(165);
    expect(plan.anchorIndices.every(index => index >= plan.visibleRange.from && index <= plan.visibleRange.to)).toBe(true);
  });

  test('refines visible bars from PresentationAssessment feedback', () => {
    const initialPlan = createSmartScreenshotPlan(candles(180), candidate(80, 90), '15m', 70);
    const refinedPlan = refineSmartScreenshotPlan(
      initialPlan,
      180,
      assessment({
        visibility: 'Weak',
        composition: 'Weak',
        warnings: ['Too few visible candles for context.'],
      })
    );

    expect(refinedPlan.visibleBars).toBeGreaterThan(initialPlan.visibleBars);
    expect(refinedPlan.reasons).toContain('Refined screenshot range from PresentationAssessment warnings.');
  });
});
