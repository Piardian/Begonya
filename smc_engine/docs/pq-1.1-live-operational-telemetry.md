# PQ-1.1 — Live Operational Telemetry Qualification

Status: IMPLEMENTED  
Date: 2026-07-24  
Scope: Optional production telemetry instrumentation

## Mission

PQ-1.1 instruments the production runtime to collect real operational evidence.

It does not change strategy behavior.

## Telemetry Architecture

```text
Production Runtime
  ↓
Poller Telemetry
  ├─ polling.jsonl
  ├─ pipeline.jsonl
  └─ screenshot.jsonl

Telegram Sender
  ↓
telegram.jsonl

Runtime Monitor
  ↓
runtime.jsonl

Daily Reporter
  ↓
daily-report-YYYY-MM-DD.md
```

## Configuration

Telemetry is optional and disabled unless explicitly enabled.

| Variable | Purpose |
| --- | --- |
| `ENABLE_TELEMETRY=true` | Enables telemetry JSONL writes. |
| `ENABLE_RUNTIME_MONITOR=true` | Enables periodic memory/CPU/event-loop telemetry. |
| `ENABLE_LATENCY_METRICS=false` | Optional switch to disable latency metrics. Default is enabled when telemetry is enabled. |
| `ENABLE_DAILY_REPORT=true` | Enables recurring daily report generation. |
| `TELEMETRY_DIRECTORY=telemetry` | Output directory for JSONL and reports. |
| `REPORT_INTERVAL_MS=86400000` | Daily report interval. |
| `RUNTIME_MONITOR_INTERVAL_MS=60000` | Runtime monitor interval. |
| `TELEMETRY_PIPELINE_LATENCY_PASS_MS` | Configurable pipeline latency threshold. |
| `TELEMETRY_TELEGRAM_SUCCESS_RATE` | Configurable Telegram success threshold. |
| `TELEMETRY_SCREENSHOT_SUCCESS_RATE` | Configurable screenshot success threshold. |
| `TELEMETRY_POLLING_SUCCESS_RATE` | Configurable polling uptime threshold. |

Thresholds are read from configuration. If they are not configured, the daily report returns `PASS WITH LIMITATIONS` instead of inventing production criteria.

## Collected Evidence

### Pipeline Latency

Written to:

```text
telemetry/pipeline.jsonl
```

Fields:

- detection start;
- detection end;
- detection time;
- grade time;
- decision time;
- execution eligibility time;
- formatter time;
- screenshot time;
- Telegram send time;
- total pipeline time;
- execution status;
- risk status;
- notification delivery result.

Note: grade timing is currently recorded as `null` because Grade is executed inside the existing detector pipeline. PQ-1.1 does not split detector internals to avoid behavior changes.

### Telegram Delivery

Written to:

```text
telemetry/telegram.jsonl
```

Fields:

- send request timestamp;
- Telegram response time;
- success;
- retry count;
- failure reason.

### Screenshot Telemetry

Written to:

```text
telemetry/screenshot.jsonl
```

Fields:

- chart loading time;
- screenshot generation time;
- upload time;
- fallback usage;
- 1M availability;
- 15M fallback frequency;
- success/failure reason.

### Runtime Resource Monitoring

Written to:

```text
telemetry/runtime.jsonl
```

Fields:

- memory RSS;
- heap total;
- heap used;
- external memory;
- CPU user/system usage;
- event loop delay mean/max;
- poll counters.

### Polling Stability

Written to:

```text
telemetry/polling.jsonl
```

Fields:

- poll count;
- successful polls;
- failed polls;
- consecutive failures;
- average poll duration;
- longest poll duration;
- fetched candles.

## Daily Qualification Summary

Generated as:

```text
telemetry/daily-report-YYYY-MM-DD.md
```

The report includes:

- total signals;
- average/max pipeline latency;
- Telegram success rate;
- screenshot success rate;
- polling success rate;
- memory statistics;
- CPU statistics;
- poll stability;
- threshold status;
- qualification verdict.

## Behavior Safety

PQ-1.1 does not change:

- detector logic;
- grade engine;
- decision engine;
- planning;
- runtime behavior;
- risk engine;
- signal generation;
- Telegram message content;
- overlay rendering.

All telemetry writes are side-channel observations.

If telemetry is disabled, the runtime behaves as before.

## Regression Summary

Required regression checks:

- build passes;
- existing tests pass;
- telemetry disabled by default;
- JSONL files are created only when `ENABLE_TELEMETRY=true`;
- daily report generation is optional;
- no trading decision reads telemetry.

## Acceptance Verdict

PQ-1.1 is accepted when:

- telemetry files are generated under `TELEMETRY_DIRECTORY`;
- daily report can be generated;
- build passes;
- full test suite passes;
- no behavioral regression is detected.
