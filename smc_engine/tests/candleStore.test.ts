import * as fs from 'fs';
import * as path from 'path';
import { CandleStore, StoredCandle } from '../server/candleStore';

describe('Candle Store', () => {
  const testDir = path.join(__dirname, 'temp_candle_store_test');

  beforeEach(() => {
    // Clean directory before each test
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    // Final cleanup
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  test('should return empty array if data file is missing (no exceptions)', () => {
    const store = new CandleStore(testDir);
    const candles = store.getCandles('EURUSD', '15m');
    expect(candles).toEqual([]);
  });

  test('should append new candles and retrieve them in order', () => {
    const store = new CandleStore(testDir);
    const c1: StoredCandle = { timestamp: 1000, open: 1.0500, high: 1.0510, low: 1.0490, close: 1.0505 };
    const c2: StoredCandle = { timestamp: 2000, open: 1.0505, high: 1.0520, low: 1.0500, close: 1.0515 };

    store.appendCandle('EURUSD', '15m', c1);
    store.appendCandle('EURUSD', '15m', c2);

    const candles = store.getCandles('EURUSD', '15m');
    expect(candles).toHaveLength(2);
    expect(candles[0]).toEqual(c1);
    expect(candles[1]).toEqual(c2);
  });

  test('should overwrite (update) last candle if timestamp matches', () => {
    const store = new CandleStore(testDir);
    const c1: StoredCandle = { timestamp: 1000, open: 1.0500, high: 1.0510, low: 1.0490, close: 1.0505 };
    const c2: StoredCandle = { timestamp: 1000, open: 1.0500, high: 1.0515, low: 1.0490, close: 1.0512 }; // updated wick/close

    store.appendCandle('EURUSD', '15m', c1);
    store.appendCandle('EURUSD', '15m', c2);

    const candles = store.getCandles('EURUSD', '15m');
    expect(candles).toHaveLength(1);
    expect(candles[0]).toEqual(c2);
  });

  test('should ignore older candles completely', () => {
    const store = new CandleStore(testDir);
    const c1: StoredCandle = { timestamp: 2000, open: 1.0500, high: 1.0510, low: 1.0490, close: 1.0505 };
    const c2: StoredCandle = { timestamp: 1000, open: 1.0400, high: 1.0410, low: 1.0390, close: 1.0405 }; // older

    store.appendCandle('EURUSD', '15m', c1);
    store.appendCandle('EURUSD', '15m', c2);

    const candles = store.getCandles('EURUSD', '15m');
    expect(candles).toHaveLength(1);
    expect(candles[0]).toEqual(c1);
  });

  test('should prune older candles when size exceeds 500 limit', () => {
    const store = new CandleStore(testDir);
    
    // Add 501 candles
    for (let i = 0; i < 501; i++) {
      const c: StoredCandle = {
        timestamp: 1000 * i,
        open: 1.0500,
        high: 1.0510,
        low: 1.0490,
        close: 1.0500,
      };
      store.appendCandle('EURUSD', '15m', c);
    }

    const candles = store.getCandles('EURUSD', '15m');
    expect(candles).toHaveLength(500);
    // Oldest candle at timestamp 0 should have been pruned
    expect(candles[0].timestamp).toBe(1000);
    // Newest candle should be at timestamp 500000
    expect(candles[499].timestamp).toBe(500000);
  });
});
