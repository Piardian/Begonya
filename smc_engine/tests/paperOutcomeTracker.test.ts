import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { JsonlEvidenceStore } from '../server/evidenceStore';
import { PaperOutcomeTracker } from '../server/paperOutcomeTracker';
import type { NotificationCandidate } from '../server/pipeline';
import type { StoredCandle } from '../server/candleStore';
import type { OrderBlock, StructureEvent, SwingPoint } from '../src/types';
import type { LiquidityMagnet } from '../src/liquidityMagnetDetector';
import type { OpposingObstacle } from '../src/opposingObstacleDetector';

function candle(timestamp: number, open: number, high: number, low: number, close: number): StoredCandle {
  return { timestamp, open, high, low, close };
}

function candidate(signalId: string, direction: 'long' | 'short' = 'long', extras?: { liquidityMagnet?: LiquidityMagnet | null; opposingObstacle?: OpposingObstacle | null }): NotificationCandidate {
  const brokenSwing: SwingPoint = {
    type: direction === 'long' ? 'high' : 'low',
    price: direction === 'long' ? 1.101 : 1.099,
    formedAtIndex: 0,
    confirmedAtIndex: 0,
    timestamp: 1_000,
  };
  const event: StructureEvent = {
    type: 'BOS',
    direction: direction === 'long' ? 'bullish' : 'bearish',
    brokenSwing,
    breakCandleIndex: 1,
    breakTimestamp: 1_000,
    breakClosePrice: direction === 'long' ? 1.101 : 1.099,
  };
  const poi: OrderBlock = {
    direction: direction === 'long' ? 'bullish' : 'bearish',
    candleIndex: 1,
    high: 1.1000,
    low: 1.0990,
    formedAtIndex: 1,
    relatedEvent: event,
  };

  return {
    symbol: 'EURUSD',
    tradeDirection: direction,
    poiType: 'OB',
    poi,
    gradeResult: {
      totalScore: 9,
      grade: 'A+',
      entryAllowed: true,
      blockReasons: [],
      breakdown: {
        htfBiasPD: 1,
        structure: 1,
        displacement: 1,
        sweep: 1,
        poi: 1,
        riskReward: 1,
        freshness: 1,
        liquidity: 1,
        opposingObstacle: 1,
      },
      poiIntegrity: { quality: 'clean', testCount: 0, score: 1 },
    },
    uniqueKey: signalId,
    signalId,
    currentPrice: direction === 'long' ? 1.1020 : 1.0980,
    marketDataTimestamp: 1_000,
    poiFormedTimestamp: 1_000,
    poiTimeframe: '15m',
    validationClosePrice: direction === 'long' ? 1.1020 : 1.0980,
    validationCloseTimestamp: 1_000,
    bias4H: direction === 'long' ? 'bullish' : 'bearish',
    bias1H: direction === 'long' ? 'bullish' : 'bearish',
    poiTestCount: 0,
    pd4H: direction === 'long' ? 'discount' : 'premium',
    pd1H: direction === 'long' ? 'discount' : 'premium',
    pd15M: direction === 'long' ? 'discount' : 'premium',
    liquidityMagnet: extras?.liquidityMagnet,
    opposingObstacle: extras?.opposingObstacle,
  } as unknown as NotificationCandidate;
}

function makeTracker(): { tracker: PaperOutcomeTracker; root: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'begonya-outcome-'));
  return {
    root,
    tracker: new PaperOutcomeTracker({
      statePath: path.join(root, 'ledger.json'),
      evidenceStore: new JsonlEvidenceStore(path.join(root, 'evidence')),
    }),
  };
}

describe('PaperOutcomeTracker', () => {
  test('closes a long signal at TP after a zone retest', () => {
    const { tracker } = makeTracker();
    tracker.registerCandidate(candidate('tp-long'));
    tracker.update('EURUSD', [
      candle(2_000, 1.1020, 1.1000, 1.0992, 1.0996),
      candle(3_000, 1.0996, 1.1025, 1.0995, 1.1020),
    ]);

    const result = tracker.get('tp-long');
    expect(result?.status).toBe('CLOSED');
    expect(result?.outcome).toBe('TP');
    expect(result?.takeProfit).toBeGreaterThan(result.entryPrice ?? 0);
  });

  test('closes a long signal at SL before BE activation', () => {
    const { tracker } = makeTracker();
    tracker.registerCandidate(candidate('sl-long'));
    tracker.update('EURUSD', [
      candle(2_000, 1.1020, 1.1000, 1.0992, 1.0995),
      candle(3_000, 1.0995, 1.0997, 1.0985, 1.0988),
    ]);

    expect(tracker.get('sl-long')?.outcome).toBe('SL');
  });

  test('arms BE at 1R and closes at BE on a later retrace', () => {
    const { tracker } = makeTracker();
    tracker.registerCandidate(candidate('be-long'));
    tracker.update('EURUSD', [
      candle(2_000, 1.1020, 1.1000, 1.0992, 1.0995),
      candle(3_000, 1.0995, 1.1013, 1.0994, 1.1008),
      candle(4_000, 1.1008, 1.1009, 1.0998, 1.1000),
    ]);

    const result = tracker.get('be-long');
    expect(result?.beArmed).toBe(true);
    expect(result?.outcome).toBe('BE');
  });

  test('expires a signal that never reaches the entry zone', () => {
    const { tracker } = makeTracker();
    tracker.registerCandidate(candidate('expire-long'));
    tracker.update('EURUSD', [candle(172_801_001, 1.1030, 1.1040, 1.1025, 1.1035)]);

    expect(tracker.get('expire-long')?.outcome).toBe('EXPIRED');
  });

  test('marks same-candle TP and SL as UNKNOWN instead of guessing execution order', () => {
    const { tracker } = makeTracker();
    tracker.registerCandidate(candidate('ambiguous-long'));
    tracker.update('EURUSD', [
      candle(2_000, 1.1020, 1.1025, 1.0980, 1.0995),
    ]);

    expect(tracker.get('ambiguous-long')?.outcome).toBe('UNKNOWN');
  });
  test('uses the nearest favorable liquidity magnet or opposing obstacle instead of forcing 2R', () => {
    const { tracker } = makeTracker();
    tracker.registerCandidate(candidate('target-liquidity', 'long', {
      liquidityMagnet: {
        type: 'EQH',
        priceLevel: 1.1015,
        pointsCount: 2,
        distancePips: 15,
        isActive: true,
        description: 'test EQH',
      },
      opposingObstacle: {
        hasObstacle: true,
        obstacleType: 'OB',
        timeframe: '15m',
        level: { low: 1.1030, high: 1.1040 },
        distancePips: 30,
        warningText: 'test obstacle',
      },
    }));
    tracker.update('EURUSD', [
      candle(2_000, 1.1020, 1.1000, 1.0992, 1.0996),
    ]);

    const result = tracker.get('target-liquidity');
    expect(result?.status).toBe('OPEN');
    expect(result?.targetSource).toBe('LIQUIDITY_MAGNET');
    expect(result?.takeProfit).toBeCloseTo(1.1015, 6);
  });

  test('caps target at the opposing obstacle when liquidity is beyond it', () => {
    const { tracker } = makeTracker();
    tracker.registerCandidate(candidate('target-obstacle', 'long', {
      liquidityMagnet: {
        type: 'EQH',
        priceLevel: 1.1050,
        pointsCount: 2,
        distancePips: 50,
        isActive: true,
        description: 'test EQH',
      },
      opposingObstacle: {
        hasObstacle: true,
        obstacleType: 'OB',
        timeframe: '15m',
        level: { low: 1.1025, high: 1.1035 },
        distancePips: 25,
        warningText: 'test obstacle',
      },
    }));
    tracker.update('EURUSD', [
      candle(2_000, 1.1020, 1.1000, 1.0992, 1.0996),
    ]);

    const result = tracker.get('target-obstacle');
    expect(result?.status).toBe('OPEN');
    expect(result?.targetSource).toBe('OPPOSING_OBSTACLE');
    expect(result?.takeProfit).toBeCloseTo(1.1025, 6);
  });

});
