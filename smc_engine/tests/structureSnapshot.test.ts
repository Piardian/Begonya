import { createStructureSnapshot, formatStructureDebugLog } from '../src/structureSnapshot';
import { Candle } from '../src/types';

describe('Structure Snapshot RC-6.0', () => {
  test('creates an immutable deterministic snapshot with traceable structure events', () => {
    const candles = bullishBosCandles();

    const first = createStructureSnapshot(candles, 'EURUSD', '15m');
    const second = createStructureSnapshot(candles, 'EURUSD', '15m');

    expect(first).toEqual(second);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.debugEvents)).toBe(true);
    expect(first.currentTrend).toBe('bullish');
    expect(first.lastBos).toMatchObject({
      type: 'BOS',
      direction: 'bullish',
      breakCandleIndex: 14,
      breakClosePrice: 25,
    });
    expect(first.lastChoch).toBeNull();
    expect(first.activeOrderBlock).toMatchObject({
      direction: 'bullish',
      formedAtIndex: 13,
      high: 18,
      low: 14,
    });
    expect(first.premiumDiscount.status).toBe('premium');
    expect(first.structureState.swingCount).toBeGreaterThanOrEqual(4);
    expect(first.structureState.eventCount).toBe(1);
    expect(first.structureState.orderBlockCount).toBe(1);
  });

  test('emits debug log lines for SWING, BOS, OB, and PD evidence', () => {
    const snapshot = createStructureSnapshot(bullishBosCandles(), 'EURUSD', '15m');
    const log = formatStructureDebugLog(snapshot);

    expect(log).toContain('[SWING]');
    expect(log).toContain('[BOS]');
    expect(log).toContain('[OB]');
    expect(log).toContain('[PD]');
    expect(log).toContain('reason=');
    expect(log).toContain('sourceIndex=');
    expect(log).toContain('timestamp=');
  });

  test('does not duplicate structure events when the same broken swing remains beyond price', () => {
    const candles = bullishBosCandles();
    candles.push(candle(15, 25, 28, 24, 27));
    candles.push(candle(16, 27, 29, 26, 28));

    const snapshot = createStructureSnapshot(candles, 'EURUSD', '15m');
    const bosEvents = snapshot.debugEvents.filter(event => event.tag === '[BOS]');

    expect(bosEvents).toHaveLength(1);
    expect(snapshot.structureState.eventCount).toBe(1);
  });

  test('preserves no-repaint behavior for confirmed historical structure events', () => {
    const candles = bullishBosCandles();
    const batchSnapshot = createStructureSnapshot(candles, 'EURUSD', '15m');

    let lastObservedBos: typeof batchSnapshot.lastBos = null;
    for (let size = 1; size <= candles.length; size++) {
      const sliceSnapshot = createStructureSnapshot(candles.slice(0, size), 'EURUSD', '15m');
      if (sliceSnapshot.lastBos) {
        lastObservedBos = sliceSnapshot.lastBos;
      }
    }

    expect(lastObservedBos).toEqual(batchSnapshot.lastBos);
  });

  test('captures sweep evidence when range liquidity is swept', () => {
    const candles = rangeSweepCandles();
    const snapshot = createStructureSnapshot(candles, 'EURUSD', '15m');

    expect(snapshot.activeSweep).toMatchObject({
      type: 'sweep_low',
      candleIndex: 14,
    });
    expect(snapshot.debugEvents.some(event => event.tag === '[SWEEP]' && event.reason.includes('sweep_low'))).toBe(true);
  });
});

function candle(index: number, open: number, high: number, low: number, close: number): Candle {
  return {
    timestamp: 1000 * index,
    open,
    high,
    low,
    close,
  };
}

function bullishBosCandles(): Candle[] {
  return [
    candle(0, 15, 15, 14, 15),
    candle(1, 12, 13, 11, 12),
    candle(2, 11, 12, 10, 11),
    candle(3, 14, 14, 13, 14),
    candle(4, 15, 16, 14, 15),
    candle(5, 18, 20, 15, 18),
    candle(6, 17, 18, 14, 17),
    candle(7, 16, 17, 13, 16),
    candle(8, 13, 16, 12, 13),
    candle(9, 17, 18, 13, 17),
    candle(10, 18, 19, 14, 18),
    candle(11, 20, 22, 16, 20),
    candle(12, 18, 20, 15, 18),
    candle(13, 17, 18, 14, 15),
    candle(14, 24, 26, 24, 25),
  ];
}

function rangeSweepCandles(): Candle[] {
  return [
    candle(0, 1.05, 1.051, 1.049, 1.05),
    candle(1, 1.05, 1.052, 1.048, 1.05),
    candle(2, 1.05, 1.053, 1.04, 1.05),
    candle(3, 1.05, 1.056, 1.045, 1.05),
    candle(4, 1.05, 1.058, 1.047, 1.05),
    candle(5, 1.05, 1.06, 1.048, 1.05),
    candle(6, 1.05, 1.057, 1.046, 1.05),
    candle(7, 1.05, 1.056, 1.044, 1.05),
    candle(8, 1.05, 1.057, 1.039, 1.05),
    candle(9, 1.05, 1.058, 1.044, 1.05),
    candle(10, 1.05, 1.059, 1.046, 1.05),
    candle(11, 1.05, 1.061, 1.047, 1.05),
    candle(12, 1.05, 1.057, 1.046, 1.05),
    candle(13, 1.05, 1.056, 1.045, 1.05),
    candle(14, 1.05, 1.055, 1.038, 1.05),
  ];
}
