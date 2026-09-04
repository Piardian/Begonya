import * as fs from 'fs';
import * as path from 'path';
import { JsonlEvidenceStore } from '../server/evidenceStore';
import {
  appendCompletedSignalOutcomeEvidenceAsync,
  buildSignalEvidenceRecord,
  recordApprovedSignalEvidenceAsync,
} from '../server/evidenceRecorder';
import { RuntimeExecutionPipelineResult } from '../server/runtimeExecutionPipeline';
import { NotificationCandidate } from '../server/pipeline';
import { SIGNAL_EVIDENCE_SCHEMA_VERSION } from '../src/signalEvidence';

describe('Signal Evidence Recorder', () => {
  const testDir = path.join(__dirname, 'temp_evidence_test');
  const originalEnv = process.env;

  beforeEach(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
    process.env = { ...originalEnv };
    delete process.env.ENABLE_EVIDENCE_RECORDER;
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
    process.env = originalEnv;
  });

  test('builds deterministic engineering feature evidence from approved signal context', () => {
    const evidence = buildSignalEvidenceRecord(candidate(), execution(), candles());

    expect(evidence.evidenceSchemaVersion).toBe(SIGNAL_EVIDENCE_SCHEMA_VERSION);
    expect(evidence.metadata.signalId).toBe('EURUSD_15m_OB_demo');
    expect(evidence.htfContext).toEqual({
      bias4H: 'bullish',
      bias1H: 'bullish',
      pd4H: 'discount',
      pd1H: 'discount',
      pd15M: 'discount',
    });
    expect(evidence.structure).toEqual({
      eventType: 'BOS',
      eventTimestamp: 2000,
      eventTimeframe: '15m',
      structureScore: 2,
    });
    expect(evidence.poi.zoneHigh).toBe(1.105);
    expect(evidence.poi.zoneLow).toBe(1.1);
    expect(evidence.poi.poiAgeMs).toBe(1000);
    expect(evidence.displacement.bodyPercentage).toBe(50);
    expect(evidence.model.modelState).toBe('confirmed');
    expect(evidence.runtime.executionEligibility).toBe(true);
    expect(evidence.presentationPlanShadow?.mode).toBeDefined();
    expect(evidence.presentationDesignValidationShadow?.designConsistencyScore).toBeGreaterThan(0);
    expect(evidence.governanceSummary?.auditSummary.auditCount).toBeGreaterThan(0);
    expect(evidence.governanceSummary?.versionSummary.governanceVersion).toBe(1);
    expect(evidence.communicationShadow?.message.channel).toBe('Telegram');
    expect(evidence.communicationShadow?.validation.consistencyScore).toBeGreaterThan(0);
    expect(Object.isFrozen(evidence)).toBe(true);
  });

  test('persists signal and completed outcome evidence as append-only JSONL', async () => {
    const store = new JsonlEvidenceStore(testDir);
    const evidence = buildSignalEvidenceRecord(candidate(), execution(), candles());

    await store.appendSignalEvidence(evidence);
    appendCompletedSignalOutcomeEvidenceAsync({
      signalId: 'EURUSD_15m_OB_demo',
      outcomeType: 'TP',
      holdingTimeMs: 60000,
      rrAchieved: 2,
      maximumFavorableExcursion: 18.5,
      maximumAdverseExcursion: 4.2,
      exitTimestamp: 3000,
      exitReason: 'manual validation fixture',
    }, store);
    await new Promise(resolve => setTimeout(resolve, 20));

    const signalPath = path.join(testDir, 'signals', 'signal-evidence.jsonl');
    const outcomePath = path.join(testDir, 'outcomes', 'outcome-evidence.jsonl');
    expect(fs.existsSync(signalPath)).toBe(true);
    expect(fs.existsSync(outcomePath)).toBe(true);

    const signalRows = fs.readFileSync(signalPath, 'utf8').trim().split('\n').map(row => JSON.parse(row));
    const outcomeRows = fs.readFileSync(outcomePath, 'utf8').trim().split('\n').map(row => JSON.parse(row));
    expect(signalRows).toHaveLength(1);
    expect(outcomeRows).toHaveLength(1);
    expect(outcomeRows[0].outcome.type).toBe('TP');
  });

  test('records asynchronously and does not throw when store fails', async () => {
    const failingStore = {
      appendSignalEvidence: jest.fn().mockRejectedValue(new Error('disk full')),
      appendOutcomeEvidence: jest.fn().mockRejectedValue(new Error('disk full')),
    };

    expect(() => recordApprovedSignalEvidenceAsync(candidate(), execution(), candles(), failingStore)).not.toThrow();
    expect(() => appendCompletedSignalOutcomeEvidenceAsync({
      signalId: 'EURUSD_15m_OB_demo',
      outcomeType: 'SL',
      exitTimestamp: 3000,
      exitReason: 'test failure path',
    }, failingStore)).not.toThrow();
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(failingStore.appendSignalEvidence).toHaveBeenCalledTimes(1);
    expect(failingStore.appendOutcomeEvidence).toHaveBeenCalledTimes(1);
  });
});

function candidate(): NotificationCandidate {
  return {
    symbol: 'EURUSD',
    tradeDirection: 'long',
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
    uniqueKey: 'EURUSD_15m_OB_demo',
    signalId: 'EURUSD_15m_OB_demo',
    signalContext: {
      signalId: 'EURUSD_15m_OB_demo',
      pair: 'EURUSD',
      direction: 'long',
      timeframe: '15m',
      grade: 'A+',
      score: 9,
      timestamp: 2000,
      lifecycle: {
        states: ['DETECTED', 'GRADED'],
        currentState: 'GRADED',
      },
    },
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

function execution(): RuntimeExecutionPipelineResult {
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
  } as unknown as RuntimeExecutionPipelineResult;
}

function candles() {
  return [
    { timestamp: 1000, open: 1.1, high: 1.105, low: 1.095, close: 1.102 },
    { timestamp: 2000, open: 1.102, high: 1.108, low: 1.1, close: 1.106 },
  ];
}
