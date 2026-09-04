# EVR-1.0 — Signal Evidence Recorder

## Purpose

EVR-1.0 records deterministic engineering features for every approved trading signal before Telegram formatting.

It does not record raw detector traces. It records the normalized feature snapshot required for future statistical analysis, post-trade review, calibration studies, and Learning Engine datasets.

## Pipeline Position

```text
Market Data
↓
Detector
↓
Grade
↓
Decision / Risk
↓
Approved Signal
↓
Evidence Recorder
↓
Telegram Formatter
↓
Telegram Delivery
```

Evidence writing is asynchronous and non-blocking. Telegram delivery does not wait for disk writes. If evidence writing fails, the failure is logged and signal delivery continues.

## Storage Layout

```text
evidence/
  signals/
    signal-evidence.jsonl
  outcomes/
    outcome-evidence.jsonl
  archive/
    reserved for future compaction/export
```

The initial storage backend is JSONL. Each line is one immutable record. The store is intentionally abstracted so SQLite or another database can be added later without changing detector, grade, decision, risk, or Telegram behavior.

## Signal Evidence Schema

Each approved signal evidence record contains:

```text
evidenceSchemaVersion

metadata
  signalId
  timestamp
  recordedAt
  symbol
  direction
  timeframe
  engineVersion
  detectorVersion
  gradeVersion

htfContext
  bias4H
  bias1H
  pd4H
  pd1H
  pd15M

structure
  eventType
  eventTimestamp
  eventTimeframe
  structureScore

poi
  poiType
  timeframe
  zoneHigh
  zoneLow
  poiAgeMs
  poiTestCount

displacement
  displacementScore
  bodyPercentage
  range
  impulseDirection

sweep
  sweepDetected
  sweepDirection
  sweepQuality

model
  modelState
  admissionProfile

grade
  totalScore
  grade
  entryAllowed
  breakdown
  blockReasons

runtime
  executionEligibility
  decisionCalibration
  riskResult
```

## Completed Outcome Evidence

When a trade lifecycle is completed, the outcome is appended as a separate JSONL event keyed by the same `signalId`.

The original signal evidence is never overwritten.

```text
evidenceSchemaVersion
signalId
appendedAt

outcome
  type
  holdingTimeMs
  rrAchieved
  maximumFavorableExcursion
  maximumAdverseExcursion
  exitTimestamp
  exitReason
```

## Sample Signal Evidence

```json
{
  "evidenceSchemaVersion": 1,
  "metadata": {
    "signalId": "EURUSD_15m_OB_demo",
    "timestamp": 2000,
    "recordedAt": "1970-01-01T00:00:02.000Z",
    "symbol": "EURUSD",
    "direction": "long",
    "timeframe": "15m",
    "engineVersion": 1,
    "detectorVersion": 1,
    "gradeVersion": 1
  },
  "htfContext": {
    "bias4H": "bullish",
    "bias1H": "bullish",
    "pd4H": "discount",
    "pd1H": "discount",
    "pd15M": "discount"
  },
  "structure": {
    "eventType": "BOS",
    "eventTimestamp": 2000,
    "eventTimeframe": "15m",
    "structureScore": 2
  },
  "poi": {
    "poiType": "OB",
    "timeframe": "15m",
    "zoneHigh": 1.101,
    "zoneLow": 1.099,
    "poiAgeMs": 1000,
    "poiTestCount": 0
  },
  "displacement": {
    "displacementScore": 2,
    "bodyPercentage": 50,
    "range": 0.008,
    "impulseDirection": "bullish"
  },
  "sweep": {
    "sweepDetected": true,
    "sweepDirection": "long",
    "sweepQuality": "strong"
  },
  "model": {
    "modelState": "confirmed",
    "admissionProfile": "PRODUCTION"
  },
  "grade": {
    "totalScore": 9,
    "grade": "A+",
    "entryAllowed": true,
    "breakdown": {
      "htfBiasPD": 2,
      "displacement": 2,
      "structure": 2,
      "sweep": 2,
      "poiQuality": 1
    },
    "blockReasons": []
  },
  "runtime": {
    "executionEligibility": true,
    "decisionCalibration": {
      "decision": "ELIGIBLE",
      "reasonCode": "CONTEXT_POLICY_PASSED"
    },
    "riskResult": {
      "status": "ACCEPTED",
      "executionAllowed": true,
      "reasonCode": "POLICY_GATE_PASSED",
      "reasonMessage": "Risk policy accepted."
    }
  }
}
```

## Sample Completed Outcome Evidence

```json
{
  "evidenceSchemaVersion": 1,
  "signalId": "EURUSD_15m_OB_demo",
  "appendedAt": "1970-01-01T00:00:10.000Z",
  "outcome": {
    "type": "TP",
    "holdingTimeMs": 600000,
    "rrAchieved": 2,
    "maximumFavorableExcursion": 0.004,
    "maximumAdverseExcursion": 0.001,
    "exitTimestamp": 10000,
    "exitReason": "Target reached"
  }
}
```

## Architecture Boundaries

Evidence Collection:

- Reads already-produced signal, grade, decision, risk, and runtime outputs.
- Persists deterministic engineering features.
- Does not mutate the signal.
- Does not block Telegram.

Learning:

- Not implemented in this sprint.
- Future consumers may read evidence records.

Calibration:

- Not implemented in this sprint.
- No threshold, grade, decision, or risk behavior changes are made.

Inference:

- Not implemented in this sprint.
- Evidence never influences live signal generation.

## Guarantees

- Detector logic unchanged.
- Grade logic unchanged.
- Decision logic unchanged.
- Risk logic unchanged.
- Telegram format unchanged.
- Evidence schema is versioned.
- Evidence records are immutable.
- Outcome is append-only.
- Storage backend can be replaced later.
