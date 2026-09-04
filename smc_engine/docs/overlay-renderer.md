# Overlay Rendering Engine

This module adds a second render stage after the TradingView screenshot is captured.

```text
Detection Engine
  -> TradingView Screenshot
  -> Overlay Renderer
  -> Annotated Screenshot
  -> Telegram
```

The renderer is independent from TradingView. It does not use Lightweight Charts primitives, internal APIs, DOM reads, or chart runtime coordinates.

## Feature Flag

The integration is controlled by:

```text
ENABLE_OVERLAY_RENDERER=true
```

When the flag is not set to `true`, the captured screenshot buffer is sent to Telegram unchanged.

## Coordinate Mapping

The renderer accepts explicit chart metadata:

```text
imageWidth
imageHeight
timeframe
firstVisibleLogical
lastVisibleLogical
visiblePriceRange
plotLeft
plotTop
plotWidth
plotHeight
devicePixelRatio
rightPriceScaleWidth
barSpacing
timeScaleWidth
```

Bar index to X:

```text
ratio = (index - firstVisibleLogical) / (lastVisibleLogical - firstVisibleLogical)
x = plotLeft + ratio * plotWidth
```

Price to Y:

```text
ratio = (price - visiblePriceRange.min) / (visiblePriceRange.max - visiblePriceRange.min)
y = plotTop + plotHeight - ratio * plotHeight
```

The renderer requires explicit plot and visible-range metadata. It does not infer the chart pane from the screenshot.

## First Version

Supported annotations:

- Order Block rectangle
- BOS arrow
- Simple label

Not included in the first version:

- FVG
- CHoCH
- Liquidity Sweep
- Premium/Discount Zone

## Current Limitation

The current TradingView screenshot is captured from an external widget and does not provide native visible-bar metadata. The adapter can derive a deterministic fallback contract from the stored 15m candle window, but precise visual alignment depends on screenshot capture producing this contract from the same chart state as the screenshot.
