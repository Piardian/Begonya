# EXC-1.0 — 1M Execution Context Screenshot

## Purpose

EXC-1.0 adds native 1-minute execution screenshots as a presentation-only artifact.

The 1M timeframe is not used for:

- detection
- grading
- decision
- planning
- runtime execution
- risk evaluation
- signal generation

It exists only to help the trader visually inspect the execution area after a signal has already passed the existing production pipeline.

## Architecture Overview

```text
15M Detection Pipeline
        ↓
Decision / Risk
        ↓
Telegram Message
        ↓
1M Candle Fetch
        ↓
1M Lightweight Chart Capture
        ↓
Existing Overlay Renderer
        ↓
Telegram Photo Attachment
```

## Native 1M Support

The internal timeframe model now supports:

```text
1m
15m
1h
4h
```

TwelveData mapping:

```text
1m  → 1min
15m → 15min
1h  → 1h
4h  → 4h
```

## Screenshot Generation Flow

For every approved signal, when multi-timeframe visualization is enabled:

```text
Signal approved
        ↓
Telegram text message delivered
        ↓
1M candles loaded on demand
        ↓
Existing 15M detector output mapped onto nearest 1M candles
        ↓
1M chart rendered
        ↓
Existing overlay renderer annotates execution context
        ↓
Telegram photo attached
```

The 1M screenshot is delivered before higher timeframe screenshots:

```text
1M
15M
1H
4H if ENABLE_4H_ATTACHMENT=true
```

## Annotation Rules

The 1M chart renders only existing signal metadata:

- Entry zone
- Current price
- Order Block or FVG
- BOS / CHoCH event marker
- Direction / grade label
- Premium / Discount context from existing overlay metadata

The 1M chart does not calculate new 1M structures.

## Failure Policy

If 1M candles or screenshots cannot be generated:

- failure is logged
- screenshot telemetry is recorded
- normal signal delivery continues
- grading is not changed
- risk is not changed
- notification lifecycle is not cancelled

## Example Telegram Output

```text
SECTION 1 — TRADE SUMMARY
Pair          : EURUSD
Direction     : BUY
Grade         : A+
Score         : 9/9
Entry Zone    : 1.05040 - 1.05140
Status        : Waiting Retest

[Telegram attachment 1] RC-5.1 1M — EURUSD
[Telegram attachment 2] RC-5.1 15M — EURUSD
[Telegram attachment 3] RC-5.1 1H — EURUSD
[Telegram attachment 4] RC-5.1 4H — EURUSD, if enabled
```

## Regression Guarantee

EXC-1.0 does not modify detector, grade, decision, risk, execution, or formatter behavior.

The 1M screenshot is a visual artifact only.
