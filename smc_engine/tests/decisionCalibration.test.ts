import { calibrateDecision } from '../src/decisionCalibration';
import { runRuntimeExecutionPipeline } from '../server/runtimeExecutionPipeline';
import { NotificationCandidate } from '../server/pipeline';

describe('Decision Calibration RC-3', () => {
  test('accepts only fully aligned A+ runtime candidates', () => {
    const candidate = buildCandidate();
    const result = runRuntimeExecutionPipeline(candidate);

    expect(result.decisionCalibration.status).toBe('ELIGIBLE');
    expect(result.decisionReport.decisions[0].status).toBe('ELIGIBLE');
    expect(result.executionPlan.audit.plannedActions).toBe(1);
    expect(result.riskResult.items[0].riskStatus).toBe('ACCEPTED');
  });

  test('filters BUY candidates in 4H premium even when grade score is high', () => {
    const candidate = buildCandidate({ pd4H: 'premium' });
    const result = runRuntimeExecutionPipeline(candidate);

    expect(result.decisionCalibration.status).toBe('FILTERED');
    expect(result.decisionReport.decisions[0].status).toBe('FILTERED');
    expect(result.decisionReport.decisions[0].reason.code).toBe('4H_PD_ALIGNMENT');
    expect(result.executionPlan.audit.plannedActions).toBe(0);
    expect(result.simulationResult.audit.simulatedItems).toBe(0);
    expect(result.riskResult.items).toHaveLength(0);
    expect(result.signalContext.riskStatus).toBe('NO_RISK');
  });

  test('does not let PVP acceleration bypass premium/discount conflicts', () => {
    const calibration = calibrateDecision({
      tradeDirection: 'short',
      bias4H: 'bearish',
      bias1H: 'bearish',
      pd4H: 'discount',
      pd1H: 'discount',
      pd15M: 'discount',
      poiTestCount: 1,
      grade: 'A',
      score: 5,
      admissionProfile: 'PVP_ACCELERATION',
      blockReasons: [],
      breakdown: { htfBiasPD: 1, displacement: 1, structure: 1, sweep: 2, poiQuality: 0 },
    });

    expect(calibration.checks.some(check =>
      check.code === '4H_PD_ALIGNMENT' && check.status === 'FAIL'
    )).toBe(true);
    expect(calibration.status).toBe('FILTERED');
  });

  test('filters 4H and 1H trend conflict for continuation model', () => {
    const candidate = buildCandidate({
      bias1H: 'bearish',
      gradeResult: {
        totalScore: 7,
        grade: 'A',
        entryAllowed: false,
        blockReasons: ['1H bias is not aligned with 4H bias for continuation model'],
        breakdown: { htfBiasPD: 1, displacement: 2, structure: 2, sweep: 2, poiQuality: 1 },
      },
    });
    const result = runRuntimeExecutionPipeline(candidate);

    expect(result.decisionCalibration.status).toBe('FILTERED');
    expect(result.decisionReport.decisions[0].status).toBe('FILTERED');
    expect(result.decisionReport.decisions[0].reason.code).toBe('NO_GRADE_BLOCK_REASONS');
    expect(result.executionPlan.audit.plannedActions).toBe(0);
  });

  test('allows clean A grade candidates when context gates pass', () => {
    const calibration = calibrateDecision({
      tradeDirection: 'long',
      bias4H: 'bullish',
      bias1H: 'bullish',
      pd4H: 'discount',
      pd1H: 'discount',
      pd15M: 'discount',
      poiTestCount: 0,
      grade: 'A',
      score: 6,
      blockReasons: [],
      breakdown: { htfBiasPD: 2, displacement: 2, structure: 2, sweep: 2, poiQuality: 1 },
    });

    expect(calibration.status).toBe('ELIGIBLE');
    expect(calibration.checks.some(check => check.code === 'MINIMUM_RUNTIME_GRADE' && check.status === 'PASS')).toBe(true);
  });

  test('keeps B+ candidates blocked in production runtime admission', () => {
    const calibration = calibrateDecision({
      tradeDirection: 'long',
      bias4H: 'bullish',
      bias1H: 'bullish',
      pd4H: 'discount',
      pd1H: 'discount',
      pd15M: 'discount',
      poiTestCount: 0,
      grade: 'B+',
      score: 3,
      blockReasons: [],
      breakdown: { htfBiasPD: 2, displacement: 2, structure: 2, sweep: 2, poiQuality: 1 },
    });

    expect(calibration.status).toBe('FILTERED');
    expect(calibration.reason.code).toBe('MINIMUM_RUNTIME_GRADE');
  });

  test('keeps B+ blocked under PVP acceleration admission', () => {
    const calibration = calibrateDecision({
      tradeDirection: 'long',
      bias4H: 'bullish',
      bias1H: 'bullish',
      pd4H: 'discount',
      pd1H: 'discount',
      pd15M: 'discount',
      poiTestCount: 0,
      grade: 'B+',
      score: 3,
      admissionProfile: 'PVP_ACCELERATION',
      blockReasons: [],
      breakdown: { htfBiasPD: 2, displacement: 2, structure: 2, sweep: 2, poiQuality: 1 },
    });

    expect(calibration.status).toBe('FILTERED');
    expect(calibration.checks.some(check => check.code === 'MINIMUM_RUNTIME_GRADE' && check.status === 'FAIL')).toBe(true);
  });

  test('allows moderate displacement (score 1) and neutral POI (score 0) in A candidates', () => {
    const calibration = calibrateDecision({
      tradeDirection: 'long',
      bias4H: 'bullish',
      bias1H: 'bullish',
      pd4H: 'discount',
      pd1H: 'discount',
      pd15M: 'discount',
      poiTestCount: 0,
      grade: 'A',
      score: 6,
      blockReasons: [],
      breakdown: { htfBiasPD: 2, displacement: 1, structure: 2, sweep: 2, poiQuality: 0 },
    });

    expect(calibration.status).toBe('ELIGIBLE');
    expect(calibration.checks.some(check => check.code === 'MINIMUM_RUNTIME_GRADE' && check.status === 'PASS')).toBe(true);
    expect(calibration.checks.some(check => check.code === 'DISPLACEMENT_STRENGTH' && check.status === 'PASS')).toBe(true);
    expect(calibration.checks.some(check => check.code === 'POI_QUALITY' && check.status === 'PASS')).toBe(true);
    expect(Object.isFrozen(calibration)).toBe(true);
  });
});

function buildCandidate(overrides: Partial<NotificationCandidate> = {}): NotificationCandidate {
  const relatedEvent = {
    type: 'BOS' as const,
    direction: 'bullish' as const,
    brokenSwing: {} as any,
    breakCandleIndex: 12,
    breakTimestamp: 1717407600000,
    breakClosePrice: 1.056,
  };

  return {
    symbol: 'EURUSD',
    tradeDirection: 'long',
    poiType: 'OB',
    poi: {
      direction: 'bullish',
      candleIndex: 10,
      high: 1.055,
      low: 1.053,
      formedAtIndex: 10,
      relatedEvent,
    },
    gradeResult: {
      totalScore: 9,
      grade: 'A+',
      entryAllowed: true,
      blockReasons: [],
      breakdown: { htfBiasPD: 2, displacement: 2, structure: 2, sweep: 2, poiQuality: 1 },
    },
    uniqueKey: 'EURUSD_15m_OB_1717400000000_1717407600000',
    signalId: 'EURUSD_15m_OB_1717400000000_1717407600000',
    currentPrice: 1.0585,
    poiFormedTimestamp: 1717400000000,
    bias4H: 'bullish',
    bias1H: 'bullish',
    poiTestCount: 0,
    pd4H: 'discount',
    pd1H: 'discount',
    pd15M: 'discount',
    ...overrides,
  };
}
