# TDQ-1.0 — Deterministic Provider Queue & Rate Limiter

## Scope

TDQ-1.0 changes only Twelve Data request orchestration. Detector, Grade,
Decision, Risk, Evidence, Telegram formatting, signal scoring, symbols, and
timeframes are unchanged.

## Architecture

### Before

```text
Scheduler / signal delivery
          |
          v
     fetchCandles
          |
          v
   Twelve Data HTTP
```

Each timer could call the provider concurrently. HTTP failures were converted
to empty candle arrays, HTTP 429 was not retried, and provider credit metadata
was discarded.

### After

```text
Scheduler / signal delivery / future manual refresh
                       |
                       v
                  fetchCandles
                       |
                       v
          Global deterministic queue
                       |
                       v
       Credit limiter (concurrency = 1)
                       |
                       v
        Bounded deterministic retry layer
                       |
                       v
             Twelve Data transport
                       |
              +--------+--------+
              |                 |
              v                 v
       typed candles       typed provider error
              |
              v
      provider + queue telemetry
```

## Layer responsibilities

### Public client

`fetchCandles(symbol, timeframe, outputSize)` is the only application entry
point. It enqueues a request and returns candles only after a typed successful
provider result. It never converts a provider failure into `[]`.

### Deterministic global queue

There is one process-global queue. Jobs that are waiting together are ordered
by:

1. `15m`
2. `1h`
3. `4h`
4. `1m` presentation

Within a timeframe, symbols use the stable order:

1. `EURUSD`
2. `GBPUSD`
3. `AUDUSD`
4. `USDCAD`

Jobs with the same timeframe and symbol retain FIFO sequence order. The active
job is never pre-empted, so retry order remains deterministic.

### Credit limiter

The limiter uses fixed UTC minute windows and permits:

```text
usable credits = TWELVE_DATA_CREDITS_PER_MINUTE
               - TWELVE_DATA_RATE_LIMIT_SAFETY_MARGIN
```

The defaults are 8 provider credits, a safety margin of 1, and therefore 7
intentional requests per minute. Concurrency is always one. When the usable
budget is exhausted, the active queue waits for the next minute boundary plus
a fixed buffer. No random jitter is used.

### Retry layer

Only `ProviderRateLimitError` is retried automatically. The active job keeps
its queue position, waits until the next provider window (or longer when
`Retry-After` requires it), and retries up to
`TWELVE_DATA_MAX_RETRIES`. Exhaustion returns the typed error to the poller.

Network and invalid-response failures are explicit and fail the poll without
mutating candle state.

### Typed failures

- `ProviderRateLimitError`: HTTP 429, credit metadata, deterministic retry.
- `ProviderNetworkError`: DNS, connection, or fetch rejection.
- `ProviderResponseError`: missing credentials, non-429 HTTP errors, invalid
  JSON, provider error payloads, missing values, or malformed candles.

### Telemetry

When `ENABLE_TELEMETRY=true`:

- `telemetry/provider.jsonl` records every provider attempt.
- `telemetry/provider-queue.jsonl` records queue transitions and metrics.
- `telemetry/polling.jsonl` marks exhausted provider failures as failed polls.

Provider attempt format:

```json
{
  "type": "provider",
  "provider": "TWELVE_DATA",
  "requestTimestamp": "2026-07-24T12:00:00.100Z",
  "responseTimestamp": "2026-07-24T12:00:00.280Z",
  "latencyMs": 180,
  "endpoint": "/time_series",
  "symbol": "EURUSD",
  "timeframe": "15m",
  "httpStatus": 200,
  "retryCount": 0,
  "apiCreditsUsed": 1,
  "apiCreditsLeft": 7,
  "success": true,
  "errorType": null,
  "errorMessage": null
}
```

Queue log example:

```json
{
  "type": "provider_queue",
  "provider": "TWELVE_DATA",
  "event": "STARTED",
  "jobId": 42,
  "endpoint": "/time_series",
  "symbol": "EURUSD",
  "timeframe": "15m",
  "jobRetryCount": 0,
  "queueLength": 8,
  "waitingJobs": 7,
  "completedJobs": 41,
  "retryCount": 0,
  "failedJobs": 0
}
```

Retry log example:

```json
{
  "type": "provider_queue",
  "provider": "TWELVE_DATA",
  "event": "RETRY_WAIT",
  "jobId": 42,
  "endpoint": "/time_series",
  "symbol": "EURUSD",
  "timeframe": "15m",
  "jobRetryCount": 1,
  "queueLength": 8,
  "waitingJobs": 7,
  "completedJobs": 41,
  "retryCount": 1,
  "failedJobs": 0
}
```

Live queue metrics are available read-only at:

```text
GET /provider/metrics
```

The response includes queue length, active request, waiting jobs, completed
jobs, total retries, and failed jobs.

## Configuration

```dotenv
ENABLE_TELEMETRY=true
TELEMETRY_DIRECTORY=telemetry
TWELVE_DATA_CREDITS_PER_MINUTE=8
TWELVE_DATA_RATE_LIMIT_SAFETY_MARGIN=1
TWELVE_DATA_MAX_RETRIES=2
TWELVE_DATA_RATE_LIMIT_WINDOW_BUFFER_MS=250
```

Configuration is read once when the process-global queue is first created.
Changing it requires a process restart.

