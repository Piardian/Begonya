import { getPipSize, formatPrice, detectAssetClass, getEstimatedSpreadPips } from './assetMetrics';
import { LiquidityMagnet } from './liquidityMagnetDetector';
import { OpposingObstacle } from './opposingObstacleDetector';
import { MacroGateEvaluation } from '../server/macroGateAdapter';

export interface TradeTargetStep {
  readonly price: number;
  readonly pips: number;
  readonly rr: number;
  readonly label: string;
  readonly action?: string;
}

export interface TradeExpectancyPlan {
  readonly version: 'v1.0';
  readonly symbol: string;
  readonly direction: 'long' | 'short';
  readonly entryPrice: number;
  readonly stopLoss: number;
  readonly riskDistancePips: number;
  readonly smartStopBufferPips: number;

  readonly tp1: TradeTargetStep;
  readonly tp2: TradeTargetStep;
  readonly tp3: TradeTargetStep;

  readonly primaryRR: number;
  readonly winProbability: number;
  readonly expectedValueR: number; // Expectancy E = (P * R) - ((1 - P) * 1)
  readonly kellyFraction: number;
  readonly recommendedRiskPct: number;

  readonly isAdmissible: boolean;
  readonly rejectionReason?: string;
  readonly propFirmGuardPassed?: boolean;
}

export interface CalculateExpectancyInput {
  symbol: string;
  direction: 'long' | 'short';
  zoneLow: number;
  zoneHigh: number;
  currentPrice: number;
  grade: string; // 'A+' | 'A' | 'B+' | 'B'
  totalScore: number; // 0-100
  atr15mPips?: number | null;
  liquidityMagnet?: LiquidityMagnet | null;
  opposingObstacle?: OpposingObstacle | null;
  macroEvaluation?: MacroGateEvaluation | null;
  minimumAcceptableRR?: number; // default 2.0
}

function getDefaultAtrPips(symbol: string): number {
  const assetClass = detectAssetClass(symbol);
  switch (assetClass) {
    case 'FOREX':
      return 14.0;
    case 'FOREX_JPY':
      return 22.0;
    case 'CRYPTO':
      return 350.0;
    case 'INDEX':
      return 45.0;
    case 'COMMODITY':
      return 28.0;
    default:
      return 15.0;
  }
}

export function calculateTradeExpectancyPlan(input: CalculateExpectancyInput): TradeExpectancyPlan {
  const {
    symbol,
    direction,
    zoneLow,
    zoneHigh,
    currentPrice,
    grade,
    atr15mPips,
    liquidityMagnet,
    opposingObstacle,
    macroEvaluation,
    minimumAcceptableRR = 2.0,
  } = input;

  const pip = getPipSize(symbol);

  // 1. Optimal Entry Price:
  // If price is inside the zone, use currentPrice; otherwise use 50% equilibrium of the zone.
  const inZone = currentPrice >= zoneLow && currentPrice <= zoneHigh;
  const equilibrium = (zoneLow + zoneHigh) / 2;
  const entryPrice = inZone ? currentPrice : equilibrium;

  // 2. Smart Stop Loss with Volatility Buffer & Prop Firm Spread Guard:
  // Buffer = max(2 pips, ATR15m * 0.35, spread * 1.5 + 1.0)
  const effectiveAtr = atr15mPips && atr15mPips > 0 ? atr15mPips : getDefaultAtrPips(symbol);
  const spreadPips = getEstimatedSpreadPips(symbol);
  const smartStopBufferPips = Number(Math.max(2.0, effectiveAtr * 0.35, spreadPips * 1.5 + 1.0).toFixed(1));
  const bufferUnits = smartStopBufferPips * pip;

  let stopLoss: number;
  if (direction === 'long') {
    stopLoss = zoneLow - bufferUnits;
  } else {
    stopLoss = zoneHigh + bufferUnits;
  }

  const riskDistancePips = Number((Math.max(1.0, Math.abs(entryPrice - stopLoss) / pip)).toFixed(1));

  // 3. Multi-Stage Asymmetric Targets (TP1, TP2, TP3):
  // TP1: Breakeven & Partial Profit (1.5R default)
  const tp1RR = 1.5;
  const tp1Pips = Number((tp1RR * riskDistancePips).toFixed(1));
  const tp1Price = direction === 'long'
    ? entryPrice + (tp1Pips * pip)
    : entryPrice - (tp1Pips * pip);

  const tp1: TradeTargetStep = {
    price: tp1Price,
    pips: tp1Pips,
    rr: tp1RR,
    label: 'TP1 (Breakeven & %50 Kâr)',
    action: 'Pozisyonun %50’si kapatılır, Kalanın Stop seviyesi Girişe (Breakeven) çekilir.',
  };

  // TP2: Primary Institutional Target (Liquidity Pool or 2.5R - 3.0R)
  let tp2RR = 2.5;
  let tp2Pips = Number((tp2RR * riskDistancePips).toFixed(1));
  let tp2Price = direction === 'long'
    ? entryPrice + (tp2Pips * pip)
    : entryPrice - (tp2Pips * pip);

  if (liquidityMagnet && liquidityMagnet.isActive && liquidityMagnet.distancePips > 0) {
    const magnetRR = Number((liquidityMagnet.distancePips / riskDistancePips).toFixed(2));
    if (magnetRR >= 2.0 && magnetRR <= 4.5) {
      tp2RR = magnetRR;
      tp2Pips = liquidityMagnet.distancePips;
      tp2Price = liquidityMagnet.priceLevel;
    }
  }

  const tp2: TradeTargetStep = {
    price: tp2Price,
    pips: tp2Pips,
    rr: tp2RR,
    label: 'TP2 (Ana Kurumsal Hedef)',
    action: 'Ana hedef likidite havuzu; pozisyonun %30’u kapatılır.',
  };

  // TP3: Runner / Macro Expansion (4.0R)
  const tp3RR = 4.0;
  const tp3Pips = Number((tp3RR * riskDistancePips).toFixed(1));
  const tp3Price = direction === 'long'
    ? entryPrice + (tp3Pips * pip)
    : entryPrice - (tp3Pips * pip);

  const tp3: TradeTargetStep = {
    price: tp3Price,
    pips: tp3Pips,
    rr: tp3RR,
    label: 'TP3 (Trend Koşucusu / Runner)',
    action: 'Kalan %20 pozisyon 4H trend yönünde makro hedefe sürülür.',
  };

  // 4. Quant Win Probability & Mathematical Expectancy:
  // Base P(Win) derived from SMC Grade
  let winProb = 0.52;
  if (grade === 'A+') winProb = 0.58;
  else if (grade === 'A') winProb = 0.52;
  else winProb = 0.46;

  // Macro & Obstacle adjustments
  if (macroEvaluation && macroEvaluation.begonyaScore >= 80) winProb += 0.04;
  else if (macroEvaluation && macroEvaluation.begonyaScore >= 70) winProb += 0.02;

  if (opposingObstacle && opposingObstacle.hasObstacle) winProb -= 0.05;
  if (liquidityMagnet && liquidityMagnet.isActive) winProb += 0.03;

  winProb = Number(Math.max(0.40, Math.min(0.68, winProb)).toFixed(2));

  // Mathematical Expectancy: E = (P * R) - ((1 - P) * 1)
  const primaryRR = tp2RR;
  const expectedValueR = Number(((winProb * primaryRR) - ((1 - winProb) * 1.0)).toFixed(2));

  // Fractional Kelly Criterion:
  // f* = [p * (b + 1) - 1] / b
  const fullKelly = (winProb * (primaryRR + 1) - 1) / primaryRR;
  const halfKelly = Number(Math.max(0.1, fullKelly * 0.5).toFixed(3));
  const macroMult = macroEvaluation?.macroGateMultiplier ?? 1.0;
  const recommendedRiskPct = Number(Math.max(0.25, Math.min(1.25, halfKelly * 2.0 * macroMult)).toFixed(2));

  // 5. Gating & Admissibility:
  let isAdmissible = true;
  let rejectionReason: string | undefined = undefined;

  if (primaryRR < minimumAcceptableRR) {
    isAdmissible = false;
    rejectionReason = `Asimetrik R:R yetersiz (1:${primaryRR.toFixed(1)} < 1:${minimumAcceptableRR.toFixed(1)}). Kâr marjı kurumsal eşiği karşılamıyor.`;
  } else if (expectedValueR < 0.35) {
    isAdmissible = false;
    rejectionReason = `Matematiksel beklenti değeri düşük (+${expectedValueR}R < +0.35R). İşlem pozitif matematiksel avantaja sahip değil.`;
  }

  return {
    version: 'v1.0',
    symbol,
    direction,
    entryPrice,
    stopLoss,
    riskDistancePips,
    smartStopBufferPips,
    tp1,
    tp2,
    tp3,
    primaryRR,
    winProbability: winProb,
    expectedValueR,
    kellyFraction: halfKelly,
    recommendedRiskPct,
    isAdmissible,
    rejectionReason,
    propFirmGuardPassed: true,
  };
}
