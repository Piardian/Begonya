# RC-5.4 — NAS100 Visual Expansion

NAS100 is intentionally a visualization-only profile. It uses the
`PEPPERSTONE:NAS100` TradingView feed for 15M and 1H screenshots and does not
call TwelveData, `pollAndProcess`, Detection, Grade, Decision, Risk, or the
production signal counter.

Run the one-shot preview with `ENABLE_NAS100_VISUALIZATION=true npm run
nas100:visualization`. The default is disabled and rollback is therefore a
single environment flag change.

Because a visualization-only capture has no `SignalContext`, the production
overlay renderer is not invoked and the run reports `Overlay: FAILED` rather
than fabricating an overlay. This is an intentional safety boundary: overlay
success requires a real signal context and must not be inferred from a raw
TradingView screenshot.
