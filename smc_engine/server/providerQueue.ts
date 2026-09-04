import { Symbol, Timeframe } from './candleStore';
import {
  ProviderError,
  ProviderRateLimitError,
  ProviderRequest,
  ProviderSuccess,
} from './providerTypes';
import {
  recordProviderQueueTelemetry,
  recordProviderTelemetry,
} from './telemetry';

export interface ProviderQueueMetrics {
  readonly queueLength: number;
  readonly activeRequest: ProviderQueueJobView | null;
  readonly waitingJobs: number;
  readonly completedJobs: number;
  readonly retryCount: number;
  readonly failedJobs: number;
}

export interface ProviderQueueJobView {
  readonly id: number;
  readonly endpoint: string;
  readonly symbol: Symbol;
  readonly timeframe: Timeframe;
  readonly retryCount: number;
}

type ProviderTransport = (request: ProviderRequest, retryCount: number, keyIndex?: number) => Promise<ProviderSuccess>;

interface QueueJob {
  readonly id: number;
  readonly request: ProviderRequest;
  retryCount: number;
  readonly resolve: (value: ProviderSuccess) => void;
  readonly reject: (reason: unknown) => void;
}

export interface DeterministicProviderQueueOptions {
  readonly transport: ProviderTransport;
  readonly keyCount?: number;
  readonly creditsPerMinute?: number;
  readonly safetyMargin?: number;
  readonly maxRetries?: number;
  readonly windowBufferMs?: number;
  readonly now?: () => number;
  readonly sleep?: (durationMs: number) => Promise<void>;
}

interface KeyWindowState {
  windowStartMs: number;
  creditsUsed: number;
  cooldownUntilMs: number;
}

const TIMEFRAME_PRIORITY: Readonly<Record<Timeframe, number>> = Object.freeze({
  '15m': 0,
  '1h': 1,
  '4h': 2,
  '1m': 3,
});

const SYMBOL_PRIORITY: Readonly<Record<Symbol, number>> = Object.freeze({
  EURUSD: 0,
  GBPUSD: 1,
  AUDUSD: 2,
  USDCAD: 3,
  USDJPY: 4,
  NZDUSD: 5,
  USDCHF: 6,
  EURJPY: 7,
  AUDCAD: 8,
  EURGBP: 9,
  GBPJPY: 10,
  EURCHF: 11,
  GBPCHF: 12,
  AUDCHF: 13,
  CADCHF: 14,
  NZDCHF: 15,
  CHFJPY: 16,
  NAS100: 17,
  XAUUSD: 18,
  BTCUSD: 19,
  BTCEUR: 20,
  ETHUSD: 21,
  ETHEUR: 22,
  LTCUSD: 23,
  LTCEUR: 24,
  SOLUSD: 25,
});

export class DeterministicProviderQueue {
  private readonly transport: ProviderTransport;
  private readonly keyCount: number;
  private readonly creditsPerMinute: number;
  private readonly safetyMargin: number;
  private readonly maxRetries: number;
  private readonly windowBufferMs: number;
  private readonly now: () => number;
  private readonly sleep: (durationMs: number) => Promise<void>;
  private readonly waiting: QueueJob[] = [];
  private readonly keyWindows: KeyWindowState[];
  private active: QueueJob | null = null;
  private drainScheduled = false;
  private sequence = 0;
  private completedJobs = 0;
  private retries = 0;
  private failedJobs = 0;
  private keyRoundRobin = 0;

  constructor(options: DeterministicProviderQueueOptions) {
    this.transport = options.transport;
    this.keyCount = positiveInteger(options.keyCount, 1);
    this.creditsPerMinute = positiveInteger(options.creditsPerMinute, 8);
    this.safetyMargin = nonNegativeInteger(options.safetyMargin, 1);
    this.maxRetries = nonNegativeInteger(options.maxRetries, 2);
    this.windowBufferMs = nonNegativeInteger(options.windowBufferMs, 250);
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? (durationMs => new Promise(resolve => setTimeout(resolve, durationMs)));
    this.keyWindows = Array.from({ length: this.keyCount }, () => ({
      windowStartMs: -1,
      creditsUsed: 0,
      cooldownUntilMs: 0,
    }));
    if (this.availableCreditsPerMinute < 1) {
      throw new Error('Provider queue safety margin must leave at least one usable credit per minute.');
    }
  }

  enqueue(request: ProviderRequest): Promise<ProviderSuccess> {
    return new Promise<ProviderSuccess>((resolve, reject) => {
      const job: QueueJob = {
        id: ++this.sequence,
        request,
        retryCount: 0,
        resolve,
        reject,
      };
      this.waiting.push(job);
      this.sortWaitingJobs();
      this.emitQueueTelemetry('ENQUEUED', job);
      this.scheduleDrain();
    });
  }

  getMetrics(): ProviderQueueMetrics {
    return Object.freeze({
      queueLength: this.waiting.length + (this.active ? 1 : 0),
      activeRequest: this.active ? jobView(this.active) : null,
      waitingJobs: this.waiting.length,
      completedJobs: this.completedJobs,
      retryCount: this.retries,
      failedJobs: this.failedJobs,
    });
  }

  private get availableCreditsPerMinute(): number {
    return this.creditsPerMinute - this.safetyMargin;
  }

  private scheduleDrain(): void {
    if (this.drainScheduled || this.active) return;
    this.drainScheduled = true;
    queueMicrotask(() => {
      this.drainScheduled = false;
      void this.drain();
    });
  }

  private async drain(): Promise<void> {
    if (this.active) return;
    const job = this.waiting.shift();
    if (!job) return;
    this.active = job;
    this.emitQueueTelemetry('STARTED', job);

    try {
      const result = await this.executeWithRetry(job);
      this.completedJobs += 1;
      this.emitQueueTelemetry('COMPLETED', job);
      job.resolve(result);
    } catch (error) {
      this.failedJobs += 1;
      this.emitQueueTelemetry('FAILED', job);
      job.reject(error);
    } finally {
      this.active = null;
      this.scheduleDrain();
    }
  }

  private async executeWithRetry(job: QueueJob): Promise<ProviderSuccess> {
    let currentKeyIndex: number | undefined = undefined;
    for (;;) {
      const keyIdx = await this.acquireKeyAndCredit(currentKeyIndex);
      currentKeyIndex = undefined;
      try {
        const result = await this.transport(job.request, job.retryCount, keyIdx);
        recordProviderTelemetry({
          type: 'provider',
          provider: 'TWELVE_DATA',
          ...result.metadata,
          success: true,
          errorType: null,
          errorMessage: null,
        });
        return result;
      } catch (error) {
        recordProviderTelemetry(providerFailureTelemetry(job, error));
        if (!(error instanceof ProviderRateLimitError) || job.retryCount >= this.maxRetries) {
          throw error;
        }

        const cooldownDuration = error.retryAfterMs ?? (60_000 + this.windowBufferMs);
        this.keyWindows[keyIdx].cooldownUntilMs = this.now() + cooldownDuration;

        job.retryCount += 1;
        this.retries += 1;
        this.emitQueueTelemetry('RETRY_WAIT', job);

        const otherKeyAvailable = this.keyWindows.some((kw, i) => i !== keyIdx && this.now() >= kw.cooldownUntilMs);
        if (otherKeyAvailable && this.keyCount > 1) {
          currentKeyIndex = (keyIdx + 1) % this.keyCount;
          continue;
        }

        await this.waitForNextCreditWindow(error.retryAfterMs);
      }
    }
  }

  private async acquireKeyAndCredit(preferredKeyIndex?: number): Promise<number> {
    for (;;) {
      this.refreshAllWindows();
      const now = this.now();

      const candidateKeys: number[] = [];
      if (preferredKeyIndex !== undefined && preferredKeyIndex >= 0 && preferredKeyIndex < this.keyCount) {
        candidateKeys.push(preferredKeyIndex);
      }
      for (let i = 0; i < this.keyCount; i++) {
        const k = (this.keyRoundRobin + i) % this.keyCount;
        if (!candidateKeys.includes(k)) candidateKeys.push(k);
      }

      for (const keyIdx of candidateKeys) {
        const kw = this.keyWindows[keyIdx];
        if (now >= kw.cooldownUntilMs && kw.creditsUsed < this.availableCreditsPerMinute) {
          kw.creditsUsed += 1;
          this.keyRoundRobin = (keyIdx + 1) % this.keyCount;
          return keyIdx;
        }
      }

      await this.waitForNextCreditWindow(null);
    }
  }

  private refreshAllWindows(): void {
    const currentWindow = minuteWindowStart(this.now());
    for (const kw of this.keyWindows) {
      if (kw.windowStartMs !== currentWindow) {
        kw.windowStartMs = currentWindow;
        kw.creditsUsed = 0;
      }
    }
  }

  private async waitForNextCreditWindow(providerRetryAfterMs: number | null): Promise<void> {
    const now = this.now();
    const boundaryWaitMs = minuteWindowStart(now) + 60_000 - now + this.windowBufferMs;
    const waitMs = Math.max(boundaryWaitMs, providerRetryAfterMs ?? 0);
    await this.sleep(Math.max(0, waitMs));
    this.refreshAllWindows();
  }

  private sortWaitingJobs(): void {
    this.waiting.sort((left, right) =>
      TIMEFRAME_PRIORITY[left.request.timeframe] - TIMEFRAME_PRIORITY[right.request.timeframe] ||
      SYMBOL_PRIORITY[left.request.symbol] - SYMBOL_PRIORITY[right.request.symbol] ||
      left.id - right.id
    );
  }

  private emitQueueTelemetry(
    event: 'ENQUEUED' | 'STARTED' | 'RETRY_WAIT' | 'COMPLETED' | 'FAILED',
    job: QueueJob
  ): void {
    const metrics = this.getMetrics();
    recordProviderQueueTelemetry({
      type: 'provider_queue',
      provider: 'TWELVE_DATA',
      event,
      jobId: job.id,
      endpoint: job.request.endpoint,
      symbol: job.request.symbol,
      timeframe: job.request.timeframe,
      jobRetryCount: job.retryCount,
      queueLength: metrics.queueLength,
      activeRequest: metrics.activeRequest,
      waitingJobs: metrics.waitingJobs,
      completedJobs: metrics.completedJobs,
      retryCount: metrics.retryCount,
      failedJobs: metrics.failedJobs,
    });
  }
}


function providerFailureTelemetry(job: QueueJob, error: unknown) {
  const providerError = error instanceof Error ? error : new Error(String(error));
  const metadata = (error as { metadata?: ProviderSuccess['metadata'] } | null)?.metadata;
  return {
    type: 'provider' as const,
    provider: 'TWELVE_DATA' as const,
    requestTimestamp: metadata?.requestTimestamp ?? new Date().toISOString(),
    responseTimestamp: metadata?.responseTimestamp ?? new Date().toISOString(),
    latencyMs: metadata?.latencyMs ?? 0,
    endpoint: job.request.endpoint,
    symbol: job.request.symbol,
    timeframe: job.request.timeframe,
    httpStatus: metadata?.httpStatus ?? (error instanceof ProviderError ? error.httpStatus : null),
    retryCount: job.retryCount,
    apiCreditsUsed: error instanceof ProviderRateLimitError ? error.apiCreditsUsed : null,
    apiCreditsLeft: error instanceof ProviderRateLimitError ? error.apiCreditsLeft : null,
    success: false,
    errorType: providerError.name,
    errorMessage: providerError.message,
  };
}

function jobView(job: QueueJob): ProviderQueueJobView {
  return Object.freeze({
    id: job.id,
    endpoint: job.request.endpoint,
    symbol: job.request.symbol,
    timeframe: job.request.timeframe,
    retryCount: job.retryCount,
  });
}

function minuteWindowStart(timestampMs: number): number {
  return Math.floor(timestampMs / 60_000) * 60_000;
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && (value as number) > 0 ? value as number : fallback;
}

function nonNegativeInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && (value as number) >= 0 ? value as number : fallback;
}
