import { Candle } from './types';
import { RangeState } from './rangeCalculator';
import type { Symbol } from '../server/universe';

export interface SweepEvent {
  type: 'sweep_low' | 'sweep_high';
  sweptLevel: number;
  penetrationDistance: number; // in pips
  candleIndex: number;
  timestamp: number;
  wickPrice: number;
}

const MIN_SWEEP_PIPS: Record<string, Record<'15m' | '1h' | '4h', number>> = {
  'EURUSD': { '15m': 5, '1h': 10, '4h': 15 },
  'GBPUSD': { '15m': 7, '1h': 12, '4h': 18 },
  'AUDUSD': { '15m': 5, '1h': 10, '4h': 15 },
  'USDCAD': { '15m': 5, '1h': 10, '4h': 15 },
  'EURJPY': { '15m': 5, '1h': 10, '4h': 15 },
  'AUDCAD': { '15m': 5, '1h': 10, '4h': 15 },
  'EURGBP': { '15m': 5, '1h': 10, '4h': 15 },
  'GBPJPY': { '15m': 7, '1h': 12, '4h': 18 },
  'NAS100': { '15m': 10, '1h': 20, '4h': 40 },
  'XAUUSD': { '15m': 10, '1h': 20, '4h': 30 },
  'BTCUSD': { '15m': 50, '1h': 100, '4h': 200 },
  'BTCEUR': { '15m': 50, '1h': 100, '4h': 200 },
  'ETHUSD': { '15m': 5, '1h': 10, '4h': 20 },
  'ETHEUR': { '15m': 5, '1h': 10, '4h': 20 },
  'LTCUSD': { '15m': 1, '1h': 2, '4h': 5 },
  'LTCEUR': { '15m': 1, '1h': 2, '4h': 5 },
};

function getPipMultiplier(symbol: string): number {
  if (symbol.includes('JPY')) return 0.01;
  if (symbol === 'NAS100' || symbol === 'US100') return 1.0;
  if (symbol.startsWith('XAU')) return 0.1;
  if (symbol.startsWith('XAG')) return 0.01;
  if (symbol.startsWith('BTC') || symbol.startsWith('ETH')) return 1.0;
  if (symbol.startsWith('LTC')) return 0.1;
  return 0.0001;
}

/**
 * Detects liquidity sweeps (wick penetrating beyond range boundaries by at least minPenetration).
 * 
 * Rules:
 * 1. Sweep Low: candle.low < rangeLow - minPenetration (bullish reversal)
 * 2. Sweep High: candle.high > rangeHigh + minPenetration (bearish reversal)
 * 3. Duplicate prevention: A single rangeLow/rangeHigh value can trigger at most one sweep event.
 *    If rangeLow or rangeHigh updates, or a new range regime starts, sweeps can trigger again.
 */
export function detectSweeps(
  candles: Candle[],
  rangeStates: RangeState[],
  pair: Symbol,
  timeframe: '15m' | '1h' | '4h'
): SweepEvent[] {
  const events: SweepEvent[] = [];
  const minPenetrationPips = (MIN_SWEEP_PIPS[pair] ?? MIN_SWEEP_PIPS['EURUSD'])[timeframe];
  const pipMultiplier = getPipMultiplier(pair);
  const minPenetrationPrice = minPenetrationPips * pipMultiplier;

  let sweptLowLevel: number | null = null;
  let sweptHighLevel: number | null = null;
  let lastRegimeStartIndex: number | null = null;

  for (let idx = 0; idx < candles.length; idx++) {
    const rangeState = rangeStates[idx];

    if (!rangeState.isRange || rangeState.rangeHigh === null || rangeState.rangeLow === null) {
      // Out of range: reset active sweeps tracking
      sweptLowLevel = null;
      sweptHighLevel = null;
      lastRegimeStartIndex = null;
      continue;
    }

    // If we transitioned to a new range regime, reset tracking
    if (rangeState.regimeStartIndex !== lastRegimeStartIndex) {
      sweptLowLevel = null;
      sweptHighLevel = null;
      lastRegimeStartIndex = rangeState.regimeStartIndex;
    }

    const candle = candles[idx];

    // Check Sweep Low
    if (candle.low < rangeState.rangeLow - minPenetrationPrice) {
      // If we haven't swept this rangeLow level yet
      if (sweptLowLevel !== rangeState.rangeLow) {
        const penetrationDistance = (rangeState.rangeLow - candle.low) / pipMultiplier;
        events.push({
          type: 'sweep_low',
          sweptLevel: rangeState.rangeLow,
          penetrationDistance,
          candleIndex: idx,
          timestamp: candle.timestamp,
          wickPrice: candle.low,
        });
        sweptLowLevel = rangeState.rangeLow;
      }
    }

    // Check Sweep High
    if (candle.high > rangeState.rangeHigh + minPenetrationPrice) {
      // If we haven't swept this rangeHigh level yet
      if (sweptHighLevel !== rangeState.rangeHigh) {
        const penetrationDistance = (candle.high - rangeState.rangeHigh) / pipMultiplier;
        events.push({
          type: 'sweep_high',
          sweptLevel: rangeState.rangeHigh,
          penetrationDistance,
          candleIndex: idx,
          timestamp: candle.timestamp,
          wickPrice: candle.high,
        });
        sweptHighLevel = rangeState.rangeHigh;
      }
    }
  }

  return events;
}
