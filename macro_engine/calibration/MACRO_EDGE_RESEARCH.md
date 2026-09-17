# Macro Edge Research v1

This is a research-only extension of the existing Begonya macro engine. It does not modify production regime logic, LLM prompts, deterministic execution gates, or SMC behavior.

## Purpose

Measure whether macro economic surprises contain incremental directional information for XAUUSD and EURUSD, and whether the relationship becomes stronger or weaker after observing cross-asset market repricing.

## Research flow

```text
Economic release
      ↓
Point-in-time surprise normalization
      ↓
Event clustering
      ↓
Cross-asset repricing
(DXY + optional US02Y/US10Y proxies + XAUUSD/EURUSD)
      ↓
Forward returns at exact horizons
      ↓
Gross + cost-adjusted edge statistics
      ↓
OOS validation
```

## Current design

The research layer uses expanding pre-year MAD and STD surprise scales. Simultaneous releases are represented as one event timestamp instead of multiple independent observations. Forward outcomes use the existing exact-horizon bar mapping from `calibration.event_horizon`.

Positive normalized surprise means a stronger-US-macro impulse using the existing `INDICATOR_DIRECTIONS` convention. Research-only expected asset direction is explicit:

- DXY: positive
- EURUSD: negative
- XAUUSD: negative
- US02Y: positive
- US10Y: positive

These directions are hypotheses, not production rules. They must survive out-of-sample testing before any production use.

## Example

```bash
python -m calibration.macro_edge_research \
  --timeframe M5 \
  --symbols XAUUSD EURUSD DXY \
  --years 2019 2020 2021 2022 2023 2024 2025
```

If the MT5 environment exposes usable intraday broker symbols for US02Y/US10Y, they can be added explicitly to the `--symbols` list. They are not required for the first XAUUSD/EURUSD research pass.

The output is `macro_edge_research.json` unless another output path is provided.

## Promotion rule

No research result is automatically promoted to a production gate. A candidate relationship must first pass chronological OOS validation, transaction-cost checks, robustness tests, and finally an incremental test against the existing SMC + Macro baseline.
