import { StoredCandle, Symbol, Timeframe } from './candleStore';

export const TWELVE_DATA_TIME_SERIES_ENDPOINT = '/time_series';

export interface ProviderRequest {
  readonly endpoint: typeof TWELVE_DATA_TIME_SERIES_ENDPOINT;
  readonly symbol: Symbol;
  readonly timeframe: Timeframe;
  readonly outputSize: number;
}

export interface ProviderResponseMetadata {
  readonly requestTimestamp: string;
  readonly responseTimestamp: string;
  readonly latencyMs: number;
  readonly endpoint: string;
  readonly symbol: Symbol;
  readonly timeframe: Timeframe;
  readonly httpStatus: number | null;
  readonly retryCount: number;
  readonly apiCreditsUsed: number | null;
  readonly apiCreditsLeft: number | null;
}

export interface ProviderSuccess {
  readonly candles: StoredCandle[];
  readonly metadata: ProviderResponseMetadata;
}

export abstract class ProviderError extends Error {
  readonly endpoint: string;
  readonly symbol: Symbol;
  readonly timeframe: Timeframe;
  readonly httpStatus: number | null;
  readonly retryCount: number;

  protected constructor(
    name: string,
    message: string,
    request: ProviderRequest,
    httpStatus: number | null,
    retryCount: number,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = name;
    this.endpoint = request.endpoint;
    this.symbol = request.symbol;
    this.timeframe = request.timeframe;
    this.httpStatus = httpStatus;
    this.retryCount = retryCount;
  }
}

export class ProviderRateLimitError extends ProviderError {
  readonly retryAfterMs: number | null;
  readonly apiCreditsUsed: number | null;
  readonly apiCreditsLeft: number | null;

  constructor(
    message: string,
    request: ProviderRequest,
    retryCount: number,
    retryAfterMs: number | null,
    apiCreditsUsed: number | null,
    apiCreditsLeft: number | null
  ) {
    super('ProviderRateLimitError', message, request, 429, retryCount);
    this.retryAfterMs = retryAfterMs;
    this.apiCreditsUsed = apiCreditsUsed;
    this.apiCreditsLeft = apiCreditsLeft;
  }
}

export class ProviderNetworkError extends ProviderError {
  constructor(message: string, request: ProviderRequest, retryCount: number, cause?: unknown) {
    super(
      'ProviderNetworkError',
      message,
      request,
      null,
      retryCount,
      cause === undefined ? undefined : { cause }
    );
  }
}

export class ProviderResponseError extends ProviderError {
  readonly responseBody: string | null;

  constructor(
    message: string,
    request: ProviderRequest,
    httpStatus: number | null,
    retryCount: number,
    responseBody: string | null = null,
    cause?: unknown
  ) {
    super(
      'ProviderResponseError',
      message,
      request,
      httpStatus,
      retryCount,
      cause === undefined ? undefined : { cause }
    );
    this.responseBody = responseBody;
  }
}

