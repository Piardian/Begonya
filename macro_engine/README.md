# Macro Multi-AGI Army: Institutional Macro Regime & Risk Engine

Institutional Quantitative Macro Regime & Risk Engine powered by a multi-agent hierarchy of Google Gemini models with deterministic mathematical and econometrical fallbacks.

## Architecture & Workflow

1. **Ingestion Layer (`ingestion/`):**
   - Direct MT5 Zero-Latency Live Feed (`mt5_market_data.py`) with fallback to Yahoo Finance (`market_data.py`).
   - Federal Reserve Economic Data (`fred_macro_data.py`) with direct FRED API & public fallback scrapers.
   - High-Impact Economic Calendar (`economic_calendar.py`) tracking NFP, CPI, FOMC rate decisions.

2. **Preprocessing & Econometrics (`preprocessing/`):**
   - Term structure analysis (Yield Curve Spread 10Y - 2Y, 20-day momentum Spread_20D).
   - Dynamic 60-day percentiles for VIX, Credit Spread (HY OAS), and Financial Conditions (NFCI).
   - Real yields via TIPS (DFII10) and Transatlantic Policy Divergence (US10Y - DE10Y).
   - Commodity terms-of-trade shock filters (Brent, Copper/Gold ratio).

3. **Multi-Agent Orchestrator (`agents/` & `graph/`):**
   - **Agent 1 (Macro Analyst):** Rates, yield curve, labor market Z-scores, economic regime classification.
   - **Agent 2 (Market Cross-Asset Analyst):** DXY, commodities, equities, crypto decoupling, cross-asset correlations.
   - **Agent 3 (Chief Macro Strategist):** Synthesis, regime determination, asset biases (EURUSD, XAUUSD, BTC, SPX), and risk scaling.
   - **Model Cascading:** Seamless automatic fallback across Gemini Flash models.
   - **Deterministic Fallback Engine:** 100% offline mathematical rule engine if LLM connectivity is disrupted.

4. **Gateways & Execution (`gateways/` & `daemon/`):**
   - Atomic lock-free `macro_bias_gate.json` publishing with regime hysteresis (preventing whipsaws).
   - Event-driven background scheduler (`macro_scheduler.py`) triggering on daily D1 close and T+180s post high-impact releases.
   - Direct bridge integration with algorithmic trading systems (e.g., MetaTrader 5).

5. **Historical Crisis Verification (`tests/`):**
   - Validated against historical market stress events: October 2023 Supply Shock, March 2023 SVB Run, March 2020 COVID Dash for Cash.

## Setup & Quick Start

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Configure Environment
Copy `.env.example` to `.env` and provide your Google Gemini API keys:
```bash
cp .env.example .env
```

### 3. Run Pipeline
To execute a single full analysis run:
```bash
python main.py
```

To run historical crisis replay tests:
```bash
python tests/historical_replay.py
```

To run the background event-driven daemon:
```bash
python daemon/macro_scheduler.py
```
