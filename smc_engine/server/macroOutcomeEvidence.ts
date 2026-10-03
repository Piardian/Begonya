import * as fs from 'fs';
import * as path from 'path';
import type { NotificationCandidate } from './pipeline';
import { MacroGateAdapter } from './macroGateAdapter';
import { detectAssetClass, getPipSize, AssetClass } from '../src/assetMetrics';
import { NewsGuard } from './newsGuard';
import {
  CRYPTO_ROTATION_UNIVERSE_META,
  CryptoRotationEngine,
} from './cryptoRotationEngine';

export interface CryptoRotationSnapshotData {
  readonly coin: string;
  readonly sector: string;
  readonly layer: number;
  readonly rotationScore: number;
  readonly rotationGate: string;
  readonly derivativesRegime: string;
  readonly fundingRatePct: number;
  readonly effectiveRvol: number;
  readonly rsVsBtc24hPct: number;
  readonly btcDominancePct: number | null;
}

export interface MacroSnapshot {
  readonly timestamp: number;
  readonly isoTimestamp: string;
  readonly primaryRegime: string;
  readonly volatilityRiskScore: number;
  readonly vixLevel: number | null;
  readonly capitalPreservationMode: boolean;
  readonly riskMultiplier: number;
  readonly macroGateMultiplier: number;
  readonly begonyaScore: number;
  readonly scoreTier: string;
  readonly smcTechnicalScore: number;
  readonly macroBias: string;
  readonly macroAction: 'PROCEED' | 'VETO' | 'DEFENSIVE_REDUCE' | 'NEUTRAL_CAUTION' | 'WAIT';

  // Sovereign Yield Spreads
  readonly spreadDeUs2yBps: number | null;
  readonly spreadDeUs2yDelta5d: number | null;
  readonly spreadGbUs2yBps: number | null;
  readonly spreadGbUs2yDelta5d: number | null;
  readonly spreadCaUs2yBps: number | null;
  readonly spreadCaUs2yDelta5d: number | null;
  readonly spreadAuUs2yBps: number | null;
  readonly spreadAuUs2yDelta5d: number | null;

  // Commodities & Growth
  readonly brentLevel: number | null;
  readonly brentRoc20d: number | null;
  readonly copperGoldDelta4wPct: number | null;
  readonly energyPenaltyActive: boolean;

  // News Event Proximity
  readonly nearestNewsEventName: string | null;
  readonly nearestNewsCurrency: string | null;
  readonly nearestNewsImpact: string | null;
  readonly minutesToNewsEvent: number | null;
  readonly newsFreezeActive: boolean;

  // Crypto 8-Factor Rotation
  readonly isCrypto: boolean;
  readonly cryptoRotation?: CryptoRotationSnapshotData;

  // Point-in-Time Data Provenance & Vintage
  readonly dataVintageTimestamp?: string;
  readonly pointInTimeVerified: boolean;
  readonly dataLatencyMs?: number;
}

export interface DynamicCostInputs {
  readonly symbol: string;
  readonly riskDistance: number;
  readonly entryPrice?: number | null;
  readonly vixLevel?: number | null;
  readonly newsFreezeActive?: boolean;
  readonly minutesToNewsEvent?: number | null;
  readonly isWeekend?: boolean;
  readonly observedSpreadPips?: number | null;
}

export interface DynamicTransactionCostResult {
  readonly spreadDistance: number;
  readonly slippageDistance: number;
  readonly commissionDistance: number;
  readonly spreadCostR: number;
  readonly slippageCostR: number;
  readonly commissionCostR: number;
  readonly totalCostR: number;
  readonly slippageBps: number;
  readonly spreadPips: number;
}

export function estimateDynamicTransactionCost(inputs: DynamicCostInputs): DynamicTransactionCostResult {
  const {
    symbol,
    riskDistance,
    entryPrice,
    vixLevel,
    newsFreezeActive,
    minutesToNewsEvent,
    isWeekend,
    observedSpreadPips,
  } = inputs;

  const assetClass = detectAssetClass(symbol);
  const pip = getPipSize(symbol);
  const safeRisk = riskDistance > 0 ? riskDistance : pip * 10;
  const price = entryPrice && entryPrice > 0 ? entryPrice : 1000;

  // 1. Base spread & slippage calibration by specific symbol / asset class
  let baseSpreadDist: number;
  let baseSlipDist: number;
  let commissionDist = 0;
  let baseSlippageBps = 1.0;

  switch (assetClass) {
    case 'FOREX': {
      const symUpper = symbol.toUpperCase();
      if (symUpper.includes('EURUSD')) {
        baseSpreadDist = 1.1 * pip;
        baseSlipDist = 0.3 * pip;
        baseSlippageBps = 0.3;
      } else if (symUpper.includes('GBPUSD')) {
        baseSpreadDist = 1.4 * pip;
        baseSlipDist = 0.4 * pip;
        baseSlippageBps = 0.4;
      } else {
        baseSpreadDist = 1.5 * pip;
        baseSlipDist = 0.5 * pip;
        baseSlippageBps = 0.5;
      }
      commissionDist = 0.05 * pip; // Standard ECN commission ($5/lot)
      break;
    }
    case 'FOREX_JPY': {
      baseSpreadDist = 1.3 * pip;
      baseSlipDist = 0.4 * pip;
      baseSlippageBps = 0.4;
      commissionDist = 0.05 * pip;
      break;
    }
    case 'COMMODITY': {
      // Gold XAUUSD
      baseSpreadDist = 0.25; // 25 cents
      baseSlipDist = 0.15;   // 15 cents
      baseSlippageBps = 0.7;
      commissionDist = 0.05;
      break;
    }
    case 'INDEX': {
      baseSpreadDist = 1.2;
      baseSlipDist = 0.6;
      baseSlippageBps = 1.2;
      commissionDist = 0.2;
      break;
    }
    case 'CRYPTO': {
      const upper = symbol.toUpperCase();
      if (upper.startsWith('BTC')) {
        baseSpreadDist = price * 0.00010; // 1.0 bps
        baseSlipDist = price * 0.00015;   // 1.5 bps
        baseSlippageBps = 1.5;
        commissionDist = price * 0.00040; // 4 bps taker
      } else if (upper.startsWith('ETH')) {
        baseSpreadDist = price * 0.00015; // 1.5 bps
        baseSlipDist = price * 0.00020;   // 2.0 bps
        baseSlippageBps = 2.0;
        commissionDist = price * 0.00040;
      } else if (upper.startsWith('SOL')) {
        baseSpreadDist = price * 0.00030; // 3.0 bps
        baseSlipDist = price * 0.00035;   // 3.5 bps
        baseSlippageBps = 3.5;
        commissionDist = price * 0.00050;
      } else {
        // Mid/Low-cap Altcoins
        baseSpreadDist = price * 0.00050; // 5.0 bps
        baseSlipDist = price * 0.00060;   // 6.0 bps
        baseSlippageBps = 6.0;
        commissionDist = price * 0.00060;
      }
      break;
    }
    default: {
      baseSpreadDist = 2.0 * pip;
      baseSlipDist = 0.5 * pip;
      baseSlippageBps = 1.0;
      break;
    }
  }

  // Use observed live spread if explicitly provided
  if (typeof observedSpreadPips === 'number' && observedSpreadPips > 0) {
    baseSpreadDist = observedSpreadPips * pip;
  }

  // 2. Dynamic Volatility & Liquidity Multiplier
  let volMultiplier = 1.0;
  if (typeof vixLevel === 'number' && vixLevel > 20) {
    volMultiplier += Math.min(1.0, (vixLevel - 20) / 20); // 1.0x to 2.0x
  }
  if (newsFreezeActive || (typeof minutesToNewsEvent === 'number' && minutesToNewsEvent <= 15)) {
    volMultiplier *= 2.2; // News event spread blowout
  } else if (typeof minutesToNewsEvent === 'number' && minutesToNewsEvent <= 60) {
    volMultiplier *= 1.4;
  }
  if (isWeekend) {
    volMultiplier *= 1.3; // Weekend illiquidity buffer
  }

  const effectiveSpreadDist = baseSpreadDist * volMultiplier;
  const effectiveSlipDist = baseSlipDist * volMultiplier;
  const effectiveSlipBps = Math.round(baseSlippageBps * volMultiplier * 10) / 10;
  const spreadPips = Math.round((effectiveSpreadDist / pip) * 10) / 10;

  const spreadCostR = Math.round((effectiveSpreadDist / safeRisk) * 1000) / 1000;
  const slippageCostR = Math.round((effectiveSlipDist / safeRisk) * 1000) / 1000;
  const commissionCostR = Math.round((commissionDist / safeRisk) * 1000) / 1000;
  const totalCostR = Math.round((spreadCostR + slippageCostR + commissionCostR) * 1000) / 1000;

  return {
    spreadDistance: effectiveSpreadDist,
    slippageDistance: effectiveSlipDist,
    commissionDistance: commissionDist,
    spreadCostR,
    slippageCostR,
    commissionCostR,
    totalCostR,
    slippageBps: effectiveSlipBps,
    spreadPips,
  };
}

export function estimateTransactionCost(symbol: string, riskDistance: number, entryPrice?: number | null): {
  spreadDistance: number;
  slippageDistance: number;
  spreadCostR: number;
  slippageCostR: number;
  totalCostR: number;
} {
  const result = estimateDynamicTransactionCost({ symbol, riskDistance, entryPrice });
  return {
    spreadDistance: result.spreadDistance,
    slippageDistance: result.slippageDistance,
    spreadCostR: result.spreadCostR,
    slippageCostR: result.slippageCostR,
    totalCostR: result.totalCostR,
  };
}

export type ForecastHorizonType = 'SCALP_INTRADAY' | 'SWING_4H_24H' | 'MULTI_DAY';
export type MacroGatingCohortType = 'MACRO_APPROVED' | 'MACRO_BLOCKED' | 'SMC_ONLY';
export type MacroActionType = 'PROCEED' | 'WAIT' | 'VETO' | 'BLOCK';

export interface MacroOutcomeEvidenceRecord {
  readonly schemaVersion: 2;
  readonly signalId: string;
  readonly symbol: string;
  readonly direction: 'long' | 'short';
  readonly poiType: 'OB' | 'FVG';
  readonly grade: string;
  readonly smcScore: number;
  readonly signalTimestamp: number;
  readonly entryTimestamp: number | null;
  readonly exitTimestamp: number;
  readonly holdingTimeMs: number | null;
  readonly outcome: 'TP' | 'SL' | 'BE' | 'EXPIRED' | 'CANCELLED' | 'UNKNOWN';
  readonly realizedR: number | null;
  readonly entryPrice: number | null;
  readonly exitPrice: number | null;
  readonly stopLoss: number | null;
  readonly takeProfit: number | null;
  readonly riskDistance: number | null;
  readonly maximumFavorableExcursion: number;
  readonly maximumAdverseExcursion: number;
  readonly exitReason: string;
  readonly macroSnapshot: MacroSnapshot;

  // Required Execution & Provenance Metrics (Schema v2)
  readonly executionSource: 'TEST' | 'PAPER' | 'LIVE';
  readonly entryConfirmed: boolean;
  readonly fillModel: 'STRICT_BID_ASK' | 'TOUCH_APPROX' | 'CONSERVATIVE_SL_FIRST';
  readonly spreadCostR: number;
  readonly slippageCostR: number;
  readonly commissionCostR: number;
  readonly totalCostR: number;
  readonly netRealizedR: number | null;
  readonly assetClass: AssetClass;
  readonly exAnteForecastHorizon: ForecastHorizonType;
  readonly realizedHoldingDuration?: ForecastHorizonType;
  readonly macroGatingCohort: MacroGatingCohortType;
  readonly macroDecisionAtSignal: 'PROCEED' | 'WAIT' | 'BLOCK';

  // Event Timing Lineage
  readonly signalGeneratedAt: string;
  readonly candleClosedAt: string;
  readonly entryTriggeredAt: string | null;
  readonly exitOccurredAt: string;
  readonly recordedAt: string;
  readonly pipelineLatencyMs: number;
  readonly decisionEngineVersion: string;
  readonly ambiguousIntracandleConflict?: boolean;
}

export function normalizeMacroOutcomeRecord(raw: any): MacroOutcomeEvidenceRecord {
  const signalTs = raw.signalTimestamp ?? Date.now();
  const exitTs = raw.exitTimestamp ?? Date.now();
  const entryTs = raw.entryTimestamp ?? null;
  const holdingMs = raw.holdingTimeMs ?? (entryTs ? Math.max(0, exitTs - entryTs) : null);
  const entryConfirmed = raw.entryConfirmed ?? (entryTs !== null);

  // Ex-ante forecast horizon determination
  const exAnteForecastHorizon: ForecastHorizonType = raw.exAnteForecastHorizon ?? (
    raw.forecastHorizon ?? 'SCALP_INTRADAY'
  );

  let realizedHoldingDuration: ForecastHorizonType | undefined;
  if (holdingMs !== null) {
    realizedHoldingDuration = holdingMs < 4 * 3600 * 1000
      ? 'SCALP_INTRADAY'
      : (holdingMs <= 24 * 3600 * 1000 ? 'SWING_4H_24H' : 'MULTI_DAY');
  }

  // Macro Gating Cohort normalization
  let cohort: MacroGatingCohortType = raw.macroGatingCohort ?? 'SMC_ONLY';
  if ((raw.macroGatingCohort as string) === 'MACRO_PLUS_SMC') {
    cohort = 'MACRO_APPROVED';
  }

  const executionSource: 'TEST' | 'PAPER' | 'LIVE' = raw.executionSource ?? (
    raw.signalId?.startsWith('test_') ? 'TEST' : 'PAPER'
  );

  const costs = estimateDynamicTransactionCost({
    symbol: raw.symbol ?? 'EURUSD',
    riskDistance: raw.riskDistance ?? 0,
    entryPrice: raw.entryPrice,
    vixLevel: raw.macroSnapshot?.vixLevel,
    newsFreezeActive: raw.macroSnapshot?.newsFreezeActive,
  });

  const grossR = entryConfirmed ? (raw.realizedR ?? null) : null;
  const netR = grossR !== null ? Math.round((grossR - costs.totalCostR) * 100) / 100 : null;

  return {
    schemaVersion: 2,
    signalId: raw.signalId,
    symbol: raw.symbol,
    direction: raw.direction,
    poiType: raw.poiType ?? 'OB',
    grade: raw.grade ?? 'B',
    smcScore: raw.smcScore ?? 80,
    signalTimestamp: signalTs,
    entryTimestamp: entryTs,
    exitTimestamp: exitTs,
    holdingTimeMs: holdingMs,
    outcome: raw.outcome ?? 'UNKNOWN',
    realizedR: grossR,
    entryPrice: raw.entryPrice ?? null,
    exitPrice: raw.exitPrice ?? null,
    stopLoss: raw.stopLoss ?? null,
    takeProfit: raw.takeProfit ?? null,
    riskDistance: raw.riskDistance ?? null,
    maximumFavorableExcursion: raw.maximumFavorableExcursion ?? 0,
    maximumAdverseExcursion: raw.maximumAdverseExcursion ?? 0,
    exitReason: raw.exitReason ?? 'Recorded outcome',
    macroSnapshot: raw.macroSnapshot ?? createFallbackMacroSnapshot(raw.symbol, raw.direction, signalTs),

    executionSource,
    entryConfirmed,
    fillModel: raw.fillModel ?? 'STRICT_BID_ASK',
    spreadCostR: entryConfirmed ? (raw.spreadCostR ?? costs.spreadCostR) : 0,
    slippageCostR: entryConfirmed ? (raw.slippageCostR ?? costs.slippageCostR) : 0,
    commissionCostR: entryConfirmed ? (raw.commissionCostR ?? costs.commissionCostR) : 0,
    totalCostR: entryConfirmed ? (raw.totalCostR ?? costs.totalCostR) : 0,
    netRealizedR: netR,
    assetClass: raw.assetClass ?? detectAssetClass(raw.symbol ?? 'EURUSD'),
    exAnteForecastHorizon,
    realizedHoldingDuration,
    macroGatingCohort: cohort,
    macroDecisionAtSignal: raw.macroDecisionAtSignal ?? (raw.macroSnapshot?.macroAction === 'PROCEED' ? 'PROCEED' : 'BLOCK'),

    signalGeneratedAt: raw.signalGeneratedAt ?? new Date(signalTs).toISOString(),
    candleClosedAt: raw.candleClosedAt ?? new Date(signalTs).toISOString(),
    entryTriggeredAt: entryTs ? new Date(entryTs).toISOString() : null,
    exitOccurredAt: raw.exitOccurredAt ?? new Date(exitTs).toISOString(),
    recordedAt: raw.recordedAt ?? new Date().toISOString(),
    pipelineLatencyMs: raw.pipelineLatencyMs ?? 0,
    decisionEngineVersion: raw.decisionEngineVersion ?? 'v2.1.0',
    ambiguousIntracandleConflict: raw.ambiguousIntracandleConflict ?? false,
  };
}

export interface MacroOutcomeStore {
  appendRecord(record: MacroOutcomeEvidenceRecord): Promise<void>;
  readAllRecords(): Promise<MacroOutcomeEvidenceRecord[]>;
}

export class FileMacroOutcomeStore implements MacroOutcomeStore {
  constructor(
    private readonly filePath = process.env.MACRO_OUTCOME_LEDGER_PATH ?? (
      process.env.NODE_ENV === 'test'
        ? path.join(process.cwd(), 'tests', 'temp_evidence', 'outcomes', 'macro-outcome-evidence.jsonl')
        : path.join(process.env.EVIDENCE_DIRECTORY ?? 'evidence', 'outcomes', 'macro-outcome-evidence.jsonl')
    )
  ) {}

  async appendRecord(record: MacroOutcomeEvidenceRecord): Promise<void> {
    await fs.promises.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.promises.appendFile(this.filePath, `${JSON.stringify(record)}\n`, 'utf8');
  }

  async readAllRecords(): Promise<MacroOutcomeEvidenceRecord[]> {
    try {
      const raw = await fs.promises.readFile(this.filePath, 'utf8');
      return raw
        .split(/\r?\n/)
        .filter(Boolean)
        .map(line => normalizeMacroOutcomeRecord(JSON.parse(line)));
    } catch (err) {
      const code = err && typeof err === 'object' && 'code' in err ? (err as any).code : null;
      if (code === 'ENOENT') return [];
      throw err;
    }
  }
}

export function captureMacroSnapshot(
  candidate: NotificationCandidate,
  checkTimeMs?: number
): MacroSnapshot {
  const now = checkTimeMs ?? candidate.marketDataTimestamp ?? Date.now();
  const macroGateAdapter = MacroGateAdapter.getInstance();
  const newsGuard = NewsGuard.getInstance();

  const evalResult = candidate.macroEvaluation ??
    macroGateAdapter.evaluateCandidate(
      candidate.symbol,
      candidate.tradeDirection,
      candidate.gradeResult?.totalScore
    );

  const payload = macroGateAdapter.loadGatePayload();
  const rs = payload?.regime_state ?? {};

  // News proximity
  const nearestNews = newsGuard.getNearestUpcomingEvent(candidate.symbol, now);
  const newsFreezeActive = nearestNews?.isFrozen ?? false;

  // Crypto identification
  const cleanSym = candidate.symbol.toUpperCase();
  const baseCoin = cleanSym.endsWith('USD') ? cleanSym.slice(0, -3) : cleanSym;
  const isCrypto =
    Boolean(CRYPTO_ROTATION_UNIVERSE_META[baseCoin]) ||
    ['BTC', 'ETH', 'SOL', 'LTC'].includes(baseCoin) ||
    cleanSym.startsWith('BTC') ||
    cleanSym.startsWith('ETH') ||
    cleanSym.startsWith('SOL');

  let cryptoRotation: CryptoRotationSnapshotData | undefined;
  if (isCrypto) {
    const coinAssessment = evalResult.cryptoRotationAssessment ??
      (payload ? CryptoRotationEngine.getInstance().getCoinAssessment(baseCoin, payload) : null);

    if (coinAssessment) {
      const btcDomPct = payload?.crypto_rotation?.btc_dominance_panel?.btc_dominance_pct ??
        (rs as any)?.btc_dominance_pct ??
        null;

      cryptoRotation = {
        coin: coinAssessment.coin,
        sector: coinAssessment.sector,
        layer: coinAssessment.layer,
        rotationScore: coinAssessment.active_rotation_score,
        rotationGate: coinAssessment.rotation_gate,
        derivativesRegime: coinAssessment.derivatives_regime,
        fundingRatePct: coinAssessment.funding_rate_pct,
        effectiveRvol: coinAssessment.effective_rvol,
        rsVsBtc24hPct: coinAssessment.rs_vs_btc_24h_pct,
        btcDominancePct: typeof btcDomPct === 'number' ? btcDomPct : null,
      };
    }
  }

  return {
    timestamp: now,
    isoTimestamp: new Date(now).toISOString(),
    primaryRegime: evalResult.primaryRegime,
    volatilityRiskScore: payload?.volatility_risk_score ?? 0.4,
    vixLevel: typeof rs.vix_level === 'number' ? rs.vix_level : null,
    capitalPreservationMode: evalResult.capitalPreservationMode,
    riskMultiplier: evalResult.riskMultiplier,
    macroGateMultiplier: evalResult.macroGateMultiplier,
    begonyaScore: evalResult.begonyaScore,
    scoreTier: evalResult.scoreTier,
    smcTechnicalScore: evalResult.smcTechnicalScore,
    macroBias: evalResult.macroBias,
    macroAction: evalResult.action,

    // Sovereign Yield Spreads
    spreadDeUs2yBps: typeof rs.spread_de_us_2y_bps === 'number' ? rs.spread_de_us_2y_bps : null,
    spreadDeUs2yDelta5d: typeof rs.spread_de_us_2y_delta_5d === 'number' ? rs.spread_de_us_2y_delta_5d : null,
    spreadGbUs2yBps: typeof rs.spread_gb_us_2y_bps === 'number' ? rs.spread_gb_us_2y_bps : null,
    spreadGbUs2yDelta5d: typeof rs.spread_gb_us_2y_delta_5d === 'number' ? rs.spread_gb_us_2y_delta_5d : null,
    spreadCaUs2yBps: typeof rs.spread_ca_us_2y_bps === 'number' ? rs.spread_ca_us_2y_bps : null,
    spreadCaUs2yDelta5d: typeof rs.spread_ca_us_2y_delta_5d === 'number' ? rs.spread_ca_us_2y_delta_5d : null,
    spreadAuUs2yBps: typeof rs.spread_au_us_2y_bps === 'number' ? rs.spread_au_us_2y_bps : null,
    spreadAuUs2yDelta5d: typeof rs.spread_au_us_2y_delta_5d === 'number' ? rs.spread_au_us_2y_delta_5d : null,

    // Commodities & Growth
    brentLevel: typeof rs.brent_level === 'number' ? rs.brent_level : null,
    brentRoc20d: typeof rs.brent_roc_20d === 'number' ? rs.brent_roc_20d : null,
    copperGoldDelta4wPct: typeof rs.copper_gold_delta_4w_pct === 'number' ? rs.copper_gold_delta_4w_pct : null,
    energyPenaltyActive: Boolean(rs.energy_penalty_active),

    // News
    nearestNewsEventName: nearestNews?.event.name ?? null,
    nearestNewsCurrency: nearestNews?.event.currency ?? null,
    nearestNewsImpact: nearestNews?.event.impact ?? null,
    minutesToNewsEvent: nearestNews?.minutesToEvent ?? null,
    newsFreezeActive,

    // Crypto
    isCrypto,
    ...(cryptoRotation ? { cryptoRotation } : {}),

    // Point-in-time provenance
    dataVintageTimestamp: (rs as any)?.vintage_timestamp ?? (payload as any)?.generated_at_utc,
    pointInTimeVerified: Boolean((payload as any)?.generated_at_utc),
    dataLatencyMs: (payload as any)?.generated_at_utc ? Math.max(0, now - new Date((payload as any).generated_at_utc).getTime()) : undefined,
  };
}

export function createFallbackMacroSnapshot(
  symbol: string,
  direction: 'long' | 'short',
  timestamp: number
): MacroSnapshot {
  return {
    timestamp,
    isoTimestamp: new Date(timestamp).toISOString(),
    primaryRegime: 'Fallback / Historical Tracking',
    volatilityRiskScore: 0.4,
    vixLevel: null,
    capitalPreservationMode: false,
    riskMultiplier: 1.0,
    macroGateMultiplier: 1,
    begonyaScore: 75,
    scoreTier: 'B',
    smcTechnicalScore: 75,
    macroBias: 'NEUTRAL_ALL',
    macroAction: 'PROCEED',
    spreadDeUs2yBps: null,
    spreadDeUs2yDelta5d: null,
    spreadGbUs2yBps: null,
    spreadGbUs2yDelta5d: null,
    spreadCaUs2yBps: null,
    spreadCaUs2yDelta5d: null,
    spreadAuUs2yBps: null,
    spreadAuUs2yDelta5d: null,
    brentLevel: null,
    brentRoc20d: null,
    copperGoldDelta4wPct: null,
    energyPenaltyActive: false,
    nearestNewsEventName: null,
    nearestNewsCurrency: null,
    nearestNewsImpact: null,
    minutesToNewsEvent: null,
    newsFreezeActive: false,
    isCrypto: symbol.toUpperCase().includes('BTC') ||
      symbol.toUpperCase().includes('ETH') ||
      symbol.toUpperCase().includes('SOL') ||
      symbol.toUpperCase().includes('LTC'),
    pointInTimeVerified: false,
  };
}
