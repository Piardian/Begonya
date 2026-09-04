# Signal Delivery Contract v1.0

## Mission

This document defines how qualified Swing BOS Core trading signals are presented to the user after the detector and execution-preparation pipeline has completed.

This contract does not change detector behavior, grading logic, decision logic, risk logic, execution logic, Telegram transport, screenshot rendering, or overlay rendering.

It standardizes:

- notification eligibility;
- message layout;
- required action wording;
- confirmation wording;
- TP reporting;
- execution checklist;
- explainability;
- migration expectations.

The Telegram notification must function as a complete execution card.

---

## Scope

This contract applies only after the signal has reached:

```text
DETECTED
↓
GRADED
↓
PLANNED
↓
EXECUTION_READY
```

Detector contracts remain unchanged.

This contract must not be used to justify detector, grading, decision, risk, or execution behavior changes.

---

## Objectives

Signal delivery must be:

- deterministic;
- easy to read;
- actionable;
- unambiguous;
- suitable for live trading;
- suitable for demo validation;
- suitable for QA review.

The user must understand the required action within a few seconds.

---

## Contract Vocabulary

### Qualified Signal

A signal that has passed the detector, grading, planning, execution readiness, decision, and risk gates required by the active runtime profile.

### Notification

The user-facing Telegram text message and associated chart attachments.

### Execution Card

The complete user-facing signal packet containing:

- trade summary;
- required action;
- entry zone;
- stop guidance;
- TP policy;
- confirmation requirement;
- execution checklist;
- explainability;
- chart attachments.

### Required Action

The single explicit instruction the user should follow next.

### Confirmation

The lower timeframe trigger required before execution, if any.

---

# Phase 1 — Notification Policy

## Policy

Grade-level notification eligibility is:

| Grade | Notification |
|---|---|
| A+ | Notify |
| A | Notify |
| B+ | Notify |
| B | No Notification |
| C | No Notification |
| D | No Notification |

## Additional Execution Gates

Grade eligibility alone is not sufficient for final notification delivery.

The following gates may suppress notification:

- hard Grade block reasons;
- Decision status not eligible;
- Risk status not accepted;
- Execution not ready;
- notification idempotency / duplicate prevention;
- Telegram delivery failure;
- attachment validation failure only when the attachment is contractually blocking.

## Profile Rule

If a non-production profile such as PVP acceleration admits additional candidates, the message must display the active profile.

Production and validation signals must be distinguishable.

## Contract Classification

| Behavior | Classification |
|---|---|
| A+, A, B+ grade-level notification eligibility | Required Behavior |
| B/C/D no notification | Required Behavior |
| Decision/Risk/Execution gates may suppress notification | Required Behavior |
| PVP/demo profile label | Required Behavior |
| Profitability-based notification filtering | Non-goal |

---

# Phase 2 — Grade Qualification Rules

## Displacement Rule Proposal

The following rule is accepted as a qualification proposal, not as a Signal Delivery responsibility:

```text
Displacement = 0
↓
Maximum possible grade = B
```

A signal without displacement should not become A or A+.

## A+ Eligibility Proposal

The following A+ quality proposal is accepted as a qualification proposal, not as a Signal Delivery responsibility:

```text
SELL requires:
1H Premium
AND
15M Premium

BUY requires:
1H Discount
AND
15M Discount
```

## Architecture Placement

| Rule | Belongs To | Rationale |
---|---|---|
| Displacement = 0 caps maximum grade | Grade Contract | It changes score/grade semantics. |
| A+ requires 1H and 15M P/D alignment | Grade Contract or Execution Eligibility Contract | If it changes grade, Grade Contract. If it only gates notification, Execution Eligibility Contract. |
| Whether an eligible signal is shown to user | Signal Delivery Contract | Delivery decides presentation, not scoring. |

## Recommendation

The most appropriate architecture is:

```text
Grade Contract
    defines score and grade

Execution Eligibility Contract
    defines tradability gates

Signal Delivery Contract
    defines how eligible signals are presented
```

Signal Delivery must not silently alter grades.

## Contract Classification

| Behavior | Classification |
|---|---|
| Delivery must not mutate grade | Required Behavior |
| Displacement cap belongs outside Signal Delivery | Required Behavior |
| A+ P/D eligibility belongs outside Signal Delivery unless used only as display metadata | Required Behavior |
| Signal Delivery may display why a grade/gate passed | Required Behavior |

---

# Phase 3 — Message Layout Specification

## Required Top Section

The top section must display trading information before engineering details.

Required order:

```text
SECTION 1 — TRADE SUMMARY

Pair
Direction
Grade
Current Status
Entry Zone
Stop Loss
Take Profit
Current Price
Distance
Required Action
Required Confirmation
```

No engineering details may appear before this section.

## Required Sections

The full message should use this order:

```text
SECTION 1 — TRADE SUMMARY
SECTION 2 — EXECUTION CARD
SECTION 3 — EXECUTION CHECKLIST
SECTION 4 — MARKET CONTEXT
SECTION 5 — GRADE DETAILS
SECTION 6 — GRADE EXPLANATION
SECTION 7 — SIGNAL INFORMATION
SECTION 8 — SYSTEM METADATA
```

## Engineering Details Placement

The following must not appear before trade summary:

- runtime internals;
- session lifecycle;
- engine audit counts;
- implementation identifiers;
- verbose grade reasoning.

They may appear in later sections if needed for QA.

## Contract Classification

| Behavior | Classification |
|---|---|
| Trade summary first | Required Behavior |
| Required Action in top section | Required Behavior |
| Engineering metadata after trading information | Required Behavior |
| QA details preserved below summary | Required Behavior |
| Hiding all explainability | Non-goal |

---

# Phase 4 — Take Profit Policy

## If TP Model Exists

Display:

```text
Take Profit
TP1: ...
TP2: ...
TP3: ...
```

## If TP Is Not Modeled

Display:

```text
Take Profit   : Not Modeled
Suggested TP  : Nearest Opposing Liquidity Pool
TP Status     : Manual target selection required
```

## Forbidden Output

The message must not imply TP is missing accidentally.

Forbidden examples:

```text
Take Profit: Manual / not modeled
Risk / Reward: N/A
```

unless paired with explicit explanation that TP is intentionally not modeled.

## Contract Classification

| Behavior | Classification |
|---|---|
| Explicit TP modeled/not modeled status | Required Behavior |
| TP1/TP2/TP3 when model exists | Required Behavior |
| Suggested target when TP not modeled | Required Behavior |
| Silent TP omission | Forbidden |
| Automatic TP invention by delivery layer | Non-goal |

---

# Phase 5 — Required Action Specification

## Required Action Rule

Every delivered signal must contain exactly one Required Action.

Allowed Required Action values:

- WAIT
- WAIT FOR RETEST
- WAIT FOR 1M BOS
- WAIT FOR 1M CHOCH
- BUY AFTER CONFIRMATION
- SELL AFTER CONFIRMATION
- READY TO EXECUTE

## Ambiguous Wording Rule

The message must not rely on ambiguous wording such as:

- Waiting Retest
- Entry decision is yours
- Manual confirmation
- Watch price

unless a Required Action field also states the explicit trigger.

## Directional Action Rule

If the signal direction is BUY, execution actions must use BUY wording.

If the signal direction is SELL, execution actions must use SELL wording.

## Contract Classification

| Behavior | Classification |
|---|---|
| Exactly one Required Action | Required Behavior |
| Controlled action vocabulary | Required Behavior |
| Directional action consistency | Required Behavior |
| Ambiguous-only action wording | Forbidden |
| User discretion text without trigger | Forbidden |

---

# Phase 6 — Confirmation Policy

## Confirmation Requirement

If lower timeframe confirmation is required, the message must explicitly state:

```text
Required Confirmation: 1M BOS
```

or:

```text
Required Confirmation: 1M CHOCH
```

If no lower timeframe confirmation is required:

```text
Required Confirmation: NOT REQUIRED
```

## Retest Rule

The message must not say only:

```text
Waiting Retest
```

It must specify what confirms the retest.

Example:

```text
Required Action       : WAIT FOR 1M BOS
Required Confirmation : 1M BOS after retest into entry zone
```

## Contract Classification

| Behavior | Classification |
|---|---|
| Explicit lower timeframe trigger | Required Behavior |
| NOT REQUIRED state when no confirmation needed | Required Behavior |
| “Waiting Retest” without trigger | Forbidden |
| Delivery layer inventing confirmation logic | Non-goal |

---

# Phase 7 — Chart Context Policy

## Context Review

The message should emphasize execution context before high timeframe narrative.

Recommended display priority:

```text
1M Execution Context
15M Setup Context
1H Directional Context
4H HTF Context
```

## 1M Execution Block

When available, display:

- 1M Trend
- 1M Structure
- 1M Confirmation

## 4H Context Rule

4H context may still appear, but it must not dominate the top of the message.

4H chart/context is supporting context, not the immediate execution instruction.

## Unsupported Context Rule

The message must not promise 1M confirmation if the implementation does not currently calculate or validate 1M BOS/CHoCH.

If 1M engine is unavailable, display:

```text
1M Confirmation: REQUIRED — NOT AUTOMATED
```

or:

```text
1M Confirmation: NOT MODELED
```

## Contract Classification

| Behavior | Classification |
|---|---|
| Execution context before HTF narrative | Required Behavior |
| 1M confirmation displayed only if supported or explicitly manual | Required Behavior |
| 4H context remains supporting context | Intentional Design Choice |
| Removing all HTF context | Non-goal |

---

# Phase 8 — Execution Checklist Specification

## Checklist Requirement

Every signal must contain an Execution Checklist.

Checklist values are limited to:

- PASS
- FAIL
- WAITING
- NOT REQUIRED

## Required Checklist Items

Minimum checklist:

```text
HTF Bias
Premium / Discount
Sweep
Structure
Displacement
POI Retest
Lower Timeframe Confirmation
Execution Ready
Risk Accepted
Notification Delivered
```

## Hidden Condition Rule

No hidden execution condition may exist outside the checklist.

If a condition can block execution, it must appear in the checklist or be explicitly marked as not part of execution readiness.

## Contract Classification

| Behavior | Classification |
|---|---|
| Checklist present in every notification | Required Behavior |
| Controlled checklist values | Required Behavior |
| Blocking condition must be visible | Required Behavior |
| Hidden execution condition | Forbidden |
| Profitability checklist | Non-goal |

---

# Phase 9 — Explainability

## Score Explanation Rule

Every displayed score must have an explanation.

If the message displays:

```text
Displacement: +1
```

it must also explain why `+1` was assigned.

## Block Explanation Rule

Every blocked execution must state why.

Required format:

```text
Execution Blocked
Reason Code: ...
Reason: ...
Required Next State: ...
```

## Waiting Explanation Rule

Every waiting condition must specify what is being waited for.

Examples:

```text
WAITING: Price must retest entry zone.
WAITING: 1M BOS required after retest.
WAITING: Risk gate has not accepted execution.
```

## Contract Classification

| Behavior | Classification |
|---|---|
| Every displayed score explained | Required Behavior |
| Every block reason visible | Required Behavior |
| Every waiting condition explicit | Required Behavior |
| Unexplained state transition | Forbidden |
| Long-form engineering dump before trading card | Forbidden |

---

# Phase 10 — Consistency Review

## Required Consistency Rules

Signal Delivery must remain consistent with:

- Detector Contract;
- Grade Contract;
- Execution Eligibility Contract;
- Risk Result;
- Lifecycle;
- Telegram delivery result.

## Message Promise Rule

The message must never promise behavior unsupported by implementation.

Examples:

- Do not display TP1/TP2/TP3 if no TP model exists.
- Do not display 1M BOS confirmed if no 1M BOS engine ran.
- Do not display READY TO EXECUTE if risk did not accept execution.
- Do not display Notification Delivered before Telegram success.

## Contract Classification

| Behavior | Classification |
|---|---|
| Message must match implementation state | Required Behavior |
| Unsupported promise forbidden | Required Behavior |
| Lifecycle state must be accurate | Required Behavior |
| Transport success must be accurate | Required Behavior |

---

# Signal Delivery Contract v1.0 — Canonical Message Layout

```text
━━━━━━━━━━━━━━━━━━━━━━
SECTION 1 — TRADE SUMMARY
Pair                  : EURUSD
Direction             : BUY
Grade                 : A+
Current Status         : WAITING_CONFIRMATION
Entry Zone             : 1.05040 - 1.05140
Stop Loss              : Below 1.05040
Take Profit            : Not Modeled
Suggested TP           : Nearest Opposing Liquidity Pool
Current Price          : 1.04960
Distance               : 8.0 pip below entry zone
Required Action        : WAIT FOR 1M BOS
Required Confirmation  : 1M BOS after retest into entry zone
━━━━━━━━━━━━━━━━━━━━━━
SECTION 2 — EXECUTION CARD
Tradable Now           : NO
Execution Ready        : NO
Reason                 : Waiting for retest and lower timeframe confirmation.
Profile                : PRODUCTION
━━━━━━━━━━━━━━━━━━━━━━
SECTION 3 — EXECUTION CHECKLIST
HTF Bias               : PASS
Premium / Discount     : PASS
Sweep                  : PASS
Structure              : PASS
Displacement           : PASS
POI Retest             : WAITING
1M Confirmation         : WAITING
Execution Ready         : WAITING
Risk Accepted           : PASS
Notification Delivered  : PASS
━━━━━━━━━━━━━━━━━━━━━━
SECTION 4 — MARKET CONTEXT
15M Setup              : Bullish FVG
1H P/D                 : Discount
15M P/D                : Discount
1M Trend               : NOT MODELED
1M Structure           : NOT MODELED
1M Confirmation         : REQUIRED — MANUAL
4H Context             : Supporting context only
━━━━━━━━━━━━━━━━━━━━━━
SECTION 5 — GRADE DETAILS
HTF Bias & P/D          : +2
Displacement            : +2
Structure               : +2
Sweep                   : +2
POI Quality             : +1
Total                   : 9
━━━━━━━━━━━━━━━━━━━━━━
SECTION 6 — GRADE EXPLANATION
...
━━━━━━━━━━━━━━━━━━━━━━
SECTION 7 — SIGNAL INFORMATION
Signal ID              : ...
Zone Formed            : ...
Structure Event         : ...
━━━━━━━━━━━━━━━━━━━━━━
SECTION 8 — SYSTEM METADATA
Decision               : ELIGIBLE
Planning               : PLANNED
Runtime                : PREPARED
Session                : COMPLETED
Execution              : READY
Paper                  : READY
Simulation             : SIMULATED
Risk                   : ACCEPTED
```

---

# Architecture Recommendations

## Recommendation 1 — Keep Delivery Separate

Signal Delivery must remain a presentation contract.

It must not mutate:

- grade;
- score;
- detector output;
- decision result;
- risk result;
- execution result.

## Recommendation 2 — Create Execution Eligibility Contract

Rules such as:

- displacement = 0 caps grade;
- A+ requires 1H/15M P/D alignment;
- 1M confirmation required;

should not be hidden inside Telegram formatting.

They should be formalized in either:

- Grade Contract; or
- Execution Eligibility Contract.

## Recommendation 3 — Delivery Should Consume a Prepared View Model

Long-term preferred flow:

```text
Runtime Result
↓
Signal Delivery View Model
↓
Telegram Formatter
```

The formatter should format already-decided fields rather than deriving trading meaning.

---

# Migration Plan

## Phase A — Documentation Freeze

- Review Signal Delivery Contract v1.0.
- Approve or revise ambiguous sections.
- Freeze v1.0 before formatter changes.

## Phase B — View Model Design

- Define `SignalDeliveryViewModel`.
- Map current candidate + execution result into delivery fields.
- Do not alter detector or grade output.

## Phase C — Formatter Migration

- Reorder Telegram message according to this contract.
- Add Required Action.
- Add Required Confirmation.
- Add TP policy wording.
- Add Execution Checklist.

## Phase D — Regression Tests

Required tests:

- A+/A/B+ notification policy.
- B/C/D no notification.
- Required Action exists exactly once.
- TP not modeled is explicit.
- No engineering metadata before trade summary.
- Checklist contains all blocking conditions.
- Unsupported 1M confirmation is not falsely claimed as automated.
- Telegram success remains tied to Notification Delivered.

## Phase E — Demo Validation

Generate demo messages for:

- A+ BUY;
- A SELL;
- B+ WAIT;
- filtered signal;
- TP not modeled;
- lower timeframe confirmation required.

## Phase F — Production Rollout

- Enable new message layout behind a feature flag.
- Compare old/new messages in demo mode.
- Switch production after visual review.

---

# Final Acceptance Criteria

Signal Delivery Contract v1.0 is accepted when:

- every notification has one explicit Required Action;
- every notification has explicit TP status;
- every notification has explicit Required Confirmation;
- every notification has an Execution Checklist;
- no engineering details appear before trading information;
- every displayed score has an explanation;
- every block/waiting state explains what is required next;
- message never promises unsupported automation;
- detector, grade, decision, risk, and execution behavior remain unchanged.

