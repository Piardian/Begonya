import * as fs from 'fs';
import * as path from 'path';
import { PaperOutcomeTracker } from '../server/paperOutcomeTracker';
import { FileMacroOutcomeStore } from '../server/macroOutcomeEvidence';
import { NotificationCandidate } from '../server/pipeline';
import { StoredCandle } from '../server/candleStore';

describe('PaperOutcomeTracker Macro Integration Lifecycle', () => {
  const testDir = path.join(__dirname, 'tmp_integration_tracker');
  const statePath = path.join(testDir, 'test-outcome-state.json');
  const macroEvidencePath = path.join(testDir, 'test-macro-outcomes.jsonl');

  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  test('registers candidate, enters trade on candle touch, reaches TP and writes macro outcome record', async () => {
    const macroOutcomeStore = new FileMacroOutcomeStore(macroEvidencePath);
    const tracker = new PaperOutcomeTracker({
      statePath,
      macroOutcomeStore,
      config: {
        entryExpiryMs: 24 * 3600 * 1000,
        riskReward: 2.0,
        breakEvenAtR: 1.0,
        stopBufferPips: 2,
      },
    });

    const now = 1700000000000;
    const candidate: NotificationCandidate = {
      symbol: 'BTCUSD',
      tradeDirection: 'long',
      poiType: 'OB',
      currentPrice: 65100,
      poiFormedTimestamp: now - 3600000,
      marketDataTimestamp: now,
      bias4H: 'bullish',
      bias1H: 'bullish',
      poiTestCount: 0,
      pd4H: 'discount',
      pd1H: 'discount',
      poi: {
        formedAtIndex: 10,
        low: 64900,
        high: 65000,
        relatedEvent: {
          breakTimestamp: now - 1800000,
        },
      } as any,
      gradeResult: {
        grade: 'A',
        totalScore: 88,
        entryAllowed: true,
        breakdown: {} as any,
        blockReasons: [],
      },
      uniqueKey: 'test_integration_btc_1',
      signalId: 'test_integration_btc_1',
    };

    // 1. Register candidate
    tracker.registerCandidate(candidate);
    const tracked = tracker.get('test_integration_btc_1');
    expect(tracked).toBeDefined();
    expect(tracked?.status).toBe('WAITING_ENTRY');
    expect(tracked?.macroSnapshot).toBeDefined();
    expect(tracked?.macroSnapshot?.isCrypto).toBe(true);

    // 2. Feed candle that touches zone -> enters OPEN
    const candleEntry: StoredCandle = {
      timestamp: now + 15 * 60 * 1000,
      open: 65050,
      high: 65050,
      low: 64950, // touches zone [64900, 65000]
      close: 65020,
    };
    tracker.update('BTCUSD', [candleEntry]);

    const openSignal = tracker.get('test_integration_btc_1');
    expect(openSignal?.status).toBe('OPEN');
    expect(openSignal?.entryPrice).toBe(65000);
    expect(openSignal?.takeProfit).toBeDefined();
    expect(openSignal?.stopLoss).toBeDefined();

    // 3. Feed candle that reaches TP
    const tpTarget = openSignal!.takeProfit!;
    const candleTP: StoredCandle = {
      timestamp: now + 30 * 60 * 1000,
      open: 65020,
      high: tpTarget + 100,
      low: 65010,
      close: tpTarget + 50,
    };
    tracker.update('BTCUSD', [candleTP]);

    const closedSignal = tracker.get('test_integration_btc_1');
    expect(closedSignal?.status).toBe('CLOSED');
    expect(closedSignal?.outcome).toBe('TP');

    // 4. Verify durable macro outcome evidence record was appended
    await new Promise(resolve => setTimeout(resolve, 50));
    const records = await macroOutcomeStore.readAllRecords();
    expect(records).toHaveLength(1);
    expect(records[0].signalId).toBe('test_integration_btc_1');
    expect(records[0].outcome).toBe('TP');
    expect(records[0].realizedR).toBe(2.0);
    expect(records[0].macroSnapshot).toBeDefined();
    expect(records[0].macroSnapshot.isCrypto).toBe(true);
    expect(records[0].macroSnapshot.primaryRegime).toBeDefined();
  });
});
