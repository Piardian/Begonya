import { Candle, SwingPoint, StructureEvent } from '../src/types';
import {
  detectBreakerBlocks,
  findActiveBreakerBlocks,
  findNearestBreakerBlock,
  isPriceInBreakerZone,
} from '../src/breakerBlockDetector';

describe('Breaker Block Engine (ICT/SMC Liquidity & Trapped Orders)', () => {
  test('should detect Bullish Breaker Block when L1 is swept by L2 before H1 is broken upward', () => {
    // 16 candles
    const candles: Candle[] = [];
    for (let i = 0; i < 16; i++) {
      candles.push({
        timestamp: i * 60000,
        open: 105,
        high: 106,
        low: 104,
        close: 105,
      });
    }

    // Index 2: Swing Low L1 at 100
    candles[2] = { timestamp: 20000, open: 103, high: 104, low: 100, close: 102 };

    // Index 5: Swing High H1 at 110 (this will become the Breaker Block)
    candles[5] = { timestamp: 50000, open: 107, high: 110, low: 106, close: 109 };

    // Index 8: Sell-side Liquidity Sweep L2 down to 98 (< 100)
    candles[8] = { timestamp: 80000, open: 101, high: 102, low: 98, close: 100 };

    // Index 11: Violent break closing above H1 (close = 112 > 110)
    candles[11] = { timestamp: 110000, open: 108, high: 113, low: 107, close: 112 };

    // Post-break candles (indices 12-15): remain above breaker zone [106, 110]
    candles[12] = { timestamp: 120000, open: 112, high: 114, low: 111, close: 113 };
    // Index 13: Retest of the Breaker Block zone [106, 110], low = 107 touches zone, close = 111 holds
    candles[13] = { timestamp: 130000, open: 113, high: 113, low: 107, close: 111 };
    candles[14] = { timestamp: 140000, open: 111, high: 115, low: 111, close: 114 };
    candles[15] = { timestamp: 150000, open: 114, high: 116, low: 113, close: 115 };

    const swings: SwingPoint[] = [
      { type: 'low', price: 100, formedAtIndex: 2, confirmedAtIndex: 4, timestamp: 20000 },
      { type: 'high', price: 110, formedAtIndex: 5, confirmedAtIndex: 7, timestamp: 50000 },
      { type: 'low', price: 98, formedAtIndex: 8, confirmedAtIndex: 10, timestamp: 80000 },
    ];

    const structureEvents: StructureEvent[] = [
      {
        type: 'BOS',
        direction: 'bullish',
        brokenSwing: swings[1], // H1 broken
        breakCandleIndex: 11,
        breakTimestamp: 110000,
        breakClosePrice: 112,
      },
    ];

    const breakers = detectBreakerBlocks(candles, swings, structureEvents, 15);

    expect(breakers).toHaveLength(1);
    const bb = breakers[0];
    expect(bb.direction).toBe('bullish');
    expect(bb.candleIndex).toBe(5);
    expect(bb.high).toBe(110);
    expect(bb.low).toBe(106);
    expect(bb.bodyHigh).toBe(109);
    expect(bb.bodyLow).toBe(107);
    expect(bb.sweptSwingPrice).toBe(100);
    expect(bb.sweptCandleIndex).toBe(8);
    expect(bb.sweepDepth).toBe(2);
    expect(bb.brokenAtIndex).toBe(11);
    expect(bb.testCount).toBe(1);
    expect(bb.mitigated).toBe(false);
    expect(bb.active).toBe(true);

    // Test helper functions
    expect(isPriceInBreakerZone(bb, 108)).toBe(true);
    expect(isPriceInBreakerZone(bb, 115)).toBe(false);

    const nearestSupport = findNearestBreakerBlock(breakers, 112, 'bullish');
    expect(nearestSupport).not.toBeNull();
    expect(nearestSupport?.high).toBe(110);
  });

  test('should detect Bearish Breaker Block when H1 is swept by H2 before L1 is broken downward', () => {
    const candles: Candle[] = [];
    for (let i = 0; i < 16; i++) {
      candles.push({
        timestamp: i * 60000,
        open: 195,
        high: 196,
        low: 194,
        close: 195,
      });
    }

    // Index 2: Swing High H1 at 200
    candles[2] = { timestamp: 20000, open: 197, high: 200, low: 196, close: 198 };

    // Index 5: Swing Low L1 at 190 (this will become the Bearish Breaker Block)
    candles[5] = { timestamp: 50000, open: 193, high: 194, low: 190, close: 191 };

    // Index 8: Buy-side Liquidity Sweep H2 up to 203 (> 200)
    candles[8] = { timestamp: 80000, open: 198, high: 203, low: 197, close: 201 };

    // Index 11: Violent break closing below L1 (close = 187 < 190)
    candles[11] = { timestamp: 110000, open: 191, high: 192, low: 186, close: 187 };

    // Post-break candles (indices 12-15): remain below breaker zone [190, 194]
    candles[12] = { timestamp: 120000, open: 187, high: 188, low: 185, close: 186 };
    // Index 13: Retest of the Bearish Breaker Block zone [190, 194], high = 193 touches resistance, close = 188 rejects
    candles[13] = { timestamp: 130000, open: 188, high: 193, low: 187, close: 188 };
    candles[14] = { timestamp: 140000, open: 188, high: 189, low: 184, close: 185 };
    candles[15] = { timestamp: 150000, open: 185, high: 186, low: 183, close: 184 };

    const swings: SwingPoint[] = [
      { type: 'high', price: 200, formedAtIndex: 2, confirmedAtIndex: 4, timestamp: 20000 },
      { type: 'low', price: 190, formedAtIndex: 5, confirmedAtIndex: 7, timestamp: 50000 },
      { type: 'high', price: 203, formedAtIndex: 8, confirmedAtIndex: 10, timestamp: 80000 },
    ];

    const structureEvents: StructureEvent[] = [
      {
        type: 'CHoCH',
        direction: 'bearish',
        brokenSwing: swings[1], // L1 broken
        breakCandleIndex: 11,
        breakTimestamp: 110000,
        breakClosePrice: 187,
      },
    ];

    const breakers = detectBreakerBlocks(candles, swings, structureEvents, 15);

    expect(breakers).toHaveLength(1);
    const bb = breakers[0];
    expect(bb.direction).toBe('bearish');
    expect(bb.candleIndex).toBe(5);
    expect(bb.high).toBe(194);
    expect(bb.low).toBe(190);
    expect(bb.sweptSwingPrice).toBe(200);
    expect(bb.sweptCandleIndex).toBe(8);
    expect(bb.sweepDepth).toBe(3);
    expect(bb.brokenAtIndex).toBe(11);
    expect(bb.testCount).toBe(1);
    expect(bb.mitigated).toBe(false);
    expect(bb.active).toBe(true);

    const nearestResistance = findNearestBreakerBlock(breakers, 188, 'bearish');
    expect(nearestResistance).not.toBeNull();
    expect(nearestResistance?.low).toBe(190);
  });

  test('should NOT detect Breaker Block if no liquidity sweep occurred before the break', () => {
    const candles: Candle[] = [];
    for (let i = 0; i < 16; i++) {
      candles.push({
        timestamp: i * 60000,
        open: 105,
        high: 106,
        low: 104,
        close: 105,
      });
    }

    // Index 2: L1 = 100
    candles[2] = { timestamp: 20000, open: 103, high: 104, low: 100, close: 102 };

    // Index 5: H1 = 110
    candles[5] = { timestamp: 50000, open: 107, high: 110, low: 106, close: 109 };

    // Index 8: Higher Low L2 = 103 (> 100, NOT a sweep!)
    candles[8] = { timestamp: 80000, open: 104, high: 105, low: 103, close: 104 };

    // Index 11: Break above H1
    candles[11] = { timestamp: 110000, open: 108, high: 113, low: 107, close: 112 };

    const swings: SwingPoint[] = [
      { type: 'low', price: 100, formedAtIndex: 2, confirmedAtIndex: 4, timestamp: 20000 },
      { type: 'high', price: 110, formedAtIndex: 5, confirmedAtIndex: 7, timestamp: 50000 },
      { type: 'low', price: 103, formedAtIndex: 8, confirmedAtIndex: 10, timestamp: 80000 },
    ];

    const structureEvents: StructureEvent[] = [
      {
        type: 'BOS',
        direction: 'bullish',
        brokenSwing: swings[1],
        breakCandleIndex: 11,
        breakTimestamp: 110000,
        breakClosePrice: 112,
      },
    ];

    const breakers = detectBreakerBlocks(candles, swings, structureEvents, 15);
    // Regular BOS without sweep is a trend continuation, NOT a Breaker Block
    expect(breakers).toHaveLength(0);
  });

  test('should mark Breaker Block as mitigated when a candle closes beyond the zone', () => {
    const candles: Candle[] = [];
    for (let i = 0; i < 16; i++) {
      candles.push({
        timestamp: i * 60000,
        open: 105,
        high: 106,
        low: 104,
        close: 105,
      });
    }

    candles[2] = { timestamp: 20000, open: 103, high: 104, low: 100, close: 102 };
    candles[5] = { timestamp: 50000, open: 107, high: 110, low: 106, close: 109 };
    candles[8] = { timestamp: 80000, open: 101, high: 102, low: 98, close: 100 };
    candles[11] = { timestamp: 110000, open: 108, high: 113, low: 107, close: 112 };

    // Index 13: Invalidation - candle closes below 106 (close = 103 < 106)
    candles[13] = { timestamp: 130000, open: 107, high: 108, low: 102, close: 103 };

    const swings: SwingPoint[] = [
      { type: 'low', price: 100, formedAtIndex: 2, confirmedAtIndex: 4, timestamp: 20000 },
      { type: 'high', price: 110, formedAtIndex: 5, confirmedAtIndex: 7, timestamp: 50000 },
      { type: 'low', price: 98, formedAtIndex: 8, confirmedAtIndex: 10, timestamp: 80000 },
    ];

    const structureEvents: StructureEvent[] = [
      {
        type: 'BOS',
        direction: 'bullish',
        brokenSwing: swings[1],
        breakCandleIndex: 11,
        breakTimestamp: 110000,
        breakClosePrice: 112,
      },
    ];

    const breakers = detectBreakerBlocks(candles, swings, structureEvents, 15);
    expect(breakers).toHaveLength(1);
    expect(breakers[0].mitigated).toBe(true);
    expect(breakers[0].active).toBe(false);

    const activeBreakers = findActiveBreakerBlocks(breakers);
    expect(activeBreakers).toHaveLength(0);
  });
});
