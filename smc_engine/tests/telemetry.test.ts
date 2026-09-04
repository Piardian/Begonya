import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  generateDailyQualificationReport,
  recordDeliveryQueueTelemetry,
  recordOperationalTelemetry,
  recordGovernanceTelemetry,
  recordPipelineTelemetry,
  recordPipelineFilterTelemetry,
  recordPoiLifecycleTelemetry,
  recordPollingTelemetry,
  recordProviderQueueTelemetry,
  recordProviderTelemetry,
  recordScreenshotTelemetry,
  recordValidationTelemetry,
  recordTelegramTelemetry,
} from '../server/telemetry';

describe('Production Telemetry', () => {
  let testDir: string;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swing-bos-telemetry-'));
    process.env = {
      ...originalEnv,
      ENABLE_TELEMETRY: 'true',
      TELEMETRY_DIRECTORY: testDir,
      TELEMETRY_PIPELINE_LATENCY_PASS_MS: '5000',
      TELEMETRY_TELEGRAM_SUCCESS_RATE: '0.95',
      TELEMETRY_SCREENSHOT_SUCCESS_RATE: '0.95',
      TELEMETRY_POLLING_SUCCESS_RATE: '0.95',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  test('writes structured telemetry jsonl files and daily report', () => {
    recordPipelineTelemetry({
      type: 'pipeline',
      signalId: 'EURUSD_15m_OB_demo',
      symbol: 'EURUSD',
      profile: 'PRODUCTION',
      detectionStart: '2026-07-24T00:00:00.000Z',
      detectionEnd: '2026-07-24T00:00:00.100Z',
      detectionTimeMs: 100,
      gradeTimeMs: null,
      decisionTimeMs: 20,
      executionEligibilityTimeMs: 20,
      formatterTimeMs: 5,
      screenshotTimeMs: 200,
      telegramSendTimeMs: 50,
      totalPipelineTimeMs: 375,
      executionStatus: 'READY',
      riskStatus: 'ACCEPTED',
      notificationDelivered: true,
    });

    recordOperationalTelemetry({
      type: 'operational',
      signalId: 'EURUSD_15m_OB_demo',
      symbol: 'EURUSD',
      timeframe: '15m',
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
          stage: 'DETECTION',
          startedAt: '2026-07-24T00:00:00.000Z',
          endedAt: '2026-07-24T00:00:00.100Z',
          durationMs: 100,
          status: 'PASS',
        },
      ],
      healthStatus: {
        provider: 'OK',
        telegram: 'OK',
        screenshot: 'OK',
        overlay: 'OK',
        evidence: 'OK',
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
    });

    recordValidationTelemetry({
      type: 'validation',
      signalId: 'EURUSD_15m_OB_demo',
      validationVersion: 1,
      lifecycleStatus: 'COMPLETED',
      lifecycleDurationMs: 60000,
      validationDurationMs: 25,
      benchmarkDurationMs: 10,
      datasetGenerationTimeMs: 15,
      trendCalculationTimeMs: 5,
      coverage: {
        validation: 1,
        evidence: 1,
        communication: 1,
        presentation: 1,
        benchmark: 1,
      },
      trendCounts: {
        daily: 1,
        weekly: 1,
        monthly: 1,
      },
      datasetSize: 1,
      benchmarkSummary: {
        matched: 1,
        mismatched: 0,
        pending: 0,
        insufficientData: 0,
        skipped: 0,
      },
      validationSummary: 'signals=1;coverage=100.00%',
      lifecycleSummary: 'completed=1;cancelled=0',
      trendSnapshot: 'daily=1;weekly=1;monthly=1',
    });

    recordGovernanceTelemetry({
      type: 'governance',
      signalId: 'EURUSD_15m_OB_demo',
      policyEvaluationTimeMs: 4,
      configurationLoadTimeMs: 3,
      auditWriteTimeMs: 2,
      snapshotGenerationTimeMs: 1,
      reliabilityMetrics: {
        successRate: 1,
        retryRate: 0,
        failureRate: 0,
        recoveryRate: 1,
        pipelineAvailability: 1,
      },
      auditEntries: [
        {
          type: 'POLICY_APPLIED',
          signalId: 'EURUSD_15m_OB_demo',
          timestamp: '2026-07-24T00:00:00.000Z',
          details: 'Policy summary applied.',
        },
      ],
    });

    recordTelegramTelemetry({
      type: 'telegram',
      signalId: 'EURUSD_15m_OB_demo',
      requestTimestamp: '2026-07-24T00:00:00.200Z',
      responseTimeMs: 50,
      success: true,
      retryCount: 0,
      failureReason: null,
    });

    recordScreenshotTelemetry({
      type: 'screenshot',
      signalId: 'EURUSD_15m_OB_demo',
      symbol: 'EURUSD',
      timeframe: '15m',
      chartLoadingTimeMs: 100,
      screenshotGenerationTimeMs: 200,
      uploadTimeMs: 25,
      success: true,
      fallbackUsed: true,
      oneMinuteAvailable: false,
      fifteenMinuteFallback: true,
      failureReason: null,
    });

    recordPollingTelemetry({
      type: 'polling',
      symbol: 'EURUSD',
      timeframe: '15m',
      startedAt: '2026-07-24T00:00:00.000Z',
      durationMs: 300,
      success: true,
      fetchedCandles: 10,
      failedReason: null,
    });

    recordProviderTelemetry({
      type: 'provider',
      provider: 'TWELVE_DATA',
      requestTimestamp: '2026-07-24T00:00:00.000Z',
      responseTimestamp: '2026-07-24T00:00:00.050Z',
      latencyMs: 50,
      endpoint: '/time_series',
      symbol: 'EURUSD',
      timeframe: '15m',
      httpStatus: 200,
      retryCount: 0,
      apiCreditsUsed: 1,
      apiCreditsLeft: 7,
      success: true,
      errorType: null,
      errorMessage: null,
    });

    recordProviderQueueTelemetry({
      type: 'provider_queue',
      provider: 'TWELVE_DATA',
      event: 'COMPLETED',
      jobId: 1,
      endpoint: '/time_series',
      symbol: 'EURUSD',
      timeframe: '15m',
      jobRetryCount: 0,
      queueLength: 0,
      activeRequest: null,
      waitingJobs: 0,
      completedJobs: 1,
      retryCount: 0,
      failedJobs: 0,
    });

    recordPipelineFilterTelemetry({
      type: 'pipeline_filter',
      symbol: 'EURUSD',
      timeframe: '15m',
      evaluatedPois: 1,
      candidatesCreated: 1,
      rejectionCounts: {},
      gradeBlockFamilyCombinations: {
        'HTF_CONTEXT + POI_INTEGRITY': 1,
      },
      groupAblationCandidates: {
        without_HTF_CONTEXT: 1,
      },
    });

    recordPoiLifecycleTelemetry({
      type: 'poi_lifecycle',
      poiId: 'EURUSD_OB_demo_1',
      symbol: 'EURUSD',
      timeframe: '15m',
      poiType: 'OB',
      direction: 'long',
      poiCreatedAt: Date.parse('2026-07-24T00:00:00.000Z'),
      originStructureEvent: {
        type: 'BOS',
        direction: 'bullish',
        timestamp: Date.parse('2026-07-24T00:00:00.000Z'),
      },
      observedAt: Date.parse('2026-07-24T00:15:00.000Z'),
      currentPrice: 1.1,
      zoneLow: 1.099,
      zoneHigh: 1.101,
      distancePips: 0,
      distanceAtr: 0,
      oppositeStructureEventsSinceOrigin: [],
      poiTestCount: 0,
      grade: 'A',
      candidateEligible: true,
      whyNotCandidateYet: [],
      isApproaching: true,
      isTouching: true,
      isInvalidated: false,
    });

    recordDeliveryQueueTelemetry({
      type: 'delivery_queue',
      signalId: 'EURUSD_15m_OB_demo',
      symbol: 'EURUSD',
      cohort: 'CORE_UNIVERSE',
      universeVersion: 'fx-universe-v2',
      event: 'QUEUED',
      state: 'QUEUED',
      queueDepth: 1,
      deliveryAttemptCount: 0,
      queueDelayMs: 0,
      failureReason: null,
    });

    recordDeliveryQueueTelemetry({
      type: 'delivery_queue',
      signalId: 'EURUSD_15m_OB_demo',
      symbol: 'EURUSD',
      cohort: 'CORE_UNIVERSE',
      universeVersion: 'fx-universe-v2',
      event: 'SENT',
      state: 'SENT',
      queueDepth: 0,
      deliveryAttemptCount: 1,
      queueDelayMs: 250,
      failureReason: null,
    });

    const reportPath = generateDailyQualificationReport();

    expect(fs.existsSync(path.join(testDir, 'pipeline.jsonl'))).toBe(true);
    expect(fs.existsSync(path.join(testDir, 'telegram.jsonl'))).toBe(true);
    expect(fs.existsSync(path.join(testDir, 'screenshot.jsonl'))).toBe(true);
    expect(fs.existsSync(path.join(testDir, 'operational.jsonl'))).toBe(true);
    expect(fs.existsSync(path.join(testDir, 'polling.jsonl'))).toBe(true);
    expect(fs.existsSync(path.join(testDir, 'provider.jsonl'))).toBe(true);
    expect(fs.existsSync(path.join(testDir, 'provider-queue.jsonl'))).toBe(true);
    expect(fs.existsSync(path.join(testDir, 'validation.jsonl'))).toBe(true);
    expect(fs.existsSync(path.join(testDir, 'governance.jsonl'))).toBe(true);
    expect(fs.existsSync(reportPath)).toBe(true);

    const report = fs.readFileSync(reportPath, 'utf8');
    expect(report).toContain('Total Signals: 1');
    expect(report).toContain('Telegram Success Rate: 100.00%');
    expect(report).toContain('Screenshot Success Rate: 100.00%');
    expect(report).toContain('Validation Samples: 1');
    expect(report).toContain('Governance Samples: 1');
    expect(report).toContain('## Telemetry Freshness');
    expect(report).toContain('operational: samples=1');
    expect(report).toContain('Average Policy Evaluation Time: 4.00 ms');
    expect(report).toContain('## Production Diagnostic Funnel');
    expect(report).toContain('ALL: POI=1');
    expect(report).toContain('A_OR_A_PLUS=1');
    expect(report).toContain('QUEUED=1');
    expect(report).toContain('SENT=1');
    expect(report).toContain('## Candidate Timing Diagnostics');
    expect(report).toContain('Candidate Lateness Classes: ON_TIME=1');
    expect(report).toContain('## Delivery Queue Diagnostics');
    expect(report).toContain('Queue Events: QUEUED=1, SENT=1');
    expect(report).toContain('## Provider Diagnostics');
    expect(report).toContain('EURUSD: polls=1');
    expect(report).toContain('Top Evidence-family Combinations: HTF_CONTEXT + POI_INTEGRITY=1');
    expect(report).toContain('PASS');
  });

  test('does not compare pre-queue validation pass records with an empty delivery queue', () => {
    fs.writeFileSync(path.join(testDir, 'operational.jsonl'), [
      JSON.stringify({
        type: 'operational',
        signalId: 'OLD_PASS_SIGNAL',
        symbol: 'EURUSD',
        validationDecision: 'PASS',
        entryValidation: 'PASS',
        confirmationValidation: 'PASS',
        htfConsistency: 'PASS',
        timestamp: '2026-08-11T14:05:05.220Z',
      }),
    ].join('\n') + '\n', 'utf8');

    fs.writeFileSync(path.join(testDir, 'polling.jsonl'), [
      JSON.stringify({
        type: 'polling',
        symbol: 'EURUSD',
        timeframe: '15m',
        success: true,
        durationMs: 10,
        timestamp: '2026-08-14T15:08:01.000Z',
      }),
    ].join('\n') + '\n', 'utf8');

    const reportPath = generateDailyQualificationReport();
    const report = fs.readFileSync(reportPath, 'utf8');

    expect(report).toContain('INFO: Validation PASS record(s) exist but delivery queue telemetry is empty');
    expect(report).toContain('WARN: Operational telemetry is stale compared with polling telemetry');
    expect(report).not.toContain('validation PASS record(s) have no QUEUED delivery event');
  });
});
