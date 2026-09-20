import * as fs from 'fs';
import * as path from 'path';
import type { NotificationCandidate } from './pipeline';
import type { RuntimeExecutionPipelineResult } from './runtimeExecutionPipeline';
import type { OrderBlock, FVG } from '../src/types';

export const SIGNAL_LEDGER_VERSION = 1 as const;

export type SignalLedgerEventType =
  | 'SIGNAL_ISSUED'
  | 'ENTRY_RECORDED'
  | 'EXIT_RECORDED'
  | 'CANCELLED';

export interface SignalLedgerEvent {
  readonly version: typeof SIGNAL_LEDGER_VERSION;
  readonly eventId: string;
  readonly signalId: string;
  readonly eventType: SignalLedgerEventType;
  readonly eventTimestamp: number;
  readonly recordedAt: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface SignalIssuedPayload {
  readonly symbol: string;
  readonly timeframe: '15m';
  readonly direction: 'long' | 'short';
  readonly poiType: 'OB' | 'FVG';
  readonly signalTimestamp: number;
  readonly marketDataTimestamp: number | null;
  readonly observedMarketPrice: number;
  readonly poiFormedTimestamp: number;
  readonly zoneLow: number;
  readonly zoneHigh: number;
  readonly grade: string;
  readonly score: number;
  readonly entryAllowed: boolean;
  readonly admissionProfile: string;
  readonly riskStatus: string;
  readonly executionEligibility: boolean;
  readonly executionMode: string;
  readonly paperExecutionId: string;
  readonly paperStatus: string | null;
  readonly macro: Readonly<{
    readonly allowed: boolean;
    readonly action: string;
    readonly mappedMacroKey: string;
    readonly tradeDirection: 'long' | 'short';
    readonly macroBias: string;
    readonly primaryRegime: string;
    readonly riskMultiplier: number;
    readonly macroGateMultiplier: 0 | 1;
    readonly begonyaScore: number;
    readonly scoreTier: string;
  }> | null;
  readonly execution: Readonly<{
    readonly realExecutionTracked: false;
    readonly brokerOrderId: null;
    readonly positionId: null;
    readonly entryTimestamp: null;
    readonly entryPrice: null;
    readonly exitTimestamp: null;
    readonly exitPrice: null;
    readonly realizedR: null;
    readonly entrySlippageBps: null;
    readonly exitSlippageBps: null;
  }>;
}

export interface SignalEntryPayload {
  readonly executionSource: 'PAPER' | 'BROKER_OBSERVED' | 'MANUAL';
  readonly entryTimestamp: number;
  readonly entryPrice: number;
  readonly brokerOrderId: string | null;
  readonly positionId: string | null;
  readonly slippageBps: number | null;
}

export interface SignalExitPayload {
  readonly executionSource: 'PAPER' | 'BROKER_OBSERVED' | 'MANUAL';
  readonly exitTimestamp: number;
  readonly exitPrice: number;
  readonly outcome: 'TAKE_PROFIT' | 'STOP_LOSS' | 'BREAK_EVEN' | 'EXPIRED' | 'CANCELLED' | 'UNKNOWN';
  readonly realizedR: number | null;
  readonly holdingTimeMs: number | null;
  readonly slippageBps: number | null;
}

export class FileSignalLedger {
  constructor(private readonly baseDir = path.join(process.env.EVIDENCE_DIRECTORY ?? 'evidence', 'ledger')) {}

  async recordSignalIssued(input: {
    readonly candidate: NotificationCandidate;
    readonly execution: RuntimeExecutionPipelineResult;
  }): Promise<SignalLedgerEvent> {
    const signalId = input.candidate.signalId ?? input.candidate.uniqueKey;
    const eventTimestamp = input.candidate.marketDataTimestamp ?? input.candidate.signalContext?.timestamp ?? Date.now();
    const zone = resolveZone(input.candidate);
    const risk = input.execution.riskResult.items[0];
    const paperItem = input.execution.paperResult.items[0];
    const macro = input.candidate.macroEvaluation
      ? {
          allowed: input.candidate.macroEvaluation.allowed,
          action: input.candidate.macroEvaluation.action,
          mappedMacroKey: input.candidate.macroEvaluation.mappedMacroKey,
          tradeDirection: input.candidate.macroEvaluation.tradeDirection,
          macroBias: input.candidate.macroEvaluation.macroBias,
          primaryRegime: input.candidate.macroEvaluation.primaryRegime,
          riskMultiplier: input.candidate.macroEvaluation.riskMultiplier,
          macroGateMultiplier: input.candidate.macroEvaluation.macroGateMultiplier,
          begonyaScore: input.candidate.macroEvaluation.begonyaScore,
          scoreTier: input.candidate.macroEvaluation.scoreTier,
        }
      : null;

    return this.appendOnce(signalId, 'SIGNAL_ISSUED', eventTimestamp, {
      symbol: input.candidate.symbol,
      timeframe: '15m',
      direction: input.candidate.tradeDirection,
      poiType: input.candidate.poiType,
      signalTimestamp: input.candidate.signalContext?.timestamp ?? input.candidate.poi.relatedEvent.breakTimestamp,
      marketDataTimestamp: input.candidate.marketDataTimestamp ?? null,
      observedMarketPrice: input.candidate.currentPrice,
      poiFormedTimestamp: input.candidate.poiFormedTimestamp,
      zoneLow: zone.low,
      zoneHigh: zone.high,
      grade: input.candidate.gradeResult.grade,
      score: input.candidate.gradeResult.totalScore,
      entryAllowed: input.candidate.gradeResult.entryAllowed,
      admissionProfile: input.candidate.admissionProfile ?? 'PRODUCTION',
      riskStatus: risk?.riskStatus ?? 'NO_RISK',
      executionEligibility: risk?.evaluation.executionAllowed === true,
      executionMode: input.execution.engineResult.engineReference.engineMode,
      paperExecutionId: input.execution.paperResult.paperExecutionReference.paperExecutionId,
      paperStatus: paperItem?.paperStatus ?? null,
      macro,
      execution: {
        realExecutionTracked: false as const,
        brokerOrderId: null,
        positionId: null,
        entryTimestamp: null,
        entryPrice: null,
        exitTimestamp: null,
        exitPrice: null,
        realizedR: null,
        entrySlippageBps: null,
        exitSlippageBps: null,
      },
    });
  }

  async recordEntry(signalId: string, payload: SignalEntryPayload): Promise<SignalLedgerEvent> {
    await this.assertEventExists(signalId, 'SIGNAL_ISSUED');
    if (await this.hasEventType(signalId, 'ENTRY_RECORDED')) {
      throw new Error(`ENTRY_RECORDED already exists for signal ${signalId}.`);
    }
    if (await this.hasEventType(signalId, 'EXIT_RECORDED')) {
      throw new Error(`Cannot record an entry after exit for signal ${signalId}.`);
    }
    return this.appendOnce(signalId, 'ENTRY_RECORDED', payload.entryTimestamp, payload as unknown as Readonly<Record<string, unknown>>);
  }

  async recordExit(signalId: string, payload: SignalExitPayload): Promise<SignalLedgerEvent> {
    await this.assertEventExists(signalId, 'ENTRY_RECORDED');
    if (await this.hasEventType(signalId, 'EXIT_RECORDED')) {
      throw new Error(`EXIT_RECORDED already exists for signal ${signalId}.`);
    }
    return this.appendOnce(signalId, 'EXIT_RECORDED', payload.exitTimestamp, payload as unknown as Readonly<Record<string, unknown>>);
  }

  async recordCancelled(signalId: string, eventTimestamp: number, reason: string): Promise<SignalLedgerEvent> {
    await this.assertEventExists(signalId, 'SIGNAL_ISSUED');
    if (await this.hasEventType(signalId, 'EXIT_RECORDED')) {
      throw new Error(`Cannot cancel a closed signal ${signalId}.`);
    }
    if (await this.hasEventType(signalId, 'CANCELLED')) {
      throw new Error(`CANCELLED already exists for signal ${signalId}.`);
    }
    return this.appendOnce(signalId, 'CANCELLED', eventTimestamp, { reason });
  }

  private async appendOnce(
    signalId: string,
    eventType: SignalLedgerEventType,
    eventTimestamp: number,
    payload: Readonly<Record<string, unknown>>
  ): Promise<SignalLedgerEvent> {
    if (!signalId.trim()) throw new Error('signalId cannot be empty.');
    if (!Number.isFinite(eventTimestamp)) throw new Error('eventTimestamp must be finite.');

    const existing = await this.readEvents(signalId);
    const duplicate = existing.find(event => event.eventType === eventType);
    if (duplicate) return duplicate;

    const event: SignalLedgerEvent = Object.freeze({
      version: SIGNAL_LEDGER_VERSION,
      eventId: `${sanitize(signalId)}:${eventType}`,
      signalId,
      eventType,
      eventTimestamp,
      recordedAt: new Date().toISOString(),
      payload: Object.freeze({ ...payload }),
    });

    const filePath = this.filePath(signalId);
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.appendFile(filePath, `${JSON.stringify(event)}\n`, 'utf8');
    return event;
  }

  private async assertEventExists(signalId: string, eventType: SignalLedgerEventType): Promise<void> {
    if (!(await this.hasEventType(signalId, eventType))) {
      throw new Error(`${eventType} is required before this operation for signal ${signalId}.`);
    }
  }

  private async hasEventType(signalId: string, eventType: SignalLedgerEventType): Promise<boolean> {
    const events = await this.readEvents(signalId);
    return events.some(event => event.eventType === eventType);
  }

  private async readEvents(signalId: string): Promise<SignalLedgerEvent[]> {
    const filePath = this.filePath(signalId);
    try {
      const raw = await fs.promises.readFile(filePath, 'utf8');
      return raw
        .split(/\r?\n/)
        .filter(Boolean)
        .map(line => JSON.parse(line) as SignalLedgerEvent);
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
      if (code === 'ENOENT') return [];
      throw error;
    }
  }

  private filePath(signalId: string): string {
    return path.join(this.baseDir, sanitize(signalId) + '.jsonl');
  }
}

function resolveZone(candidate: NotificationCandidate): { low: number; high: number } {
  if (candidate.poiType === 'OB') {
    const ob = candidate.poi as OrderBlock;
    return { low: ob.low, high: ob.high };
  }
  const fvg = candidate.poi as FVG;
  return { low: fvg.gapLow, high: fvg.gapHigh };
}

function sanitize(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}
