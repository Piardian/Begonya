import { validateDataset } from '../src/outcomeValidation';
import { OUTCOME_LABELING_CONFIG_VERSION, OUTCOME_RESULT_VERSION, OutcomeResult } from '../src/outcomeResult';
import { SignalIntelligenceSnapshot } from '../src/signalIntelligenceSnapshot';

describe('Outcome Dataset Validation', () => {
  test('reports missing outcome as warning and includes coverage', () => {
    const snapshots = [snapshot('a'), snapshot('b')];
    const outcomes = [outcome('a')];

    const report = validateDataset({ snapshots, outcomes });

    expect(report.valid).toBe(true);
    expect(report.coverage).toEqual({
      snapshotCount: 2,
      labeledCount: 1,
      missingOutcomeCount: 1,
      coverageRate: 0.5,
    });
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ severity: 'warning', code: 'MISSING_OUTCOME', candidateId: 'b' }),
      ])
    );
  });

  test('reports duplicate snapshots, duplicate outcomes, and orphan outcomes as errors', () => {
    const report = validateDataset({
      snapshots: [snapshot('dup'), snapshot('dup')],
      outcomes: [outcome('dup'), outcome('dup'), outcome('orphan')],
    });

    expect(report.valid).toBe(false);
    expect(report.issues.map(issue => issue.code)).toEqual(
      expect.arrayContaining(['DUPLICATE_SNAPSHOT', 'DUPLICATE_OUTCOME', 'ORPHAN_OUTCOME'])
    );
  });

  test('reports read errors, unsupported versions, invalid status, invalid reason, and invalid metadata', () => {
    const unsupportedSnapshot = snapshot('bad-snapshot');
    unsupportedSnapshot.snapshotVersion = 99 as any;
    const unsupportedOutcome = outcome('bad-outcome');
    unsupportedOutcome.outcomeVersion = 99 as any;
    const invalidStatus = outcome('bad-status');
    invalidStatus.outcomeStatus = 'WIN' as any;
    const invalidReason = outcome('bad-reason');
    invalidReason.reason = {} as any;
    const invalidMetadata = outcome('bad-metadata');
    invalidMetadata.metadata.labelingConfigVersion = 99 as any;

    const report = validateDataset({
      snapshots: [unsupportedSnapshot, snapshot('bad-outcome'), snapshot('bad-status'), snapshot('bad-reason'), snapshot('bad-metadata')],
      outcomes: [unsupportedOutcome, invalidStatus, invalidReason, invalidMetadata],
      snapshotReadErrors: [{ id: 'snapshot.json', type: 'invalid_json', message: 'broken snapshot' }],
      outcomeReadErrors: [{ id: 'outcome.json', type: 'invalid_json', message: 'broken outcome' }],
    });

    expect(report.valid).toBe(false);
    expect(report.issues.map(issue => issue.code)).toEqual(
      expect.arrayContaining([
        'SNAPSHOT_READ_ERROR',
        'OUTCOME_READ_ERROR',
        'UNSUPPORTED_SNAPSHOT_VERSION',
        'UNSUPPORTED_OUTCOME_VERSION',
        'INVALID_OUTCOME_STATUS',
        'INVALID_OUTCOME_REASON',
        'LABELING_CONFIG_VERSION_MISMATCH',
      ])
    );
  });

  test('reports inconsistent timestamps', () => {
    const invalid = outcome('a');
    invalid.metadata.startTimestamp = Date.UTC(2024, 5, 3, 6, 0, 0);

    const report = validateDataset({
      snapshots: [snapshot('a')],
      outcomes: [invalid],
    });

    expect(report.valid).toBe(false);
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'INCONSISTENT_TIMESTAMPS', candidateId: 'a' }),
      ])
    );
  });
});

export function snapshot(candidateId: string): SignalIntelligenceSnapshot {
  return {
    snapshotVersion: 1,
    timestamp: '2024-06-03T07:00:00.000Z',
    symbol: 'EURUSD',
    timeframe: '15m',
    candidateId,
    candidate: {
      poiType: 'OB',
      tradeDirection: 'long',
      currentPrice: 1.1,
      poiFormedTimestamp: Date.UTC(2024, 5, 3, 6, 30, 0),
      relatedEventType: 'BOS',
      relatedEventTimestamp: Date.UTC(2024, 5, 3, 7, 0, 0),
    },
    signalQuality: {
      version: 1,
      score: 80,
      confidence: 80,
      status: 'excellent',
      metrics: {
        barsSinceFormation: 1,
        barsSinceBreak: 1,
        distanceToPoiPips: 1,
        poiRelation: 'above',
        poiTestCount: 0,
        isFresh: true,
        isNearPoi: true,
        invalidationRisk: 'low',
      },
      marketContext: {
        session: 'london',
        killzone: true,
        dayOfWeek: 1,
        hourTR: 10,
      },
      reasons: [],
      warnings: [],
    },
    grade: {
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
    engine: {
      signalQualityVersion: 1,
      gradeVersion: 1,
    },
  };
}

export function outcome(candidateId: string, status: OutcomeResult['outcomeStatus'] = 'TP'): OutcomeResult {
  return {
    outcomeVersion: OUTCOME_RESULT_VERSION,
    candidateId,
    labeledAt: '2024-06-03T07:02:00.000Z',
    outcomeStatus: status,
    completionReason: status === 'TP' ? 'take_profit_hit' : 'stop_loss_hit',
    reason: {
      reasonCode: status === 'TP' ? 'TAKE_PROFIT_LEVEL_REACHED' : 'STOP_LOSS_LEVEL_REACHED',
      reasonMessage: 'Test reason',
    },
    metadata: {
      labelingConfigVersion: OUTCOME_LABELING_CONFIG_VERSION,
      evaluatedCandles: 2,
      startTimestamp: Date.UTC(2024, 5, 3, 7, 1, 0),
      endTimestamp: Date.UTC(2024, 5, 3, 7, 2, 0),
      resolvedAtTimestamp: Date.UTC(2024, 5, 3, 7, 2, 0),
      resolvedAtIndex: 1,
      maxFavorableExcursionPips: 20,
      maxAdverseExcursionPips: 5,
      evaluationDurationBars: 2,
      evaluationCompleted: true,
    },
  };
}
