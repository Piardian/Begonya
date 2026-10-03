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
  readonly macroGateMultiplier: 0 | 1;
  readonly begonyaScore: number;
  readonly scoreTier: string;
  readonly smcTechnicalScore: number;
  readonly macroBias: string;
  readonly macroAction: string;

  // Sovereign 2Y Yield Spreads
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
}

export function estimateTransactionCost(symbol: string, riskDistance: number, entryPrice?: number | null): {
  spreadDistance: number;
  slippageDistance: number;
  spreadCostR: number;
  slippageCostR: number;
  totalCostR: number;
} {
  const assetClass = detectAssetClass(symbol);
  const pip = getPipSize(symbol);
  let spreadDist = 2.0 * pip;
  let slipDist = 0.5 * pip;

  switch (assetClass) {
    case 'FOREX':
      spreadDist = 1.2 * pip;
      slipDist = 0.4 * pip;
      break;
    case 'FOREX_JPY':
      spreadDist = 1.5 * pip;
      slipDist = 0.5 * pip;
      break;
    case 'COMMODITY':
      spreadDist = 0.25;
      slipDist = 0.15;
      break;
    case 'INDEX':
      spreadDist = 1.2;
      slipDist = 0.6;
      break;
    case 'CRYPTO': {
      const price = entryPrice && entryPrice > 0 ? entryPrice : 1000;
      const upper = symbol.toUpperCase();
      if (upper.startsWith('BTC') || upper.startsWith('ETH')) {
        spreadDist = price * 0.00015;
        slipDist = price * 0.00020;
      } else {
        spreadDist = price * 0.00060;
        slipDist = price * 0.00060;
      }
      break;
    }
  }

  const safeRisk = riskDistance > 0 ? riskDistance : 1;
  const spreadCostR = Math.round((spreadDist / safeRisk) * 1000) / 1000;
  const slippageCostR = Math.round((slipDist / safeRisk) * 1000) / 1000;
  const totalCostR = Math.round((spreadCostR + slippageCostR) * 1000) / 1000;

  return {
    spreadDistance: spreadDist,
    slippageDistance: slipDist,
    spreadCostR,
    slippageCostR,
    totalCostR,
  };
}

export interface MacroOutcomeEvidenceRecord {
  readonly schemaVersion: 1;
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
  readonly outcome: 'TP' | 'SL' | 'BE' | 'EXPIRED' | 'UNKNOWN';
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
  readonly recordedAt: string;

  // Realistic Execution & Cost Metrics
  readonly executionSource?: 'TEST' | 'PAPER' | 'LIVE';
  readonly entryConfirmed?: boolean;
  readonly spreadCostR?: number;
  readonly slippageCostR?: number;
  readonly netRealizedR?: number | null;
  readonly assetClass?: AssetClass;
  readonly forecastHorizon?: 'SCALP_INTRADAY' | 'SWING_4H_24H' | 'MULTI_DAY';
  readonly macroGatingCohort?: 'SMC_ONLY' | 'MACRO_ONLY' | 'MACRO_PLUS_SMC';
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
        .map(line => JSON.parse(line) as MacroOutcomeEvidenceRecord);
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
  };
}
