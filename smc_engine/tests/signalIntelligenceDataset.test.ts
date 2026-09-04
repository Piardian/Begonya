import * as fs from 'fs';
import * as path from 'path';
import {
  FileSignalIntelligenceSnapshotSource,
  InMemorySnapshotSource,
  SignalIntelligenceSnapshotReader,
} from '../src/signalIntelligenceSnapshotReader';
import {
  calculateDatasetStatistics,
  SignalIntelligenceDataset,
  validateSignalIntelligenceDataset,
} from '../src/signalIntelligenceDataset';
import { SignalIntelligenceSnapshot } from '../src/signalIntelligenceSnapshot';

describe('Evidence Collection Engine', () => {
  test('reader parses valid snapshots and reports broken JSON without throwing', () => {
    const valid = buildSnapshot({ candidateId: 'valid-1' });
    const reader = new SignalIntelligenceSnapshotReader(
      new InMemorySnapshotSource([
        { id: 'broken.json', raw: '{ nope' },
        { id: 'valid.json', raw: JSON.stringify(valid) },
      ])
    );

    const result = reader.readAll();

    expect(result.snapshots).toEqual([valid]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].type).toBe('invalid_json');
  });

  test('file source reads snapshot files recursively in deterministic order', () => {
    const testDir = path.join(__dirname, 'temp_evidence_reader');
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });

    fs.mkdirSync(path.join(testDir, 'GBPUSD', '15m'), { recursive: true });
    fs.mkdirSync(path.join(testDir, 'EURUSD', '15m'), { recursive: true });
    fs.writeFileSync(path.join(testDir, 'GBPUSD', '15m', 'b.json'), JSON.stringify(buildSnapshot({ candidateId: 'b', symbol: 'GBPUSD' })));
    fs.writeFileSync(path.join(testDir, 'EURUSD', '15m', 'a.json'), JSON.stringify(buildSnapshot({ candidateId: 'a', symbol: 'EURUSD' })));

    const source = new FileSignalIntelligenceSnapshotSource(testDir);
    const entries = source.list();

    expect(entries.map(entry => entry.id)).toEqual(['EURUSD/15m/a.json', 'GBPUSD/15m/b.json']);

    fs.rmSync(testDir, { recursive: true, force: true });
  });

  test('dataset query supports where, sort, and limit without mutating the original dataset', () => {
    const snapshots = [
      buildSnapshot({ candidateId: 'c', symbol: 'EURUSD', grade: 'A+', status: 'excellent', timestamp: '2024-06-03T07:30:00.000Z' }),
      buildSnapshot({ candidateId: 'a', symbol: 'EURUSD', grade: 'A', status: 'good', timestamp: '2024-06-03T07:10:00.000Z' }),
      buildSnapshot({ candidateId: 'b', symbol: 'GBPUSD', grade: 'A+', status: 'excellent', timestamp: '2024-06-03T07:20:00.000Z' }),
    ];
    const dataset = SignalIntelligenceDataset.fromSnapshots(snapshots);

    const queried = dataset.query({
      where: { symbol: 'EURUSD' },
      sort: { by: 'timestamp', direction: 'asc' },
      limit: 1,
    });

    expect(queried.snapshots().map(snapshot => snapshot.candidateId)).toEqual(['a']);
    expect(dataset.snapshots().map(snapshot => snapshot.candidateId)).toEqual(['c', 'a', 'b']);
  });

  test('validation reports duplicates, invalid schema, read errors, and version compatibility warnings', () => {
    const valid = buildSnapshot({ candidateId: 'dup' });
    const duplicate = buildSnapshot({ candidateId: 'dup' });
    const incompatible = buildSnapshot({ candidateId: 'version-warning' });
    incompatible.engine.signalQualityVersion = 3 as any;
    const invalid = { candidateId: 'invalid' } as unknown as SignalIntelligenceSnapshot;

    const report = validateSignalIntelligenceDataset(
      [valid, duplicate, incompatible, invalid],
      [{ id: 'broken.json', type: 'invalid_json', message: 'Unexpected token' }]
    );

    expect(report.valid).toBe(false);
    expect(report.totalSnapshots).toBe(4);
    expect(report.issues.map(issue => issue.code)).toEqual(
      expect.arrayContaining([
        'READ_ERROR',
        'DUPLICATE_CANDIDATE_ID',
        'VERSION_COMPATIBILITY_WARNING',
        'INVALID_SCHEMA',
      ])
    );
  });

  test('statistics returns deterministic distribution counts', () => {
    const snapshots = [
      buildSnapshot({ candidateId: '1', symbol: 'EURUSD', grade: 'A+', status: 'excellent' }),
      buildSnapshot({ candidateId: '2', symbol: 'EURUSD', grade: 'A', status: 'good' }),
      buildSnapshot({ candidateId: '3', symbol: 'GBPUSD', grade: 'A+', status: 'excellent' }),
    ];

    expect(calculateDatasetStatistics(snapshots)).toEqual({
      totalSnapshots: 3,
      symbols: { EURUSD: 2, GBPUSD: 1 },
      timeframes: { '15m': 3 },
      grades: { 'A+': 2, A: 1 },
      signalQualityStatuses: { excellent: 2, good: 1 },
      snapshotVersions: { '1': 3 },
    });
  });
});

function buildSnapshot(overrides: {
  candidateId?: string;
  symbol?: 'EURUSD' | 'GBPUSD';
  grade?: 'A+' | 'A' | 'B+' | 'B' | 'C';
  status?: 'excellent' | 'good' | 'risky' | 'invalid';
  timestamp?: string;
} = {}): SignalIntelligenceSnapshot {
  const candidateId = overrides.candidateId ?? 'candidate-1';
  const symbol = overrides.symbol ?? 'EURUSD';
  const grade = overrides.grade ?? 'A+';
  const status = overrides.status ?? 'excellent';
  const timestamp = overrides.timestamp ?? '2024-06-03T07:00:00.000Z';

  return {
    snapshotVersion: 1,
    timestamp,
    symbol,
    timeframe: '15m',
    candidateId,
    candidate: {
      poiType: 'OB',
      tradeDirection: 'long',
      currentPrice: 1.101,
      poiFormedTimestamp: Date.UTC(2024, 5, 3, 6, 30, 0),
      relatedEventType: 'BOS',
      relatedEventTimestamp: Date.UTC(2024, 5, 3, 7, 0, 0),
    },
    signalQuality: {
      version: 1,
      score: 86,
      confidence: 81,
      status,
      metrics: {
        barsSinceFormation: 12,
        barsSinceBreak: 10,
        distanceToPoiPips: 8,
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
      reasons: [
        {
          code: 'FRESH_POI',
          severity: 'info',
          source: 'SignalQualityEngine',
          message: 'POI is fresh.',
          value: 12,
        },
      ],
      warnings: [],
    },
    grade: {
      totalScore: grade === 'A+' ? 9 : 5,
      grade,
      entryAllowed: grade === 'A+' || grade === 'A' || grade === 'B+',
      blockReasons: [],
      breakdown: {
        htfBiasPD: 2,
        displacement: 2,
        structure: 2,
        sweep: 2,
        poiQuality: grade === 'A+' ? 1 : -1,
      },
    },
    engine: {
      signalQualityVersion: 1,
      gradeVersion: 1,
    },
  };
}
