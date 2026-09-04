import express from 'express';
import { getTwelveDataQueueMetrics } from './twelveDataClient';
import { getTelegramHealthSnapshot } from './telegramSender';
import type { SignalDeliveryQueueMetrics } from './signalDeliveryQueue';

export const app = express();
app.use(express.json());

export interface RuntimeReadinessState {
  readonly status: 'starting' | 'initializing' | 'ready' | 'degraded';
  readonly startedAt: string;
  readonly httpBoundAt: string | null;
  readonly initialPollingStartedAt: string | null;
  readonly initialPollingCompletedAt: string | null;
  readonly intervalsStartedAt: string | null;
  readonly deliveryQueueStarted: boolean;
  readonly lastError: string | null;
}

let readinessState: RuntimeReadinessState = {
  status: 'starting',
  startedAt: new Date().toISOString(),
  httpBoundAt: null,
  initialPollingStartedAt: null,
  initialPollingCompletedAt: null,
  intervalsStartedAt: null,
  deliveryQueueStarted: false,
  lastError: null,
};

let deliveryQueueMetricsProvider: (() => SignalDeliveryQueueMetrics) | null = null;

export function updateRuntimeReadiness(patch: Partial<RuntimeReadinessState>): void {
  readinessState = Object.freeze({
    ...readinessState,
    ...patch,
  });
}

export function configureDeliveryQueueMetrics(
  provider: (() => SignalDeliveryQueueMetrics) | null
): void {
  deliveryQueueMetricsProvider = provider;
}

export function resetRuntimeReadinessForTests(): void {
  readinessState = {
    status: 'starting',
    startedAt: new Date().toISOString(),
    httpBoundAt: null,
    initialPollingStartedAt: null,
    initialPollingCompletedAt: null,
    intervalsStartedAt: null,
    deliveryQueueStarted: false,
    lastError: null,
  };
  deliveryQueueMetricsProvider = null;
}

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/readiness', (req, res) => {
  const telegram = getTelegramHealthSnapshot();
  const deliveryQueue = deliveryQueueMetricsProvider?.() ?? null;
  const telegramRequired = process.env.REQUIRE_TELEGRAM_READINESS === 'true';
  const queueHeartbeatHealthy = deliveryQueue !== null &&
    deliveryQueue.running &&
    heartbeatIsFresh(deliveryQueue.lastHeartbeatAt);
  const queueHealthy = queueHeartbeatHealthy &&
    deliveryQueue.lastError === null;
  const telegramHealthy = telegram.status === 'ok' || !telegramRequired;
  const ready = readinessState.status === 'ready' &&
    readinessState.deliveryQueueStarted &&
    telegramHealthy &&
    queueHealthy;
  const blockingReasons = [
    readinessState.status !== 'ready' ? `runtime status is ${readinessState.status}` : null,
    !readinessState.deliveryQueueStarted ? 'delivery queue is not started' : null,
    telegramRequired && telegram.status !== 'ok' ? `telegram status is ${telegram.status}` : null,
    !queueHeartbeatHealthy ? 'delivery queue worker heartbeat is not healthy' : null,
    deliveryQueue?.lastError ? `delivery queue error: ${deliveryQueue.lastError}` : null,
  ].filter((reason): reason is string => reason !== null);

  const effectiveStatus = ready
    ? 'ready'
    : readinessState.status === 'starting' || readinessState.status === 'initializing'
      ? readinessState.status
      : 'degraded';

  res.status(ready ? 200 : 503).json({
    ready,
    blockingReasons,
    ...readinessState,
    status: effectiveStatus,
    telegram,
    deliveryQueue,
    provider: {
      name: 'TWELVE_DATA',
      ...getTwelveDataQueueMetrics(),
    },
  });
});

app.get('/delivery/metrics', (req, res) => {
  const deliveryQueue = deliveryQueueMetricsProvider?.() ?? null;
  res.status(deliveryQueue ? 200 : 503).json({ deliveryQueue });
});

app.get('/provider/metrics', (req, res) => {
  res.status(200).json({
    provider: 'TWELVE_DATA',
    ...getTwelveDataQueueMetrics(),
  });
});

function heartbeatIsFresh(timestamp: string | null): boolean {
  if (!timestamp) return false;
  const heartbeat = Date.parse(timestamp);
  if (!Number.isFinite(heartbeat)) return false;
  const configured = Number(process.env.DELIVERY_QUEUE_HEARTBEAT_MAX_AGE_MS ?? 30_000);
  const maxAgeMs = Number.isFinite(configured) && configured > 0 ? configured : 30_000;
  return Date.now() - heartbeat <= maxAgeMs;
}
