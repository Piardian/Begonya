import * as fs from 'fs';
import * as path from 'path';
import {
  createSignalIntelligenceSnapshot,
  GRADE_ENGINE_VERSION,
  SIGNAL_INTELLIGENCE_SNAPSHOT_VERSION,
} from '../src/signalIntelligenceSnapshot';
import { SignalQualityResult } from '../src/signalQualityEngine';
import { FileSignalIntelligenceSnapshotWriter } from '../server/signalIntelligenceSnapshotStore';

describe('SignalIntelligenceSnapshot', () => {
  test('creates a deterministic versioned domain snapshot', () => {
    const input = buildSnapshotInput();

    const first = createSignalIntelligenceSnapshot(input);
    const second = createSignalIntelligenceSnapshot(input);

    expect(second).toEqual(first);
    expect(first.snapshotVersion).toBe(SIGNAL_INTELLIGENCE_SNAPSHOT_VERSION);
    expect(first.timestamp).toBe('2024-06-03T07:00:00.000Z');
    expect(first.engine).toEqual({
      signalQualityVersion: 1,
      gradeVersion: GRADE_ENGINE_VERSION,
    });
  });

  test('writes snapshots through a storage adapter without changing snapshot shape', () => {
    const testDir = path.join(__dirname, 'temp_signal_intelligence_snapshots');
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }

    const snapshot = createSignalIntelligenceSnapshot({
      ...buildSnapshotInput(),
      candidateId: 'EURUSD/15m OB:demo candidate',
    });
    const writer = new FileSignalIntelligenceSnapshotWriter(testDir);

    writer.write(snapshot);

    const expectedPath = path.join(testDir, 'EURUSD', '15m', 'EURUSD_15m_OB_demo_candidate.json');
    expect(fs.existsSync(expectedPath)).toBe(true);
    expect(JSON.parse(fs.readFileSync(expectedPath, 'utf8'))).toEqual(snapshot);

    fs.rmSync(testDir, { recursive: true, force: true });
  });
});

function buildSnapshotInput() {
  const signalQuality: SignalQualityResult = {
    version: 1,
    score: 86,
    confidence: 81,
    status: 'excellent',
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
  };

  return {
    symbol: 'EURUSD' as const,
    timeframe: '15m' as const,
    candidateId: 'EURUSD_15m_OB_1717400000000_1717407600000',
    candidate: {
      poiType: 'OB' as const,
      tradeDirection: 'long' as const,
      currentPrice: 1.101,
      poiFormedTimestamp: Date.UTC(2024, 5, 3, 6, 30, 0),
      relatedEventType: 'BOS' as const,
      relatedEventTimestamp: Date.UTC(2024, 5, 3, 7, 0, 0),
    },
    signalQuality,
    grade: {
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
  };
}
