# Macro Multi-AGI Army: Institutional Macro Regime & Risk Engine

Macro regime and risk engine combining deterministic market/FRED metrics with LLM-based analysis. Deterministic metrics are authoritative for execution gates; LLM outputs are advisory explanations only.

## Architecture & Workflow

1. **Ingestion (`ingestion/`)**
   - Market data from the configured MT5/Yahoo path with fail-closed validation.
   - FRED observations with explicit current/prior observation dates and no synthetic live baselines.
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
   - Surprise calibration infrastructure uses real provider-backed observations and chronological calibration/validation/out-of-sample splits.
   - The existing crisis fixtures are synthetic rule-execution fixtures, not provider-backed historical performance evidence.
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

### 5. Calibrate Surprise Sigmas
Populate `calibration/surprise_observations.csv` with provider-backed actual/forecast observations and then use `calibration/surprise_sigma.py` to generate a fitted profile. The module will not fabricate a sigma when the observation count is insufficient.
