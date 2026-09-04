jest.mock('../server/twelveDataClient');
jest.mock('../server/pipeline');
jest.mock('../server/telegramSender');
jest.mock('../server/tvScreenshot');
jest.mock('../server/tvChartCapture');

import { pollAndProcess, setupFamilyGuard } from '../server/poller';
import * as client from '../server/twelveDataClient';
import * as pipelineModule from '../server/pipeline';
import * as telegramSender from '../server/telegramSender';
import * as tvChartCapture from '../server/tvChartCapture';
import { CandleStore } from '../server/candleStore';
import { NotifiedStore } from '../server/notifiedStore';
import * as path from 'path';
import * as fs from 'fs';

import * as killzone from '../server/killzone';

describe('Poller', () => {
  const testDir = path.join(__dirname, 'temp_poller_test');
  let candleStore: CandleStore;
  let notifiedStore: NotifiedStore;

  const originalEnv = process.env;

  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    candleStore = new CandleStore(testDir);
    notifiedStore = new NotifiedStore(testDir);
    setupFamilyGuard.clear();

    jest.resetAllMocks();
    jest.spyOn(killzone, 'evaluateKillzoneFilter').mockReturnValue({
      active: true,
      reason: 'test_open',
      profile: 'PRODUCTION',
      filter: 'ACTIVE',
    });
    jest.spyOn(tvChartCapture, 'captureLightweightChartWithMetadata').mockResolvedValue({
      screenshotPng: Buffer.from('chart'),
      metadata: {
        imageWidth: 1000,
        imageHeight: 600,
        firstVisibleBar: 0,
        lastVisibleBar: 0,
        visibleBars: 1,
        minPrice: 1,
        maxPrice: 2,
        timeframe: '15m',
      } as any,
    });
    process.env = { ...originalEnv };
    process.env.ENABLE_KILLZONE = 'false';
    delete process.env.ENABLE_SIGNAL_INTELLIGENCE_SNAPSHOTS;
    delete process.env.ENABLE_SIGNAL_QUALITY_ENGINE;
    delete process.env.ENABLE_PVP_KILLZONE_BYPASS;
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    process.env = originalEnv;
  });

  test('should trigger cold start with outputsize 100 when candleStore is empty', async () => {
    const mockFetch = jest.spyOn(client, 'fetchCandles').mockResolvedValue([
      { timestamp: 1000, open: 1, high: 2, low: 0.5, close: 1.5 },
    ]);

    await pollAndProcess('EURUSD', '15m', candleStore, notifiedStore);
    expect(mockFetch).toHaveBeenCalledWith('EURUSD', '15m', 100);

    const stored = candleStore.getCandles('EURUSD', '15m');
    expect(stored).toHaveLength(1);
  });

  test('should trigger update with outputsize 10 when candleStore has candles', async () => {
    candleStore.appendCandle('EURUSD', '15m', { timestamp: 500, open: 1, high: 2, low: 0.5, close: 1.5 });
    const mockFetch = jest.spyOn(client, 'fetchCandles').mockResolvedValue([
      { timestamp: 1000, open: 1, high: 2, low: 0.5, close: 1.5 },
    ]);

    await pollAndProcess('EURUSD', '15m', candleStore, notifiedStore);
    expect(mockFetch).toHaveBeenCalledWith('EURUSD', '15m', 10);
  });

  test('should execute runPipeline and send message on 15m, but not on 1h or 4h', async () => {
    jest.spyOn(client, 'fetchCandles').mockResolvedValue([
      { timestamp: 1717290000000, open: 1.056, high: 1.059, low: 1.052, close: 1.0585 },
      { timestamp: 1717300000000, open: 1.058, high: 1.06, low: 1.057, close: 1.0585 },
    ]);

    const mockPipeline = jest.spyOn(pipelineModule, 'runPipeline').mockReturnValue([
      {
        symbol: 'EURUSD',
        tradeDirection: 'long',
        poiType: 'OB',
        poi: {
          direction: 'bullish',
          candleIndex: 10,
          high: 1.059,
          low: 1.057,
          formedAtIndex: 10,
          relatedEvent: {
            type: 'BOS',
            direction: 'bullish',
            brokenSwing: {} as any,
            breakCandleIndex: 12,
            breakTimestamp: 1717300000000,
            breakClosePrice: 1.056,
          },
        },
        gradeResult: {
          totalScore: 9,
          grade: 'A+',
          entryAllowed: true,
          blockReasons: [],
          breakdown: { htfBiasPD: 2, displacement: 2, structure: 2, sweep: 2, poiQuality: 1 },
        },
        uniqueKey: 'test_key',
        currentPrice: 1.0585,
        poiFormedTimestamp: 1717290000000,
        bias4H: 'bullish',
        bias1H: 'bullish',
        poiTestCount: 0,
        pd4H: 'discount',
        pd1H: 'discount',
      },
    ]);

    const mockSender = jest.spyOn(telegramSender, 'sendTelegramMessage').mockResolvedValue(true);
    const mockPhotoSender = jest.spyOn(telegramSender, 'sendTelegramPhoto').mockResolvedValue(true);

    // Call 15m -> should trigger pipeline and telegram
    await pollAndProcess('EURUSD', '15m', candleStore, notifiedStore);
    expect(mockPipeline).toHaveBeenCalledTimes(1);
    expect(mockSender).toHaveBeenCalledTimes(1);
    expect(tvChartCapture.captureLightweightChartWithMetadata).toHaveBeenCalledTimes(2);
    expect(mockPhotoSender).toHaveBeenCalledTimes(2);

    // A repeated detector result must not produce a second durable notification.
    await pollAndProcess('EURUSD', '15m', candleStore, notifiedStore);
    expect(mockSender).toHaveBeenCalledTimes(1);
    expect(mockPhotoSender).toHaveBeenCalledTimes(2);

    mockPipeline.mockClear();
    mockSender.mockClear();

    // Call 1h -> should not trigger pipeline
    await pollAndProcess('EURUSD', '1h', candleStore, notifiedStore);
    expect(mockPipeline).not.toHaveBeenCalled();
    expect(mockSender).not.toHaveBeenCalled();
  });

  test('should skip pipeline but still fetch candles when outside killzone', async () => {
    process.env.ENABLE_KILLZONE = 'true';
    jest.spyOn(killzone, 'evaluateKillzoneFilter').mockReturnValue({
      active: false,
      reason: 'outside_trading_hours',
      profile: 'PRODUCTION',
      filter: 'ACTIVE',
    });

    const mockFetch = jest.spyOn(client, 'fetchCandles').mockResolvedValue([
      { timestamp: 1000, open: 1, high: 2, low: 0.5, close: 1.5 },
    ]);
    const mockPipeline = jest.spyOn(pipelineModule, 'runPipeline');

    await pollAndProcess('EURUSD', '15m', candleStore, notifiedStore);

    expect(mockFetch).toHaveBeenCalled();
    expect(mockPipeline).not.toHaveBeenCalled();
  });

  test('should evaluate outside-killzone candles in PVP bypass mode', async () => {
    process.env.ENABLE_KILLZONE = 'true';
    process.env.ENABLE_PVP_KILLZONE_BYPASS = 'true';

    jest.spyOn(killzone, 'evaluateKillzoneFilter').mockReturnValue({
      active: true,
      reason: 'pvp_killzone_bypass',
      profile: 'PVP_ACCELERATION',
      filter: 'BYPASSED',
    });
    jest.spyOn(client, 'fetchCandles').mockResolvedValue([
      { timestamp: 1000, open: 1, high: 2, low: 0.5, close: 1.5 },
    ]);
    const mockPipeline = jest.spyOn(pipelineModule, 'runPipeline').mockReturnValue([]);

    await pollAndProcess('EURUSD', '15m', candleStore, notifiedStore);

    expect(mockPipeline).toHaveBeenCalledTimes(1);
  });

  test('should send text telegram message even if chart rendering throws an error', async () => {
    jest.spyOn(client, 'fetchCandles').mockResolvedValue([
      { timestamp: 1717290000000, open: 1.056, high: 1.059, low: 1.052, close: 1.0585 },
      { timestamp: 1717300000000, open: 1.058, high: 1.06, low: 1.057, close: 1.0585 },
    ]);

    const mockPipeline = jest.spyOn(pipelineModule, 'runPipeline').mockReturnValue([
      {
        symbol: 'EURUSD',
        tradeDirection: 'long',
        poiType: 'OB',
        poi: {
          direction: 'bullish',
          candleIndex: 10,
          high: 1.059,
          low: 1.057,
          formedAtIndex: 10,
          relatedEvent: {
            type: 'BOS',
            direction: 'bullish',
            brokenSwing: {} as any,
            breakCandleIndex: 12,
            breakTimestamp: 1717300000000,
            breakClosePrice: 1.056,
          },
        },
        gradeResult: {
          totalScore: 9,
          grade: 'A+',
          entryAllowed: true,
          blockReasons: [],
          breakdown: { htfBiasPD: 2, displacement: 2, structure: 2, sweep: 2, poiQuality: 1 },
        },
        uniqueKey: 'test_key',
        currentPrice: 1.0585,
        poiFormedTimestamp: 1717290000000,
        bias4H: 'bullish',
        bias1H: 'bullish',
        poiTestCount: 0,
        pd4H: 'discount',
        pd1H: 'discount',
      },
    ]);

    const mockSender = jest.spyOn(telegramSender, 'sendTelegramMessage').mockResolvedValue(true);
    const mockPhotoSender = jest.spyOn(telegramSender, 'sendTelegramPhoto').mockRejectedValue(new Error('Chart crash'));

    // This should resolve successfully without throwing
    await expect(pollAndProcess('EURUSD', '15m', candleStore, notifiedStore)).resolves.not.toThrow();

    expect(mockSender).toHaveBeenCalledTimes(1);
    expect(mockPhotoSender).toHaveBeenCalledTimes(2);
  });

  test('should generate native 1m execution screenshot in MTF delivery without changing approval flow', async () => {
    process.env.ENABLE_RC5_1_MTF = 'true';
    process.env.ENABLE_OVERLAY_RENDERER = 'false';

    const candidate: any = {
      symbol: 'EURUSD',
      tradeDirection: 'long',
      poiType: 'OB',
      poi: {
        direction: 'bullish',
        candleIndex: 10,
        high: 1.059,
        low: 1.057,
        formedAtIndex: 10,
        relatedEvent: {
          type: 'BOS',
          direction: 'bullish',
          brokenSwing: {} as any,
          breakCandleIndex: 12,
          breakTimestamp: 1717300000000,
          breakClosePrice: 1.056,
        },
      },
      gradeResult: {
        totalScore: 9,
        grade: 'A+',
        entryAllowed: true,
        blockReasons: [],
        breakdown: { htfBiasPD: 2, displacement: 2, structure: 2, sweep: 2, poiQuality: 1 },
      },
      uniqueKey: 'test_key_mtf_1m',
      currentPrice: 1.0585,
      poiFormedTimestamp: 1717290000000,
      bias4H: 'bullish',
      bias1H: 'bullish',
      poiTestCount: 0,
      pd4H: 'discount',
      pd1H: 'discount',
    };

    const mockFetch = jest.spyOn(client, 'fetchCandles')
      .mockResolvedValueOnce([
        { timestamp: 1717290000000, open: 1.056, high: 1.059, low: 1.052, close: 1.0585 },
        { timestamp: 1717300000000, open: 1.058, high: 1.06, low: 1.057, close: 1.0585 },
      ])
      .mockResolvedValueOnce([
        { timestamp: 1717299940000, open: 1.0581, high: 1.0588, low: 1.0579, close: 1.0584 },
        { timestamp: 1717300000000, open: 1.0584, high: 1.0589, low: 1.0582, close: 1.0585 },
      ]);

    jest.spyOn(pipelineModule, 'runPipeline').mockReturnValue([candidate]);
    jest.spyOn(telegramSender, 'sendTelegramMessage').mockResolvedValue(true);
    const mockPhotoSender = jest.spyOn(telegramSender, 'sendTelegramPhoto').mockResolvedValue(true);
    const mockMtfCapture = jest.spyOn(tvChartCapture, 'captureMultiTimeframeCharts').mockResolvedValue([
      {
        timeframe: '1m',
        candidate,
        chart: {
          screenshotPng: Buffer.from('one-minute-chart'),
          metadata: { imageWidth: 1000, imageHeight: 600, timeframe: '1m' } as any,
        },
      },
      {
        timeframe: '15m',
        candidate,
        chart: {
          screenshotPng: Buffer.from('fifteen-minute-chart'),
          metadata: { imageWidth: 1000, imageHeight: 600, timeframe: '15m' } as any,
        },
      },
    ]);

    await pollAndProcess('EURUSD', '15m', candleStore, notifiedStore);

    expect(mockFetch).toHaveBeenCalledWith('EURUSD', '1m', 200);
    expect(mockMtfCapture).toHaveBeenCalledWith(
      expect.objectContaining({ '1m': expect.any(Array), '15m': expect.any(Array) }),
      candidate,
      1000,
      600,
      100,
      1,
      expect.arrayContaining(['1m', '15m', '1h'])
    );
    expect(mockPhotoSender).toHaveBeenCalledTimes(2);
    expect(mockPhotoSender.mock.calls[0][1]).toContain('1M');
  });

  test('should block notification when signal current price does not match chart last close', async () => {
    jest.spyOn(client, 'fetchCandles').mockResolvedValue([
      { timestamp: 1717290000000, open: 1.143, high: 1.144, low: 1.142, close: 1.1435 },
      { timestamp: 1717300000000, open: 1.1435, high: 1.1442, low: 1.143, close: 1.14384 },
    ]);

    jest.spyOn(pipelineModule, 'runPipeline').mockReturnValue([
      {
        symbol: 'EURUSD',
        tradeDirection: 'long',
        poiType: 'OB',
        poi: {
          direction: 'bullish',
          candleIndex: 0,
          high: 1.0514,
          low: 1.0504,
          formedAtIndex: 0,
          relatedEvent: {
            type: 'BOS',
            direction: 'bullish',
            brokenSwing: {} as any,
            breakCandleIndex: 1,
            breakTimestamp: 1717300000000,
            breakClosePrice: 1.056,
          },
        },
        gradeResult: {
          totalScore: 9,
          grade: 'A+',
          entryAllowed: true,
          blockReasons: [],
          breakdown: { htfBiasPD: 2, displacement: 2, structure: 2, sweep: 2, poiQuality: 1 },
        },
        uniqueKey: 'mismatched_market_state',
        currentPrice: 1.0496,
        poiFormedTimestamp: 1717290000000,
        bias4H: 'bullish',
        bias1H: 'bullish',
        poiTestCount: 0,
        pd4H: 'discount',
        pd1H: 'discount',
      },
    ]);

    const mockSender = jest.spyOn(telegramSender, 'sendTelegramMessage').mockResolvedValue(true);
    const mockPhotoSender = jest.spyOn(telegramSender, 'sendTelegramPhoto').mockResolvedValue(true);

    await expect(pollAndProcess('EURUSD', '15m', candleStore, notifiedStore)).resolves.not.toThrow();

    expect(mockSender).not.toHaveBeenCalled();
    expect(mockPhotoSender).not.toHaveBeenCalled();
    expect(tvChartCapture.captureLightweightChartWithMetadata).not.toHaveBeenCalled();
    expect(notifiedStore.hasBeenNotified('mismatched_market_state')).toBe(false);
  });

  test('should block telegram notification when decision calibration filters a weak context', async () => {
    jest.spyOn(client, 'fetchCandles').mockResolvedValue([
      { timestamp: 1717290000000, open: 1.056, high: 1.059, low: 1.052, close: 1.0585 },
      { timestamp: 1717300000000, open: 1.058, high: 1.06, low: 1.057, close: 1.0585 },
    ]);

    jest.spyOn(pipelineModule, 'runPipeline').mockReturnValue([
      {
        symbol: 'EURUSD',
        tradeDirection: 'long',
        poiType: 'OB',
        poi: {
          direction: 'bullish',
          candleIndex: 10,
          high: 1.055,
          low: 1.053,
          formedAtIndex: 10,
          relatedEvent: {
            type: 'BOS',
            direction: 'bullish',
            brokenSwing: {} as any,
            breakCandleIndex: 12,
            breakTimestamp: 1717300000000,
            breakClosePrice: 1.056,
          },
        },
        gradeResult: {
          totalScore: 9,
          grade: 'A+',
          entryAllowed: true,
          blockReasons: [],
          breakdown: { htfBiasPD: 2, displacement: 2, structure: 2, sweep: 2, poiQuality: 1 },
        },
        uniqueKey: 'filtered_context',
        currentPrice: 1.0585,
        poiFormedTimestamp: 1717290000000,
        bias4H: 'bullish',
        bias1H: 'bullish',
        poiTestCount: 0,
        pd4H: 'premium',
        pd1H: 'discount',
      },
    ]);

    const mockSender = jest.spyOn(telegramSender, 'sendTelegramMessage').mockResolvedValue(true);
    const mockPhotoSender = jest.spyOn(telegramSender, 'sendTelegramPhoto').mockResolvedValue(true);

    await expect(pollAndProcess('EURUSD', '15m', candleStore, notifiedStore)).resolves.not.toThrow();

    expect(mockSender).not.toHaveBeenCalled();
    expect(mockPhotoSender).not.toHaveBeenCalled();
    expect(tvChartCapture.captureLightweightChartWithMetadata).not.toHaveBeenCalled();
    expect(notifiedStore.hasBeenNotified('filtered_context')).toBe(false);
  });

  test('should catch exceptions and not crash on fetchCandles failures', async () => {
    jest.spyOn(client, 'fetchCandles').mockRejectedValue(new Error('API Down'));
    await expect(pollAndProcess('EURUSD', '15m', candleStore, notifiedStore)).resolves.not.toThrow();
  });
});
