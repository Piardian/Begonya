import * as fs from 'fs';
import * as path from 'path';
import { NotificationCandidate } from '../server/pipeline';
import { QueuedSignalDelivery, SignalDeliveryQueue } from '../server/signalDeliveryQueue';

describe('SignalDeliveryQueue reliability', () => {
  const testDir = path.join(__dirname, 'temp_signal_delivery_queue_test');

  beforeEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  afterAll(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  test('retries a transient Telegram failure after deterministic backoff', async () => {
    let now = Date.parse('2026-08-16T08:00:00.000Z');
    const processDelivery = jest.fn()
      .mockResolvedValueOnce({ outcome: 'TELEGRAM_FAILED', failureReason: 'network timeout' })
      .mockResolvedValueOnce({ outcome: 'SENT' });
    const queue = new SignalDeliveryQueue({
      dataDir: testDir,
      now: () => now,
      retryBaseDelayMs: 1_000,
      processDelivery,
    });

    queue.enqueue(candidate(), new Date(now).toISOString());
    await queue.drainOnce();

    expect(queue.list()[0]).toEqual(expect.objectContaining({
      state: 'RATE_LIMIT_RETRY',
      deliveryAttemptCount: 1,
      nextDeliveryAttemptAt: new Date(now + 1_000).toISOString(),
    }));

    await queue.drainOnce();
    expect(processDelivery).toHaveBeenCalledTimes(1);

    now += 1_000;
    await queue.drainOnce();
    expect(processDelivery).toHaveBeenCalledTimes(2);
    expect(queue.list()[0]).toEqual(expect.objectContaining({
      state: 'SENT',
      deliveryAttemptCount: 2,
      telegramSentAt: new Date(now).toISOString(),
    }));
  });

  test('stops after the configured attempt limit and invokes terminal cleanup once', async () => {
    let now = Date.parse('2026-08-16T08:00:00.000Z');
    const terminalCleanup = jest.fn();
    const queue = new SignalDeliveryQueue({
      dataDir: testDir,
      now: () => now,
      maxDeliveryAttempts: 2,
      retryBaseDelayMs: 100,
      processDelivery: async () => ({ outcome: 'TELEGRAM_FAILED', failureReason: 'Telegram unavailable' }),
      onTerminalFailure: terminalCleanup,
    });

    queue.enqueue(candidate(), new Date(now).toISOString());
    await queue.drainOnce();
    now += 100;
    await queue.drainOnce();

    expect(queue.list()[0]).toEqual(expect.objectContaining({
      state: 'TELEGRAM_FAILED',
      deliveryAttemptCount: 2,
      nextDeliveryAttemptAt: null,
    }));
    expect(terminalCleanup).toHaveBeenCalledTimes(1);

    await queue.drainOnce();
    expect(terminalCleanup).toHaveBeenCalledTimes(1);
  });

  test('recovers a persisted DISPATCHING item after restart', async () => {
    const now = Date.parse('2026-08-16T08:00:00.000Z');
    fs.mkdirSync(testDir, { recursive: true });
    const persisted: Omit<QueuedSignalDelivery, 'nextDeliveryAttemptAt'> = {
      signalId: 'queue-test-signal',
      symbol: 'EURUSD',
      candidate: candidate(),
      signalCreatedAt: new Date(now - 10_000).toISOString(),
      validationPassedAt: new Date(now - 5_000).toISOString(),
      queuedAt: new Date(now - 5_000).toISOString(),
      priorityScore: 1000,
      state: 'DISPATCHING',
      deliveryAttemptCount: 1,
      lastDeliveryAttemptAt: new Date(now - 1_000).toISOString(),
      dispatchStartedAt: new Date(now - 1_000).toISOString(),
      telegramSentAt: null,
      failureReason: null,
    };
    fs.writeFileSync(
      path.join(testDir, 'signal_delivery_queue.json'),
      JSON.stringify([persisted]),
      'utf8'
    );

    const processDelivery = jest.fn().mockResolvedValue({ outcome: 'SENT' });
    const queue = new SignalDeliveryQueue({ dataDir: testDir, now: () => now, processDelivery });

    expect(queue.list()[0]).toEqual(expect.objectContaining({
      state: 'RATE_LIMIT_RETRY',
      nextDeliveryAttemptAt: new Date(now).toISOString(),
    }));

    await queue.drainOnce();
    expect(processDelivery).toHaveBeenCalledTimes(1);
    expect(queue.list()[0].state).toBe('SENT');
  });

  test('exposes worker heartbeat and creates durable runtime state when empty', async () => {
    const now = Date.parse('2026-08-16T08:00:00.000Z');
    const queue = new SignalDeliveryQueue({
      dataDir: testDir,
      now: () => now,
      processDelivery: async () => ({ outcome: 'SENT' }),
    });

    queue.start(60_000);
    await Promise.resolve();
    expect(queue.getMetrics()).toEqual(expect.objectContaining({
      running: true,
      lastHeartbeatAt: new Date(now).toISOString(),
      queuedItems: 0,
    }));
    expect(fs.existsSync(path.join(testDir, 'signal_delivery_queue.json'))).toBe(true);
    queue.stop();
    expect(queue.getMetrics().running).toBe(false);
  });
});

function candidate(): NotificationCandidate {
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
    gradeResult: { grade: 'A+', totalScore: 9 },
    uniqueKey: 'queue-test-signal',
    signalId: 'queue-test-signal',
    currentPrice: 1.095,
    poiFormedTimestamp: Date.parse('2026-08-16T07:50:00.000Z'),
  } as NotificationCandidate;
}
