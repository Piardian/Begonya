import { createSignalContext } from '../src/signalContext';
import { createWaitingEntryOutcome } from '../src/signalOutcome';
import { createPendingSignalBenchmark } from '../src/signalBenchmark';
import { InMemorySignalRepository } from '../src/signalRepository';
import { buildSignalEvidenceRecord } from '../server/evidenceRecorder';
import { buildValidationFramework } from '../src/validationFramework';
import { NotificationCandidate } from '../server/pipeline';

describe('Validation & Learning Framework', () => {
  test('builds lifecycle records, validation metrics, benchmark summary, and learning dataset', () => {
    const repository = new InMemorySignalRepository();

    const context1 = createSignalContext({
      signalId: 'EURUSD_15m_OB_1717400000000_1717407600000',
      pair: 'EURUSD',
      direction: 'long',
      timeframe: '15m',
      grade: 'A+',
      score: 9,
      executionStatus: 'EXECUTION_READY',
      riskStatus: 'ACCEPTED',
      timestamp: 1717407600000,
      lifecycleStates: ['DETECTED', 'GRADED', 'PLANNED', 'EXECUTION_READY', 'SIMULATED', 'RISK_ACCEPTED'],
    });
    const context2 = createSignalContext({
      signalId: 'GBPUSD_15m_OB_1717490000000_1717493600000',
      pair: 'GBPUSD',
      direction: 'short',
      timeframe: '15m',
      grade: 'A',
      score: 5,
      executionStatus: 'EXECUTION_READY',
      riskStatus: 'ACCEPTED',
      timestamp: 1717493600000,
      lifecycleStates: ['DETECTED', 'GRADED', 'PLANNED', 'EXECUTION_READY', 'SIMULATED', 'RISK_ACCEPTED'],
    });

    repository.createSignalRecord(context1);
    repository.createSignalRecord(context2);

    const outcome1 = createWaitingEntryOutcome(context1);
    repository.saveOutcome(outcome1);
    const benchmark1 = createPendingSignalBenchmark({ signalContext: context1, signalOutcome: outcome1 });
    repository.saveBenchmark(benchmark1);

    const evidence1 = buildSignalEvidenceRecord(candidate(context1), execution(), candles());

    const report = buildValidationFramework({
      repository,
      signalEvidence: [evidence1],
      operationalTelemetry: [operationalTelemetry(context1.signalId)],
      generatedAt: '2026-07-27T00:00:00.000Z',
    });

    expect(report.validationVersion).toBe(1);
    expect(report.lifecycleRecords).toHaveLength(2);
    expect(report.validationRecords).toHaveLength(2);
    expect(report.qualityMetrics.signalCount).toBe(2);
    expect(report.qualityMetrics.completedSignals).toBe(0);
    expect(report.qualityMetrics.evidenceCoverage).toBe(0.5);
    expect(report.qualityMetrics.communicationCoverage).toBe(0.5);
    expect(report.qualityMetrics.presentationCoverage).toBe(0.5);
    expect(report.benchmarkFramework.benchmarkedSignals).toBe(1);
    expect(report.benchmarkFramework.benchmarkCoverage).toBe(0.5);
    expect(report.benchmarkFramework.statusCounts.PENDING).toBe(1);
    expect(report.learningDataset.items).toHaveLength(2);
    expect(report.learningDataset.items[0].validation.lifecycle.signalId).toBeDefined();
    expect(report.trendReporting.daily.length).toBeGreaterThan(0);
    expect(report.evidenceSummary.validationSummary).toContain('signals=2');
  });
});

function candidate(context: ReturnType<typeof createSignalContext>): NotificationCandidate {
  return {
    symbol: context.pair,
    tradeDirection: context.direction,
    poiType: 'OB',
    poi: {
      direction: 'bullish',
      candleIndex: 0,
      high: 1.105,
      low: 1.1,
      formedAtIndex: 0,
      relatedEvent: {
        type: 'BOS',
        direction: 'bullish',
        brokenSwing: {
          type: 'high',
          price: 1.103,
          formedAtIndex: 0,
          confirmedAtIndex: 1,
          timestamp: 1000,
        },
        breakCandleIndex: 1,
        breakTimestamp: 2000,
        breakClosePrice: 1.106,
      },
    },
    gradeResult: {
      totalScore: 9,
      grade: 'A+',
      entryAllowed: true,
      blockReasons: [],
      breakdown: {
        htfBiasPD: 2,
        displacement: 2,
        structure: 2,
        sweep: 2,
        poiQuality: 1,
      },
    },
    uniqueKey: context.signalId,
    signalId: context.signalId,
    signalContext: context,
    currentPrice: 1.106,
    poiFormedTimestamp: 1000,
    bias4H: 'bullish',
    bias1H: 'bullish',
    poiTestCount: 1,
    pd4H: 'discount',
    pd1H: 'discount',
    pd15M: 'discount',
    admissionProfile: 'PRODUCTION',
  };
}

function execution() {
  return {
    riskResult: {
      items: [
        {
          riskStatus: 'ACCEPTED',
          evaluation: {
            executionAllowed: true,
            reason: {
              code: 'POLICY_GATE_PASSED',
              message: 'Policy-level risk accepted.',
            },
          },
        },
      ],
    },
    decisionCalibration: {
      status: 'ELIGIBLE',
      reason: {
        code: 'CONTEXT_POLICY_PASSED',
        message: 'All runtime context quality gates passed.',
      },
      checks: [
        {
          code: 'MINIMUM_RUNTIME_GRADE',
          status: 'PASS',
          severity: 'INFO',
          message: 'Grade is A or A+ and can be evaluated by context gates.',
        },
      ],
    },
    engineResult: { audit: { readyCommands: 1 } },
    decisionReport: { decisions: [{ status: 'ELIGIBLE', reason: { code: 'OK', message: 'OK' } }] },
    signalContext: { lifecycle: { states: ['DETECTED', 'GRADED', 'PLANNED'], currentState: 'PLANNED' }, timestamp: 2000, riskStatus: 'ACCEPTED' },
    signalOutcome: { outcomeType: 'WAITING_ENTRY' },
    signalBenchmark: { benchmarkStatus: 'PENDING' },
  } as any;
}

function candles() {
  return [
    { timestamp: 1000, open: 1.1, high: 1.105, low: 1.095, close: 1.102 },
    { timestamp: 2000, open: 1.102, high: 1.108, low: 1.1, close: 1.106 },
  ];
}

function operationalTelemetry(signalId: string) {
  return {
    type: 'operational' as const,
    signalId,
    symbol: 'EURUSD' as const,
    timeframe: '15m' as const,
    profile: 'PRODUCTION',
    totalPipelineTimeMs: 250,
    stageDurationsMs: {
      detection: 50,
      analysis: 50,
      presentation: 50,
      communication: 50,
      transport: 50,
    },
    executionTimeline: [
      {
        stage: 'DETECTION' as const,
        startedAt: '2026-07-27T00:00:00.000Z',
        endedAt: '2026-07-27T00:00:00.050Z',
        durationMs: 50,
        status: 'PASS' as const,
      },
      {
        stage: 'PRESENTATION' as const,
        startedAt: '2026-07-27T00:00:00.100Z',
        endedAt: '2026-07-27T00:00:00.150Z',
        durationMs: 50,
        status: 'PASS' as const,
      },
      {
        stage: 'COMMUNICATION' as const,
        startedAt: '2026-07-27T00:00:00.150Z',
        endedAt: '2026-07-27T00:00:00.200Z',
        durationMs: 50,
        status: 'PASS' as const,
      },
    ],
    healthStatus: {
      provider: 'OK' as const,
      telegram: 'OK' as const,
      screenshot: 'OK' as const,
      overlay: 'OK' as const,
      evidence: 'OK' as const,
    },
    retrySummary: {
      retryCount: 0,
      recoverySuccess: true,
      lastFailureReason: null,
      retryDurationMs: 0,
    },
    errorSummary: {
      validationErrors: 0,
      networkErrors: 0,
      timeoutErrors: 0,
      renderingErrors: 0,
      providerErrors: 0,
      internalErrors: 0,
      lastErrorCategory: null,
      lastErrorMessage: null,
    },
    diagnostics: {
      slowStages: [],
      bottlenecks: [],
      skippedStages: [],
    },
  };
}
