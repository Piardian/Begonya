# Signal Quality Engine

## Purpose

`SignalQualityEngine` is an observer-only layer for the Signal Quality Initiative.
It does not change detection, grading, candidate filtering, Telegram delivery, or rendering behavior.

Sprint 1 goal:

```text
Detection
↓
Candidate
↓
SignalQualityEngine
↓
SignalQualityResult
↓
Grade unchanged
↓
Telegram unchanged
```

The purpose is to start producing structured, reusable quality data before any production decision rules are changed.

## Feature flag

Pipeline integration is guarded by:

```text
ENABLE_SIGNAL_QUALITY_ENGINE=true
```

When the flag is disabled, candidates are emitted without `signalQualityResult`.
The runtime candidate shape remains unchanged.

## Determinism rule

`SignalQualityEngine` must be deterministic.

The same input must always produce the same output. The engine must not use:

- randomness
- `new Date()` / wall-clock time
- network calls
- external services
- filesystem state
- environment variables

Market context is derived from the supplied candle/candidate timestamp, not from current system time.

## Result contract

```ts
interface SignalQualityResult {
  version: 1;
  score: number;
  confidence: number;
  status: 'excellent' | 'good' | 'risky' | 'invalid';
  metrics: {
    barsSinceFormation: number;
    barsSinceBreak: number;
    distanceToPoiPips: number;
    poiRelation: 'inside' | 'above' | 'below';
    poiTestCount: number;
    isFresh: boolean;
    isNearPoi: boolean;
    invalidationRisk: 'low' | 'medium' | 'high';
  };
  marketContext: {
    session: 'asian' | 'london' | 'new_york' | 'overlap' | 'off_session';
    killzone: boolean;
    dayOfWeek: number;
    hourTR: number;
  };
  reasons: SignalQualityReason[];
  warnings: SignalQualityReason[];
}
```

`version` is mandatory so benchmark logs remain interpretable when SQI V2/V3 rules are introduced later.

## Reason contract

```ts
interface SignalQualityReason {
  code: string;
  severity: 'info' | 'warning' | 'critical';
  source: 'SignalQualityEngine';
  message: string;
  value?: number | string | boolean;
}
```

`source` is mandatory because the same reason shape can later be reused by:

- Benchmark Engine
- Outcome Engine
- Explainability Engine
- Learning Engine

## Sprint 1 non-goals

Sprint 1 must not:

- change scoring thresholds
- modify `GradeCalculator`
- filter candidates
- filter notifications
- expand Telegram formatting by default
- make entry decisions
- change Detection Engine behavior

## Acceptance criteria

- Existing signal generation remains unchanged.
- Telegram output remains unchanged unless explicitly extended behind a future flag.
- Every candidate can produce a `SignalQualityResult` when the feature flag is enabled.
- Flag disabled behavior remains backward compatible.
- `SignalQualityEngine` does not affect `GradeCalculator`.
- Output is deterministic.
- Result data is structured and reusable by benchmark/outcome/learning modules.
- Build passes.
- Tests pass.
