import * as fs from 'fs';
import * as path from 'path';
import type { Symbol } from './candleStore';
import type { NotificationCandidate } from './pipeline';
import type { SignalBenchmark } from '../src/signalBenchmark';
import { recordDeliveryQueueTelemetry } from './telemetry';
import { UNIVERSE_VERSION, universeCohort } from './universe';

export type DeliveryQueueState =
  | 'QUEUED'
  | 'DISPATCHING'
  | 'SENT'
  | 'EXPIRED_IN_QUEUE'
  | 'RATE_LIMIT_RETRY'
  | 'SCREENSHOT_FAILED'
  | 'DATA_FAILED'
  | 'TELEGRAM_FAILED';

export interface QueuedSignalDelivery {
  readonly signalId: string;
  readonly symbol: Symbol;
  readonly candidate: NotificationCandidate;
  readonly benchmark?: SignalBenchmark;
  readonly signalCreatedAt: string;
  readonly validationPassedAt: string;
  readonly queuedAt: string;
  readonly priorityScore: number;
  readonly state: DeliveryQueueState;
  readonly deliveryAttemptCount: number;
  readonly lastDeliveryAttemptAt: string | null;
  readonly nextDeliveryAttemptAt: string | null;
  readonly dispatchStartedAt: string | null;
  readonly telegramSentAt: string | null;
  readonly failureReason: string | null;
}

export interface DeliveryProcessingResult {
  readonly outcome: DeliveryQueueState;
  readonly failureReason?: string | null;
}

export interface SignalDeliveryQueueMetrics {
  readonly running: boolean;
  readonly workerStartedAt: string | null;
  readonly lastHeartbeatAt: string | null;
  readonly lastError: string | null;
  readonly activeSignalId: string | null;
  readonly totalItems: number;
  readonly queuedItems: number;
  readonly retryingItems: number;
  readonly dispatchingItems: number;
  readonly sentItems: number;
  readonly terminalFailureItems: number;
}

export interface SignalDeliveryQueueOptions {
  readonly dataDir?: string;
  readonly now?: () => number;
  readonly maxDeliveryAttempts?: number;
  readonly retryBaseDelayMs?: number;
  readonly retryMaxDelayMs?: number;
  readonly processDelivery: (item: QueuedSignalDelivery) => Promise<DeliveryProcessingResult>;
  readonly onTerminalFailure?: (
    item: QueuedSignalDelivery,
    result: DeliveryProcessingResult
  ) => void | Promise<void>;
}

const RETRYABLE_OUTCOMES = new Set<DeliveryQueueState>([
  'RATE_LIMIT_RETRY',
  'DATA_FAILED',
  'TELEGRAM_FAILED',
]);

export class SignalDeliveryQueue {
  private readonly dataDir: string;
  private readonly now: () => number;
  private readonly maxDeliveryAttempts: number;
  private readonly retryBaseDelayMs: number;
  private readonly retryMaxDelayMs: number;
  private readonly processDelivery: SignalDeliveryQueueOptions['processDelivery'];
  private readonly onTerminalFailure?: SignalDeliveryQueueOptions['onTerminalFailure'];
  private readonly items = new Map<string, QueuedSignalDelivery>();
  private activeSignalId: string | null = null;
  private workerTimer: NodeJS.Timeout | null = null;
  private workerStartedAt: string | null = null;
  private lastHeartbeatAt: string | null = null;
  private lastError: string | null = null;

  constructor(options: SignalDeliveryQueueOptions) {
    this.dataDir = options.dataDir ?? 'data';
    this.now = options.now ?? Date.now;
    this.maxDeliveryAttempts = positiveInteger(options.maxDeliveryAttempts, 3);
    this.retryBaseDelayMs = nonNegativeInteger(options.retryBaseDelayMs, 5_000);
    this.retryMaxDelayMs = nonNegativeInteger(options.retryMaxDelayMs, 60_000);
    this.processDelivery = options.processDelivery;
    this.onTerminalFailure = options.onTerminalFailure;
    this.load();
  }

  start(intervalMs = 1000): void {
    if (this.workerTimer) return;
    this.persist();
    this.workerStartedAt = new Date(this.now()).toISOString();
    this.workerTimer = setInterval(() => {
      this.runWorkerCycle();
    }, positiveInteger(intervalMs, 1000));
    this.workerTimer.unref?.();
    this.runWorkerCycle();
  }

  stop(): void {
    if (!this.workerTimer) return;
    clearInterval(this.workerTimer);
    this.workerTimer = null;
  }

  enqueue(candidate: NotificationCandidate, validationPassedAt: string): QueuedSignalDelivery {
    const signalId = candidate.signalId ?? candidate.uniqueKey;
    const existing = this.items.get(signalId);
    if (existing && isProtectedFromReplacement(existing.state)) {
      return existing;
    }

    const next: QueuedSignalDelivery = Object.freeze({
      signalId,
      symbol: candidate.symbol,
      candidate,
      signalCreatedAt: new Date(candidate.signalContext?.timestamp ?? candidate.poi.relatedEvent.breakTimestamp).toISOString(),
      validationPassedAt,
      queuedAt: new Date(this.now()).toISOString(),
      priorityScore: priorityScore(candidate),
      state: 'QUEUED',
      deliveryAttemptCount: 0,
      lastDeliveryAttemptAt: null,
      nextDeliveryAttemptAt: null,
      dispatchStartedAt: null,
      telegramSentAt: null,
      failureReason: null,
    });
    this.items.set(signalId, next);
    this.persist();
    this.telemetry(next, 'QUEUED');
    return next;
  }

  list(): readonly QueuedSignalDelivery[] {
    return Object.freeze([...this.items.values()]);
  }

  getMetrics(): SignalDeliveryQueueMetrics {
    const values = [...this.items.values()];
    return Object.freeze({
      running: this.workerTimer !== null,
      workerStartedAt: this.workerStartedAt,
      lastHeartbeatAt: this.lastHeartbeatAt,
      lastError: this.lastError,
      activeSignalId: this.activeSignalId,
      totalItems: values.length,
      queuedItems: values.filter(item => item.state === 'QUEUED').length,
      retryingItems: values.filter(item => item.state === 'RATE_LIMIT_RETRY').length,
      dispatchingItems: values.filter(item => item.state === 'DISPATCHING').length,
      sentItems: values.filter(item => item.state === 'SENT' || item.state === 'SCREENSHOT_FAILED').length,
      terminalFailureItems: values.filter(item => item.state === 'DATA_FAILED' || item.state === 'TELEGRAM_FAILED').length,
    });
  }

  async drainOnce(): Promise<void> {
    this.lastHeartbeatAt = new Date(this.now()).toISOString();
    if (this.activeSignalId) return;
    const next = this.nextDispatchable();
    if (!next) return;

    this.activeSignalId = next.signalId;
    const dispatching = this.update(next.signalId, current => ({
      ...current,
      state: 'DISPATCHING',
      dispatchStartedAt: new Date(this.now()).toISOString(),
      lastDeliveryAttemptAt: new Date(this.now()).toISOString(),
      nextDeliveryAttemptAt: null,
      deliveryAttemptCount: current.deliveryAttemptCount + 1,
    }));
    this.telemetry(dispatching, 'DISPATCHING');

    try {
      const result = await this.processDelivery(dispatching);
      await this.applyProcessingResult(dispatching.signalId, result);
    } catch (error) {
      await this.applyProcessingResult(dispatching.signalId, {
        outcome: 'DATA_FAILED',
        failureReason: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.activeSignalId = null;
    }
  }

  private runWorkerCycle(): void {
    void this.drainOnce().catch(error => {
      this.activeSignalId = null;
      this.lastError = error instanceof Error ? error.message : String(error);
    });
  }

  private async applyProcessingResult(signalId: string, result: DeliveryProcessingResult): Promise<void> {
    const current = this.items.get(signalId);
    if (!current) return;

    const shouldRetry = RETRYABLE_OUTCOMES.has(result.outcome) &&
      current.deliveryAttemptCount < this.maxDeliveryAttempts;

    if (shouldRetry) {
      const retrying = this.update(signalId, item => ({
        ...item,
        state: 'RATE_LIMIT_RETRY',
        nextDeliveryAttemptAt: new Date(this.now() + this.retryDelayMs(item.deliveryAttemptCount)).toISOString(),
        failureReason: result.failureReason ?? `${result.outcome} requires retry`,
      }));
      this.lastError = retrying.failureReason;
      this.telemetry(retrying, 'RATE_LIMIT_RETRY');
      return;
    }

    const finalItem = this.update(signalId, item => ({
      ...item,
      state: result.outcome,
      nextDeliveryAttemptAt: null,
      telegramSentAt: result.outcome === 'SENT' || result.outcome === 'SCREENSHOT_FAILED'
        ? new Date(this.now()).toISOString()
        : item.telegramSentAt,
      failureReason: result.failureReason ?? null,
    }));
    this.lastError = result.outcome === 'SENT' || result.outcome === 'EXPIRED_IN_QUEUE'
      ? null
      : finalItem.failureReason;
    this.telemetry(finalItem, result.outcome);

    if (RETRYABLE_OUTCOMES.has(result.outcome) && this.onTerminalFailure) {
      try {
        await this.onTerminalFailure(finalItem, result);
      } catch (error) {
        this.lastError = error instanceof Error ? error.message : String(error);
      }
    }
  }

  private retryDelayMs(deliveryAttemptCount: number): number {
    const exponential = this.retryBaseDelayMs * (2 ** Math.max(0, deliveryAttemptCount - 1));
    return Math.min(exponential, this.retryMaxDelayMs);
  }

  private nextDispatchable(): QueuedSignalDelivery | null {
    const now = this.now();
    const candidates = [...this.items.values()].filter(item => {
      if (item.state === 'QUEUED') return true;
      if (item.state !== 'RATE_LIMIT_RETRY') return false;
      if (!item.nextDeliveryAttemptAt) return true;
      const retryAt = Date.parse(item.nextDeliveryAttemptAt);
      return !Number.isFinite(retryAt) || retryAt <= now;
    });
    if (candidates.length === 0) return null;
    candidates.sort((left, right) =>
      right.priorityScore - left.priorityScore ||
      Date.parse(left.queuedAt) - Date.parse(right.queuedAt)
    );
    return candidates[0] ?? null;
  }

  private update(
    signalId: string,
    updater: (current: QueuedSignalDelivery) => Omit<QueuedSignalDelivery, never>
  ): QueuedSignalDelivery {
    const current = this.items.get(signalId);
    if (!current) {
      throw new Error(`Queued signal not found: ${signalId}`);
    }
    const next = Object.freeze(updater(current));
    this.items.set(signalId, next);
    this.persist();
    return next;
  }

  private filePath(): string {
    return path.join(this.dataDir, 'signal_delivery_queue.json');
  }

  private load(): void {
    const filePath = this.filePath();
    if (!fs.existsSync(filePath)) return;
    try {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Array<Partial<QueuedSignalDelivery>>;
      let recovered = false;
      for (const value of raw) {
        if (!isQueuedSignalDelivery(value)) continue;
        const shouldRecover = value.state === 'DISPATCHING' ||
          ((value.state === 'DATA_FAILED' || value.state === 'TELEGRAM_FAILED') &&
            value.deliveryAttemptCount < this.maxDeliveryAttempts);
        const item: QueuedSignalDelivery = Object.freeze({
          ...value,
          state: shouldRecover ? 'RATE_LIMIT_RETRY' : value.state,
          nextDeliveryAttemptAt: shouldRecover
            ? new Date(this.now()).toISOString()
            : value.nextDeliveryAttemptAt ?? null,
          failureReason: shouldRecover
            ? appendRecoveryReason(value.failureReason ?? null)
            : value.failureReason ?? null,
        });
        recovered = recovered || shouldRecover || value.nextDeliveryAttemptAt === undefined;
        this.items.set(item.signalId, item);
      }
      if (recovered) this.persist();
    } catch (error) {
      this.lastError = `Delivery queue load failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  private persist(): void {
    fs.mkdirSync(this.dataDir, { recursive: true });
    const filePath = this.filePath();
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify([...this.items.values()], null, 2), 'utf8');
    fs.renameSync(tmp, filePath);
  }

  private telemetry(item: QueuedSignalDelivery, event: DeliveryQueueState): void {
    recordDeliveryQueueTelemetry({
      type: 'delivery_queue',
      signalId: item.signalId,
      symbol: item.symbol,
      cohort: universeCohort(item.symbol),
      universeVersion: UNIVERSE_VERSION,
      event,
      state: item.state,
      queueDepth: [...this.items.values()].filter(current =>
        current.state === 'QUEUED' ||
        current.state === 'DISPATCHING' ||
        current.state === 'RATE_LIMIT_RETRY'
      ).length,
      deliveryAttemptCount: item.deliveryAttemptCount,
      queueDelayMs: Math.max(0, this.now() - Date.parse(item.queuedAt)),
      failureReason: item.failureReason,
    });
  }
}

function isProtectedFromReplacement(state: DeliveryQueueState): boolean {
  return state === 'QUEUED' ||
    state === 'DISPATCHING' ||
    state === 'RATE_LIMIT_RETRY' ||
    state === 'SENT' ||
    state === 'SCREENSHOT_FAILED';
}

function appendRecoveryReason(reason: string | null): string {
  const recovery = 'Recovered unfinished delivery after process restart.';
  return reason ? `${reason}; ${recovery}` : recovery;
}

function isQueuedSignalDelivery(value: Partial<QueuedSignalDelivery>): value is QueuedSignalDelivery {
  return typeof value.signalId === 'string' &&
    typeof value.symbol === 'string' &&
    typeof value.candidate === 'object' &&
    value.candidate !== null &&
    typeof value.signalCreatedAt === 'string' &&
    typeof value.validationPassedAt === 'string' &&
    typeof value.queuedAt === 'string' &&
    typeof value.priorityScore === 'number' &&
    typeof value.state === 'string' &&
    typeof value.deliveryAttemptCount === 'number' &&
    (typeof value.lastDeliveryAttemptAt === 'string' || value.lastDeliveryAttemptAt === null) &&
    (typeof value.dispatchStartedAt === 'string' || value.dispatchStartedAt === null) &&
    (typeof value.telegramSentAt === 'string' || value.telegramSentAt === null) &&
    (typeof value.failureReason === 'string' || value.failureReason === null);
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && (value as number) > 0 ? value as number : fallback;
}

function nonNegativeInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && (value as number) >= 0 ? value as number : fallback;
}

function priorityScore(candidate: NotificationCandidate): number {
  const zoneMid = resolveZoneMid(candidate);
  const rawDistance = Math.abs(candidate.currentPrice - zoneMid);
  const percentDistance = zoneMid > 0 ? (rawDistance / zoneMid) * 100 : 0;
  const gradeBoost = candidate.gradeResult.grade === 'A+' ? 1000 : candidate.gradeResult.grade === 'A' ? 500 : 0;
  return gradeBoost - (percentDistance * 20);
}

function resolveZoneMid(candidate: NotificationCandidate): number {
  if (candidate.poiType === 'OB') {
    const zone = candidate.poi as { low: number; high: number };
    return (zone.low + zone.high) / 2;
  }
  const zone = candidate.poi as { gapLow: number; gapHigh: number };
  return (zone.gapLow + zone.gapHigh) / 2;
}
