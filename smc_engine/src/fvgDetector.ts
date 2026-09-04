import { Candle, StructureEvent, DisplacementLeg, FVG } from './types';
import { findDisplacementLeg } from './displacementLeg';
import type { Symbol } from '../server/universe';

const MIN_FVG_PIPS: Record<Symbol, Record<'15m' | '1h' | '4h', number>> = {
  'EURUSD': { '15m': 5, '1h': 10, '4h': 15 },
  'GBPUSD': { '15m': 7, '1h': 12, '4h': 18 },
  'AUDUSD': { '15m': 5, '1h': 10, '4h': 15 },
  'USDCAD': { '15m': 5, '1h': 10, '4h': 15 },
  'USDJPY': { '15m': 5, '1h': 10, '4h': 15 },
  'NZDUSD': { '15m': 5, '1h': 10, '4h': 15 },
  'USDCHF': { '15m': 5, '1h': 10, '4h': 15 },
  'EURJPY': { '15m': 5, '1h': 10, '4h': 15 },
  'AUDCAD': { '15m': 5, '1h': 10, '4h': 15 },
  'EURGBP': { '15m': 5, '1h': 10, '4h': 15 },
  'GBPJPY': { '15m': 7, '1h': 12, '4h': 18 },
  'EURCHF': { '15m': 5, '1h': 10, '4h': 15 },
  'GBPCHF': { '15m': 7, '1h': 12, '4h': 18 },
  'AUDCHF': { '15m': 5, '1h': 10, '4h': 15 },
  'CADCHF': { '15m': 5, '1h': 10, '4h': 15 },
  'NZDCHF': { '15m': 5, '1h': 10, '4h': 15 },
  'CHFJPY': { '15m': 5, '1h': 10, '4h': 15 },
  'NAS100': { '15m': 10, '1h': 20, '4h': 40 },
  'XAUUSD': { '15m': 10, '1h': 20, '4h': 30 },
  'BTCUSD': { '15m': 50, '1h': 100, '4h': 200 },
  'BTCEUR': { '15m': 50, '1h': 100, '4h': 200 },
  'ETHUSD': { '15m': 5, '1h': 10, '4h': 20 },
  'ETHEUR': { '15m': 5, '1h': 10, '4h': 20 },
  'LTCUSD': { '15m': 1, '1h': 2, '4h': 5 },
  'LTCEUR': { '15m': 1, '1h': 2, '4h': 5 },
  'SOLUSD': { '15m': 1, '1h': 2, '4h': 5 },
};

function getPipMultiplier(symbol: string): number {
  if (symbol.includes('JPY')) return 0.01;
  if (symbol === 'NAS100' || symbol === 'US100') return 1.0;
  if (symbol.startsWith('XAU')) return 0.1;
  if (symbol.startsWith('XAG')) return 0.01;
  if (symbol.startsWith('BTC') || symbol.startsWith('ETH')) return 1.0;
  if (symbol.startsWith('LTC') || symbol.startsWith('SOL')) return 0.1;
  return 0.0001;
}

const MIN_FVG_RATIO = 0.25;

/**
 * Detects all FVGs within a specific displacement leg.
 * Sifts through all 3-candle sequences centered on candles within the leg.
 */
export function detectFVGsInLeg(
  candles: Candle[],
  leg: DisplacementLeg,
  pair: Symbol,
  timeframe: '15m' | '1h' | '4h',
  relatedEvent: StructureEvent
): FVG[] {
  const fvgs: FVG[] = [];
  const minPips = (MIN_FVG_PIPS[pair] ?? MIN_FVG_PIPS['EURUSD'])[timeframe];
  const pipMultiplier = getPipMultiplier(pair);

  // Iterate the middle candle index 'i' through the leg
  for (let i = leg.startIndex; i <= leg.endIndex; i++) {
    if (i - 1 < 0 || i + 1 >= candles.length) {
      continue;
    }

    let gapHigh = 0;
    let gapLow = 0;
    let isFvgFound = false;

    if (leg.direction === 'bullish') {
      if (candles[i + 1].low > candles[i - 1].high) {
        gapHigh = candles[i + 1].low;
        gapLow = candles[i - 1].high;
        isFvgFound = true;
      }
    } else {
      if (candles[i + 1].high < candles[i - 1].low) {
        gapHigh = candles[i - 1].low;
        gapLow = candles[i + 1].high;
        isFvgFound = true;
      }
    }

    if (isFvgFound) {
      const gapSize = gapHigh - gapLow;
      const gapSizePips = gapSize / pipMultiplier;
      const displacementCandleRange = candles[i].high - candles[i].low;
      
      if (displacementCandleRange === 0) {
        continue;
      }

      const ratio = gapSize / displacementCandleRange;

      // Filter: Both absolute and proportional thresholds must be passed
      const passesAbsolute = gapSizePips >= minPips;
      const passesProportional = gapSize >= displacementCandleRange * MIN_FVG_RATIO;

      if (passesAbsolute && passesProportional) {
        fvgs.push({
          direction: leg.direction,
          gapHigh,
          gapLow,
          gapSizePips,
          ratioToDisplacementCandle: ratio,
          middleCandleIndex: i,
          relatedEvent,
        });
      }
    }
  }

  return fvgs;
}

/**
 * Detects all FVGs associated with a list of structure events.
 */
export function detectAllFVGs(
  candles: Candle[],
  structureEvents: StructureEvent[],
  pair: Symbol,
  timeframe: '15m' | '1h' | '4h'
): FVG[] {
  const allFvgs: FVG[] = [];
  for (const event of structureEvents) {
    const leg = findDisplacementLeg(candles, event);
    const fvgs = detectFVGsInLeg(candles, leg, pair, timeframe, event);
    allFvgs.push(...fvgs);
  }
  return allFvgs;
}
