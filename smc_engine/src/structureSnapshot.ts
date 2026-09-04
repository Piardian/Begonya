import { calculatePremiumDiscount } from './premiumDiscountCalculator';
import { calculateRange } from './rangeCalculator';
import { detectAllOrderBlocks } from './obDetector';
import { detectStructure } from './structureDetector';
import { detectSweeps, SweepEvent } from './sweepDetector';
import { detectSwings } from './swingDetector';
import { Candle, OrderBlock, PremiumDiscountState, StructureEvent, SwingPoint } from './types';
import type { Symbol } from '../server/universe';

export type StructureSymbol = Symbol;
export type StructureTimeframe = '15m' | '1h' | '4h';

export interface StructureDebugEvent {
  readonly tag: '[SWING]' | '[BOS]' | '[CHOCH]' | '[SWEEP]' | '[OB]' | '[PD]';
  readonly timestamp: number | null;
  readonly sourceIndex: number | null;
  readonly reason: string;
}

export interface StructureSnapshot {
  readonly symbol: StructureSymbol;
  readonly timeframe: StructureTimeframe;
  readonly currentIndex: number;
  readonly currentTimestamp: number | null;
  readonly currentTrend: 'bullish' | 'bearish' | 'range' | 'undefined';
  readonly currentSwing: SwingPoint | null;
  readonly lastBos: StructureEvent | null;
  readonly lastChoch: StructureEvent | null;
  readonly activeOrderBlock: OrderBlock | null;
  readonly activeSweep: SweepEvent | null;
  readonly premiumDiscount: PremiumDiscountState;
  readonly structureState: {
    readonly eventCount: number;
    readonly swingCount: number;
    readonly orderBlockCount: number;
    readonly sweepCount: number;
  };
  readonly debugEvents: readonly StructureDebugEvent[];
}

export function createStructureSnapshot(
  candles: readonly Candle[],
  symbol: StructureSymbol,
  timeframe: StructureTimeframe,
  currentIndex = candles.length - 1
): StructureSnapshot {
  const safeCurrentIndex = normalizeCurrentIndex(candles, currentIndex);
  const candleSlice = safeCurrentIndex >= 0 ? candles.slice(0, safeCurrentIndex + 1) : [];
  const swings = detectSwings([...candleSlice]);
  const structureState = detectStructure([...candleSlice], swings);
  const rangeStates = candleSlice.map((_, idx) => calculateRange([...candleSlice], swings, structureState, idx));
  const sweeps = detectSweeps([...candleSlice], rangeStates, symbol, timeframe);
  const orderBlocks = detectAllOrderBlocks([...candleSlice], structureState.events);
  const premiumDiscount = calculatePremiumDiscount([...candleSlice], swings, safeCurrentIndex);

  const snapshot: StructureSnapshot = {
    symbol,
    timeframe,
    currentIndex: safeCurrentIndex,
    currentTimestamp: candleSlice[safeCurrentIndex]?.timestamp ?? null,
    currentTrend: structureState.currentTrend,
    currentSwing: latestByConfirmedIndex(swings),
    lastBos: latestEvent(structureState.events, 'BOS'),
    lastChoch: latestEvent(structureState.events, 'CHoCH'),
    activeOrderBlock: latestActiveOrderBlock(orderBlocks, candleSlice, safeCurrentIndex),
    activeSweep: sweeps[sweeps.length - 1] ?? null,
    premiumDiscount,
    structureState: Object.freeze({
      eventCount: structureState.events.length,
      swingCount: swings.length,
      orderBlockCount: orderBlocks.length,
      sweepCount: sweeps.length,
    }),
    debugEvents: Object.freeze([
      ...swingDebugEvents(swings),
      ...structureDebugEvents(structureState.events),
      ...sweepDebugEvents(sweeps),
      ...orderBlockDebugEvents(orderBlocks, candleSlice, safeCurrentIndex),
      premiumDiscountDebugEvent(premiumDiscount, candleSlice[safeCurrentIndex]?.timestamp ?? null, safeCurrentIndex),
    ]),
  };

  return deepFreezeSnapshot(snapshot);
}

export function formatStructureDebugEvent(event: StructureDebugEvent): string {
  return `${event.tag} timestamp=${event.timestamp ?? 'N/A'} sourceIndex=${event.sourceIndex ?? 'N/A'} reason=${event.reason}`;
}

export function formatStructureDebugLog(snapshot: StructureSnapshot): string {
  return snapshot.debugEvents.map(formatStructureDebugEvent).join('\n');
}

function normalizeCurrentIndex(candles: readonly Candle[], currentIndex: number): number {
  if (candles.length === 0) return -1;
  if (currentIndex < 0) return 0;
  if (currentIndex >= candles.length) return candles.length - 1;
  return currentIndex;
}

function latestByConfirmedIndex(swings: readonly SwingPoint[]): SwingPoint | null {
  return swings.length > 0 ? swings[swings.length - 1] : null;
}

function latestEvent(events: readonly StructureEvent[], type: 'BOS' | 'CHoCH'): StructureEvent | null {
  for (let idx = events.length - 1; idx >= 0; idx--) {
    if (events[idx].type === type) return events[idx];
  }
  return null;
}

function latestActiveOrderBlock(
  orderBlocks: readonly OrderBlock[],
  candles: readonly Candle[],
  currentIndex: number
): OrderBlock | null {
  for (let idx = orderBlocks.length - 1; idx >= 0; idx--) {
    if (!isOrderBlockInvalidated(orderBlocks[idx], candles, currentIndex)) {
      return orderBlocks[idx];
    }
  }
  return null;
}

function isOrderBlockInvalidated(ob: OrderBlock, candles: readonly Candle[], currentIndex: number): boolean {
  for (let idx = ob.formedAtIndex + 1; idx <= currentIndex; idx++) {
    const close = candles[idx]?.close;
    if (close === undefined) continue;
    if (ob.direction === 'bullish' && close < ob.low) return true;
    if (ob.direction === 'bearish' && close > ob.high) return true;
  }
  return false;
}

function swingDebugEvents(swings: readonly SwingPoint[]): StructureDebugEvent[] {
  return swings.map(swing => Object.freeze({
    tag: '[SWING]' as const,
    timestamp: swing.timestamp,
    sourceIndex: swing.formedAtIndex,
    reason: `${swing.type.toUpperCase()} confirmed at candle ${swing.confirmedAtIndex} from strict five-candle fractal.`,
  }));
}

function structureDebugEvents(events: readonly StructureEvent[]): StructureDebugEvent[] {
  return events.map(event => Object.freeze({
    tag: event.type === 'BOS' ? '[BOS]' as const : '[CHOCH]' as const,
    timestamp: event.breakTimestamp,
    sourceIndex: event.breakCandleIndex,
    reason: `${event.direction.toUpperCase()} ${event.type} close ${event.breakClosePrice} broke ${event.brokenSwing.type} swing ${event.brokenSwing.price} from index ${event.brokenSwing.formedAtIndex}.`,
  }));
}

function sweepDebugEvents(sweeps: readonly SweepEvent[]): StructureDebugEvent[] {
  return sweeps.map(sweep => Object.freeze({
    tag: '[SWEEP]' as const,
    timestamp: sweep.timestamp,
    sourceIndex: sweep.candleIndex,
    reason: `${sweep.type} swept ${sweep.sweptLevel} by ${round(sweep.penetrationDistance)} pips with wick ${sweep.wickPrice}.`,
  }));
}

function orderBlockDebugEvents(
  orderBlocks: readonly OrderBlock[],
  candles: readonly Candle[],
  currentIndex: number
): StructureDebugEvent[] {
  return orderBlocks.map(ob => Object.freeze({
    tag: '[OB]' as const,
    timestamp: candles[ob.formedAtIndex]?.timestamp ?? null,
    sourceIndex: ob.formedAtIndex,
    reason: `${ob.direction.toUpperCase()} OB origin candle ${ob.formedAtIndex} high=${ob.high} low=${ob.low} related to ${ob.relatedEvent.type}; invalidated=${isOrderBlockInvalidated(ob, candles, currentIndex)}.`,
  }));
}

function premiumDiscountDebugEvent(
  pd: PremiumDiscountState,
  timestamp: number | null,
  sourceIndex: number
): StructureDebugEvent {
  return Object.freeze({
    tag: '[PD]' as const,
    timestamp,
    sourceIndex,
    reason: `Premium/Discount status=${pd.status} fib=${pd.fibValue === null ? 'N/A' : round(pd.fibValue)} rangeHigh=${pd.rangeHigh ?? 'N/A'} rangeLow=${pd.rangeLow ?? 'N/A'}.`,
  });
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function deepFreezeSnapshot(snapshot: StructureSnapshot): StructureSnapshot {
  return Object.freeze({
    ...snapshot,
    currentSwing: snapshot.currentSwing ? Object.freeze({ ...snapshot.currentSwing }) : null,
    lastBos: snapshot.lastBos ? Object.freeze({ ...snapshot.lastBos }) : null,
    lastChoch: snapshot.lastChoch ? Object.freeze({ ...snapshot.lastChoch }) : null,
    activeOrderBlock: snapshot.activeOrderBlock ? Object.freeze({ ...snapshot.activeOrderBlock }) : null,
    activeSweep: snapshot.activeSweep ? Object.freeze({ ...snapshot.activeSweep }) : null,
    premiumDiscount: Object.freeze({ ...snapshot.premiumDiscount }),
    structureState: Object.freeze({ ...snapshot.structureState }),
    debugEvents: Object.freeze(snapshot.debugEvents.map(event => Object.freeze({ ...event }))),
  });
}
