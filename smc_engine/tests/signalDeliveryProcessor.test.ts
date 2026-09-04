import * as fs from 'fs';
import * as path from 'path';
import { CandleStore } from '../server/candleStore';
import { NotifiedStore } from '../server/notifiedStore';
import { NotificationCandidate } from '../server/pipeline';
import { createSignalDeliveryProcessor } from '../server/signalDeliveryProcessor';
import { QueuedSignalDelivery } from '../server/signalDeliveryQueue';
import * as twelveDataClient from '../server/twelveDataClient';

describe('signal delivery processor failure classification', () => {
  const testDir = path.join(__dirname, 'temp_signal_delivery_processor_test');

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  test('classifies candidate refresh failure as retryable DATA_FAILED', async () => {
    jest.spyOn(twelveDataClient, 'fetchCandles').mockRejectedValue(new Error('provider timeout'));
    const candidate = buildCandidate();
    const notifiedStore = new NotifiedStore(testDir);
    notifiedStore.reservePending([candidate.uniqueKey]);
    const processor = createSignalDeliveryProcessor(new CandleStore(testDir), notifiedStore);

    const result = await processor(buildQueueItem(candidate));

    expect(result).toEqual({ outcome: 'DATA_FAILED', failureReason: 'provider timeout' });
    expect(notifiedStore.hasBeenNotified(candidate.uniqueKey)).toBe(true);
  });
});

function buildQueueItem(candidate: NotificationCandidate): QueuedSignalDelivery {
  const timestamp = new Date('2026-08-16T08:00:00.000Z').toISOString();
  return {
    signalId: candidate.uniqueKey,
    symbol: candidate.symbol,
    candidate,
    signalCreatedAt: timestamp,
    validationPassedAt: timestamp,
    queuedAt: timestamp,
    priorityScore: 1000,
    state: 'DISPATCHING',
    deliveryAttemptCount: 1,
    lastDeliveryAttemptAt: timestamp,
    nextDeliveryAttemptAt: null,
    dispatchStartedAt: timestamp,
    telegramSentAt: null,
    failureReason: null,
  };
}

function buildCandidate(): NotificationCandidate {
  return {
    symbol: 'EURUSD',
    tradeDirection: 'long',
    poiType: 'OB',
    poi: {
      direction: 'bullish',
      high: 1.1,
      low: 1.09,
      relatedEvent: {
        type: 'BOS',
        direction: 'bullish',
        breakTimestamp: Date.parse('2026-08-16T07:55:00.000Z'),
      },
    },
    gradeResult: { grade: 'A+', totalScore: 9, blockReasons: [] },
    uniqueKey: 'processor-test-signal',
    currentPrice: 1.095,
    poiFormedTimestamp: Date.parse('2026-08-16T07:50:00.000Z'),
  } as unknown as NotificationCandidate;
}
