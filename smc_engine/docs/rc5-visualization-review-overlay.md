# RC-5 — TradingView Visualization & Review Overlay

The review overlay remains isolated from detection, grading, decision, risk, and outcome code.

The existing capture path uses Lightweight Charts public coordinates from `TV_CHART_METADATA`. The renderer now adds:

- a dashed current-price reference line;
- a very low-opacity Premium/Discount background split at equilibrium;
- existing Order Block/FVG boxes and BOS/CHoCH labels.

Entry, stop, and target lines are intentionally rendered only when those levels are present in the candidate contract. The current candidate contract exposes a POI zone and current price, but does not expose modeled TP or SL values; the renderer does not invent them.

The current production notification path captures the 15M review chart. 4H and 1H capture support remains a separate capture concern because their candle indexes and POI timestamps must be mapped before annotations can be applied safely.

No trading decision or signal-generation behavior is changed by this overlay work.
