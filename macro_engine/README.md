# Macro Multi-AGI Army: Institutional Macro Regime & Risk Engine

Macro regime and risk engine combining deterministic market/FRED metrics with LLM-based analysis. Deterministic metrics are authoritative for execution gates; LLM outputs are advisory explanations only.

## Architecture & Workflow

1. **Ingestion (`ingestion/`)**
   - Market data from the configured MT5/Yahoo path with fail-closed validation.
   - FRED observations with explicit current/prior observation dates and an explicit replay vintage end date.
   - High-impact economic calendar with fail-closed availability semantics.

2. **Deterministic preprocessing (`preprocessing/`)**
   - Yield-curve, real-yield, liquidity, credit, volatility and cross-asset metrics.
   - Explicit replay clock and explicit previous regime state.
   - Input range/anomaly checks, freshness checks and provenance metadata.
   - Return-based cross-asset correlation rather than price-level correlation.

3. **LLM analysis (`agents/`)**
   - Specialist and strategist models consume deterministic metrics.
   - Structured LLM output remains advisory. It does not authorize execution.

4. **Execution gate (`gateways/`)**
   - Gate precedence is deterministic: EVENT_FREEZE > SYSTEMIC_STRESS > BASE_BIAS.
   - Execution bridge accepts only `deterministic_metrics_only` gates and rejects stale/untrusted gate files.
   - Gate publication remains atomic so downstream execution never reads a partially written JSON file.

5. **Calibration and replay (`calibration/`, `tests/`)**
   - Surprise calibration uses provider-backed actual/consensus observations with provenance and point-in-time flags.
   - FRED replay requests are constrained to the replay vintage date to reduce revision leakage.
   - Calibration is split chronologically into calibration, validation and out-of-sample partitions.
   - Existing crisis fixtures are synthetic rule-execution fixtures, not provider-backed historical performance evidence.
   - No economic edge is claimed until a real historical dataset is loaded and evaluated out-of-sample.

## Setup & Quick Start

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Configure Environment
Copy `.env.example` to `.env` and provide the required API keys:
```bash
cp .env.example .env
```

### 3. Run Pipeline
```bash
python main.py
```

### 4. Run Tests
```bash
python -m unittest discover -s tests -p "test_*.py" -v
```

### 5. Collect Historical Surprise Observations
Trading Economics historical calendar data is used as the provider-backed source for calibration. The API provides historical actual and consensus forecast fields and documents point-in-time calendar data for backtesting. citeturn700684search0turn648268search0

Set `TRADING_ECONOMICS_API_KEY`, then run:
```bash
python -m calibration.collect_surprises --start 2015-01-01 --end 2025-12-31
```

The collector writes only rows containing numeric `actual` and `forecast` values and stores provider provenance, source URL, event timestamp and the point-in-time flag. It does not silently substitute the provider's proprietary `TEForecast` for the consensus `Forecast` field.

### 6. Fit Surprise Sigmas
Choose chronological cutoffs so the calibration period precedes validation, and validation precedes out-of-sample data:
```bash
python -m calibration.fit_sigmas \
  --calibration-end 2020-12-31 \
  --validation-end 2023-12-31 \
  --min-observations 30 \
  --required-indicator cpi \
  --required-indicator core_cpi \
  --required-indicator nfp \
  --required-indicator unemployment \
  --required-indicator pmi \
  --required-indicator gdp \
  --required-indicator retail_sales
```

The fitter refuses malformed rows, non-PIT rows, non-Trading-Economics rows, insufficient sample sizes, and missing empirical sigmas. The resulting JSON profile can be loaded into `MacroMetricsCalculator(surprise_sigmas=...)`; the built-in values remain explicitly labeled as uncalibrated compatibility defaults until such a profile is supplied.

The checked-in CSV is intentionally empty until provider-backed data is collected; no fabricated observations are committed.
