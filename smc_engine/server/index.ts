import 'dotenv/config';
import type { Server } from 'http';
import { app, configureDeliveryQueueMetrics, updateRuntimeReadiness } from './webhookServer';
import { CandleStore, Symbol, Timeframe } from './candleStore';
import { NotifiedStore } from './notifiedStore';
import { pollAndProcess, PollAndProcessResult } from './poller';
import { maybeGenerateDailyQualificationReport, startRuntimeTelemetryMonitor } from './telemetry';
import { recordRuntimeTrace } from './runtimeTrace';
import { ALL_SYMBOLS } from './universe';
import { QueuedSignalDelivery, SignalDeliveryQueue } from './signalDeliveryQueue';
import { createSignalDeliveryProcessor } from './signalDeliveryProcessor';
import { probeTelegramConnection } from './telegramSender';
import { acquireRuntimeInstanceLock, RuntimeInstanceLock } from './runtimeInstanceLock';

const port = environmentInteger('PORT', 3000);
const symbols: Symbol[] = [...ALL_SYMBOLS];
const timeframes: Timeframe[] = ['4h', '1h', '15m'];
const latestPollResults = new Map<string, PollAndProcessResult>();
const activePolls = new Map<string, Promise<PollAndProcessResult>>();

let initialPollingComplete = false;
let initialPollingCompletedAt: string | null = null;
let runtimeLock: RuntimeInstanceLock | null = null;
let httpServer: Server | null = null;
let activeDeliveryQueue: SignalDeliveryQueue | null = null;

async function start(): Promise<void> {
  runtimeLock = acquireRuntimeInstanceLock();
  process.once('exit', () => runtimeLock?.release());

  const candleStore = new CandleStore();
  const notifiedStore = new NotifiedStore();
  const deliveryQueue = new SignalDeliveryQueue({
    processDelivery: createSignalDeliveryProcessor(candleStore, notifiedStore),
    maxDeliveryAttempts: environmentInteger('DELIVERY_MAX_ATTEMPTS', 3),
    retryBaseDelayMs: environmentInteger('DELIVERY_RETRY_BASE_DELAY_MS', 5_000),
    retryMaxDelayMs: environmentInteger('DELIVERY_RETRY_MAX_DELAY_MS', 60_000),
    onTerminalFailure: item => clearCandidatePending(notifiedStore, item),
  });
  activeDeliveryQueue = deliveryQueue;
  reserveRecoveredDeliveries(notifiedStore, deliveryQueue);
  configureDeliveryQueueMetrics(() => deliveryQueue.getMetrics());

  httpServer = await bindHttpServer(port);
  updateRuntimeReadiness({
    status: 'initializing',
    httpBoundAt: new Date().toISOString(),
  });
  console.log(`Health check server listening on port ${port}`);

  const telegramHealth = await probeTelegramConnection();
  if (telegramHealth.status !== 'ok') {
    console.error(`Telegram readiness probe failed: ${telegramHealth.lastError ?? 'unknown error'}`);
  }

  startRuntimeTelemetryMonitor();
  maybeGenerateDailyQualificationReport();
  deliveryQueue.start();
  updateRuntimeReadiness({ deliveryQueueStarted: true });
  updateRuntimeReadiness({ status: 'ready' });

  recordRuntimeTrace({
    signalId: 'startup',
    file: 'server/index.ts',
    functionName: 'start',
    timestamp: new Date().toISOString(),
    input: { port, symbols, timeframes },
    output: { startup: true, runtimeLock: runtimeLock.filePath },
  });

  console.log(`[Startup] Profile: ${process.env.ENABLE_PVP_KILLZONE_BYPASS === 'true' ? 'PVP_ACCELERATION' : 'PRODUCTION'} | Killzone Filter: ${process.env.ENABLE_PVP_KILLZONE_BYPASS === 'true' ? 'BYPASSED' : 'ACTIVE'}`);
  console.log(`[Startup] ${new Date().toISOString()} - Bot started. Symbols: ${symbols.join(', ')} | Timeframes: ${timeframes.join(', ')} | Killzone: ${process.env.ENABLE_KILLZONE === 'true' ? 'ACTIVE' : 'PASSIVE'}`);

  installShutdownHandlers();
  await initializeBackgroundServices(candleStore, notifiedStore, deliveryQueue);
}

async function initializeBackgroundServices(
  candleStore: CandleStore,
  notifiedStore: NotifiedStore,
  deliveryQueue: SignalDeliveryQueue
): Promise<void> {
  console.log('Performing initial polling for all symbols and timeframes...');
  updateRuntimeReadiness({
    initialPollingStartedAt: new Date().toISOString(),
    lastError: null,
  });

  for (const symbol of symbols) {
    for (const timeframe of timeframes) {
      const existing = candleStore.getCandles(symbol, timeframe);
      if (existing.length >= 50 && timeframe !== '15m') {
        console.log(`[Startup] ${symbol} (${timeframe}) has ${existing.length} cached candles, using cache.`);
        continue;
      }
      console.log(`Polling ${symbol} (${timeframe})...`);
      await runTrackedPoll(symbol, timeframe, candleStore, notifiedStore, deliveryQueue);
    }
  }

  initialPollingComplete = true;
  initialPollingCompletedAt = new Date().toISOString();
  publishPollReadiness();
  console.log('Initial polling completed. Setting up intervals...');
  setupPollingIntervals(candleStore, notifiedStore, deliveryQueue);
  updateRuntimeReadiness({
    intervalsStartedAt: new Date().toISOString(),
  });
}

function setupPollingIntervals(
  candleStore: CandleStore,
  notifiedStore: NotifiedStore,
  deliveryQueue: SignalDeliveryQueue
): void {
  scheduleNextAlignedPoll(candleStore, notifiedStore, deliveryQueue);
}

function scheduleNextAlignedPoll(
  candleStore: CandleStore,
  notifiedStore: NotifiedStore,
  deliveryQueue: SignalDeliveryQueue
): void {
  const now = Date.now();
  const fifteenMinutesMs = 15 * 60 * 1000;
  const nextTargetMs = Math.ceil((now + 5000) / fifteenMinutesMs) * fifteenMinutesMs + 5000;
  const delayMs = Math.max(1000, nextTargetMs - now);

  const nextDate = new Date(nextTargetMs).toISOString();
  console.log(`[Scheduler] Next aligned polling scheduled for ${nextDate} (in ${Math.round(delayMs / 1000)}s)`);

  setTimeout(async () => {
    try {
      await executeAlignedPollingCycle(candleStore, notifiedStore, deliveryQueue);
    } catch (err) {
      console.error('[Scheduler] Error during aligned polling cycle:', err);
    } finally {
      scheduleNextAlignedPoll(candleStore, notifiedStore, deliveryQueue);
    }
  }, delayMs);
}

async function executeAlignedPollingCycle(
  candleStore: CandleStore,
  notifiedStore: NotifiedStore,
  deliveryQueue: SignalDeliveryQueue
): Promise<void> {
  const now = new Date();
  const minutes = now.getUTCMinutes();
  const hours = now.getUTCHours();
  const isHourClose = minutes < 5 || minutes >= 55;
  const is4HourClose = isHourClose && hours % 4 === 0;

  console.log(`[Scheduler] ${now.toISOString()} - Executing aligned polling cycle (4h=${is4HourClose}, 1h=${isHourClose}, 15m=true)...`);

  for (const symbol of symbols) {
    if (is4HourClose) {
      void runTrackedPoll(symbol, '4h', candleStore, notifiedStore, deliveryQueue);
    }
    if (isHourClose) {
      void runTrackedPoll(symbol, '1h', candleStore, notifiedStore, deliveryQueue);
    }
    void runTrackedPoll(symbol, '15m', candleStore, notifiedStore, deliveryQueue);
  }
}

function runTrackedPoll(
  symbol: Symbol,
  timeframe: Timeframe,
  candleStore: CandleStore,
  notifiedStore: NotifiedStore,
  deliveryQueue: SignalDeliveryQueue
): Promise<PollAndProcessResult> {
  const key = `${symbol}:${timeframe}`;
  const existing = activePolls.get(key);
  if (existing) return existing;

  const running = pollAndProcess(symbol, timeframe, candleStore, notifiedStore, deliveryQueue)
    .catch(error => ({
      success: false,
      fetchedCount: 0,
      failureReason: error instanceof Error ? error.message : String(error),
    }))
    .then(result => {
      latestPollResults.set(key, result);
      if (initialPollingComplete) publishPollReadiness();
      return result;
    })
    .finally(() => {
      activePolls.delete(key);
    });

  activePolls.set(key, running);
  return running;
}

function publishPollReadiness(): void {
  const failed = [...latestPollResults.entries()].filter(([, result]) => !result.success);
  updateRuntimeReadiness({
    status: failed.length === 0 ? 'ready' : 'degraded',
    initialPollingCompletedAt,
    lastError: failed.length === 0
      ? null
      : `${failed[0][0]}: ${failed[0][1].failureReason ?? 'poll failed'}`,
  });
}

function reserveRecoveredDeliveries(
  notifiedStore: NotifiedStore,
  deliveryQueue: SignalDeliveryQueue
): void {
  for (const item of deliveryQueue.list()) {
    if (item.state !== 'QUEUED' && item.state !== 'DISPATCHING' && item.state !== 'RATE_LIMIT_RETRY') continue;
    notifiedStore.markPending(item.candidate.uniqueKey);
    if (item.candidate.dedupeKey) notifiedStore.markPending(item.candidate.dedupeKey);
  }
}

function clearCandidatePending(notifiedStore: NotifiedStore, item: QueuedSignalDelivery): void {
  notifiedStore.clearPending(item.candidate.uniqueKey);
  if (item.candidate.dedupeKey) notifiedStore.clearPending(item.candidate.dedupeKey);
}

function bindHttpServer(listenPort: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = app.listen(listenPort);
    const onError = (error: Error) => reject(error);
    server.once('error', onError);
    server.once('listening', () => {
      server.off('error', onError);
      server.on('error', error => {
        console.error('HTTP server error:', error);
        updateRuntimeReadiness({
          status: 'degraded',
          lastError: error.message,
        });
      });
      resolve(server);
    });
  });
}

function installShutdownHandlers(): void {
  const shutdown = (signal: string) => {
    console.log(`[Shutdown] ${signal} received.`);
    activeDeliveryQueue?.stop();
    if (httpServer) {
      httpServer.close(() => {
        runtimeLock?.release();
        process.exit(0);
      });
      setTimeout(() => process.exit(1), 5_000).unref();
      return;
    }
    runtimeLock?.release();
    process.exit(0);
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

function environmentInteger(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

start().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('Fatal initialization error:', error);
  activeDeliveryQueue?.stop();
  configureDeliveryQueueMetrics(null);
  httpServer?.close();
  runtimeLock?.release();
  updateRuntimeReadiness({
    status: 'degraded',
    lastError: message,
  });
  process.exitCode = 1;
});
