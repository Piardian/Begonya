import * as fs from 'fs';
import * as path from 'path';
import { JsonlEvidenceStore } from './evidenceStore';
import type { NotificationCandidate } from './pipeline';
import type { StoredCandle } from './candleStore';
import type { OrderBlock, FVG } from '../src/types';
import { detectAssetClass, getPipSize } from '../src/assetMetrics';
import { selectPaperTarget } from '../src/paperOutcomeTracker';
import { FileSignalLedger } from './signalLedger';
import {
  captureMacroSnapshot,
  createFallbackMacroSnapshot,
  FileMacroOutcomeStore,
  MacroOutcomeEvidenceRecord,
  MacroOutcomeStore,
  MacroSnapshot,
  estimateTransactionCost,
} from './macroOutcomeEvidence';

export type PaperOutcomeType = 'TP' | 'SL' | 'BE' | 'EXPIRED' | 'UNKNOWN';
type Direction = NotificationCandidate['tradeDirection'];

export interface TrackedSignal {
  signalId: string;
  symbol: string;
  direction: Direction;
  signalTimestamp: number;
  poiType?: 'OB' | 'FVG';
  grade?: string;
  smcScore?: number;
  macroSnapshot?: MacroSnapshot;
  liquidityMagnet?: NotificationCandidate['liquidityMagnet'];
  opposingObstacle?: NotificationCandidate['opposingObstacle'];
  zoneLow: number;
  zoneHigh: number;
  entryPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  riskDistance: number | null;
  targetR?: number;
  entryTriggeredAt: number | null;
  lastProcessedCandleTimestamp: number;
  beArmed: boolean;
  maximumFavorableExcursion: number;
  maximumAdverseExcursion: number;
  status: 'WAITING_ENTRY' | 'OPEN' | 'CLOSED';
  outcome?: PaperOutcomeType;
  exitTimestamp?: number;
  exitReason?: string;
}

interface TrackerState {
  version: 1;
  signals: Record<string, TrackedSignal>;
}

export interface PaperOutcomeTrackerConfig {
  readonly entryExpiryMs: number;
  readonly maxHoldBars: number;
  readonly riskReward: number;
  readonly breakEvenAtR: number;
  readonly stopBufferPips: number;
}

const DEFAULT_CONFIG: PaperOutcomeTrackerConfig = Object.freeze({
  entryExpiryMs: 16 * 15 * 60 * 1000,
  maxHoldBars: 32,
  riskReward: 2,
  breakEvenAtR: 1,
  stopBufferPips: 2,
});

export function calculateAssetCalibratedStopBuffer(symbol: string, zoneLow: number, zoneHigh: number): number {
  const assetClass = detectAssetClass(symbol);
  const upper = symbol.toUpperCase();
  const zoneWidth = Math.abs(zoneHigh - zoneLow);

  switch (assetClass) {
    case 'FOREX':
      return 2.0 * 0.0001; // 2.0 pips
    case 'FOREX_JPY':
      return 2.5 * 0.01; // 2.5 pips
    case 'COMMODITY':
      if (upper.startsWith('XAU')) {
        // Gold: minimum $1.50 (15 pips) or 10% of zone width to absorb broker spread spikes
        return Math.max(1.50, zoneWidth * 0.10);
      }
      return Math.max(0.15, zoneWidth * 0.10);
    case 'INDEX':
      // NAS100 / SPX: minimum 10.0 points or 10% of zone
      return Math.max(10.0, zoneWidth * 0.10);
    case 'CRYPTO':
      if (upper.startsWith('BTC')) {
        // BTC: minimum $35.0 buffer or 10% of zone
        return Math.max(35.0, zoneWidth * 0.10);
      }
      if (upper.startsWith('ETH')) {
        return Math.max(3.50, zoneWidth * 0.10);
      }
      if (upper.startsWith('SOL')) {
        return Math.max(0.35, zoneWidth * 0.10);
      }
      // Altcoins: 10% of zone width or 5 minimum pip units
      return Math.max(getPipSize(symbol) * 5, zoneWidth * 0.10);
    default:
      return 2.0 * getPipSize(symbol);
  }
}

export function isSliceThroughCandle(
  direction: 'long' | 'short',
  candle: StoredCandle,
  zoneLow: number,
  zoneHigh: number
): boolean {
  if (direction === 'long') {
    // Slices down completely through support zone without rejection
    return candle.open > zoneLow && candle.close < zoneLow;
  } else {
    // Slices up completely through resistance zone without rejection
    return candle.open < zoneHigh && candle.close > zoneHigh;
  }
}

export class PaperOutcomeTracker {
  private static instance: PaperOutcomeTracker | null = null;

  private readonly config: PaperOutcomeTrackerConfig;
  private readonly statePath: string;
  private readonly evidenceStore: JsonlEvidenceStore;
  private readonly macroOutcomeStore: MacroOutcomeStore;
  private readonly signalLedger: FileSignalLedger;
  private state: TrackerState;

  constructor(options?: {
    readonly statePath?: string;
    readonly evidenceStore?: JsonlEvidenceStore;
    readonly macroOutcomeStore?: MacroOutcomeStore;
    readonly signalLedger?: FileSignalLedger;
    readonly config?: Partial<PaperOutcomeTrackerConfig>;
  }) {
    this.config = Object.freeze({ ...DEFAULT_CONFIG, ...(options?.config ?? {}) });
    this.statePath = options?.statePath ?? process.env.OUTCOME_LEDGER_PATH ?? (
      process.env.NODE_ENV === 'test'
        ? path.resolve(process.cwd(), 'tests', 'temp_evidence', 'active_outcomes.json')
        : path.resolve(process.cwd(), 'data', 'active_outcomes.json')
    );
    this.evidenceStore = options?.evidenceStore ?? new JsonlEvidenceStore();
    this.macroOutcomeStore = options?.macroOutcomeStore ?? new FileMacroOutcomeStore();
    this.signalLedger = options?.signalLedger ?? new FileSignalLedger();
    this.state = this.loadState();
  }

  public static getInstance(options?: {
    readonly statePath?: string;
    readonly evidenceStore?: JsonlEvidenceStore;
    readonly macroOutcomeStore?: MacroOutcomeStore;
    readonly signalLedger?: FileSignalLedger;
    readonly config?: Partial<PaperOutcomeTrackerConfig>;
  }): PaperOutcomeTracker {
    if (!PaperOutcomeTracker.instance) {
      PaperOutcomeTracker.instance = new PaperOutcomeTracker(options);
    }
    return PaperOutcomeTracker.instance;
  }

  public static resetInstance(): void {
    PaperOutcomeTracker.instance = null;
  }

  registerCandidate(candidate: NotificationCandidate, macroSnapshot?: MacroSnapshot): void {
    const signalId = candidate.signalId ?? candidate.uniqueKey;
    const existing = this.state.signals[signalId];
    if (existing && existing.status !== 'CLOSED') return;
    if (existing?.status === 'CLOSED') return;

    const zone = candidate.poiType === 'OB'
      ? { low: (candidate.poi as OrderBlock).low, high: (candidate.poi as OrderBlock).high }
      : { low: (candidate.poi as FVG).gapLow, high: (candidate.poi as FVG).gapHigh };
    const signalTimestamp = candidate.marketDataTimestamp ?? candidate.signalContext?.timestamp ?? Date.now();

    const snapshot = macroSnapshot ?? captureMacroSnapshot(candidate, signalTimestamp);

    this.state.signals[signalId] = {
      signalId,
      symbol: candidate.symbol,
      direction: candidate.tradeDirection,
      signalTimestamp,
      poiType: candidate.poiType,
      grade: candidate.gradeResult?.grade ?? 'B',
      smcScore: candidate.macroEvaluation?.begonyaScore ?? candidate.gradeResult?.totalScore ?? 80,
      macroSnapshot: snapshot,
      liquidityMagnet: candidate.liquidityMagnet,
      opposingObstacle: candidate.opposingObstacle,
      zoneLow: zone.low,
      zoneHigh: zone.high,
      entryPrice: null,
      stopLoss: null,
      takeProfit: null,
      riskDistance: null,
      targetR: undefined,
      entryTriggeredAt: null,
      lastProcessedCandleTimestamp: signalTimestamp,
      beArmed: false,
      maximumFavorableExcursion: 0,
      maximumAdverseExcursion: 0,
      status: 'WAITING_ENTRY',
    };
    this.persist();

    // Ensure Signal Ledger records base SIGNAL_ISSUED so lifecycle is cleanly initiated
    void this.signalLedger.ensureSignalIssued({
      signalId,
      symbol: candidate.symbol,
      timeframe: '15m',
      direction: candidate.tradeDirection,
      poiType: candidate.poiType,
      signalTimestamp,
      marketDataTimestamp: candidate.marketDataTimestamp ?? null,
      observedMarketPrice: candidate.currentPrice ?? zone.high,
      poiFormedTimestamp: candidate.poiFormedTimestamp ?? signalTimestamp,
      zoneLow: zone.low,
      zoneHigh: zone.high,
      grade: candidate.gradeResult?.grade ?? 'UNKNOWN',
      score: candidate.gradeResult?.totalScore ?? 0,
      entryAllowed: candidate.gradeResult?.entryAllowed ?? true,
      macro: snapshot ? {
        allowed: snapshot.macroAction === 'PROCEED',
        action: snapshot.macroAction,
        mappedMacroKey: candidate.symbol,
        tradeDirection: candidate.tradeDirection,
        macroBias: snapshot.macroBias,
        primaryRegime: snapshot.primaryRegime,
        riskMultiplier: snapshot.riskMultiplier,
        macroGateMultiplier: snapshot.macroGateMultiplier,
        begonyaScore: snapshot.begonyaScore,
        scoreTier: snapshot.scoreTier,
      } : null,
    }).catch(err => {
      console.warn(`[PaperOutcomeTracker] Ledger ensureSignalIssued failed for ${signalId}:`, err);
    });
  }

  update(symbol: string, candles: readonly StoredCandle[]): void {
    if (candles.length === 0) return;

    let changed = false;
    for (const signal of Object.values(this.state.signals)) {
      if (signal.symbol !== symbol || signal.status === 'CLOSED') continue;

      const newCandles = candles
        .filter(candle => candle.timestamp > signal.lastProcessedCandleTimestamp)
        .sort((a, b) => a.timestamp - b.timestamp);

      for (const candle of newCandles) {
        const result = this.processCandle(signal, candle);
        signal.lastProcessedCandleTimestamp = Math.max(signal.lastProcessedCandleTimestamp, candle.timestamp);
        changed = changed || result.changed;
        if (result.closed) break;
      }
    }

    if (changed) this.persist();
  }

  get(signalId: string): TrackedSignal | undefined {
    return this.state.signals[signalId];
  }

  listOpen(): readonly TrackedSignal[] {
    return Object.freeze(Object.values(this.state.signals).filter(signal => signal.status !== 'CLOSED'));
  }

  private processCandle(signal: TrackedSignal, candle: StoredCandle): { changed: boolean; closed: boolean } {
    if (signal.status === 'WAITING_ENTRY') {
      if (candle.timestamp - signal.signalTimestamp >= this.config.entryExpiryMs) {
        this.close(signal, 'EXPIRED', candle.timestamp, 'Entry zone was not triggered before the configured entry window expired.');
        return { changed: true, closed: true };
      }

      if (!touchesZone(candle, signal.zoneLow, signal.zoneHigh)) {
        return { changed: false, closed: false };
      }

      // Approach Velocity & Rejection Guard: Check if the candle sliced completely through the zone
      if (isSliceThroughCandle(signal.direction, candle, signal.zoneLow, signal.zoneHigh)) {
        this.close(
          signal,
          'SL',
          candle.timestamp,
          'Entry zone sliced through aggressively on entry candle without structural rejection (Approach Velocity breach).'
        );
        return { changed: true, closed: true };
      }

      const entryPrice = resolveEntryPrice(signal.direction, signal.zoneLow, signal.zoneHigh, candle.open);
      // Asset-calibrated dynamic stop buffer
      const buffer = calculateAssetCalibratedStopBuffer(signal.symbol, signal.zoneLow, signal.zoneHigh);
      const stopLoss = signal.direction === 'long' ? signal.zoneLow - buffer : signal.zoneHigh + buffer;
      const riskDistance = Math.abs(entryPrice - stopLoss);

      if (!Number.isFinite(riskDistance) || riskDistance <= 0) {
        this.close(signal, 'UNKNOWN', candle.timestamp, 'Invalid synthetic risk distance prevented deterministic outcome calculation.');
        return { changed: true, closed: true };
      }

      // Dynamic Target based on Liquidity Magnet / Opposing Obstacle (Strictly minimum 2.0R, max 5.0R)
      const targetSelection = selectPaperTarget({
        entryPrice,
        stopLossPrice: stopLoss,
        tradeDirection: signal.direction,
        symbol: signal.symbol,
        liquidityMagnet: signal.liquidityMagnet,
        opposingObstacle: signal.opposingObstacle,
      });

      // Strict user rule: "ama burda yinede minimum 2 r olsun hedef"
      const targetR = Math.max(2.0, Math.min(5.0, targetSelection.targetR));
      const takeProfit = signal.direction === 'long'
        ? entryPrice + riskDistance * targetR
        : entryPrice - riskDistance * targetR;

      signal.entryPrice = entryPrice;
      signal.stopLoss = stopLoss;
      signal.takeProfit = takeProfit;
      signal.riskDistance = riskDistance;
      signal.targetR = targetR;
      signal.entryTriggeredAt = candle.timestamp;
      signal.status = 'OPEN';

      void this.signalLedger.recordEntry(signal.signalId, {
        executionSource: 'PAPER',
        entryTimestamp: candle.timestamp,
        entryPrice,
        brokerOrderId: null,
        positionId: null,
        slippageBps: 0,
      }).catch(err => {
        console.warn(`[PaperOutcomeTracker] Ledger recordEntry failed for ${signal.signalId}:`, err);
      });

      const exit = evaluateOpenCandle(signal, candle, true, this.config);
      if (exit) {
        this.close(signal, exit.type, candle.timestamp, exit.reason);
        return { changed: true, closed: true };
      }
      return { changed: true, closed: false };
    }

    if (signal.status !== 'OPEN' || signal.entryPrice === null || signal.stopLoss === null || signal.takeProfit === null || signal.riskDistance === null) {
      return { changed: false, closed: false };
    }

    const favorable = signal.direction === 'long'
      ? Math.max(0, candle.high - signal.entryPrice)
      : Math.max(0, signal.entryPrice - candle.low);
    const adverse = signal.direction === 'long'
      ? Math.max(0, signal.entryPrice - candle.low)
      : Math.max(0, candle.high - signal.entryPrice);
    signal.maximumFavorableExcursion = Math.max(signal.maximumFavorableExcursion, favorable / signal.riskDistance);
    signal.maximumAdverseExcursion = Math.max(signal.maximumAdverseExcursion, adverse / signal.riskDistance);

    if (!signal.beArmed && favorable >= signal.riskDistance * this.config.breakEvenAtR) {
      signal.beArmed = true;
    }

    const exit = evaluateOpenCandle(signal, candle, false, this.config);
    if (exit) {
      this.close(signal, exit.type, candle.timestamp, exit.reason);
      return { changed: true, closed: true };
    }

    const maxHoldMs = this.config.maxHoldBars * 15 * 60 * 1000;
    if (signal.entryTriggeredAt !== null && candle.timestamp - signal.entryTriggeredAt >= maxHoldMs) {
      this.close(signal, 'EXPIRED', candle.timestamp, 'Maximum configured holding period elapsed before TP, SL or BE.');
      return { changed: true, closed: true };
    }

    return { changed: true, closed: false };
  }

  private close(signal: TrackedSignal, outcome: PaperOutcomeType, timestamp: number, reason: string): void {
    signal.status = 'CLOSED';
    signal.outcome = outcome;
    signal.exitTimestamp = timestamp;
    signal.exitReason = reason;

    const exitPrice = resolveSyntheticExitPrice(signal, outcome);
    const targetMultiplier = signal.targetR ?? this.config.riskReward;
    const rrAchieved = outcome === 'TP' ? targetMultiplier : outcome === 'SL' ? -1 : outcome === 'BE' ? 0 : null;
    const holdingTimeMs = signal.entryTriggeredAt === null ? null : Math.max(0, timestamp - signal.entryTriggeredAt);

    // 1. Durably update Signal Ledger if applicable
    if (signal.entryTriggeredAt !== null) {
      const exitOutcome = outcome === 'TP' ? 'TAKE_PROFIT'
        : outcome === 'SL' ? 'STOP_LOSS'
        : outcome === 'BE' ? 'BREAK_EVEN'
        : outcome === 'EXPIRED' ? 'EXPIRED'
        : 'UNKNOWN';

      void this.signalLedger.recordExit(signal.signalId, {
        executionSource: 'PAPER',
        exitTimestamp: timestamp,
        exitPrice: exitPrice ?? (signal.entryPrice ?? 0),
        outcome: exitOutcome,
        realizedR: rrAchieved,
        holdingTimeMs,
        slippageBps: 0,
      }).catch(err => {
        console.warn(`[PaperOutcomeTracker] Ledger recordExit failed for ${signal.signalId}:`, err);
      });
    } else {
      void this.signalLedger.recordCancelled(signal.signalId, timestamp, reason).catch(err => {
        console.warn(`[PaperOutcomeTracker] Ledger recordCancelled failed for ${signal.signalId}:`, err);
      });
    }

    // 2. Append enriched Macro Outcome Evidence Record with transaction costs and source tagging
    const snapshot = signal.macroSnapshot ?? createFallbackMacroSnapshot(signal.symbol, signal.direction, signal.signalTimestamp);
    const costs = estimateTransactionCost(signal.symbol, signal.riskDistance ?? 0, signal.entryPrice);
    const netRealizedR = rrAchieved !== null ? Math.round((rrAchieved - costs.totalCostR) * 100) / 100 : null;
    const assetClass = detectAssetClass(signal.symbol);
    const forecastHorizon = holdingTimeMs === null || holdingTimeMs < 4 * 3600 * 1000
      ? 'SCALP_INTRADAY'
      : (holdingTimeMs <= 24 * 3600 * 1000 ? 'SWING_4H_24H' : 'MULTI_DAY');
    const macroGatingCohort = snapshot.macroAction === 'PROCEED'
      ? 'MACRO_PLUS_SMC'
      : 'SMC_ONLY';
    const executionSource = process.env.NODE_ENV === 'test'
      ? 'TEST'
      : (process.env.EXECUTION_SOURCE === 'LIVE' ? 'LIVE' : 'PAPER');

    const macroOutcomeRecord: MacroOutcomeEvidenceRecord = {
      schemaVersion: 1,
      signalId: signal.signalId,
      symbol: signal.symbol,
      direction: signal.direction,
      poiType: signal.poiType ?? 'OB',
      grade: signal.grade ?? 'B',
      smcScore: signal.smcScore ?? 80,
      signalTimestamp: signal.signalTimestamp,
      entryTimestamp: signal.entryTriggeredAt,
      exitTimestamp: timestamp,
      holdingTimeMs,
      outcome,
      realizedR: rrAchieved,
      entryPrice: signal.entryPrice,
      exitPrice,
      stopLoss: signal.stopLoss,
      takeProfit: signal.takeProfit,
      riskDistance: signal.riskDistance,
      maximumFavorableExcursion: signal.maximumFavorableExcursion,
      maximumAdverseExcursion: signal.maximumAdverseExcursion,
      exitReason: reason,
      macroSnapshot: snapshot,
      recordedAt: new Date(timestamp).toISOString(),
      executionSource,
      entryConfirmed: signal.entryTriggeredAt !== null,
      spreadCostR: costs.spreadCostR,
      slippageCostR: costs.slippageCostR,
      netRealizedR,
      assetClass,
      forecastHorizon,
      macroGatingCohort,
    };

    void this.macroOutcomeStore.appendRecord(macroOutcomeRecord).catch(error => {
      console.warn(`[PaperOutcomeTracker] Macro outcome evidence write failed for ${signal.signalId}:`, error);
    });

    // 3. Append legacy outcome evidence
    void this.evidenceStore.appendOutcomeEvidence({
      evidenceSchemaVersion: 1,
      signalId: signal.signalId,
      appendedAt: new Date(timestamp).toISOString(),
      outcome: {
        type: outcome,
        holdingTimeMs,
        rrAchieved,
        maximumFavorableExcursion: signal.maximumFavorableExcursion,
        maximumAdverseExcursion: signal.maximumAdverseExcursion,
        exitTimestamp: timestamp,
        exitReason: reason,
      },
    }).catch(error => {
      console.warn(`[PaperOutcomeTracker] Outcome evidence write failed for ${signal.signalId}:`, error);
    });
  }

  private loadState(): TrackerState {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.statePath, 'utf8')) as TrackerState;
      if (parsed.version === 1 && parsed.signals && typeof parsed.signals === 'object') return parsed;
    } catch {
      // Missing/corrupt ledger starts empty; runtime remains operational.
    }
    return { version: 1, signals: {} };
  }

  private persist(): void {
    const dir = path.dirname(this.statePath);
    fs.mkdirSync(dir, { recursive: true });
    const temp = `${this.statePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(this.state, null, 2), 'utf8');
    try {
      fs.renameSync(temp, this.statePath);
    } catch {
      fs.copyFileSync(temp, this.statePath);
      try { fs.unlinkSync(temp); } catch {}
    }
  }
}

function touchesZone(candle: StoredCandle, zoneLow: number, zoneHigh: number): boolean {
  return candle.high >= zoneLow && candle.low <= zoneHigh;
}

function resolveEntryPrice(direction: Direction, zoneLow: number, zoneHigh: number, candleOpen: number): number {
  if (direction === 'long') {
    if (candleOpen > zoneHigh) return zoneHigh;
    if (candleOpen < zoneLow) return zoneLow;
  } else {
    if (candleOpen < zoneLow) return zoneLow;
    if (candleOpen > zoneHigh) return zoneHigh;
  }
  return (zoneLow + zoneHigh) / 2;
}

function resolveSyntheticExitPrice(signal: TrackedSignal, outcome: PaperOutcomeType): number | null {
  if (outcome === 'TP') return signal.takeProfit;
  if (outcome === 'SL') return signal.stopLoss;
  if (outcome === 'BE') return signal.entryPrice;
  return signal.entryPrice;
}

function evaluateOpenCandle(
  signal: TrackedSignal,
  candle: StoredCandle,
  entryCandle: boolean,
  config: PaperOutcomeTrackerConfig,
): { type: PaperOutcomeType; reason: string } | null {
  if (signal.entryPrice === null || signal.stopLoss === null || signal.takeProfit === null) return null;

  const hitsTP = signal.direction === 'long' ? candle.high >= signal.takeProfit : candle.low <= signal.takeProfit;
  const hitsSL = signal.direction === 'long' ? candle.low <= signal.stopLoss : candle.high >= signal.stopLoss;
  const hitsBE = signal.beArmed && (signal.direction === 'long' ? candle.low <= signal.entryPrice : candle.high >= signal.entryPrice);

  if (hitsTP && hitsSL) {
    return { type: 'UNKNOWN', reason: 'TP and SL were both inside the same OHLC candle; execution order is unknowable from candle data alone.' };
  }
  if (hitsTP) return { type: 'TP', reason: `Synthetic take-profit reached at ${signal.targetR ?? config.riskReward}R (Liquidity Target).` };
  if (hitsSL) return { type: signal.beArmed ? 'BE' : 'SL', reason: signal.beArmed ? 'Break-even stop was hit after the BE threshold was armed.' : 'Synthetic stop-loss reached before break-even activation.' };
  if (hitsBE && !entryCandle) return { type: 'BE', reason: 'Break-even threshold was armed and price returned to the synthetic entry.' };
  return null;
}
