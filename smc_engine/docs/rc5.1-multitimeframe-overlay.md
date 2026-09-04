# RC-5.1 — Multi-Timeframe Review Overlay

`ENABLE_RC5_1_MTF=true` enables three timestamp-aligned captures (4H, 1H, 15M) for each notification. Candidate POI/event indexes are mapped to the nearest candle in each timeframe before rendering, so 15M indexes are never reused directly on higher-timeframe charts.

The default flag is off, preserving the existing single-photo Telegram behavior. The detailed Telegram text remains unchanged. This feature only changes chart-photo production.

The overlay contains entry-zone boundaries, current price, Premium/Discount/equilibrium, POI box, and structure label where the source candidate provides the required data. Stop-loss and take-profit are not invented because they are not modeled in the candidate contract.
