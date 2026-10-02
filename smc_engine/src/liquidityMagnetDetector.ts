import { SwingPoint } from './types';
import { getPipSize, detectAssetClass } from './assetMetrics';

export interface LiquidityMagnet {
  type: 'EQH' | 'EQL';
  priceLevel: number;
  pointsCount: number;
  distancePips: number;
  isActive: boolean;
  status?: 'ACTIVE' | 'TAKEN' | 'INVALIDATED';
  firstTakenAt?: number | null;
  sourceSwingTimestamps?: readonly number[];
  description: string;
}
function getTolerance(symbol: string, refPrice: number): number {
  const assetClass = detectAssetClass(symbol);
  const pip = getPipSize(symbol);
  switch (assetClass) {
    case 'FOREX':
      return 2.5 * pip;
    case 'FOREX_JPY':
      return 3.5 * pip;
    case 'CRYPTO':
    case 'INDEX':
    case 'COMMODITY':
      return refPrice * 0.002;
    default:
      return 3.0 * pip;
  }
}
export function detectLiquidityMagnet(
  swings: readonly SwingPoint[],
  currentPrice: number,
  tradeDirection: 'long' | 'short',
  symbol: string,
  candles?: readonly { high: number; low: number; timestamp: number }[],
  currentIndex?: number
): LiquidityMagnet | null {
  if (!swings || swings.length < 2) return null;

  const pip = getPipSize(symbol);
  const tolerance = getTolerance(symbol, currentPrice);

  if (tradeDirection === 'long') {
    const highs = swings.filter(s => s.type === 'high' && s.price > currentPrice);
    if (highs.length < 2) return null;

    const candidates: LiquidityMagnet[] = [];
    for (let i = 0; i < highs.length; i++) {
      const cluster = [highs[i]];
      for (let j = i + 1; j < highs.length; j++) {
        if (Math.abs(highs[i].price - highs[j].price) <= tolerance) {
          cluster.push(highs[j]);
        }
      }

      if (cluster.length >= 2) {
        const avgPrice = cluster.reduce((sum, s) => sum + s.price, 0) / cluster.length;
        const distancePips = Math.round(((avgPrice - currentPrice) / pip) * 10) / 10;
        const firstTakenAt = findTakenAt('EQH', avgPrice, cluster, candles, currentIndex);
        candidates.push({
          type: 'EQH',
          priceLevel: avgPrice,
          pointsCount: cluster.length,
          distancePips,
          isActive: firstTakenAt === null,
          status: firstTakenAt === null ? 'ACTIVE' : 'TAKEN',
          firstTakenAt,
          sourceSwingTimestamps: cluster.map(point => point.timestamp),
          description: `EQH (Esit Tepeler - BSL Miknatisi): ${cluster.length} tepe @ ${avgPrice.toFixed(4)} (${distancePips} pip yukarida)`,
        });
      }
    }
    return selectBestMagnet(candidates);
  } else {
    const lows = swings.filter(s => s.type === 'low' && s.price < currentPrice);
    if (lows.length < 2) return null;

    const candidates: LiquidityMagnet[] = [];
    for (let i = 0; i < lows.length; i++) {
      const cluster = [lows[i]];
      for (let j = i + 1; j < lows.length; j++) {
        if (Math.abs(lows[i].price - lows[j].price) <= tolerance) {
          cluster.push(lows[j]);
        }
      }

      if (cluster.length >= 2) {
        const avgPrice = cluster.reduce((sum, s) => sum + s.price, 0) / cluster.length;
        const distancePips = Math.round(((currentPrice - avgPrice) / pip) * 10) / 10;
        const firstTakenAt = findTakenAt('EQL', avgPrice, cluster, candles, currentIndex);
        candidates.push({
          type: 'EQL',
          priceLevel: avgPrice,
          pointsCount: cluster.length,
          distancePips,
          isActive: firstTakenAt === null,
          status: firstTakenAt === null ? 'ACTIVE' : 'TAKEN',
          firstTakenAt,
          sourceSwingTimestamps: cluster.map(point => point.timestamp),
          description: `EQL (Esit Dipler - SSL Miknatisi): ${cluster.length} dip @ ${avgPrice.toFixed(4)} (${distancePips} pip asagida)`,
        });
      }
    }
    return selectBestMagnet(candidates);
  }

  return null;
}

export function resolveDisplayLiquidityMagnet(
  swings15m: readonly SwingPoint[],
  currentPrice: number,
  tradeDirection: 'long' | 'short',
  symbol: string,
  candles15m?: readonly { high: number; low: number; timestamp: number }[],
  currentIndex15m?: number,
  swings1h?: readonly SwingPoint[],
  candles1h?: readonly { high: number; low: number; timestamp: number }[],
  currentIndex1h?: number
): LiquidityMagnet | null {
  const magnet15m = detectLiquidityMagnet(swings15m, currentPrice, tradeDirection, symbol, candles15m, currentIndex15m);
  if (magnet15m && magnet15m.isActive) {
    return magnet15m;
  }

  if (swings1h && swings1h.length >= 2) {
    const magnet1h = detectLiquidityMagnet(swings1h, currentPrice, tradeDirection, symbol, candles1h, currentIndex1h);
    if (magnet1h && magnet1h.isActive) {
      return {
        ...magnet1h,
        description: `${magnet1h.description} [1H]`,
      };
    }
  }

  const single15m = detectNearestActiveSwingMagnet(swings15m, currentPrice, tradeDirection, symbol, candles15m, currentIndex15m);
  if (single15m) {
    return single15m;
  }

  if (swings1h && swings1h.length > 0) {
    const single1h = detectNearestActiveSwingMagnet(swings1h, currentPrice, tradeDirection, symbol, candles1h, currentIndex1h, ' [1H]');
    if (single1h) {
      return single1h;
    }
  }

  return magnet15m;
}

function detectNearestActiveSwingMagnet(
  swings: readonly SwingPoint[],
  currentPrice: number,
  tradeDirection: 'long' | 'short',
  symbol: string,
  candles?: readonly { high: number; low: number; timestamp: number }[],
  currentIndex?: number,
  tfSuffix = ''
): LiquidityMagnet | null {
  if (!swings || swings.length === 0) return null;
  const pip = getPipSize(symbol);

  if (tradeDirection === 'long') {
    const activeHighs = swings
      .filter(s => s.type === 'high' && s.price > currentPrice)
      .filter(s => findTakenAt('EQH', s.price, [s], candles, currentIndex) === null)
      .sort((a, b) => a.price - b.price);

    if (activeHighs.length === 0) return null;
    const nearest = activeHighs[0];
    const extreme = activeHighs[activeHighs.length - 1];
    const distancePips = Math.round(((nearest.price - currentPrice) / pip) * 10) / 10;
    const majorSuffix = extreme.price > nearest.price ? ` | Ana Tepe: ${extreme.price.toFixed(4)}` : '';
    return {
      type: 'EQH',
      priceLevel: nearest.price,
      pointsCount: 1,
      distancePips,
      isActive: true,
      status: 'ACTIVE',
      firstTakenAt: null,
      sourceSwingTimestamps: [nearest.timestamp],
      description: `BSL (Tekil Tepe Likiditesi - Hedef Miknatis): 1 tepe @ ${nearest.price.toFixed(4)} (${distancePips} pip yukarida)${majorSuffix}${tfSuffix}`,
    };
  }

  const activeLows = swings
    .filter(s => s.type === 'low' && s.price < currentPrice)
    .filter(s => findTakenAt('EQL', s.price, [s], candles, currentIndex) === null)
    .sort((a, b) => b.price - a.price);

  if (activeLows.length === 0) return null;
  const nearest = activeLows[0];
  const extreme = activeLows[activeLows.length - 1];
  const distancePips = Math.round(((currentPrice - nearest.price) / pip) * 10) / 10;
  const majorSuffix = extreme.price < nearest.price ? ` | Ana Dip: ${extreme.price.toFixed(4)}` : '';
  return {
    type: 'EQL',
    priceLevel: nearest.price,
    pointsCount: 1,
    distancePips,
    isActive: true,
    status: 'ACTIVE',
    firstTakenAt: null,
    sourceSwingTimestamps: [nearest.timestamp],
    description: `SSL (Tekil Dip Likiditesi - Hedef Miknatis): 1 dip @ ${nearest.price.toFixed(4)} (${distancePips} pip asagida)${majorSuffix}${tfSuffix}`,
  };
}

function selectBestMagnet(candidates: readonly LiquidityMagnet[]): LiquidityMagnet | null {
  if (candidates.length === 0) return null;

  return [...candidates].sort((a, b) => {
    // Active liquidity is actionable; taken liquidity remains fallback context.
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    if (a.distancePips !== b.distancePips) return a.distancePips - b.distancePips;
    if (a.pointsCount !== b.pointsCount) return b.pointsCount - a.pointsCount;
    return a.priceLevel - b.priceLevel;
  })[0];
}

function findTakenAt(
  type: 'EQH' | 'EQL',
  priceLevel: number,
  cluster: readonly SwingPoint[],
  candles: readonly { high: number; low: number; timestamp: number }[] | undefined,
  currentIndex: number | undefined
): number | null {
  if (!candles || currentIndex === undefined) return null;
  // The cluster becomes structurally possible once all source swings have formed.
  // Use the latest formation index so a later confirmation cannot hide an earlier take.
  const startIndex = Math.max(...cluster.map(point => point.formedAtIndex));
  for (let index = startIndex + 1; index <= currentIndex && index < candles.length; index += 1) {
    if (type === 'EQH' && candles[index].high >= priceLevel) return candles[index].timestamp;
    if (type === 'EQL' && candles[index].low <= priceLevel) return candles[index].timestamp;
  }
  return null;
}
