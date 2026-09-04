import { buildGovernanceFramework } from '../src/governanceFramework';
import { buildValidationFramework } from '../src/validationFramework';
import { InMemorySignalRepository } from '../src/signalRepository';
import { createSignalContext } from '../src/signalContext';
import { createSignalOutcome } from '../src/signalOutcome';
import { createPendingSignalBenchmark } from '../src/signalBenchmark';
import { buildSignalEvidenceRecord } from '../server/evidenceRecorder';
import { RuntimeExecutionPipelineResult } from '../server/runtimeExecutionPipeline';
import { NotificationCandidate } from '../server/pipeline';

describe('System Governance Framework', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      ENABLE_TELEMETRY: 'true',
      ENABLE_VALIDATION_FRAMEWORK: 'true',
      ENABLE_PRESENTATION_V2: 'true',
      ENABLE_COMMUNICATION_V2: 'true',
      ENABLE_RUNTIME_MONITOR: 'true',
      CONFIG_VERSION: '9.1',
      CONFIG_CHANGED_FIELDS: 'ENABLE_TELEMETRY,ENABLE_RUNTIME_MONITOR',
      CONFIG_APPLIED_AT: '2026-07-27T08:00:00.000Z',
      RULEBOOK_VERSION: '3',
      PRESENTATION_VERSION: '5',
      COMMUNICATION_VERSION: '6',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('builds a frozen governance report with policy, version, audit, reliability, and snapshot data', () => {
    const repository = new InMemorySignalRepository();
    const context = createSignalContext({
      signalId: 'EURUSD_15m_OB_governance',
      pair: 'EURUSD',
      direction: 'long',
      timeframe: '15m',
      grade: 'A',
      score: 5,
      executionStatus: 'READY',
      riskStatus: 'ACCEPTED',
      timestamp: Date.UTC(2026, 6, 27, 8, 0, 0),
      lifecycleStates: ['DETECTED', 'GRADED', 'PLANNED', 'EXECUTION_READY'],
    });

    repository.createSignalRecord(context);
    const outcome = createSignalOutcome({
      signalContext: context,
      outcomeType: 'TAKE_PROFIT',
      timestamp: context.timestamp + 60_000,
    });
    repository.saveOutcome(outcome);
    repository.saveBenchmark(createPendingSignalBenchmark({ signalContext: context, signalOutcome: outcome }));

    const execution = executionResult();
    const evidence = buildSignalEvidenceRecord(candidate(), execution, candles(), operational());
    const validationReport = buildValidationFramework({
      repository,
      signalEvidence: [evidence],
      operationalTelemetry: [operational()],
      generatedAt: '2026-07-27T08:05:00.000Z',
    });

    const governance = buildGovernanceFramework({
      repository,
      signalEvidence: [evidence],
      operationalTelemetry: [operational()],
      validationReport,
      generatedAt: '2026-07-27T08:05:00.000Z',
    });

    expect(governance.governanceVersion).toBe(1);
    expect(governance.policySummary.featureFlags.ENABLE_TELEMETRY).toBe(true);
    expect(governance.configurationSummary.configVersion).toBe('9.1');
    expect(governance.versionSummary.rulebookVersion).toBe('3');
    expect(governance.auditEntries.length).toBeGreaterThan(0);
    expect(governance.reliabilityMetrics.successRate).toBeGreaterThanOrEqual(0);
    expect(governance.systemSnapshot.validationStatus.validationCoverage).toBeGreaterThanOrEqual(0);
    expect(governance.evidenceSummary.auditSummary.auditCount).toBeGreaterThan(0);
    expect(governance.telemetry.type).toBe('governance');
    expect(Object.isFrozen(governance)).toBe(true);
  });
});

function candidate(): NotificationCandidate {
  return {
    symbol: 'EURUSD' as const,
    tradeDirection: 'long' as const,
    poiType: 'OB' as const,
    poi: {
      direction: 'bullish' as const,
      candleIndex: 0,
      high: 1.105,
      low: 1.1,
      formedAtIndex: 0,
      relatedEvent: {
        type: 'BOS' as const,
        direction: 'bullish' as const,
        brokenSwing: {
          type: 'high' as const,
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
      grade: 'A+' as const,
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
    uniqueKey: 'EURUSD_15m_OB_governance',
    signalId: 'EURUSD_15m_OB_governance',
    signalContext: {
      signalId: 'EURUSD_15m_OB_governance',
      pair: 'EURUSD' as const,
      direction: 'long' as const,
      timeframe: '15m' as const,
      grade: 'A+',
      score: 9,
      timestamp: 2000,
      lifecycle: {
        states: ['DETECTED', 'GRADED'] as const,
        currentState: 'GRADED' as const,
      },
    },
    currentPrice: 1.106,
    poiFormedTimestamp: 1000,
    bias4H: 'bullish' as const,
    bias1H: 'bullish' as const,
    poiTestCount: 1,
    pd4H: 'discount' as const,
    pd1H: 'discount' as const,
    pd15M: 'discount' as const,
    admissionProfile: 'PRODUCTION',
  } as NotificationCandidate;
}

function executionResult(): RuntimeExecutionPipelineResult {
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
      checks: [],
    },
    engineResult: { audit: { readyCommands: 1 } },
    decisionReport: { decisions: [{ status: 'ELIGIBLE', reason: { code: 'OK', message: 'OK' } }] },
    signalContext: { lifecycle: { states: ['DETECTED', 'GRADED', 'PLANNED'], currentState: 'PLANNED' }, timestamp: 2000, riskStatus: 'ACCEPTED' },
    signalOutcome: { outcomeType: 'WAITING_ENTRY' },
    signalBenchmark: { benchmarkStatus: 'PENDING' },
  } as unknown as RuntimeExecutionPipelineResult;
}

function candles() {
  return [
    { timestamp: 1000, open: 1.1, high: 1.105, low: 1.095, close: 1.102 },
    { timestamp: 2000, open: 1.102, high: 1.108, low: 1.1, close: 1.106 },
  ];
}

function operational() {
  return {
    type: 'operational' as const,
    signalId: 'EURUSD_15m_OB_governance',
    symbol: 'EURUSD' as const,
    timeframe: '15m' as const,
    profile: 'PRODUCTION',
    totalPipelineTimeMs: 375,
    stageDurationsMs: {
      detection: 100,
      analysis: 20,
      presentation: 200,
      communication: 5,
      transport: 50,
    },
    executionTimeline: [
      {
        stage: 'DETECTION' as const,
        startedAt: '2026-07-27T08:00:00.000Z',
        endedAt: '2026-07-27T08:00:00.100Z',
        durationMs: 100,
        status: 'PASS' as const,
      },
      {
        stage: 'COMMUNICATION' as const,
        startedAt: '2026-07-27T08:00:00.300Z',
        endedAt: '2026-07-27T08:00:00.350Z',
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
