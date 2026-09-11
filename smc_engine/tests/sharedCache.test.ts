import * as fs from 'fs';
import * as path from 'path';
import { CandleStore } from '../server/candleStore';
import { pollAndProcess, setupFamilyGuard } from '../server/poller';
import { NotifiedStore } from '../server/notifiedStore';
import * as client from '../server/twelveDataClient';
import * as killzone from '../server/killzone';

jest.mock('../server/twelveDataClient');
jest.mock('../server/pipeline', () => ({
  runPipeline: jest.fn().mockReturnValue([]),
}));

describe('Shared Candle Cache & Smart Deduplication', () => {
  const testDir = path.join(__dirname, 'temp_shared_cache_test');
  let candleStore: CandleStore;
  let notifiedStore: NotifiedStore;

  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
    candleStore = new CandleStore(testDir);
    notifiedStore = new NotifiedStore(testDir);
    setupFamilyGuard.clear();
    jest.clearAllMocks();

    jest.spyOn(killzone, 'evaluateKillzoneFilter').mockReturnValue({
      active: true,
      reason: 'test_open',
      profile: 'PRODUCTION',
      filter: 'ACTIVE',
    });
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('CandleStore.isFresh', () => {
    it('returns false when candle file does not exist', () => {
      expect(candleStore.isFresh('EURUSD', '15m', 60_000)).toBe(false);
    });

    it('returns false when candle file exists but has fewer than minimum candles', () => {
      for (let i = 0; i < 5; i++) {
        candleStore.appendCandle('EURUSD', '15m', {
          timestamp: 1000 + i * 900_000,
          open: 1.1,
          high: 1.2,
          low: 1.0,
          close: 1.15,
        });
      }
      expect(candleStore.isFresh('EURUSD', '15m', 60_000, 20)).toBe(false);
    });

    it('returns true when candle file is fresh and has sufficient candles', () => {
      for (let i = 0; i < 25; i++) {
        candleStore.appendCandle('EURUSD', '15m', {
          timestamp: 1000 + i * 900_000,
          open: 1.1,
          high: 1.2,
          low: 1.0,
          close: 1.15,
        });
      }
      expect(candleStore.isFresh('EURUSD', '15m', 60_000, 20)).toBe(true);
    });

    it('returns false when candle file mtime is older than maxAgeMs', () => {
      for (let i = 0; i < 25; i++) {
        candleStore.appendCandle('EURUSD', '15m', {
          timestamp: 1000 + i * 900_000,
          open: 1.1,
          high: 1.2,
          low: 1.0,
          close: 1.15,
        });
      }
      expect(candleStore.isFresh('EURUSD', '15m', 0, 20)).toBe(false);
    });

    it('respects CANDLE_DATA_DIR environment variable when dataDir is omitted', () => {
      const customPath = path.join(testDir, 'custom_shared');
      const original = process.env.CANDLE_DATA_DIR;
      process.env.CANDLE_DATA_DIR = customPath;
      try {
        const store = new CandleStore();
        expect(store.getDataDir()).toBe(customPath);
      } finally {
        if (original === undefined) {
          delete process.env.CANDLE_DATA_DIR;
        } else {
          process.env.CANDLE_DATA_DIR = original;
        }
      }
    });
  });

  describe('pollAndProcess cache deduplication', () => {
    it('skips fetchCandles when shared cache is fresh', async () => {
      for (let i = 0; i < 25; i++) {
        candleStore.appendCandle('EURUSD', '15m', {
          timestamp: 1000 + i * 900_000,
          open: 1.1,
          high: 1.2,
          low: 1.0,
          close: 1.15,
        });
      }

      const fetchCandlesSpy = jest.spyOn(client, 'fetchCandles');
      const result = await pollAndProcess('EURUSD', '15m', candleStore, notifiedStore);

      expect(result.success).toBe(true);
      expect(result.fetchedCount).toBe(0);
      expect(fetchCandlesSpy).not.toHaveBeenCalled();
    });

    it('calls fetchCandles when cache is stale or missing', async () => {
      const mockCandles = [
        { timestamp: 1000, open: 1.1, high: 1.2, low: 1.0, close: 1.15 },
      ];
      const fetchCandlesSpy = jest.spyOn(client, 'fetchCandles').mockResolvedValue(mockCandles);

      const result = await pollAndProcess('GBPUSD', '15m', candleStore, notifiedStore);

      expect(result.success).toBe(true);
      expect(result.fetchedCount).toBe(1);
      expect(fetchCandlesSpy).toHaveBeenCalledTimes(1);
    });

    it('forces poll if FORCE_POLL=true even if cache is fresh', async () => {
      for (let i = 0; i < 25; i++) {
        candleStore.appendCandle('AUDUSD', '15m', {
          timestamp: 1000 + i * 900_000,
          open: 1.1,
          high: 1.2,
          low: 1.0,
          close: 1.15,
        });
      }

      const mockCandles = [
        { timestamp: 2000, open: 1.1, high: 1.2, low: 1.0, close: 1.15 },
      ];
      const fetchCandlesSpy = jest.spyOn(client, 'fetchCandles').mockResolvedValue(mockCandles);

      process.env.FORCE_POLL = 'true';
      try {
        const result = await pollAndProcess('AUDUSD', '15m', candleStore, notifiedStore);
        expect(result.success).toBe(true);
        expect(fetchCandlesSpy).toHaveBeenCalledTimes(1);
      } finally {
        delete process.env.FORCE_POLL;
      }
    });
  });
});