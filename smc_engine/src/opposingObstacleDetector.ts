import { OrderBlock, FVG } from './types';
import { getPipSize, detectAssetClass } from './assetMetrics';

export interface OpposingObstacle {
  hasObstacle: boolean;
  obstacleType: 'OB' | 'FVG' | null;
  timeframe: '15m' | '1h';
  level: { low: number; high: number } | null;
  distancePips: number;
  warningText: string;
}

export interface ObstacleCheckInput {
  symbol: string;
  tradeDirection: 'long' | 'short';
  entryZone: { low: number; high: number };
  activeOrderBlocks15m: readonly OrderBlock[];
  activeFVGs15m: readonly FVG[];
  activeOrderBlocks1h?: readonly OrderBlock[];
  activeFVGs1h?: readonly FVG[];
  minClearancePips?: number;
}

function getDefaultClearancePips(symbol: string): number {
  const assetClass = detectAssetClass(symbol);
  switch (assetClass) {
    case 'FOREX':
      return 25;
    case 'FOREX_JPY':
      return 35;
    case 'CRYPTO':
      return 500;
    default:
      return 30;
  }
}

export function detectOpposingObstacle(input: ObstacleCheckInput): OpposingObstacle {
  const pip = getPipSize(input.symbol);
  const clearancePips = input.minClearancePips ?? getDefaultClearancePips(input.symbol);
  const clearanceUnits = clearancePips * pip;

  const noObstacle: OpposingObstacle = {
    hasObstacle: false,
    obstacleType: null,
    timeframe: '15m',
    level: null,
    distancePips: 0,
    warningText: '',
  };

  if (input.tradeDirection === 'long') {
    const entryTop = input.entryZone.high;
    const maxObstaclePrice = entryTop + clearanceUnits;

    for (const ob of input.activeOrderBlocks15m) {
      if (ob.direction === 'bearish' && ob.low > entryTop && ob.low <= maxObstaclePrice) {
        const dist = Math.round(((ob.low - entryTop) / pip) * 10) / 10;
        return {
          hasObstacle: true,
          obstacleType: 'OB',
          timeframe: '15m',
          level: { low: ob.low, high: ob.high },
          distancePips: dist,
          warningText: 'Karsi Engel: ' + dist + ' pip yukarida 15M Bearish OB mevcut (' + ob.low.toFixed(4) + ' - ' + ob.high.toFixed(4) + ')',
        };
      }
    }

    for (const fvg of input.activeFVGs15m) {
      if (fvg.direction === 'bearish' && fvg.gapLow > entryTop && fvg.gapLow <= maxObstaclePrice) {
        const dist = Math.round(((fvg.gapLow - entryTop) / pip) * 10) / 10;
        return {
          hasObstacle: true,
          obstacleType: 'FVG',
          timeframe: '15m',
          level: { low: fvg.gapLow, high: fvg.gapHigh },
          distancePips: dist,
          warningText: 'Karsi Engel: ' + dist + ' pip yukarida 15M Bearish FVG mevcut (' + fvg.gapLow.toFixed(4) + ' - ' + fvg.gapHigh.toFixed(4) + ')',
        };
      }
    }
  } else {
    const entryBottom = input.entryZone.low;
    const minObstaclePrice = entryBottom - clearanceUnits;

    for (const ob of input.activeOrderBlocks15m) {
      if (ob.direction === 'bullish' && ob.high < entryBottom && ob.high >= minObstaclePrice) {
        const dist = Math.round(((entryBottom - ob.high) / pip) * 10) / 10;
        return {
          hasObstacle: true,
          obstacleType: 'OB',
          timeframe: '15m',
          level: { low: ob.low, high: ob.high },
          distancePips: dist,
          warningText: 'Karsi Engel: ' + dist + ' pip asagida 15M Bullish OB mevcut (' + ob.low.toFixed(4) + ' - ' + ob.high.toFixed(4) + ')',
        };
      }
    }

    for (const fvg of input.activeFVGs15m) {
      if (fvg.direction === 'bullish' && fvg.gapHigh < entryBottom && fvg.gapHigh >= minObstaclePrice) {
        const dist = Math.round(((entryBottom - fvg.gapHigh) / pip) * 10) / 10;
        return {
          hasObstacle: true,
          obstacleType: 'FVG',
          timeframe: '15m',
          level: { low: fvg.gapLow, high: fvg.gapHigh },
          distancePips: dist,
          warningText: 'Karsi Engel: ' + dist + ' pip asagida 15M Bullish FVG mevcut (' + fvg.gapLow.toFixed(4) + ' - ' + fvg.gapHigh.toFixed(4) + ')',
        };
      }
    }
  }

  return noObstacle;
}
