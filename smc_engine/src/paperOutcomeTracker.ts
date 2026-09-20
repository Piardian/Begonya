import { LiquidityMagnet } from './liquidityMagnetDetector';
import { OpposingObstacle } from './opposingObstacleDetector';
import { Candle } from './types';

export const PAPER_OUTCOME_TRACKER_VERSION = 1 as const;

export type TargetSource = '2R_FALLBACK' | 'LIQUIDITY_MAGNET' | 'OPPOSING_OBSTACLE';

export interface PaperTargetSelectionInput {
  readonly entryPrice: number;
  readonly stopLossPrice: number;
  readonly tradeDirection: 'long' | 'short';
  readonly symbol: string;
  readonly liquidityMagnet?: LiquidityMagnet | null;
  readonly opposingObstacle?: OpposingObstacle | null;
}

export interface PaperTargetSelectionResult {
  readonly targetPrice: number;
  readonly targetR: number;
  readonly targetSource: TargetSource;
  readonly riskDistance: number;
}

export interface PaperTradeEvaluationInput {
  readonly entryPrice: number;
  readonly stopLossPrice: number;
  readonly takeProfitPrice: number;
  readonly targetR: number;
  readonly targetSource: TargetSource;
  readonly tradeDirection: 'long' | 'short';
  readonly futureCandles: readonly Candle[];
  readonly maxWaitBars?: number;
  readonly maxHoldingBars?: number;
}

export type PaperOutcomeStatus = 'TP' | 'SL' | 'BE' | 'EXPIRED' | 'UNKNOWN';

export interface PaperTradeOutcomeResult {
  readonly status: PaperOutcomeStatus;
  readonly filled: boolean;
  readonly fillIndex: number | null;
  readonly exitIndex: number | null;
  readonly realizedR: number;
  readonly targetR: number;
  readonly targetSource: TargetSource;
  readonly mfePips: number;
  readonly maePips: number;
  readonly holdingBars: number;
  readonly exitReason: string;
}

/**
 * Selects the take profit target for a paper trade based on the 2R–5R rule:
 * - Minimum target: 2R
 * - Maximum context target: 5R
 * - Context target < 2R -> ignored (not used)
 * - Context target > 5R -> ignored (not used)
 * - Among valid candidates within [2R, 5R], the closest to entry is selected
 * - If no valid context target -> fallback to exactly 2.0R
 * - Under no circumstances TP < 2R or context TP > 5R
 */
export function selectPaperTarget(input: PaperTargetSelectionInput): PaperTargetSelectionResult {
  const { entryPrice, stopLossPrice, tradeDirection, liquidityMagnet, opposingObstacle } = input;
  const riskDistance = Math.abs(entryPrice - stopLossPrice);

  if (riskDistance <= 0) {
    throw new Error(`Invalid risk distance: entryPrice=${entryPrice}, stopLossPrice=${stopLossPrice}`);
  }

  const fallbackR = 2.0;
  const fallbackPrice = tradeDirection === 'long'
    ? entryPrice + fallbackR * riskDistance
    : entryPrice - fallbackR * riskDistance;

  interface Candidate {
    readonly source: TargetSource;
    readonly price: number;
    readonly rMultiple: number;
    readonly distance: number;
  }

  const candidates: Candidate[] = [];

  // 1. Evaluate Liquidity Magnet (must be in trade direction)
  if (liquidityMagnet && liquidityMagnet.isActive) {
    const magnetPrice = liquidityMagnet.priceLevel;
    const isValidDirection = tradeDirection === 'long'
      ? magnetPrice > entryPrice
      : magnetPrice < entryPrice;

    if (isValidDirection) {
      const distance = Math.abs(magnetPrice - entryPrice);
      const rMultiple = distance / riskDistance;
      // Strictly 2R <= R <= 5R
      if (rMultiple >= 2.0 && rMultiple <= 5.0) {
        candidates.push({
          source: 'LIQUIDITY_MAGNET',
          price: magnetPrice,
          rMultiple: Math.round(rMultiple * 100) / 100,
          distance,
        });
      }
    }
  }

  // 2. Evaluate Opposing Obstacle (must be in trade direction)
  if (opposingObstacle && opposingObstacle.hasObstacle && opposingObstacle.level) {
    // For long, obstacle is above entry (its low boundary is the first point reached)
    // For short, obstacle is below entry (its high boundary is the first point reached)
    const obstaclePrice = tradeDirection === 'long'
      ? opposingObstacle.level.low
      : opposingObstacle.level.high;

    const isValidDirection = tradeDirection === 'long'
      ? obstaclePrice > entryPrice
      : obstaclePrice < entryPrice;

    if (isValidDirection) {
      const distance = Math.abs(obstaclePrice - entryPrice);
      const rMultiple = distance / riskDistance;
      // Strictly 2R <= R <= 5R
      if (rMultiple >= 2.0 && rMultiple <= 5.0) {
        candidates.push({
          source: 'OPPOSING_OBSTACLE',
          price: obstaclePrice,
          rMultiple: Math.round(rMultiple * 100) / 100,
          distance,
        });
      }
    }
  }

  // If no candidates in [2R, 5R], fallback to exactly 2R
  if (candidates.length === 0) {
    return Object.freeze({
      targetPrice: fallbackPrice,
      targetR: fallbackR,
      targetSource: '2R_FALLBACK' as const,
      riskDistance,
    });
  }

  // Select closest to entry (smallest distance)
  candidates.sort((a, b) => a.distance - b.distance);
  const chosen = candidates[0];

  return Object.freeze({
    targetPrice: chosen.price,
    targetR: chosen.rMultiple,
    targetSource: chosen.source,
    riskDistance,
  });
}

/**
 * Simulates trade outcome according to Begonya paper outcome rules:
 * - Retest entry within maxWaitBars
 * - Stop loss at structural POI level
 * - Break-even armed at +1.0R excursion, exiting at entry if retraced
 * - Same candle TP + SL -> strictly UNKNOWN
 */
export function evaluatePaperTradeOutcome(input: PaperTradeEvaluationInput): PaperTradeOutcomeResult {
  const {
    entryPrice,
    stopLossPrice,
    takeProfitPrice,
    targetR,
    targetSource,
    tradeDirection,
    futureCandles,
    maxWaitBars = 12,
    maxHoldingBars = 40,
  } = input;

  const riskDistance = Math.abs(entryPrice - stopLossPrice);
  const pip = 0.0001; // default pip scale for excursion calculations

  // Wait for entry fill
  let fillIndex: number | null = null;
  const waitWindow = futureCandles.slice(0, maxWaitBars);

  for (let i = 0; i < waitWindow.length; i++) {
    const candle = waitWindow[i];
    if (tradeDirection === 'long') {
      if (candle.low <= entryPrice) {
        fillIndex = i;
        break;
      }
    } else {
      if (candle.high >= entryPrice) {
        fillIndex = i;
        break;
      }
    }
  }

  if (fillIndex === null) {
    return Object.freeze({
      status: 'EXPIRED',
      filled: false,
      fillIndex: null,
      exitIndex: null,
      realizedR: 0.0,
      targetR,
      targetSource,
      mfePips: 0.0,
      maePips: 0.0,
      holdingBars: 0,
      exitReason: 'UNFILLED_WAIT_EXPIRED',
    });
  }

  // Armed level for BE is +1.0R excursion
  const beArmLevel = tradeDirection === 'long'
    ? entryPrice + 1.0 * riskDistance
    : entryPrice - 1.0 * riskDistance;

  const tradeCandles = futureCandles.slice(fillIndex, fillIndex + maxHoldingBars);
  let beArmed = false;
  let mfePips = 0.0;
  let maePips = 0.0;
  let status: PaperOutcomeStatus = 'EXPIRED';
  let exitReason = 'MAX_HOLDING_TIME_EXPIRED';
  let realizedR = 0.0;
  let exitIndex: number | null = null;

  for (let i = 0; i < tradeCandles.length; i++) {
    const candle = tradeCandles[i];
    const currentIndex = fillIndex + i;

    const fav = tradeDirection === 'long'
      ? Math.max(0, (candle.high - entryPrice) / pip)
      : Math.max(0, (entryPrice - candle.low) / pip);
    const adv = tradeDirection === 'long'
      ? Math.max(0, (entryPrice - candle.low) / pip)
      : Math.max(0, (candle.high - entryPrice) / pip);

    mfePips = Math.max(mfePips, fav);
    maePips = Math.max(maePips, adv);

    const tpHit = tradeDirection === 'long' ? candle.high >= takeProfitPrice : candle.low <= takeProfitPrice;
    const slHit = tradeDirection === 'long' ? candle.low <= stopLossPrice : candle.high >= stopLossPrice;
    const armHit = tradeDirection === 'long' ? candle.high >= beArmLevel : candle.low <= beArmLevel;
    const retraceHit = beArmed && (tradeDirection === 'long' ? candle.low <= entryPrice : candle.high >= entryPrice);

    // Same-candle collision policy: strictly UNKNOWN
    if (tpHit && slHit) {
      status = 'UNKNOWN';
      exitReason = 'OHLC_AMBIGUITY_SAME_CANDLE_TP_AND_SL';
      realizedR = 0.0;
      exitIndex = currentIndex;
      break;
    }

    if (retraceHit) {
      status = 'BE';
      exitReason = 'BREAK_EVEN_RETRACED_AFTER_PLUS_1R';
      realizedR = 0.0;
      exitIndex = currentIndex;
      break;
    }

    if (tpHit) {
      status = 'TP';
      exitReason = 'TAKE_PROFIT_HIT';
      realizedR = targetR;
      exitIndex = currentIndex;
      break;
    }

    if (slHit) {
      status = 'SL';
      exitReason = 'STOP_LOSS_HIT';
      realizedR = -1.0;
      exitIndex = currentIndex;
      break;
    }

    if (armHit) {
      beArmed = true;
      if (tradeDirection === 'long' && candle.close <= entryPrice) {
        status = 'BE';
        exitReason = 'BREAK_EVEN_RETRACED_IN_BAR';
        realizedR = 0.0;
        exitIndex = currentIndex;
        break;
      } else if (tradeDirection === 'short' && candle.close >= entryPrice) {
        status = 'BE';
        exitReason = 'BREAK_EVEN_RETRACED_IN_BAR';
        realizedR = 0.0;
        exitIndex = currentIndex;
        break;
      }
    }
  }

  if (exitIndex === null) {
    const lastCandle = tradeCandles[tradeCandles.length - 1];
    exitIndex = fillIndex + tradeCandles.length - 1;
    realizedR = tradeDirection === 'long'
      ? (lastCandle.close - entryPrice) / riskDistance
      : (entryPrice - lastCandle.close) / riskDistance;
    status = 'EXPIRED';
    exitReason = 'MAX_HOLDING_TIME_EXPIRED';
  }

  const holdingBars = exitIndex - fillIndex + 1;

  return Object.freeze({
    status,
    filled: true,
    fillIndex,
    exitIndex,
    realizedR: Math.round(realizedR * 100) / 100,
    targetR,
    targetSource,
    mfePips: Math.round(mfePips * 10) / 10,
    maePips: Math.round(maePips * 10) / 10,
    holdingBars,
    exitReason,
  });
}
