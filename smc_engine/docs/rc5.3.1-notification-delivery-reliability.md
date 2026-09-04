# RC-5.3.1 — Notification Delivery Reliability

## Root cause

The pipeline marked a candidate as notified during detection, before Telegram delivery. A failed send therefore permanently suppressed future attempts.

## Lifecycle

Before:

`Detection → mark notified → Telegram attempt`

After:

`Detection → mark pending → Telegram attempt → API success → mark notified`

On failure:

`Telegram failure → queue retains pending ownership → bounded retry → terminal failure clears pending`

Current durable queue behavior:

`Telegram/data failure → bounded exponential retry → success or terminal failure`

- Default maximum delivery attempts: `3`.
- Default retry delays: `5s`, then `10s`, capped at `60s`.
- A persisted `DISPATCHING` item is recovered as `RATE_LIMIT_RETRY` after restart.
- Pending ownership stays with the queue during retry and is cleared on terminal failure.
- Telegram requests use a bounded timeout so one stalled request cannot block the worker indefinitely.

The in-memory pending state prevents duplicate work during the same process while the durable notified file is written only after a successful message response.

## Metrics

The poller emits delivery success rate, failure count and pending notification counts. Detection, grade, decision, risk and message format are unchanged.
