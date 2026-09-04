# Production Qualification Framework v1.0

Status: PQ-1.0  
Date: 2026-07-24  
Scope: Swing BOS Core production pipeline qualification  
Verdict source: `docs/evidence/QualificationSummary.md`

## Mission

Production Qualification validates that the production pipeline behaves deterministically and consistently under production-like conditions.

This framework collects evidence. It does not improve strategy performance, tune trading logic, modify detector behavior, alter grade scoring, change decision logic, change risk policy, or modify Telegram formatter behavior.

## Qualification Methodology

PQ-1.0 uses five evidence categories:

```text
Functional Qualification
  ↓
Operational Qualification
  ↓
Regression Qualification
  ↓
Performance Qualification
  ↓
Determinism Validation
```

The qualification process compares production code against frozen contracts and existing runtime behavior:

- `docs/detector-contract-v1.0.md`
- `docs/signal-delivery-contract-v1.0.md`
- `docs/execution-eligibility-contract-v1.0.md`
- runtime pipeline tests
- delivery lifecycle tests
- historical replay determinism tests

## Evidence Collection Process

Evidence is collected from:

1. Static repository inspection.
2. Existing test suite execution.
3. Build execution.
4. Historical replay determinism validation.
5. Formatter and notification lifecycle tests.
6. Chart and overlay regression tests.
7. Local performance timing of build/test/qualification commands.

Evidence artifacts are stored in:

```text
docs/evidence/
```

Required evidence files:

- `FunctionalReport.md`
- `OperationalReport.md`
- `RegressionReport.md`
- `PerformanceReport.md`
- `DeterminismReport.md`
- `QualificationSummary.md`

## Qualification Categories

### Functional Qualification

Functional Qualification verifies that required pipeline components exist and remain callable:

- Detector Pipeline
- Grade Engine
- Decision Layer
- Execution Eligibility
- Signal Delivery
- Telegram Formatter

Functional Qualification is evidence-based. A component is marked PASS only when tests or source inspection verify it without modifying trading behavior.

### Operational Qualification

Operational Qualification verifies stable operation across consecutive runs:

- stable production output shape;
- stable notification lifecycle;
- stable formatter contract;
- stable screenshot generation path;
- stable attachment fallback behavior;
- no duplicate notification regression in covered tests.

Live long-run production operation is not inferred from unit tests. If no live long-run evidence exists, the verdict must state this limitation.

### Regression Qualification

Regression Qualification verifies that PQ did not change protected domains:

- detector logic;
- grade logic;
- runtime logic;
- risk logic;
- overlay logic;
- Telegram formatter behavior except where already intentionally migrated by Signal Delivery v1.0.

PQ-1.0 itself must be documentation/evidence-only.

### Performance Qualification

Performance Qualification measures:

- build duration;
- full test duration;
- average local test suite runtime where available;
- screenshot generation coverage through chart/overlay tests;
- memory/CPU evidence availability.

If runtime memory/CPU profiling is not captured, the performance report must state that it is not yet qualified by long-run telemetry.

### Determinism Validation

Determinism Validation verifies repeated identical inputs produce identical outputs:

- same signals;
- same grades;
- same decisions;
- same execution status;
- same notification output.

Evidence comes from deterministic unit tests and historical replay determinism validation.

## Failure Classification

PQ-1.0 classifies failures as:

| Class | Meaning | Example |
| --- | --- | --- |
| Confirmed Defect | Required contract behavior fails under test or static evidence | Same input produces different decision |
| Regression | Previously passing production behavior fails after current sprint | Formatter test breaks delivery contract |
| Evidence Gap | Required evidence was not collected | No live 3-hour run evidence |
| Operational Limitation | System passes deterministic tests but lacks production telemetry | CPU/memory not measured live |
| Contract Gap | Requirement is not defined clearly enough to audit | Undefined execution status mapping |
| Out of Scope | Requested behavior belongs to future sprint | Broker execution qualification |

## Acceptance Criteria

PQ-1.0 is accepted when:

- framework document exists;
- evidence pack exists;
- build passes;
- existing tests pass;
- determinism evidence is recorded;
- regression evidence is recorded;
- performance evidence is recorded;
- final verdict is one of the approved values;
- remaining risks are explicitly listed.

## Qualification Verdict Rules

Exactly one verdict must be issued:

```text
PASS
PASS WITH LIMITATIONS
CONDITIONAL PASS
FAIL
```

Verdict rules:

| Verdict | Criteria |
| --- | --- |
| PASS | Build/tests pass, determinism passes, regression passes, and live operational/performance evidence is sufficient. |
| PASS WITH LIMITATIONS | Build/tests/determinism/regression pass, but live telemetry or long-run production evidence is incomplete. |
| CONDITIONAL PASS | Core evidence passes but one or more non-blocking issues require bounded follow-up before freeze. |
| FAIL | Build/test/determinism/regression failure or confirmed production-blocking defect. |

## Change Policy

PQ-1.0 must not change production behavior.

Allowed:

- documentation;
- evidence reports;
- measurement commands;
- qualification summaries.

Forbidden:

- detector changes;
- grade changes;
- decision changes;
- runtime changes;
- risk changes;
- overlay changes;
- Telegram formatter behavior changes.

## Evidence Package Index

See:

- `docs/evidence/FunctionalReport.md`
- `docs/evidence/OperationalReport.md`
- `docs/evidence/RegressionReport.md`
- `docs/evidence/PerformanceReport.md`
- `docs/evidence/DeterminismReport.md`
- `docs/evidence/QualificationSummary.md`
