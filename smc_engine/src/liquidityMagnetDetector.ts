import { SwingPoint } from './types';
import { getPipSize, detectAssetClass } from './assetMetrics';

export interface LiquidityMagnet {
  type: 'EQH' | 'EQL';
  priceLevel: number;
  pointsCount: number;
  distancePips: number;
  isActive: boolean;
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
  symbol: string
): LiquidityMagnet | null {
  if (!swings || swings.length < 2) return null;

  const pip = getPipSize(symbol);
  const tolerance = getTolerance(symbol, currentPrice);

  if (tradeDirection === 'long') {
    const highs = swings.filter(s => s.type === 'high' && s.price > currentPrice);
    if (highs.length < 2) return null;

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
        return {
          type: 'EQH',
          priceLevel: avgPrice,
          pointsCount: cluster.length,
          distancePips,
          isActive: true,
          description: `EQH (Esit Tepeler - BSL Miknatisi): ${cluster.length} tepe @ ${avgPrice.toFixed(4)} (${distancePips} pip yukarida)`,
        };
      }
    }
  } else {
    const lows = swings.filter(s => s.type === 'low' && s.price < currentPrice);
    if (lows.length < 2) return null;

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
        return {
          type: 'EQL',
          priceLevel: avgPrice,
          pointsCount: cluster.length,
          distancePips,
          isActive: true,
          description: `EQL (Esit Dipler - SSL Miknatisi): ${cluster.length} dip @ ${avgPrice.toFixed(4)} (${distancePips} pip asagida)`,
        };
      }
    }
  }

  return null;
}
