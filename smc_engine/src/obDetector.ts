import { Candle, StructureEvent, DisplacementLeg, OrderBlock } from './types';
import { findDisplacementLeg } from './displacementLeg';

/**
 * Detects the Order Block associated with a displacement leg.
 * 
 * Rules:
 * - The OB candle is at startIndex - 1 of the leg.
 * - For a bullish leg: the OB candle must be bearish (close < open).
 * - For a bearish leg: the OB candle must be bullish (close > open).
 * - If the candle is not of opposite color (or is a doji), return null.
 */
export function detectOrderBlock(candles: Candle[], leg: DisplacementLeg, relatedEvent: StructureEvent): OrderBlock | null {
  const obIndex = leg.startIndex - 1;
  if (obIndex < 0) {
    return null;
  }

  const obCandle = candles[obIndex];
  const isObBullish = obCandle.close > obCandle.open;
  const isObBearish = obCandle.close < obCandle.open;

  if (leg.direction === 'bullish') {
    if (!isObBearish) {
      return null;
    }
  } else {
    if (!isObBullish) {
      return null;
    }
  }

  return {
    direction: leg.direction,
    candleIndex: obIndex,
    high: obCandle.high,
    low: obCandle.low,
    formedAtIndex: obIndex,
    relatedEvent,
  };
}

/**
 * Detects all Order Blocks associated with a list of structure events.
 */
export function detectAllOrderBlocks(candles: Candle[], structureEvents: StructureEvent[]): OrderBlock[] {
  const obs: OrderBlock[] = [];
  for (const event of structureEvents) {
    const leg = findDisplacementLeg(candles, event);
    const ob = detectOrderBlock(candles, leg, event);
    if (ob !== null) {
      obs.push(ob);
    }
  }
  return obs;
}
