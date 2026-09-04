import { DeterministicProviderQueue } from '../server/providerQueue';
import {
  ProviderRateLimitError,
  ProviderRequest,
  ProviderSuccess,
  TWELVE_DATA_TIME_SERIES_ENDPOINT,
} from '../server/providerTypes';
import { Symbol, Timeframe } from '../server/candleStore';

describe('DeterministicProviderQueue', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv, ENABLE_TELEMETRY: 'false' };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('orders a simultaneous batch by timeframe priority, stable symbol order, then FIFO', async () => {
    const order: string[] = [];
    const queue = new DeterministicProviderQueue({
      creditsPerMinute: 100,
      safetyMargin: 0,
      transport: async request => {
        order.push(`${request.timeframe}:${request.symbol}`);
        return success(request);
      },
    });

    await Promise.all([
      queue.enqueue(request('USDCAD', '1m')),
      queue.enqueue(request('GBPUSD', '4h')),
      queue.enqueue(request('AUDUSD', '15m')),
      queue.enqueue(request('EURUSD', '1h')),
      queue.enqueue(request('EURUSD', '15m')),
      queue.enqueue(request('EURUSD', '15m')),
    ]);

    expect(order).toEqual([
      '15m:EURUSD',
      '15m:EURUSD',
      '15m:AUDUSD',
      '1h:EURUSD',
      '4h:GBPUSD',
      '1m:USDCAD',
    ]);
  });

  test('enforces global concurrency one', async () => {
    let active = 0;
    let maximumActive = 0;
    const queue = new DeterministicProviderQueue({
      creditsPerMinute: 100,
      safetyMargin: 0,
      transport: async providerRequest => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await Promise.resolve();
        active -= 1;
        return success(providerRequest);
      },
    });

    await Promise.all([
      queue.enqueue(request('EURUSD', '15m')),
      queue.enqueue(request('GBPUSD', '15m')),
      queue.enqueue(request('AUDUSD', '15m')),
    ]);

    expect(maximumActive).toBe(1);
  });

  test('waits for the next deterministic credit window before exceeding configured capacity', async () => {
    let now = 0;
    const sleeps: number[] = [];
    const queue = new DeterministicProviderQueue({
      creditsPerMinute: 3,
      safetyMargin: 1,
      windowBufferMs: 250,
      now: () => now,
      sleep: async durationMs => {
        sleeps.push(durationMs);
        now += durationMs;
      },
      transport: async providerRequest => success(providerRequest),
    });

    await Promise.all([
      queue.enqueue(request('EURUSD', '15m')),
      queue.enqueue(request('GBPUSD', '15m')),
      queue.enqueue(request('AUDUSD', '15m')),
    ]);

    expect(sleeps).toEqual([60_250]);
    expect(queue.getMetrics().completedJobs).toBe(3);
  });

  test('retries 429 at the next window without allowing later jobs to overtake it', async () => {
    let now = 10_000;
    const order: string[] = [];
    let firstAttempts = 0;
    const queue = new DeterministicProviderQueue({
      creditsPerMinute: 100,
      safetyMargin: 0,
      maxRetries: 2,
      windowBufferMs: 0,
      now: () => now,
      sleep: async durationMs => {
        now += durationMs;
      },
      transport: async (providerRequest, retryCount) => {
        order.push(`${providerRequest.symbol}:${retryCount}`);
        if (providerRequest.symbol === 'EURUSD' && firstAttempts++ === 0) {
          throw new ProviderRateLimitError(
            'rate limited',
            providerRequest,
            retryCount,
            null,
            8,
            0
          );
        }
        return success(providerRequest, retryCount);
      },
    });

    await Promise.all([
      queue.enqueue(request('EURUSD', '15m')),
      queue.enqueue(request('GBPUSD', '15m')),
    ]);

    expect(order).toEqual(['EURUSD:0', 'EURUSD:1', 'GBPUSD:0']);
    expect(queue.getMetrics()).toMatchObject({
      queueLength: 0,
      waitingJobs: 0,
      completedJobs: 2,
      retryCount: 1,
      failedJobs: 0,
    });
  });

  test('fails explicitly after the bounded 429 retry count', async () => {
    let now = 0;
    const queue = new DeterministicProviderQueue({
      creditsPerMinute: 100,
      safetyMargin: 0,
      maxRetries: 1,
      windowBufferMs: 0,
      now: () => now,
      sleep: async durationMs => {
        now += durationMs;
      },
      transport: async (providerRequest, retryCount) => {
        throw new ProviderRateLimitError(
          'rate limited',
          providerRequest,
          retryCount,
          null,
          8,
          0
        );
      },
    });

    await expect(queue.enqueue(request('EURUSD', '15m'))).rejects.toBeInstanceOf(ProviderRateLimitError);
    expect(queue.getMetrics()).toMatchObject({
      completedJobs: 0,
      retryCount: 1,
      failedJobs: 1,
    });
  });
});

function request(symbol: Symbol, timeframe: Timeframe): ProviderRequest {
  return {
    endpoint: TWELVE_DATA_TIME_SERIES_ENDPOINT,
    symbol,
    timeframe,
    outputSize: 10,
  };
}

function success(providerRequest: ProviderRequest, retryCount = 0): ProviderSuccess {
  const timestamp = new Date(0).toISOString();
  return {
    candles: [],
    metadata: {
      requestTimestamp: timestamp,
      responseTimestamp: timestamp,
      latencyMs: 0,
      endpoint: providerRequest.endpoint,
      symbol: providerRequest.symbol,
      timeframe: providerRequest.timeframe,
      httpStatus: 200,
      retryCount,
      apiCreditsUsed: null,
      apiCreditsLeft: null,
    },
  };
}
