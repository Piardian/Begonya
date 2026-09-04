# Setup Intelligence Contract V2

## Status

Draft / Phase 1

This document defines the shared V2 contract for Swing BOS Core's setup-quality classification layer.

No detector, grade, decision, risk, notification, provider, screenshot, or execution behavior is changed by this phase.

## Mission

Swing BOS Core is not an automated trade-entry system.

Its core mission is to become a Setup Intelligence Engine that classifies high-quality Smart Money Concepts setups in a consistent, explainable, and repeatable way.

The system should answer:

```text
Is this genuinely a high-quality setup?
```

not:

```text
Did this setup collect enough points?
```

## V1 vs V2 Philosophy

### V1

```text
Detector
↓
Score
↓
Grade
↓
Decision / Telegram / Evidence
```

In V1, score creates the grade.

### V2

```text
Detector
↓
Context Analysis
↓
Narrative Analysis
↓
Quality Analysis
↓
Hard Reject / Grade Cap / Soft Penalty
↓
Grade Assignment
↓
Explainability
↓
Decision / Telegram / Evidence
```

In V2, quality creates the grade. Score only explains the grade.

## Core Principles

### 1. Detector does not judge quality

The detector layer only reports raw technical events:

- HTF bias
- BOS
- CHoCH
- Sweep
- POI
- Order Block
- Fair Value Gap
- Premium / Discount
- Displacement
- Session
- Liquidity

It must not decide whether a setup is high quality.

### 2. Score does not create grade

V2 grade is assigned from market context, narrative coherence, and quality gates.

Explainability score is allowed only after grade assignment.

### 3. No Compensation Principle

Some quality weaknesses cannot be compensated by unrelated strengths.

Examples:

```text
Bad Premium / Discount
+
Strong Sweep
≠
Elite setup
```

```text
Weak POI
+
Strong Displacement
≠
A+ setup
```

### 4. Quality gates are separated

V2 separates:

- Hard Reject
- Grade Cap
- Soft Penalty

These must not be mixed.

## Contract Object

The TypeScript contract is defined in:

```text
src/setupAssessment.ts
```

The central object is:

```ts
SetupAssessment
```

This name is intentionally broader than `GradeResult`. It can later support Entry Intelligence, Exit Intelligence, and Outcome Analytics without redefining the core domain language.

## Main Sections

### DetectorResult

Raw detector facts.

No quality judgment belongs here.

### ContextAnalysis

Market context interpretation:

- HTF alignment
- Premium / Discount support
- Market phase
- Zone freshness
- Zone state
- Session quality

### NarrativeAnalysis

SMC story validation:

- Liquidity story
- Reaction logic
- SMC narrative
- Structural consistency
- Market logic

### QualityAnalysis

Quality classification without score:

- POI quality
- Structure quality
- Displacement quality
- Context quality
- Narrative quality
- Overall quality

### SetupAssessmentDecision

Quality gates:

- `hardReject`
- `rejectReasons`
- `gradeCaps`
- `penalties`

### SetupAssessmentGrade

Final setup grade:

- `A+`
- `A`
- `A-`
- `B+`
- `B`
- `Reject`

### SetupAssessmentExplainability

Post-grade explanation:

- supported by
- weakened by
- summary
- evidence score

## Migration Policy

Phase 1 introduces the contract only.

Expected later phases:

1. Add a shadow V2 evaluator.
2. Compare V1 `GradeResult` with V2 `SetupAssessment`.
3. Keep V1 behavior unchanged until V2 is validated.
4. Version Evidence output before using V2 in production decisions.
5. Update Telegram language only after V2 grade semantics are stable.

## Non-goals

This contract does not define:

- position sizing
- automated entry
- stop loss placement
- take profit placement
- trade management
- provider behavior
- screenshot rendering
- Telegram transport

