import { StoredCandle, Symbol, Timeframe } from './candleStore';
import { DeterministicProviderQueue, ProviderQueueMetrics } from './providerQueue';
import {
  ProviderNetworkError,
  ProviderRateLimitError,
  ProviderRequest,
  ProviderResponseError,
  ProviderResponseMetadata,
  ProviderSuccess,
  TWELVE_DATA_TIME_SERIES_ENDPOINT,
} from './providerTypes';

let globalQueue: DeterministicProviderQueue | null = null;

export async function fetchCandles(
  symbol: Symbol,
  timeframe: Timeframe,
  outputSize: number
): Promise<StoredCandle[]> {
  const result = await providerQueue().enqueue({
    endpoint: TWELVE_DATA_TIME_SERIES_ENDPOINT,
    symbol,
    timeframe,
    outputSize,
  });
  return result.candles;
}

export function getTwelveDataQueueMetrics(): ProviderQueueMetrics {
  return providerQueue().getMetrics();
}

export function resetTwelveDataProviderQueueForTests(): void {
  globalQueue = null;
}

export function getTwelveDataApiKeys(): string[] {
  const rawList = process.env.TWELVE_DATA_API_KEYS;
  if (rawList) {
    const split = rawList.split(',').map(k => k.trim()).filter(Boolean);
    if (split.length > 0) return split;
  }
  const keys: string[] = [];
  const main = process.env.TWELVE_DATA_API_KEY?.trim();
  if (main) keys.push(main);
  for (let i = 2; i <= 20; i++) {
    const extra = process.env[`TWELVE_DATA_API_KEY_${i}`]?.trim();
    if (extra && !keys.includes(extra)) {
      keys.push(extra);
    }
  }
  return keys;
}


function providerQueue(): DeterministicProviderQueue {
  if (!globalQueue) {
    const keys = getTwelveDataApiKeys();
    globalQueue = new DeterministicProviderQueue({
      transport: executeTwelveDataRequest,
      keyCount: Math.max(1, keys.length),
      creditsPerMinute: envInteger('TWELVE_DATA_CREDITS_PER_MINUTE', 8),
      safetyMargin: envInteger('TWELVE_DATA_RATE_LIMIT_SAFETY_MARGIN', 1),
      maxRetries: envInteger('TWELVE_DATA_MAX_RETRIES', 5),
      windowBufferMs: envInteger('TWELVE_DATA_RATE_LIMIT_WINDOW_BUFFER_MS', 1500),
    });
  }
  return globalQueue;
}

async function executeTwelveDataRequest(
  request: ProviderRequest,
  retryCount: number,
  keyIndex = 0
): Promise<ProviderSuccess> {
  const keys = getTwelveDataApiKeys();
  if (keys.length === 0) {
    throw new ProviderResponseError(
      'Twelve Data Client: missing TWELVE_DATA_API_KEY.',
      request,
      null,
      retryCount
    );
  }

  const apiKey = keys[keyIndex % keys.length];
  const mappedSymbol = mapSymbol(request.symbol);
  const mappedInterval = mapInterval(request.timeframe);
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(
    mappedSymbol
  )}&interval=${mappedInterval}&outputsize=${request.outputSize}&apikey=${apiKey}&timezone=UTC`;
  const requestTimeoutMs = envInteger('TWELVE_DATA_REQUEST_TIMEOUT_MS', 15_000);
  const startedAtMs = Date.now();
  const requestTimestamp = new Date(startedAtMs).toISOString();

  let response: Response;
  try {
    response = await fetchWithTimeout(url, requestTimeoutMs);

  } catch (cause) {
    const responseTimestamp = new Date().toISOString();
    const timeoutMessage = cause instanceof Error && cause.message.includes('timeout')
      ? ` Request timed out after ${requestTimeoutMs}ms.`
      : '';
    const error = new ProviderNetworkError(
      `Twelve Data network failure for ${request.symbol} ${request.timeframe}.${timeoutMessage}`,
      request,
      retryCount,
      cause
    );
    attachMetadata(error, metadataFrom(
      request,
      retryCount,
      requestTimestamp,
      responseTimestamp,
      startedAtMs,
      null,
      null,
      null
    ));
    throw error;
  }

  const responseTimestamp = new Date().toISOString();
  const creditsUsed = headerNumber(response.headers, 'api-credits-used');
  const creditsLeft = headerNumber(response.headers, 'api-credits-left');
  const metadata = metadataFrom(
    request,
    retryCount,
    requestTimestamp,
    responseTimestamp,
    startedAtMs,
    response.status,
    creditsUsed,
    creditsLeft
  );

  if (response.status === 429) {
    const responseBody = await safeResponseText(response);
    let detailedMessage = `Twelve Data rate limit reached for ${request.symbol} ${request.timeframe}.`;
    if (responseBody) {
      try {
        const parsed = JSON.parse(responseBody);
        if (parsed && typeof parsed.message === 'string') {
          detailedMessage = `Twelve Data: ${parsed.message}`;
        }
      } catch {
        detailedMessage = `Twelve Data rate limit: ${responseBody}`;
      }
    }
    const error = new ProviderRateLimitError(
      detailedMessage,
      request,
      retryCount,
      retryAfterMilliseconds(response.headers),
      creditsUsed,
      creditsLeft
    );
    attachMetadata(error, metadata);
    throw error;
  }

  if (!response.ok) {
    const responseBody = await safeResponseText(response);
    const error = new ProviderResponseError(
      `Twelve Data HTTP ${response.status} for ${request.symbol} ${request.timeframe}.`,
      request,
      response.status,
      retryCount,
      responseBody
    );
    attachMetadata(error, metadata);
    throw error;
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch (cause) {
    const error = new ProviderResponseError(
      `Twelve Data returned invalid JSON for ${request.symbol} ${request.timeframe}.`,
      request,
      response.status,
      retryCount,
      null,
      cause
    );
    attachMetadata(error, metadata);
    throw error;
  }

  if (!isProviderPayload(data) || data.status === 'error' || !Array.isArray(data.values)) {
    const message = isProviderPayload(data) && typeof data.message === 'string'
      ? data.message
      : 'missing values array';
    const error = new ProviderResponseError(
      `Twelve Data invalid response for ${request.symbol} ${request.timeframe}: ${message}.`,
      request,
      response.status,
      retryCount,
      JSON.stringify(data)
    );
    attachMetadata(error, metadata);
    throw error;
  }

  const candles: StoredCandle[] = [];
  for (const value of data.values) {
    if (!isCandlePayload(value)) {
      const error = new ProviderResponseError(
        `Twelve Data candle payload is invalid for ${request.symbol} ${request.timeframe}.`,
        request,
        response.status,
        retryCount,
        JSON.stringify(value)
      );
      attachMetadata(error, metadata);
      throw error;
    }
    candles.push({
      timestamp: new Date(`${value.datetime} UTC`).getTime(),
      open: Number(value.open),
      high: Number(value.high),
      low: Number(value.low),
      close: Number(value.close),
    });
  }
  candles.reverse();

  return { candles, metadata };
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  if (timeoutMs <= 0) {
    return fetch(url);
  }

  const controller = new AbortController();
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<Response>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      controller.abort();
      reject(new Error(`Twelve Data request timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      fetch(url, { signal: controller.signal }),
      timeout,
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

function metadataFrom(
  request: ProviderRequest,
  retryCount: number,
  requestTimestamp: string,
  responseTimestamp: string,
  startedAtMs: number,
  httpStatus: number | null,
  apiCreditsUsed: number | null,
  apiCreditsLeft: number | null
): ProviderResponseMetadata {
  return Object.freeze({
    requestTimestamp,
    responseTimestamp,
    latencyMs: Math.max(0, Date.now() - startedAtMs),
    endpoint: request.endpoint,
    symbol: request.symbol,
    timeframe: request.timeframe,
    httpStatus,
    retryCount,
    apiCreditsUsed,
    apiCreditsLeft,
  });
}

function attachMetadata(error: Error, metadata: ProviderResponseMetadata): void {
  Object.defineProperty(error, 'metadata', {
    value: metadata,
    enumerable: true,
    configurable: false,
    writable: false,
  });
}

function mapSymbol(symbol: Symbol): string {
  if (symbol === 'EURUSD') return 'EUR/USD';
  if (symbol === 'GBPUSD') return 'GBP/USD';
  if (symbol === 'AUDUSD') return 'AUD/USD';
  if (symbol === 'USDCAD') return 'USD/CAD';
  if (symbol === 'USDJPY') return 'USD/JPY';
  if (symbol === 'NZDUSD') return 'NZD/USD';
  if (symbol === 'USDCHF') return 'USD/CHF';
  if (symbol === 'EURJPY') return 'EUR/JPY';
  if (symbol === 'AUDCAD') return 'AUD/CAD';
  if (symbol === 'EURGBP') return 'EUR/GBP';
  if (symbol === 'GBPJPY') return 'GBP/JPY';
  if (symbol === 'EURCHF') return 'EUR/CHF';
  if (symbol === 'GBPCHF') return 'GBP/CHF';
  if (symbol === 'AUDCHF') return 'AUD/CHF';
  if (symbol === 'CADCHF') return 'CAD/CHF';
  if (symbol === 'NZDCHF') return 'NZD/CHF';
  if (symbol === 'CHFJPY') return 'CHF/JPY';
  if (symbol === 'NAS100') return 'QQQ';
  if (symbol === 'XAUUSD') return 'XAU/USD';
  if (symbol === 'BTCUSD') return 'BTC/USD';
  if (symbol === 'BTCEUR') return 'BTC/EUR';
  if (symbol === 'ETHUSD') return 'ETH/USD';
  if (symbol === 'ETHEUR') return 'ETH/EUR';
  if (symbol === 'LTCUSD') return 'LTC/USD';
  if (symbol === 'LTCEUR') return 'LTC/EUR';
  if (symbol === 'SOLUSD') return 'SOL/USD';
  return symbol;
}

function mapInterval(timeframe: Timeframe): string {
  if (timeframe === '1m') return '1min';
  if (timeframe === '15m') return '15min';
  return timeframe;
}

function envInteger(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) ? value : fallback;
}

function headerNumber(headers: Headers, name: string): number | null {
  const value = headers?.get?.(name);
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function retryAfterMilliseconds(headers: Headers): number | null {
  const value = headers?.get?.('retry-after');
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : null;
}

async function safeResponseText(response: Response): Promise<string | null> {
  try {
    return await response.text();
  } catch {
    return null;
  }
}

function isProviderPayload(value: unknown): value is {
  readonly status?: string;
  readonly message?: string;
  readonly values?: unknown[];
} {
  return typeof value === 'object' && value !== null;
}

function isCandlePayload(value: unknown): value is {
  readonly datetime: string;
  readonly open: string | number;
  readonly high: string | number;
  readonly low: string | number;
  readonly close: string | number;
} {
  if (typeof value !== 'object' || value === null) return false;
  const candle = value as Record<string, unknown>;
  return typeof candle.datetime === 'string' &&
    candle.open !== undefined &&
    candle.high !== undefined &&
    candle.low !== undefined &&
    candle.close !== undefined;
}
