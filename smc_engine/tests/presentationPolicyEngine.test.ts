import { buildPresentationPlan } from '../server/presentationPolicyEngine';
import { createSmartScreenshotPlan, SmartScreenshotPlan } from '../server/smartScreenshotEngine';
import { PresentationAssessment } from '../src/presentationAssessment';
import { OverlaySimplificationResult } from '../server/overlaySimplifier';
import { NotificationCandidate } from '../server/pipeline';

describe('Presentation Policy Engine', () => {
  test('coordinates assessment into compact presentation actions when visibility is weak', () => {
    const candles = makeCandles(180);
    const candidate = makeCandidate();
    const screenshotPlan = createSmartScreenshotPlan(candles, candidate, '15m', 96);
    const assessment = weakAssessment();
    const simplification = clutteredSimplification();

    const plan = buildPresentationPlan({
      assessment,
      screenshotPlan,
      overlaySimplification: simplification,
      candlesLength: candles.length,
    });

    expect(plan.mode).toBe('Compact');
    expect(plan.selectedActions.some(action => action.policy === 'ZOOM_OUT')).toBe(true);
    expect(plan.selectedActions.some(action => action.policy === 'OVERLAY_COMPACT')).toBe(true);
    expect(plan.overlayBudget.maxAnnotations).toBe(7);
    expect(plan.screenshotPlan.visibleBars).toBeGreaterThan(screenshotPlan.visibleBars);
    expect(plan.telemetry.appliedPolicyCount).toBeGreaterThan(0);
  });

  test('keeps detailed mode when readability and overlay coverage are strong', () => {
    const candles = makeCandles(160);
    const candidate = makeCandidate();
    const screenshotPlan = createSmartScreenshotPlan(candles, candidate, '15m', 80);
    const assessment = strongAssessment();
    const simplification = cleanSimplification();

    const plan = buildPresentationPlan({
      assessment,
      screenshotPlan,
      overlaySimplification: simplification,
      candlesLength: candles.length,
    });

    expect(plan.mode).toBe('Detailed');
    expect(plan.overlayBudget.maxAnnotations).toBe(12);
    expect(plan.selectedActions.some(action => action.policy === 'DETAIL_BIAS')).toBe(true);
  });
});

function makeCandles(length: number) {
  return Array.from({ length }, (_, index) => ({
    timestamp: index * 60_000,
    open: 1.1 + (index * 0.0001),
    high: 1.1008 + (index * 0.0001),
    low: 1.0992 + (index * 0.0001),
    close: 1.1003 + (index * 0.0001),
  }));
}

function makeCandidate() {
  return {
    symbol: 'EURUSD' as const,
    tradeDirection: 'long' as const,
    poiType: 'OB' as const,
    poi: {
      direction: 'bullish',
      candleIndex: 120,
      high: 1.15,
      low: 1.14,
      formedAtIndex: 120,
      relatedEvent: {
        type: 'BOS' as const,
        direction: 'bullish' as const,
        brokenSwing: {
          type: 'high',
          price: 1.145,
          formedAtIndex: 118,
          confirmedAtIndex: 119,
          timestamp: 118 * 60_000,
        },
        breakCandleIndex: 121,
        breakTimestamp: 121 * 60_000,
        breakClosePrice: 1.148,
      },
    },
    gradeResult: {
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
    },
    uniqueKey: 'EURUSD_15m_OB_policy',
    signalId: 'EURUSD_15m_OB_policy',
    signalContext: {
      signalId: 'EURUSD_15m_OB_policy',
      pair: 'EURUSD',
      direction: 'long',
      timeframe: '15m',
      grade: 'A',
      score: 5,
      timestamp: 121 * 60_000,
      lifecycle: {
        states: ['DETECTED', 'GRADED'],
        currentState: 'GRADED',
      },
    },
    currentPrice: 1.149,
    poiFormedTimestamp: 120 * 60_000,
    bias4H: 'bullish',
    bias1H: 'bullish',
    poiTestCount: 1,
    pd4H: 'discount',
    pd1H: 'discount',
    pd15M: 'discount',
    admissionProfile: 'PVP_ACCELERATION',
  } satisfies NotificationCandidate;
}

function weakAssessment(): PresentationAssessment {
  return {
    version: 'PresentationAssessment.v1',
    timeframe: '15m',
    composition: 'Weak',
    visibility: 'Weak',
    overlayQuality: 'Weak',
    drawingQuality: 'Acceptable',
    readability: 'Weak',
    presentationScore: 32,
    warnings: [
      'Too few visible candles may hide setup context.',
      'POI overlay is visible.',
    ],
    metrics: {
      annotationCount: 14,
      labelCount: 7,
      priceLineCount: 4,
      structuralMarkerCount: 2,
      poiOverlayCount: 1,
      plotAreaRatio: 0.58,
      visibleBarCount: 34,
      overlayDensity: 1.8,
      priorityCoverage: 0.6,
      hiddenAnnotations: 3,
      hiddenLabels: 2,
      visiblePriorityRatio: 0.28,
      clutterScore: 28,
      hierarchyScore: 54,
    },
  };
}

function strongAssessment(): PresentationAssessment {
  return {
    version: 'PresentationAssessment.v1',
    timeframe: '15m',
    composition: 'Good',
    visibility: 'Good',
    overlayQuality: 'Good',
    drawingQuality: 'Good',
    readability: 'Good',
    presentationScore: 92,
    warnings: [],
    metrics: {
      annotationCount: 8,
      labelCount: 3,
      priceLineCount: 4,
      structuralMarkerCount: 2,
      poiOverlayCount: 1,
      plotAreaRatio: 0.78,
      visibleBarCount: 72,
      overlayDensity: 0.88,
      priorityCoverage: 0.96,
      hiddenAnnotations: 0,
      hiddenLabels: 0,
      visiblePriorityRatio: 0.52,
      clutterScore: 4,
      hierarchyScore: 96,
    },
  };
}

function clutteredSimplification(): OverlaySimplificationResult {
  return {
    version: 'OverlaySimplification.v1',
    priorityEngineVersion: 'OverlayPriorityEngine.v1',
    originalAnnotationCount: 14,
    annotations: [],
    decisionLog: [],
    metrics: {
      overlayDensity: 1.8,
      priorityCoverage: 0.6,
      hiddenAnnotations: 3,
      hiddenLabels: 2,
      visiblePriorityRatio: 0.28,
      clutterScore: 24,
      hierarchyScore: 55,
    },
    warnings: ['Overlay annotation budget exceeded; low priority items were hidden.'],
  };
}

function cleanSimplification(): OverlaySimplificationResult {
  return {
    version: 'OverlaySimplification.v1',
    priorityEngineVersion: 'OverlayPriorityEngine.v1',
    originalAnnotationCount: 8,
    annotations: [],
    decisionLog: [],
    metrics: {
      overlayDensity: 0.9,
      priorityCoverage: 0.95,
      hiddenAnnotations: 0,
      hiddenLabels: 0,
      visiblePriorityRatio: 0.52,
      clutterScore: 3,
      hierarchyScore: 97,
    },
    warnings: [],
  };
}
