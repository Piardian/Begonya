import * as fs from 'fs';
import * as path from 'path';
import type { Candle, OrderBlock, FVG } from '../src/types';
import type { Symbol } from './universe';
import { getPipSize, detectAssetClass } from '../src/assetMetrics';

export type ShadowCohortType =
  | 'LIVE_ACCEPTED_SWEEP'
  | 'LIVE_ACCEPTED_NO_SWEEP'
  | 'SHADOW_REJECTED_DISPLACEMENT'
  | 'SHADOW_REJECTED_HTF_PD'
  | 'SHADOW_REJECTED_GRADE_BELOW_A'
  | 'SHADOW_REJECTED_CONSOLIDATED'
  | 'SHADOW_REJECTED_OTHER';

export type ShadowOutcomeType = 'TP' | 'SL' | 'BE' | 'EXPIRED' | 'CANCELLED';

export interface ShadowPoiRegistration {
  readonly symbol: Symbol;
  readonly tradeDirection: 'long' | 'short';
  readonly poiType: 'OB' | 'FVG';
  readonly zoneLow: number;
  readonly zoneHigh: number;
  readonly formedTimestamp: number;
  readonly observedTimestamp: number;
  readonly stage: 'CANDIDATE' | 'GRADED_REJECTED' | 'FILTER_REJECTED' | 'CONSOLIDATED_REJECTED';
  readonly grade: string | null;
  readonly smcScore: number | null;
  readonly hasSweep: boolean;
  readonly sweepType?: string | null;
  readonly blockingRules: readonly string[];
  readonly bias4H: string;
  readonly bias1H: string;
  readonly pd4H?: string;
  readonly pd15M?: string;
  readonly structureType?: 'internal' | 'external';
}

export interface ShadowTrackedRecord {
  readonly recordId: string;
  readonly symbol: Symbol;
  readonly tradeDirection: 'long' | 'short';
  readonly poiType: 'OB' | 'FVG';
  readonly zoneLow: number;
  readonly zoneHigh: number;
  readonly entryPrice: number;
  readonly stopPrice: number;
  readonly targetPrice: number;
  readonly targetR: number;
  readonly riskDistance: number;
  readonly formedTimestamp: number;
  readonly observedTimestamp: number;
  readonly cohort: ShadowCohortType;
  readonly stage: ShadowPoiRegistration['stage'];
  readonly grade: string | null;
  readonly smcScore: number | null;
  readonly hasSweep: boolean;
  readonly blockingRules: readonly string[];
  readonly bias4H: string;
  readonly bias1H: string;

  // Lifecycle state
  status: 'WAITING_ENTRY' | 'OPEN' | 'COMPLETED';
  entryTriggeredAt: number | null;
  entryBarIndex: number | null;
  barsHeld: number;
  maximumFavorableExcursion: number;
  maximumAdverseExcursion: number;
  outcome?: ShadowOutcomeType;
  realizedR?: number;
  exitTimestamp?: number;
  exitReason?: string;

  // 1M Confirmation Hypotheses Simulation
  confirmationHypothesis: {
    // Immediate blowout: Price pierced zone and hit stop within 1 bar without any reaction
    directBlowoutWithoutReaction: boolean;
    // Strong rejection: Price entered zone, produced favorable wick/rejection >= 0.5R
    demonstratedZoneRejection: boolean;
    // Simulated outcome if a 1M confirmation was required before entering:
    // 'AVOIDED_LOSS' -> Direct blowout was prevented because confirmation never formed
    // 'CONFIRMED_ENTERED' -> Rejection formed, trade was entered (with slightly delayed entry)
    // 'MISSED_MOVE' -> Price lightly tapped zone (< 0.2 of zone) and flew to TP without giving confirmation
    simulated1MStatus: 'PENDING' | 'AVOIDED_LOSS' | 'CONFIRMED_ENTERED' | 'MISSED_MOVE';
    simulated1MR?: number;
  };
}

export interface ShadowAnalyticsReport {
  readonly generatedAt: string;
  readonly totalTracked: number;
  readonly activeCount: number;
  readonly completedCount: number;
  readonly overall: {
    readonly fillRatePct: number;
    readonly winRatePct: number;
    readonly totalR: number;
    readonly expectancyR: number;
    readonly tpCount: number;
    readonly slCount: number;
    readonly beCount: number;
    readonly expiredCount: number;
  };
  readonly cohortBreakdown: Record<
    string,
    {
      readonly total: number;
      readonly filled: number;
      readonly fillRatePct: number;
      readonly completed: number;
      readonly wins: number;
      readonly losses: number;
      readonly winRatePct: number;
      readonly totalR: number;
      readonly avgR: number;
    }
  >;
  readonly sweepComparison: {
    readonly withSweep: { count: number; completed: number; winRatePct: number; avgR: number; totalR: number };
    readonly withoutSweep: { count: number; completed: number; winRatePct: number; avgR: number; totalR: number };
    readonly sweepAlphaR: number;
  };
  readonly filterEfficiency: {
    readonly liveAccepted: { count: number; winRatePct: number; avgR: number };
    readonly filterRejected: { count: number; winRatePct: number; avgR: number; savedLosses: number; missedWins: number };
    readonly netFilterBenefitR: number;
  };
  readonly oneMinuteConfirmationSimulation: {
    readonly totalFilled: number;
    readonly directBlowoutsAvoided: number;
    readonly missedWinningTrades: number;
    readonly standardAvgR: number;
    readonly confirmedAvgR: number;
    readonly confirmationBenefitR: number;
  };
}

export class ShadowCohortTracker {
  private static instance: ShadowCohortTracker | null = null;
  private readonly records = new Map<string, ShadowTrackedRecord>();
  private readonly completedRecords: ShadowTrackedRecord[] = [];
  private readonly stateFile: string;
  private readonly completedEvidenceFile: string;
  private readonly reportFile: string;
  private readonly maxHoldBars = 32;
  private readonly entryWindowBars = 16;

  constructor(baseDir?: string) {
    const dataDir = baseDir ?? path.resolve(process.env.DATA_DIR ?? 'data');
    const researchDir = baseDir ? dataDir : path.resolve('evidence', 'research');
    this.stateFile = path.join(dataDir, 'shadow_cohort_ledger.json');
    this.completedEvidenceFile = path.join(researchDir, 'shadow_completed_outcomes.jsonl');
    this.reportFile = path.join(dataDir, 'shadow_analytics_report.json');
    this.load();
  }

  static getInstance(): ShadowCohortTracker {
    if (!ShadowCohortTracker.instance) {
      ShadowCohortTracker.instance = new ShadowCohortTracker();
    }
    return ShadowCohortTracker.instance;
  }

  static resetInstance(): void {
    ShadowCohortTracker.instance = null;
  }

  resolveCohort(input: ShadowPoiRegistration): ShadowCohortType {
    if (input.stage === 'CANDIDATE') {
      return input.hasSweep ? 'LIVE_ACCEPTED_SWEEP' : 'LIVE_ACCEPTED_NO_SWEEP';
    }
    if (input.stage === 'CONSOLIDATED_REJECTED') {
      return 'SHADOW_REJECTED_CONSOLIDATED';
    }
    if (input.blockingRules.some(r => r.includes('displacement'))) {
      return 'SHADOW_REJECTED_DISPLACEMENT';
    }
    if (input.blockingRules.some(r => r.includes('pd') || r.includes('bias') || r.includes('direction'))) {
      return 'SHADOW_REJECTED_HTF_PD';
    }
    if (input.blockingRules.some(r => r.includes('grade_below_A') || r.includes('grade_cap'))) {
      return 'SHADOW_REJECTED_GRADE_BELOW_A';
    }
    return 'SHADOW_REJECTED_OTHER';
  }

  registerPoiCandidate(input: ShadowPoiRegistration): void {
    if (input.zoneHigh <= input.zoneLow) return;
    const pip = getPipSize(input.symbol);
    const lowPips = Math.round(input.zoneLow / pip);
    const highPips = Math.round(input.zoneHigh / pip);
    const recordId = `SHADOW:${input.symbol}:${input.tradeDirection}:${input.poiType}:${input.formedTimestamp}:${lowPips}-${highPips}`;

    if (this.records.has(recordId)) return;

    // Buffer: 1.5 pip buffer beyond zone
    const buffer = 1.5 * pip;
    const entryPrice = (input.zoneLow + input.zoneHigh) / 2;
    const stopPrice = input.tradeDirection === 'long' ? input.zoneLow - buffer : input.zoneHigh + buffer;
    const riskDistance = Math.abs(entryPrice - stopPrice);
    if (riskDistance <= 0) return;

    const targetR = 2.0; // standard benchmark target 2R
    const targetPrice = input.tradeDirection === 'long'
      ? entryPrice + riskDistance * targetR
      : entryPrice - riskDistance * targetR;

    const cohort = this.resolveCohort(input);

    const record: ShadowTrackedRecord = {
      recordId,
      symbol: input.symbol,
      tradeDirection: input.tradeDirection,
      poiType: input.poiType,
      zoneLow: input.zoneLow,
      zoneHigh: input.zoneHigh,
      entryPrice,
      stopPrice,
      targetPrice,
      targetR,
      riskDistance,
      formedTimestamp: input.formedTimestamp,
      observedTimestamp: input.observedTimestamp,
      cohort,
      stage: input.stage,
      grade: input.grade,
      smcScore: input.smcScore,
      hasSweep: input.hasSweep,
      blockingRules: [...input.blockingRules],
      bias4H: input.bias4H,
      bias1H: input.bias1H,
      status: 'WAITING_ENTRY',
      entryTriggeredAt: null,
      entryBarIndex: null,
      barsHeld: 0,
      maximumFavorableExcursion: 0,
      maximumAdverseExcursion: 0,
      confirmationHypothesis: {
        directBlowoutWithoutReaction: false,
        demonstratedZoneRejection: false,
        simulated1MStatus: 'PENDING',
      },
    };

    this.records.set(recordId, record);
    this.persist();
  }

  process(symbol: string, candles: readonly Candle[]): ShadowTrackedRecord[] {
    const updated: ShadowTrackedRecord[] = [];
    if (!candles || candles.length === 0) return updated;

    for (const [recordId, record] of [...this.records.entries()]) {
      if (record.symbol !== symbol || record.status === 'COMPLETED') continue;

      const relevantCandles = candles.filter(c => c.timestamp > record.observedTimestamp);
      if (relevantCandles.length === 0) continue;

      let changed = false;

      // 1. WAITING FOR RETEST ENTRY
      if (record.status === 'WAITING_ENTRY') {
        const entrySearchLimit = Math.min(this.entryWindowBars, relevantCandles.length);
        let foundEntryIndex = -1;

        for (let i = 0; i < entrySearchLimit; i++) {
          const c = relevantCandles[i];
          // Zone touch: price touches entry zone
          const touched = record.tradeDirection === 'long'
            ? c.low <= record.entryPrice
            : c.high >= record.entryPrice;

          if (touched) {
            foundEntryIndex = i;
            break;
          }
        }

        if (foundEntryIndex >= 0) {
          record.status = 'OPEN';
          record.entryTriggeredAt = relevantCandles[foundEntryIndex].timestamp;
          record.entryBarIndex = foundEntryIndex;
          changed = true;
        } else if (relevantCandles.length >= this.entryWindowBars) {
          // Entry window expired without retest
          record.status = 'COMPLETED';
          record.outcome = 'EXPIRED';
          record.realizedR = 0;
          record.exitTimestamp = relevantCandles[this.entryWindowBars - 1].timestamp;
          record.exitReason = 'ENTRY_WINDOW_EXPIRED';
          changed = true;
          this.archiveCompleted(record);
          updated.push(record);
          continue;
        }
      }

      // 2. OPEN POSITION TRACKING
      if (record.status === 'OPEN' && record.entryBarIndex !== null) {
        const postEntryCandles = relevantCandles.slice(record.entryBarIndex + 1);
        record.barsHeld = postEntryCandles.length;

        for (let offset = 0; offset < Math.min(this.maxHoldBars, postEntryCandles.length); offset++) {
          const c = postEntryCandles[offset];
          const favorable = record.tradeDirection === 'long'
            ? Math.max(0, c.high - record.entryPrice)
            : Math.max(0, record.entryPrice - c.low);
          const adverse = record.tradeDirection === 'long'
            ? Math.max(0, record.entryPrice - c.low)
            : Math.max(0, c.high - record.entryPrice);

          record.maximumFavorableExcursion = Math.max(record.maximumFavorableExcursion, favorable);
          record.maximumAdverseExcursion = Math.max(record.maximumAdverseExcursion, adverse);

          const favorableR = favorable / record.riskDistance;
          const adverseR = adverse / record.riskDistance;

          // 1M / LTF confirmation hypothesis tracking:
          if (favorableR >= 0.5) {
            record.confirmationHypothesis.demonstratedZoneRejection = true;
          }

          const hitStop = record.tradeDirection === 'long'
            ? c.low <= record.stopPrice
            : c.high >= record.stopPrice;
          const hitTarget = record.tradeDirection === 'long'
            ? c.high >= record.targetPrice
            : c.low <= record.targetPrice;

          // Conservative resolution on conflict: Stop Loss first
          if (hitStop) {
            record.status = 'COMPLETED';
            record.outcome = 'SL';
            record.realizedR = -1.0;
            record.exitTimestamp = c.timestamp;
            record.exitReason = 'STOP_LOSS_REACHED';

            // Check if this was a direct blowout (SL hit immediately with zero favorable reaction)
            if (!record.confirmationHypothesis.demonstratedZoneRejection && offset <= 1) {
              record.confirmationHypothesis.directBlowoutWithoutReaction = true;
              record.confirmationHypothesis.simulated1MStatus = 'AVOIDED_LOSS';
              record.confirmationHypothesis.simulated1MR = 0; // Loss was avoided!
            } else {
              record.confirmationHypothesis.simulated1MStatus = 'CONFIRMED_ENTERED';
              record.confirmationHypothesis.simulated1MR = -1.0;
            }

            changed = true;
            this.archiveCompleted(record);
            updated.push(record);
            break;
          }

          if (hitTarget) {
            record.status = 'COMPLETED';
            record.outcome = 'TP';
            record.realizedR = record.targetR;
            record.exitTimestamp = c.timestamp;
            record.exitReason = 'TAKE_PROFIT_REACHED';

            if (record.confirmationHypothesis.demonstratedZoneRejection) {
              record.confirmationHypothesis.simulated1MStatus = 'CONFIRMED_ENTERED';
              // Slightly reduced R due to confirmation latency (e.g. 1.8R instead of 2.0R)
              record.confirmationHypothesis.simulated1MR = Math.max(1.0, record.targetR - 0.2);
            } else {
              // Reached target without sustained zone reaction (quick wick & run)
              record.confirmationHypothesis.simulated1MStatus = 'MISSED_MOVE';
              record.confirmationHypothesis.simulated1MR = 0;
            }

            changed = true;
            this.archiveCompleted(record);
            updated.push(record);
            break;
          }
        }

        // Max hold expired
        if (record.status === 'OPEN' && postEntryCandles.length >= this.maxHoldBars) {
          const exitCandle = postEntryCandles[this.maxHoldBars - 1];
          const directionalMove = record.tradeDirection === 'long'
            ? exitCandle.close - record.entryPrice
            : record.entryPrice - exitCandle.close;
          const endR = Math.max(-1.0, Math.min(record.targetR, directionalMove / record.riskDistance));

          record.status = 'COMPLETED';
          record.outcome = 'EXPIRED';
          record.realizedR = endR;
          record.exitTimestamp = exitCandle.timestamp;
          record.exitReason = 'MAX_HOLD_BARS_EXPIRED';
          record.confirmationHypothesis.simulated1MStatus = 'CONFIRMED_ENTERED';
          record.confirmationHypothesis.simulated1MR = endR;

          changed = true;
          this.archiveCompleted(record);
          updated.push(record);
        }
      }

      if (changed) {
        this.records.set(recordId, record);
      }
    }

    if (updated.length > 0) {
      this.persist();
      this.generateAnalyticsReport();
    }

    return updated;
  }

  private archiveCompleted(record: ShadowTrackedRecord): void {
    try {
      this.completedRecords.push(record);
      fs.mkdirSync(path.dirname(this.completedEvidenceFile), { recursive: true });
      fs.appendFileSync(this.completedEvidenceFile, JSON.stringify(record) + '\n', 'utf8');
    } catch {
      // Best-effort append
    }
  }

  generateAnalyticsReport(): ShadowAnalyticsReport {
    const all = [...this.completedRecords];
    const totalTracked = this.records.size + this.completedRecords.length;
    const completedCount = all.length;
    const activeCount = this.records.size - [...this.records.values()].filter(r => r.status === 'COMPLETED').length;

    const filled = all.filter(r => r.entryTriggeredAt !== null);
    const fillRatePct = completedCount > 0 ? (filled.length / completedCount) * 100 : 0;

    const wins = filled.filter(r => (r.realizedR ?? 0) > 0);
    const losses = filled.filter(r => (r.realizedR ?? 0) < 0);
    const totalR = filled.reduce((acc, r) => acc + (r.realizedR ?? 0), 0);
    const winRatePct = filled.length > 0 ? (wins.length / filled.length) * 100 : 0;
    const expectancyR = filled.length > 0 ? totalR / filled.length : 0;

    // Cohort breakdown
    const cohortBreakdown: ShadowAnalyticsReport['cohortBreakdown'] = {};
    const cohortGroups = new Map<string, ShadowTrackedRecord[]>();
    for (const r of all) {
      const list = cohortGroups.get(r.cohort) ?? [];
      list.push(r);
      cohortGroups.set(r.cohort, list);
    }

    for (const [cohortName, list] of cohortGroups.entries()) {
      const fList = list.filter(r => r.entryTriggeredAt !== null);
      const cWins = fList.filter(r => (r.realizedR ?? 0) > 0);
      const cLoss = fList.filter(r => (r.realizedR ?? 0) < 0);
      const cTotalR = fList.reduce((acc, r) => acc + (r.realizedR ?? 0), 0);
      cohortBreakdown[cohortName] = {
        total: list.length,
        filled: fList.length,
        fillRatePct: list.length > 0 ? (fList.length / list.length) * 100 : 0,
        completed: list.length,
        wins: cWins.length,
        losses: cLoss.length,
        winRatePct: fList.length > 0 ? (cWins.length / fList.length) * 100 : 0,
        totalR: Math.round(cTotalR * 100) / 100,
        avgR: fList.length > 0 ? Math.round((cTotalR / fList.length) * 100) / 100 : 0,
      };
    }

    // Sweep comparison
    const withSweep = filled.filter(r => r.hasSweep);
    const withoutSweep = filled.filter(r => !r.hasSweep);
    const wR = withSweep.reduce((acc, r) => acc + (r.realizedR ?? 0), 0);
    const woR = withoutSweep.reduce((acc, r) => acc + (r.realizedR ?? 0), 0);
    const sweepComparison = {
      withSweep: {
        count: withSweep.length,
        completed: withSweep.length,
        winRatePct: withSweep.length > 0 ? (withSweep.filter(r => (r.realizedR ?? 0) > 0).length / withSweep.length) * 100 : 0,
        avgR: withSweep.length > 0 ? Math.round((wR / withSweep.length) * 100) / 100 : 0,
        totalR: Math.round(wR * 100) / 100,
      },
      withoutSweep: {
        count: withoutSweep.length,
        completed: withoutSweep.length,
        winRatePct: withoutSweep.length > 0 ? (withoutSweep.filter(r => (r.realizedR ?? 0) > 0).length / withoutSweep.length) * 100 : 0,
        avgR: withoutSweep.length > 0 ? Math.round((woR / withoutSweep.length) * 100) / 100 : 0,
        totalR: Math.round(woR * 100) / 100,
      },
      sweepAlphaR: withSweep.length > 0 && withoutSweep.length > 0
        ? Math.round(((wR / withSweep.length) - (woR / withoutSweep.length)) * 100) / 100
        : 0,
    };

    // Filter efficiency (Live Accepted vs Filter Rejected)
    const liveAccepted = filled.filter(r => r.cohort === 'LIVE_ACCEPTED_SWEEP' || r.cohort === 'LIVE_ACCEPTED_NO_SWEEP');
    const filterRejected = filled.filter(r => r.cohort.startsWith('SHADOW_REJECTED'));
    const liveTotR = liveAccepted.reduce((acc, r) => acc + (r.realizedR ?? 0), 0);
    const rejTotR = filterRejected.reduce((acc, r) => acc + (r.realizedR ?? 0), 0);
    const savedLosses = filterRejected.filter(r => (r.realizedR ?? 0) < 0).length;
    const missedWins = filterRejected.filter(r => (r.realizedR ?? 0) > 0).length;

    const filterEfficiency = {
      liveAccepted: {
        count: liveAccepted.length,
        winRatePct: liveAccepted.length > 0 ? (liveAccepted.filter(r => (r.realizedR ?? 0) > 0).length / liveAccepted.length) * 100 : 0,
        avgR: liveAccepted.length > 0 ? Math.round((liveTotR / liveAccepted.length) * 100) / 100 : 0,
      },
      filterRejected: {
        count: filterRejected.length,
        winRatePct: filterRejected.length > 0 ? (missedWins / filterRejected.length) * 100 : 0,
        avgR: filterRejected.length > 0 ? Math.round((rejTotR / filterRejected.length) * 100) / 100 : 0,
        savedLosses,
        missedWins,
      },
      netFilterBenefitR: Math.round(-rejTotR * 100) / 100, // Positive if rejected trades would have lost net R
    };

    // 1M Confirmation Simulation
    const directBlowoutsAvoided = filled.filter(r => r.confirmationHypothesis.simulated1MStatus === 'AVOIDED_LOSS').length;
    const missedWinningTrades = filled.filter(r => r.confirmationHypothesis.simulated1MStatus === 'MISSED_MOVE').length;
    const confirmedTotalR = filled.reduce((acc, r) => acc + (r.confirmationHypothesis.simulated1MR ?? (r.realizedR ?? 0)), 0);
    const standardAvgR = filled.length > 0 ? totalR / filled.length : 0;
    const confirmedAvgR = filled.length > 0 ? confirmedTotalR / filled.length : 0;

    const oneMinuteConfirmationSimulation = {
      totalFilled: filled.length,
      directBlowoutsAvoided,
      missedWinningTrades,
      standardAvgR: Math.round(standardAvgR * 100) / 100,
      confirmedAvgR: Math.round(confirmedAvgR * 100) / 100,
      confirmationBenefitR: Math.round((confirmedTotalR - totalR) * 100) / 100,
    };

    const report: ShadowAnalyticsReport = {
      generatedAt: new Date().toISOString(),
      totalTracked,
      activeCount,
      completedCount,
      overall: {
        fillRatePct: Math.round(fillRatePct * 10) / 10,
        winRatePct: Math.round(winRatePct * 10) / 10,
        totalR: Math.round(totalR * 100) / 100,
        expectancyR: Math.round(expectancyR * 100) / 100,
        tpCount: wins.length,
        slCount: losses.length,
        beCount: filled.filter(r => r.outcome === 'BE').length,
        expiredCount: all.filter(r => r.outcome === 'EXPIRED').length,
      },
      cohortBreakdown,
      sweepComparison,
      filterEfficiency,
      oneMinuteConfirmationSimulation,
    };

    try {
      fs.mkdirSync(path.dirname(this.reportFile), { recursive: true });
      fs.writeFileSync(this.reportFile, JSON.stringify(report, null, 2), 'utf8');
    } catch {
      // Best-effort write
    }

    return report;
  }

  getActiveCount(): number {
    return this.records.size;
  }

  getCompletedCount(): number {
    return this.completedRecords.length;
  }

  private load(): void {
    if (fs.existsSync(this.stateFile)) {
      try {
        const raw = fs.readFileSync(this.stateFile, 'utf8');
        const list = JSON.parse(raw) as ShadowTrackedRecord[];
        if (Array.isArray(list)) {
          for (const item of list) {
            if (item.status === 'COMPLETED') {
              this.completedRecords.push(item);
            } else {
              this.records.set(item.recordId, item);
            }
          }
        }
      } catch {
        // Start fresh on parse failure
      }
    }

    if (fs.existsSync(this.completedEvidenceFile)) {
      try {
        const lines = fs.readFileSync(this.completedEvidenceFile, 'utf8').split('\n').filter(Boolean);
        for (const line of lines) {
          const item = JSON.parse(line) as ShadowTrackedRecord;
          if (item && item.recordId && !this.completedRecords.some(c => c.recordId === item.recordId)) {
            this.completedRecords.push(item);
          }
        }
      } catch {
        // Best-effort
      }
    }
  }

  private persist(): void {
    try {
      fs.mkdirSync(path.dirname(this.stateFile), { recursive: true });
      const temp = `${this.stateFile}.${process.pid}.${Date.now()}.tmp`;
      fs.writeFileSync(temp, JSON.stringify([...this.records.values()], null, 2), 'utf8');
      fs.renameSync(temp, this.stateFile);
    } catch {
      // Best-effort persistence
    }
  }
}
