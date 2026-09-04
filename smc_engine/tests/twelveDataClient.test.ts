import {
  fetchCandles,
  resetTwelveDataProviderQueueForTests,
} from '../server/twelveDataClient';
import {
  ProviderNetworkError,
  ProviderResponseError,
} from '../server/providerTypes';

describe('Twelve Data Client', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      TWELVE_DATA_API_KEY: 'mock_key',
      TWELVE_DATA_CREDITS_PER_MINUTE: '1000',
      TWELVE_DATA_RATE_LIMIT_SAFETY_MARGIN: '0',
      TWELVE_DATA_REQUEST_TIMEOUT_MS: '1000',
    };
    resetTwelveDataProviderQueueForTests();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('should return a typed response error if TWELVE_DATA_API_KEY is missing', async () => {
    delete process.env.TWELVE_DATA_API_KEY;
    const mockFetch = jest.fn();
    global.fetch = mockFetch;

    await expect(fetchCandles('EURUSD', '15m', 10)).rejects.toBeInstanceOf(ProviderResponseError);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('should retrieve, parse, and reverse candles on success response', async () => {
    const mockResponse = {
      status: 'ok',
      values: [
        { datetime: '2026-07-02 09:15:00', open: '1.0500', high: '1.0510', low: '1.0490', close: '1.0505' }, // newest (index 0)
        { datetime: '2026-07-02 09:00:00', open: '1.0400', high: '1.0410', low: '1.0390', close: '1.0405' }, // oldest (index 1)
      ],
    };

    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });
    global.fetch = mockFetch;

    const res = await fetchCandles('EURUSD', '15m', 2);
    expect(res).toHaveLength(2);
    // Oldest should be first (index 0) due to reverse()
    expect(res[0].timestamp).toBe(new Date('2026-07-02 09:00:00 UTC').getTime());
    expect(res[0].close).toBe(1.0405);
    expect(res[1].timestamp).toBe(new Date('2026-07-02 09:15:00 UTC').getTime());
    expect(res[1].close).toBe(1.0505);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('https://api.twelvedata.com/time_series?symbol=EUR%2FUSD&interval=15min&outputsize=2'),
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  test('should map native 1m timeframe to TwelveData 1min interval', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'ok',
        values: [
          { datetime: '2026-07-02 09:01:00', open: '1.0500', high: '1.0510', low: '1.0490', close: '1.0505' },
        ],
      }),
    });
    global.fetch = mockFetch;

    const res = await fetchCandles('EURUSD', '1m', 1);

    expect(res).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('interval=1min'),
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  test('should throw typed response errors on HTTP error or API error status', async () => {
    const mockFetchHTTPError = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
    });
    global.fetch = mockFetchHTTPError;

    await expect(fetchCandles('EURUSD', '15m', 10)).rejects.toBeInstanceOf(ProviderResponseError);

    const mockFetchAPIError = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'error', message: 'Invalid API key' }),
    });
    global.fetch = mockFetchAPIError;

    await expect(fetchCandles('EURUSD', '15m', 10)).rejects.toBeInstanceOf(ProviderResponseError);
  });

  test('should throw a typed network error on network rejection', async () => {
    const mockFetch = jest.fn().mockRejectedValue(new Error('Network error'));
    global.fetch = mockFetch;

    await expect(fetchCandles('EURUSD', '15m', 10)).rejects.toBeInstanceOf(ProviderNetworkError);
  });

  test('should throw a typed network error if provider request times out', async () => {
    process.env.TWELVE_DATA_REQUEST_TIMEOUT_MS = '1';
    const mockFetch = jest.fn().mockImplementation((_url, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    }));
    global.fetch = mockFetch;

    await expect(fetchCandles('EURUSD', '15m', 10)).rejects.toBeInstanceOf(ProviderNetworkError);
  });
});
