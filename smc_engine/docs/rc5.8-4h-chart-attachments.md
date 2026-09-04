# RC-5.8 — 4H Chart Attachment Support

Production MTF delivery sends attachments in deterministic order `15M → 1H →
4H` for EURUSD, GBPUSD, AUDUSD, and USDCAD. The 4H chart reuses the existing
capture and overlay renderer and consumes only stored HTF candles; it does not
run Detection, Grade, Decision, or Risk.

4H capture/upload is non-blocking. A 4H generation or Telegram failure is
logged and counted, but does not invalidate an already successful notification.
