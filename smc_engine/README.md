# ChecklistTrigger

**Event-Driven Market Structure Analysis & Alerting Engine**

ChecklistTrigger is a TypeScript/Node.js market-analysis system that ingests multi-timeframe candle data, evaluates market-structure conditions, scores potential setups, and delivers candidate alerts through Telegram.

The project is structured as an event-driven data pipeline rather than a single indicator script.

## Architecture

```text
Twelve Data API
      ↓
Candle Poller
      ↓
Candle Store
      ↓
Market Structure Engine
      ↓
POI / Model Evaluation
      ↓
Grade Engine
      ↓
Candidate Opportunity
      ↓
Telegram Delivery
```

## Analysis pipeline

The current analysis layer includes:

- Swing detection
- Break of Structure (BOS)
- Change of Character (CHoCH)
- Range detection
- Liquidity sweep detection
- Order Blocks
- Fair Value Gaps (FVG)
- Premium / Discount classification
- Displacement quality
- POI test tracking
- Model determination
- Grade calculation

The system is currently focused on EUR/USD and GBP/USD workflows.

## Evidence & validation

The repository contains dedicated tests for analysis and runtime components, including benchmark-oriented evaluation, decision/execution flows, evidence recording, and displacement-quality scoring.

The benchmark layer is designed to work with validated datasets and track measurable outcomes such as coverage, evaluation duration, MFE/MAE, and deterministic dataset fingerprints. These are evaluation mechanisms, not claims of trading profitability or predictive accuracy.

## Runtime architecture

```text
server/
├── twelveDataClient.ts   Market-data client
├── poller.ts             Scheduled acquisition + orchestration
└── index.ts              Runtime startup + health endpoint

src/                       Analysis and domain logic
tests/                     Automated validation
```

The runtime uses different polling intervals for 15m, 1h, and 4h data and performs a controlled cold-start sequence to avoid unnecessary API pressure.

## Demo / operational entry points

The repository includes preview and visualization entry points for inspecting system behavior, in addition to the normal test/build workflow.

```bash
npm install
npm test
npm run build
```

The service exposes a `GET /health` endpoint for runtime health checks.

## Technical design

The pipeline deliberately separates:

1. Data acquisition
2. Candle persistence
3. Market-structure detection
4. POI/model evaluation
5. Candidate grading
6. Notification delivery

This separation makes individual stages easier to test and allows runtime concerns such as polling cadence, API pressure, persistence, health checks, and notification delivery to be handled independently from analysis logic.

## Testing & CI

The repository contains automated tests and a GitHub Actions workflow that runs the test and build pipeline on repository changes.

The test suite is organized around domain behavior rather than only end-to-end smoke tests, allowing individual analysis and execution components to be evaluated independently.

## Limitations

- Market data depends on the upstream Twelve Data API
- Analysis outputs are experimental
- Benchmark metrics describe the evaluated datasets and scenarios only
- Setup grades are not guarantees of market outcomes
- The project is not a live execution or profitability system
- Results should not be interpreted as financial advice

## Roadmap

- Broader instrument and timeframe support
- More comprehensive historical validation
- Expanded event and candidate lifecycle tracking
- Improved observability and reporting
- Additional automated regression scenarios

## Technology

TypeScript · Node.js · Jest · REST APIs · Market Data · Event-Driven Systems · Telegram · Automated Testing

## Status

**Active development / research prototype**

ChecklistTrigger is an engineering project for deterministic market-data analysis and event-driven alerting.
