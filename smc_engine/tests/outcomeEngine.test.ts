import * as fs from 'fs';
import * as path from 'path';
import { labelOutcome } from '../src/outcomeEngine';
import {
  OUTCOME_LABELING_CONFIG_VERSION,
  OutcomeLabelingConfig,
  OutcomeResult,
} from '../src/outcomeResult';
import { InMemoryOutcomeSource, OutcomeReader } from '../src/outcomeReader';
import { joinSnapshotsWithOutcomes } from '../src/outcomeDataset';
import { SignalIntelligenceSnapshot } from '../src/signalIntelligenceSnapshot';
import { Candle } from '../src/types';
import { FileOutcomeWriter } from '../server/outcomeStore';

describe('Outcome Engine', () => {
  test('labels long TP deterministically with evaluation metadata', () => {
    const input = {
      snapshot: buildSnapshot({ tradeDirection: 'long', currentPrice: 1.1000 }),
      futureCandles: [
        candle(1, 1.1000, 1.1010, 1.0998, 1.1005),
        candle(2, 1.1005, 1.1021, 1.1002, 1.1018),
      ],
      config: config(),
    };

    const first = labelOutcome(input);
    const second = labelOutcome(input);

    expect(second).toEqual(first);
    expect(first.outcomeStatus).toBe('TP');
    expect(first.completionReason).toBe('take_profit_hit');
    expect(first.reason.reasonCode).toBe('TAKE_PROFIT_LEVEL_REACHED');
    expect(first.metadata).toMatchObject({
      labelingConfigVersion: 1,
      evaluatedCandles: 2,
      resolvedAtIndex: 1,
      evaluationDurationBars: 2,
      evaluationCompleted: true,
      maxFavorableExcursionPips: 21,
      maxAdverseExcursionPips: 2,
    });
  });

  test('labels long SL', () => {
    const outcome = labelOutcome({
      snapshot: buildSnapshot({ tradeDirection: 'long', currentPrice: 1.1000 }),
      futureCandles: [candle(1, 1.1000, 1.1002, 1.0989, 1.0990)],
      config: config(),
    });

    expect(outcome.outcomeStatus).toBe('SL');
    expect(outcome.reason.reasonCode).toBe('STOP_LOSS_LEVEL_REACHED');
  });

  test('labels short TP and short SL', () => {
    const shortTp = labelOutcome({
      snapshot: buildSnapshot({ tradeDirection: 'short', currentPrice: 1.1000 }),
      futureCandles: [candle(1, 1.1000, 1.1002, 1.0979, 1.0981)],
      config: config(),
    });
    const shortSl = labelOutcome({
      snapshot: buildSnapshot({ tradeDirection: 'short', currentPrice: 1.1000 }),
      futureCandles: [candle(1, 1.1000, 1.1011, 1.0998, 1.1010)],
      config: config(),
    });

    expect(shortTp.outcomeStatus).toBe('TP');
    expect(shortSl.outcomeStatus).toBe('SL');
  });

  test('labels BE when break-even is reached before TP or SL', () => {
    const outcome = labelOutcome({
      snapshot: buildSnapshot({ tradeDirection: 'long', currentPrice: 1.1000 }),
      futureCandles: [candle(1, 1.1000, 1.1006, 1.0998, 1.1004)],
      config: config({ breakEvenPips: 5 }),
    });

    expect(outcome.outcomeStatus).toBe('BE');
    expect(outcome.reason.reasonCode).toBe('BREAK_EVEN_LEVEL_REACHED');
  });

  test('labels EXPIRED when full window completes without resolution', () => {
    const outcome = labelOutcome({
      snapshot: buildSnapshot({ tradeDirection: 'long', currentPrice: 1.1000 }),
      futureCandles: [
        candle(1, 1.1000, 1.1005, 1.0997, 1.1002),
        candle(2, 1.1002, 1.1006, 1.0996, 1.1001),
      ],
      config: config({ expiryBars: 2 }),
    });

    expect(outcome.outcomeStatus).toBe('EXPIRED');
    expect(outcome.completionReason).toBe('expired_without_resolution');
    expect(outcome.metadata.evaluationCompleted).toBe(true);
  });

  test('labels UNKNOWN when future data is insufficient', () => {
    const outcome = labelOutcome({
      snapshot: buildSnapshot({ tradeDirection: 'long', currentPrice: 1.1000 }),
      futureCandles: [candle(1, 1.1000, 1.1005, 1.0997, 1.1002)],
      config: config({ expiryBars: 3 }),
    });

    expect(outcome.outcomeStatus).toBe('UNKNOWN');
    expect(outcome.completionReason).toBe('insufficient_future_data');
    expect(outcome.metadata.evaluationCompleted).toBe(false);
  });

  test('applies same candle collision policy', () => {
    const collisionCandle = candle(1, 1.1000, 1.1021, 1.0989, 1.1000);

    expect(labelOutcome({
      snapshot: buildSnapshot({ tradeDirection: 'long', currentPrice: 1.1000 }),
      futureCandles: [collisionCandle],
      config: config({ sameCandleCollisionPolicy: 'SL_FIRST' }),
    }).outcomeStatus).toBe('SL');

    expect(labelOutcome({
      snapshot: buildSnapshot({ tradeDirection: 'long', currentPrice: 1.1000 }),
      futureCandles: [collisionCandle],
      config: config({ sameCandleCollisionPolicy: 'TP_FIRST' }),
    }).outcomeStatus).toBe('TP');

    expect(labelOutcome({
      snapshot: buildSnapshot({ tradeDirection: 'long', currentPrice: 1.1000 }),
      futureCandles: [collisionCandle],
      config: config({ sameCandleCollisionPolicy: 'UNKNOWN' }),
    }).outcomeStatus).toBe('UNKNOWN');
  });

  test('reader reports invalid JSON and join links only by candidateId with optional outcome', () => {
    const snapshotA = buildSnapshot({ candidateId: 'a' });
    const snapshotB = buildSnapshot({ candidateId: 'b' });
    const outcomeA = labelOutcome({
      snapshot: snapshotA,
      futureCandles: [candle(1, 1.1000, 1.1021, 1.1000, 1.1020)],
      config: config(),
    });
    const reader = new OutcomeReader(
      new InMemoryOutcomeSource([
        { id: 'bad.json', raw: '{ bad' },
        { id: 'a.json', raw: JSON.stringify(outcomeA) },
      ])
    );

    const readResult = reader.readAll();
    const joined = joinSnapshotsWithOutcomes([snapshotA, snapshotB], readResult.outcomes);

    expect(readResult.errors).toHaveLength(1);
    expect(joined[0].outcome?.candidateId).toBe('a');
    expect(joined[1].outcome).toBeUndefined();
  });

  test('file outcome writer persists outcomes separately from snapshots', () => {
    const testDir = path.join(__dirname, 'temp_outcomes');
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });

    const outcome = labelOutcome({
      snapshot: buildSnapshot({ candidateId: 'EURUSD/15m outcome demo' }),
      futureCandles: [candle(1, 1.1000, 1.1021, 1.1000, 1.1020)],
      config: config(),
    });
    const writer = new FileOutcomeWriter(testDir);

    writer.write(outcome, { symbol: 'EURUSD', timeframe: '15m' });

    const expectedPath = path.join(testDir, 'EURUSD', '15m', 'EURUSD_15m_outcome_demo.json');
    expect(JSON.parse(fs.readFileSync(expectedPath, 'utf8'))).toEqual(outcome);

    fs.rmSync(testDir, { recursive: true, force: true });
  });
});

function config(overrides: Partial<OutcomeLabelingConfig> = {}): OutcomeLabelingConfig {
  return {
    version: OUTCOME_LABELING_CONFIG_VERSION,
    takeProfitPips: 20,
    stopLossPips: 10,
    expiryBars: 5,
    sameCandleCollisionPolicy: 'SL_FIRST',
    ...overrides,
  };
}

function candle(
  minutesAfterBase: number,
  open: number,
  high: number,
  low: number,
  close: number
): Candle {
  return {
    timestamp: Date.UTC(2024, 5, 3, 7, minutesAfterBase, 0),
    open,
    high,
    low,
    close,
  };
}

function buildSnapshot(overrides: {
  candidateId?: string;
  tradeDirection?: 'long' | 'short';
  currentPrice?: number;
} = {}): SignalIntelligenceSnapshot {
  return {
    snapshotVersion: 1,
    timestamp: '2024-06-03T07:00:00.000Z',
    symbol: 'EURUSD',
    timeframe: '15m',
    candidateId: overrides.candidateId ?? 'candidate-1',
    candidate: {
      poiType: 'OB',
      tradeDirection: overrides.tradeDirection ?? 'long',
      currentPrice: overrides.currentPrice ?? 1.1000,
      poiFormedTimestamp: Date.UTC(2024, 5, 3, 6, 30, 0),
      relatedEventType: 'BOS',
      relatedEventTimestamp: Date.UTC(2024, 5, 3, 7, 0, 0),
    },
    signalQuality: {
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
