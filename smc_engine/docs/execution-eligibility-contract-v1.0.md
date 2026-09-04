# Execution Eligibility Contract v1.0

Status: DRAFT FOR REVIEW  
Scope: Detector output + Grade output + runtime context + Risk result  
Out of scope: market structure detection, score calculation, Telegram formatting, broker execution

## 1. Responsibility Definition

Execution Eligibility is the deterministic authority that answers one question:

```text
Can this graded signal be considered tradable by the runtime?
```

It does not discover market structure. It does not calculate grade. It does not create orders. It does not send Telegram messages.

The production responsibility chain is:

```text
Detector
  ↓
Grade
  ↓
Execution Eligibility
  ↓
Signal Delivery
  ↓
Formatter
  ↓
Execution / Notification
```

Layer responsibilities:

| Layer | Responsibility | Must not do |
| --- | --- | --- |
| Detector | Produce candidate setup facts: symbol, direction, POI, BOS/CHoCH, sweep, P/D context | Decide tradability |
| Grade | Score candidate quality and expose grade breakdown/block reasons | Override eligibility |
| Execution Eligibility | Evaluate whether a graded candidate may proceed | Recalculate grade or mutate detector output |
| Signal Delivery | Deliver already-eligible signals idempotently | Re-decide eligibility |
| Formatter | Present eligibility explanation | Change eligibility status |
| Execution | Consume eligible output only | Recreate detector/grade/eligibility logic |

## 2. Gate Definitions

Every gate must produce a deterministic checklist item with:

```text
gateCode
classification
status
source
humanExplanation
```

Allowed checklist statuses:

```text
PASS
FAIL
WAITING
NOT_REQUIRED
```

Gate classifications:

```text
REQUIRED
OPTIONAL
FUTURE
OUT_OF_SCOPE
```

### Current gate table

| Gate | Classification | Current source | Contract behavior |
| --- | --- | --- | --- |
| Minimum Grade | REQUIRED | Grade result / decision calibration | Production requires A or A+. PVP acceleration may admit B+ with score >= 3 as a validation profile only. |
| Grade Block Reasons | REQUIRED | Grade result `blockReasons` | Any hard grade block reason fails eligibility. |
| Displacement | REQUIRED | Grade breakdown `displacement` | Eligibility reads score only. It must not recalculate displacement. Strong score passes; weak score may wait or block by profile. |
| HTF Bias | REQUIRED | 4H/1H bias from detector/context | 4H and 1H conflict cannot be silently eligible in production. |
| Premium / Discount | REQUIRED | 4H/1H/15M P/D from detector/context | Direction must be compatible with P/D policy. Production treats 4H mismatch as hard failure; 1H mismatch is warning/waiting unless policy changes. |
| Order Block / FVG POI | REQUIRED | Detector POI + POI test count | POI can be evaluated only as provided. Eligibility does not select a different origin candle. |
| Retest / POI test count | REQUIRED | `poiTestCount` | 3+ tests block. 2 tests wait/warn. 0-1 tests pass. |
| Sweep / Model confirmation | REQUIRED | Grade breakdown `sweep` | Eligibility consumes the sweep score and reason. It must not run a second sweep detector. |
| Structure Confirmation | REQUIRED | Grade breakdown `structure` | Eligibility consumes the structure score and reason. It must not run BOS/CHoCH detection. |
| Risk Validation | REQUIRED | RiskEvaluationResult | Final tradability requires policy-level risk status `ACCEPTED`. `REJECTED` rejects; `SKIPPED` waits or rejects according to policy. |
| Manual Confirmation | OPTIONAL | Manual/runtime policy | If enabled, signal can be `WAITING_MANUAL_CONFIRMATION`. It is not an automatic broker permission. |
| Session Filter | OPTIONAL | Runtime/killzone policy | If enabled, outside-session signals become waiting/blocked by explicit reason. Killzone bypass is a separate runtime profile. |
| Spread Filter | FUTURE | Future market microstructure source | Not active in v1.0. Must not be inferred from candles. |
| News Filter | FUTURE | Future calendar source | Not active in v1.0. Must not be simulated. |
| Broker Status | OUT_OF_SCOPE | Broker adapter | Eligibility v1.0 is brokerless. |
| Position / Margin / Lot / PnL | OUT_OF_SCOPE | Future execution/risk layers | Eligibility v1.0 never calculates these. |

## 3. Grade Independence

Execution Eligibility must treat Grade output as immutable input.

It may read:

```text
grade
score
entryAllowed
blockReasons
breakdown.htfBiasPD
breakdown.displacement
breakdown.structure
breakdown.sweep
breakdown.poiQuality
```

It must not:

```text
modify grade
modify score
modify blockReasons
recalculate any grade component
promote B+ to A
demote A+ to A
change Detector output
```

Important distinction:

```text
Grade = quality score
Execution Eligibility = tradability gate
```

A high grade can still be blocked. A low grade can be observed in PVP but must not be treated as production-tradable unless the active eligibility profile explicitly allows it.

## 4. Status Model

Execution Eligibility v1.0 has exactly four public statuses:

```text
ELIGIBLE
WAITING
BLOCKED
REJECTED
```

Status definitions:

| Status | Meaning | Terminal? | Example |
| --- | --- | --- | --- |
| ELIGIBLE | All required gates passed for the active profile and risk is accepted | No | A+ short, 4H premium, risk accepted |
| WAITING | Signal is not invalid, but an explicit required condition is not complete | No | Waiting retest, HTF conflict, manual confirmation pending |
| BLOCKED | A hard eligibility gate failed before final risk acceptance | Yes for current market snapshot | Minimum grade failed, 4H P/D mismatch in production |
| REJECTED | Final risk or explicit invalidation rejected the signal | Yes | Risk rejected, simulation rejected, invalidated POI |

Mapping from current decision calibration:

| Current status | Contract status |
| --- | --- |
| `ELIGIBLE` + Risk `ACCEPTED` | `ELIGIBLE` |
| `WAIT` | `WAITING` |
| `LOW_CONFIDENCE` | `WAITING` |
| `FILTERED` | `BLOCKED` |
| `NOT_ELIGIBLE` | `BLOCKED` |
| Risk `REJECTED` | `REJECTED` |
| Risk `SKIPPED` | `WAITING` or `REJECTED` by risk policy |

## 5. Waiting Policy

Waiting is allowed only with explicit reason codes. Generic waiting is forbidden.

Required waiting fields:

```text
waitingCode
humanExplanation
requiredCondition
sourceGate
```

Allowed v1.0 waiting reasons:

| Code | Meaning | Resolution |
| --- | --- | --- |
| `WAITING_RETEST` | Price has not returned to POI/entry zone | Re-evaluate on next candle/current price update |
| `WAITING_HTF_ALIGNMENT` | 4H/1H context conflicts or is not clear enough | Re-evaluate when HTF context changes |
| `WAITING_POI_QUALITY` | POI has warning-level retest count | Wait for cleaner setup |
| `WAITING_MANUAL_CONFIRMATION` | Manual confirmation gate is enabled | Human confirms or rejects |
| `WAITING_SESSION` | Session filter is enabled and current session is not valid | Re-evaluate in valid session |
| `WAITING_RISK_VALIDATION` | Risk result is not available yet | Run risk evaluation |
| `LOW_CONFIDENCE_CONTEXT` | No hard failure, but one or more warning gates are present | Re-evaluate or hold for review |

Waiting must never be used to hide a failed hard gate.

## 6. Blocking Policy

Blocked signals must include:

```text
blockCode
humanExplanation
suggestedResolution
sourceGate
```

Allowed v1.0 block codes:

| Code | Source | Human explanation |
| --- | --- | --- |
| `MINIMUM_GRADE_FAILED` | Minimum Grade | Production requires the configured minimum grade. |
| `GRADE_BLOCK_REASON` | Grade Block Reasons | Grade engine emitted a hard block reason. |
| `DISPLACEMENT_FAILED` | Displacement | Displacement score is below the active eligibility threshold. |
| `STRUCTURE_FAILED` | Structure | Structure score is below the active eligibility threshold. |
| `SWEEP_FAILED` | Sweep | Sweep/model confirmation is below the active eligibility threshold. |
| `FOUR_H_PD_ALIGNMENT_FAILED` | Premium/Discount | 4H P/D does not support direction under production profile. |
| `POI_RETEST_LIMIT` | POI Retest | POI has reached the hard retest limit. |
| `CONTEXT_POLICY_FAILED` | Aggregated context | One or more hard context gates failed. |
| `NOT_ELIGIBLE` | Upstream decision | Upstream decision is not eligible before runtime context calibration. |

Risk rejection must use `REJECTED`, not `BLOCKED`, because Risk is a final validation result rather than an upstream context gate.

## 7. Eligibility Checklist

Every eligibility result must carry a checklist. A valid checklist for production should look like:

| Gate | Status | Evidence source |
| --- | --- | --- |
| Minimum Grade | PASS / FAIL | Grade result |
| Grade Block Reasons | PASS / FAIL | Grade result |
| HTF Bias | PASS / WAITING / FAIL | Detector/context |
| 4H Premium/Discount | PASS / FAIL | Detector/context |
| 1H Premium/Discount | PASS / WAITING | Detector/context |
| 15M Premium/Discount | PASS / WAITING / NOT_REQUIRED | Detector/context |
| POI Retest | PASS / WAITING / FAIL | Detector/context |
| Displacement | PASS / WAITING / FAIL | Grade breakdown |
| Structure | PASS / WAITING / FAIL | Grade breakdown |
| Sweep | PASS / WAITING / FAIL | Grade breakdown |
| POI Quality | PASS / WAITING | Grade breakdown |
| Manual Confirmation | PASS / WAITING / NOT_REQUIRED | Runtime policy |
| Session Filter | PASS / WAITING / NOT_REQUIRED | Runtime policy |
| Risk Validation | PASS / WAITING / REJECTED | RiskEvaluationResult |

Checklist resolution rules:

```text
Any REJECTED risk gate
  → REJECTED

Any required FAIL before risk
  → BLOCKED

Any required WAITING
  → WAITING

All required gates PASS and risk ACCEPTED
  → ELIGIBLE
```

## 8. Future Gates

The following gates are documented but inactive in v1.0:

| Future gate | Reason not active in v1.0 |
| --- | --- |
| Spread Filter | Requires reliable bid/ask source. |
| News Filter | Requires economic calendar provider and severity rules. |
| Volatility Filter | Requires contract for candle/ATR/volume interpretation. |
| Correlation Filter | Requires multi-symbol exposure model. |
| Broker Availability | Belongs to broker execution adapter. |
| Position Exposure | Belongs to future position/risk layer. |
| Stop Loss / Take Profit Validation | Current system marks TP/SL as manual/not modeled. |

Future gates must be added by contract version change, not by hidden formatter/runtime logic.

## 9. Determinism

Execution Eligibility must be deterministic.

Given identical:

```text
Detector output
Grade result
Runtime context
RiskEvaluationResult
Eligibility policy/profile
```

the system must produce identical:

```text
status
reason
checklist
block/waiting codes
human explanation
```

Forbidden:

```text
randomness
Date.now()
UUID.random()
external clock dependency
network calls
mutation of input objects
hidden profile changes
```

## 10. Architecture Review

Execution Eligibility v1.0 establishes these architecture rules:

1. Detector never decides execution eligibility.
2. Grade never decides final execution eligibility.
3. Signal Delivery never decides execution eligibility.
4. Formatter never decides execution eligibility.
5. Execution must not accept a signal unless Execution Eligibility has produced `ELIGIBLE`.
6. Risk can reject final tradability, but it must not recalculate detector, grade, or context scores.
7. PVP acceleration is an explicit eligibility profile, not a silent production behavior change.
8. All blocking/waiting decisions must be explainable through checklist entries.
9. Eligibility status must be immutable once produced for a specific market snapshot.

## State Transition Diagram

```text
DETECTED
  ↓
GRADED
  ↓
ELIGIBILITY_EVALUATING
  ├── required gate waiting ─────→ WAITING
  │                                  ↓
  │                            re-evaluate on new snapshot
  │
  ├── required gate failed ──────→ BLOCKED
  │
  ├── risk rejected ─────────────→ REJECTED
  │
  └── all required gates passed
          + risk accepted ───────→ ELIGIBLE
```

## Migration Plan

This contract does not require immediate production behavior changes. Migration should be staged:

1. Freeze this contract after review as `Execution Eligibility Contract v1.0`.
2. Introduce a dedicated immutable `ExecutionEligibilityResult` model.
3. Map current `DecisionCalibrationResult` and `RiskEvaluationResult` into the contract status model.
4. Move scattered runtime admission checks behind the eligibility contract boundary.
5. Keep Production and PVP admission profiles explicit and separately auditable.
6. Add regression tests for each gate and each status transition.
7. Update Notification Delivery to consume only final eligibility status, not raw grade/decision flags.
8. Keep Telegram formatting presentation-only.

## Review Notes

This contract intentionally preserves current behavior as the baseline:

- Production minimum grade remains A/A+.
- PVP acceleration may admit B+ with score >= 3 for validation profile only.
- 4H Premium/Discount mismatch remains a production hard gate.
- 1H Premium/Discount mismatch remains warning/waiting-level context.
- Risk remains policy-level and brokerless.

Any change to these rules after freeze must be versioned as `Execution Eligibility Contract v1.1` or higher.
