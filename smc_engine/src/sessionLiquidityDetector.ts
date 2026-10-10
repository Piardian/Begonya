import { Candle } from './types';
import type { Symbol } from '../server/universe';
import { getPipSize } from './assetMetrics';

export interface SessionLiquidityPools {
  pdh: number | null; // Previous Day High
  pdl: number | null; // Previous Day Low
  asiaHigh: number | null; // Asia Session High (00:00 - 07:00 UTC)
  asiaLow: number | null; // Asia Session Low (00:00 - 07:00 UTC)
}

export interface InstitutionalSweepEvent {
  type: 'PDH_SWEEP' | 'PDL_SWEEP' | 'ASIA_HIGH_SWEEP' | 'ASIA_LOW_SWEEP';
  level: number;
  wickPrice: number;
  penetrationPips: number;
  candleIndex: number;
  timestamp: number;
  direction: 'bullish_reversal' | 'bearish_reversal';
  rationale: string;
}

function getDayKey(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
}

/**
 * Extracts true calendar-based institutional liquidity pools:
 * 1. PDH (Previous Day High) & PDL (Previous Day Low)
 * 2. Asia High & Asia Low (00:00 - 07:00 UTC session range)
 * 
 * Strict zero-lookahead safety: only completed previous days and completed Asia sessions
 * are used as reference liquidity levels for active trading candles.
 */
export function extractSessionLiquidityPools(candles: readonly Candle[]): Map<number, SessionLiquidityPools> {
  const result = new Map<number, SessionLiquidityPools>();
  if (candles.length === 0) return result;

  // Track daily highs and lows
  let currentDayKey = getDayKey(candles[0].timestamp);
  let currentDayHigh = candles[0].high;
  let currentDayLow = candles[0].low;

  let prevDayHigh: number | null = null;
  let prevDayLow: number | null = null;

  // Track active Asia session
  let activeAsiaHigh: number | null = null;
  let activeAsiaLow: number | null = null;
  let confirmedAsiaHigh: number | null = null;
  let confirmedAsiaLow: number | null = null;

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    const dayKey = getDayKey(candle.timestamp);
    const d = new Date(candle.timestamp);
    const utcHour = d.getUTCHours();

    // Day rollover
    if (dayKey !== currentDayKey) {
      prevDayHigh = currentDayHigh;
      prevDayLow = currentDayLow;
      currentDayKey = dayKey;
      currentDayHigh = candle.high;
      currentDayLow = candle.low;

      // Reset Asia session for the new day
      activeAsiaHigh = null;
      activeAsiaLow = null;
      confirmedAsiaHigh = null;
      confirmedAsiaLow = null;
    } else {
      currentDayHigh = Math.max(currentDayHigh, candle.high);
      currentDayLow = Math.min(currentDayLow, candle.low);
    }

    // Accumulate Asia session (00:00 - 07:00 UTC)
    if (utcHour < 7) {
      activeAsiaHigh = activeAsiaHigh !== null ? Math.max(activeAsiaHigh, candle.high) : candle.high;
      activeAsiaLow = activeAsiaLow !== null ? Math.min(activeAsiaLow, candle.low) : candle.low;
    } else {
      // 07:00 UTC and beyond: Asia session is finalized
      if (confirmedAsiaHigh === null && activeAsiaHigh !== null) {
        confirmedAsiaHigh = activeAsiaHigh;
        confirmedAsiaLow = activeAsiaLow;
      }
    }

    result.set(i, {
      pdh: prevDayHigh,
      pdl: prevDayLow,
      asiaHigh: confirmedAsiaHigh,
      asiaLow: confirmedAsiaLow,
    });
  }

  return result;
}

/**
 * Detects institutional liquidity sweeps across PDH/PDL and Asia High/Low levels.
 */
export function detectInstitutionalSweeps(
  candles: readonly Candle[],
  pair: Symbol | string
): InstitutionalSweepEvent[] {
  const events: InstitutionalSweepEvent[] = [];
  if (candles.length < 2) return events;

  const pipSize = getPipSize(pair);
  const poolsByCandle = extractSessionLiquidityPools(candles);

  const sweptLevelsThisDay = new Set<string>();
  let currentDayKey = '';

  for (let idx = 0; idx < candles.length; idx++) {
    const candle = candles[idx];
    const dayKey = getDayKey(candle.timestamp);

    if (dayKey !== currentDayKey) {
      currentDayKey = dayKey;
      sweptLevelsThisDay.clear();
    }

    const pools = poolsByCandle.get(idx);
    if (!pools) continue;

    // 1. Check PDH Sweep (Price wicks above Previous Day High and closes back below)
    if (pools.pdh !== null) {
      const key = `PDH-${pools.pdh}`;
      if (!sweptLevelsThisDay.has(key) && candle.high > pools.pdh && candle.close <= pools.pdh) {
        const penetrationPips = Number(((candle.high - pools.pdh) / pipSize).toFixed(1));
        events.push({
          type: 'PDH_SWEEP',
          level: pools.pdh,
          wickPrice: candle.high,
          penetrationPips,
          candleIndex: idx,
          timestamp: candle.timestamp,
          direction: 'bearish_reversal',
          rationale: `Kurumsal BSL Avı: Önceki Günün Zirvesi (PDH: ${pools.pdh}) ${penetrationPips} pip süpürüldü ve altına dönüldü (Bearish Reversal).`,
        });
        sweptLevelsThisDay.add(key);
      }
    }

    // 2. Check PDL Sweep (Price wicks below Previous Day Low and closes back above)
    if (pools.pdl !== null) {
      const key = `PDL-${pools.pdl}`;
      if (!sweptLevelsThisDay.has(key) && candle.low < pools.pdl && candle.close >= pools.pdl) {
        const penetrationPips = Number(((pools.pdl - candle.low) / pipSize).toFixed(1));
        events.push({
          type: 'PDL_SWEEP',
          level: pools.pdl,
          wickPrice: candle.low,
          penetrationPips,
          candleIndex: idx,
          timestamp: candle.timestamp,
          direction: 'bullish_reversal',
          rationale: `Kurumsal SSL Avı: Önceki Günün Dibi (PDL: ${pools.pdl}) ${penetrationPips} pip süpürüldü ve üstüne dönüldü (Bullish Reversal).`,
        });
        sweptLevelsThisDay.add(key);
      }
    }

    // 3. Check Asia High Sweep (Price wicks above Asia High and closes below)
    if (pools.asiaHigh !== null) {
      const key = `ASIA_H-${pools.asiaHigh}`;
      if (!sweptLevelsThisDay.has(key) && candle.high > pools.asiaHigh && candle.close <= pools.asiaHigh) {
        const penetrationPips = Number(((candle.high - pools.asiaHigh) / pipSize).toFixed(1));
        events.push({
          type: 'ASIA_HIGH_SWEEP',
          level: pools.asiaHigh,
          wickPrice: candle.high,
          penetrationPips,
          candleIndex: idx,
          timestamp: candle.timestamp,
          direction: 'bearish_reversal',
          rationale: `Londra Manipülasyonu (Judas Swing): Asya Seansı Zirvesi (Asia High: ${pools.asiaHigh}) süpürüldü ve altına çekildi.`,
        });
        sweptLevelsThisDay.add(key);
      }
    }

    // 4. Check Asia Low Sweep (Price wicks below Asia Low and closes above)
    if (pools.asiaLow !== null) {
      const key = `ASIA_L-${pools.asiaLow}`;
      if (!sweptLevelsThisDay.has(key) && candle.low < pools.asiaLow && candle.close >= pools.asiaLow) {
        const penetrationPips = Number(((pools.asiaLow - candle.low) / pipSize).toFixed(1));
        events.push({
          type: 'ASIA_LOW_SWEEP',
          level: pools.asiaLow,
          wickPrice: candle.low,
          penetrationPips,
          candleIndex: idx,
          timestamp: candle.timestamp,
          direction: 'bullish_reversal',
          rationale: `Londra Manipülasyonu (Judas Swing): Asya Seansı Dibi (Asia Low: ${pools.asiaLow}) süpürüldü ve üstüne toplandı.`,
        });
        sweptLevelsThisDay.add(key);
      }
    }
  }

  return events;
}
