import request from 'supertest';
import {
  app,
  configureDeliveryQueueMetrics,
  resetRuntimeReadinessForTests,
  updateRuntimeReadiness,
} from '../server/webhookServer';
import { probeTelegramConnection } from '../server/telegramSender';

describe('Webhook Server - Health check', () => {
  const originalFetch = global.fetch;
  const originalToken = process.env.TELEGRAM_BOT_TOKEN;
  const originalChatId = process.env.TELEGRAM_CHAT_ID;

  beforeEach(() => {
    resetRuntimeReadinessForTests();
    process.env.TELEGRAM_BOT_TOKEN = 'health_test_token';
    process.env.TELEGRAM_CHAT_ID = 'health_test_chat';
  });

  afterAll(() => {
    global.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = originalToken;
    if (originalChatId === undefined) delete process.env.TELEGRAM_CHAT_ID;
    else process.env.TELEGRAM_CHAT_ID = originalChatId;
  });

  test('should return 200 and status ok on GET /health', async () => {
    const res = await request(app)
      .get('/health')
      .expect(200);

    expect(res.body).toEqual({ status: 'ok' });
  });

  test('exposes read-only Twelve Data queue diagnostics', async () => {
    const res = await request(app)
      .get('/provider/metrics')
      .expect(200);

    expect(res.body).toEqual(expect.objectContaining({
      provider: 'TWELVE_DATA',
      queueLength: expect.any(Number),
      waitingJobs: expect.any(Number),
      completedJobs: expect.any(Number),
      retryCount: expect.any(Number),
      failedJobs: expect.any(Number),
    }));
  });

  test('reports ready only when runtime, Telegram and queue heartbeat are healthy', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true }) });
    await probeTelegramConnection();
    configureDeliveryQueueMetrics(() => ({
      running: true,
      workerStartedAt: new Date().toISOString(),
      lastHeartbeatAt: new Date().toISOString(),
      lastError: null,
      activeSignalId: null,
      totalItems: 0,
      queuedItems: 0,
      retryingItems: 0,
      dispatchingItems: 0,
      sentItems: 0,
      terminalFailureItems: 0,
    }));
    updateRuntimeReadiness({ status: 'ready', deliveryQueueStarted: true });

    const res = await request(app).get('/readiness').expect(200);

    expect(res.body).toEqual(expect.objectContaining({
      ready: true,
      blockingReasons: [],
      telegram: expect.objectContaining({ status: 'ok' }),
      deliveryQueue: expect.objectContaining({ running: true }),
    }));
  });

  test('does not block readiness on Telegram probe failure unless explicitly required', async () => {
    process.env.REQUIRE_TELEGRAM_READINESS = 'false';
    global.fetch = jest.fn().mockRejectedValue(new Error('fetch failed'));
    await probeTelegramConnection();
    configureDeliveryQueueMetrics(() => ({
      running: true,
      workerStartedAt: new Date().toISOString(),
      lastHeartbeatAt: new Date().toISOString(),
      lastError: null,
      activeSignalId: null,
      totalItems: 0,
      queuedItems: 0,
      retryingItems: 0,
      dispatchingItems: 0,
      sentItems: 0,
      terminalFailureItems: 0,
    }));
    updateRuntimeReadiness({ status: 'ready', deliveryQueueStarted: true });

    const res = await request(app).get('/readiness').expect(200);

    expect(res.body).toEqual(expect.objectContaining({
      ready: true,
      telegram: expect.objectContaining({ status: 'failed' }),
    }));
    expect(res.body.blockingReasons).not.toContain('telegram status is failed');
  });

  test('returns 503 when runtime says ready but queue worker is stopped', async () => {
    configureDeliveryQueueMetrics(() => ({
      running: false,
      workerStartedAt: null,
      lastHeartbeatAt: null,
      lastError: null,
      activeSignalId: null,
      totalItems: 0,
      queuedItems: 0,
      retryingItems: 0,
      dispatchingItems: 0,
      sentItems: 0,
      terminalFailureItems: 0,
    }));
    updateRuntimeReadiness({ status: 'ready', deliveryQueueStarted: true });

    const res = await request(app).get('/readiness').expect(503);

    expect(res.body.ready).toBe(false);
    expect(res.body.blockingReasons).toContain('delivery queue worker heartbeat is not healthy');
  });

  test('exposes delivery queue runtime metrics', async () => {
    configureDeliveryQueueMetrics(() => ({
      running: true,
      workerStartedAt: new Date().toISOString(),
      lastHeartbeatAt: new Date().toISOString(),
      lastError: null,
      activeSignalId: null,
      totalItems: 3,
      queuedItems: 1,
      retryingItems: 1,
      dispatchingItems: 0,
      sentItems: 1,
      terminalFailureItems: 0,
    }));

    const res = await request(app).get('/delivery/metrics').expect(200);
    expect(res.body.deliveryQueue).toEqual(expect.objectContaining({
      running: true,
      queuedItems: 1,
      retryingItems: 1,
    }));
  });
});
