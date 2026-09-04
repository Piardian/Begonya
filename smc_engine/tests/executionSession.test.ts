import { createDecisionPolicy } from '../src/decisionPolicy';
import { generateDecisionReport } from '../src/decisionEngine';
import { generateExecutionPlan } from '../src/executionPlanner';
import { createExecutionPlanningPolicy } from '../src/executionPlanningPolicy';
import { createExecutionRuntimePolicy } from '../src/executionRuntimePolicy';
import { executePlan } from '../src/executionRuntime';
import { createExecutionSession } from '../src/executionSessionManager';
import { createExecutionSessionPolicy } from '../src/executionSessionPolicy';
import { generateLearningReport } from '../src/learningEngine';
import { generateSegmentedBenchmark } from '../src/segmentedBenchmark';
import { createValidatedDataset } from '../src/validatedDataset';
import { validateDataset } from '../src/outcomeValidation';
import { outcome, snapshot } from './outcomeValidation.test';

describe('Execution Session', () => {
  test('creates an immutable session result from a runtime result without mutating runtime output', () => {
    const runtimeResult = createRuntimeResult('PAPER');
    const before = JSON.stringify(runtimeResult);
    const sessionPolicy = createExecutionSessionPolicy({
      sessionId: 'session-paper-v1',
      sessionMode: 'PAPER',
      maximumSessionItems: 10,
    });

    const sessionResult = createExecutionSession(runtimeResult, sessionPolicy);

    expect(Object.isFrozen(sessionPolicy)).toBe(true);
    expect(Object.isFrozen(sessionResult)).toBe(true);
    expect(Object.isFrozen(sessionResult.sessionItems)).toBe(true);
    expect(Object.isFrozen(sessionResult.warnings)).toBe(true);
    expect(sessionResult.metadata).toEqual({
      sessionResultVersion: 1,
      runtimeResultVersion: runtimeResult.metadata.runtimeResultVersion,
      runtimePolicyVersion: runtimeResult.metadata.runtimePolicyVersion,
      sessionPolicyVersion: sessionPolicy.version,
      datasetFingerprint: runtimeResult.metadata.datasetFingerprint,
    });
    expect(sessionResult.sessionReference).toEqual({
      sessionId: 'session-paper-v1',
      runtimeId: runtimeResult.runtimeReference.runtimeId,
      sessionMode: 'PAPER',
      runtimeMode: 'PAPER',
    });
    expect(sessionResult.lifecycle).toMatchObject({
      initialState: 'CREATED',
      readyState: 'READY',
      currentState: 'COMPLETED',
      finalState: 'COMPLETED',
    });
    expect(sessionResult.sessionItems.length).toBe(runtimeResult.processedItems.length + runtimeResult.skippedItems.length);
    expect(sessionResult.sessionItems[0].explanation.runtimeItem).toBe(runtimeResult.processedItems[0]);
    expect(JSON.stringify(runtimeResult)).toBe(before);
    expect(JSON.stringify(sessionResult)).not.toContain('orderId');
    expect(JSON.stringify(sessionResult)).not.toContain('ticket');
    expect(JSON.stringify(sessionResult)).not.toContain('position');
  });

  test('produces deterministic session results for the same runtime result and policy', () => {
    const runtimeResult = createRuntimeResult('SIMULATION');
    const sessionPolicy = createExecutionSessionPolicy({
      sessionId: 'session-simulation-v1',
      sessionMode: 'SIMULATION',
      maximumSessionItems: 10,
    });

    const first = createExecutionSession(runtimeResult, sessionPolicy);
    const second = createExecutionSession(runtimeResult, sessionPolicy);

    expect(first).toEqual(second);
    expect(first.sessionItems[0].sessionReason.code).toBe('RUNTIME_ITEM_SESSION_CLOSED');
  });

  test('keeps broker sessions reserved and fails the session lifecycle without execution', () => {
    const runtimeResult = createRuntimeResult('BROKER');
    const sessionPolicy = createExecutionSessionPolicy({
      sessionId: 'session-broker-reserved',
      sessionMode: 'BROKER',
      maximumSessionItems: 10,
    });

    const sessionResult = createExecutionSession(runtimeResult, sessionPolicy);

    expect(sessionResult.warnings).toContainEqual(expect.objectContaining({
      type: 'BROKER_SESSION_RESERVED',
      severity: 'ERROR',
    }));
    expect(sessionResult.lifecycle.finalState).toBe('FAILED');
    expect(sessionResult.audit.failedItems).toBe(sessionResult.sessionItems.length);
  });

  test('reports carried runtime warnings and maximum session item limits', () => {
    const runtimeResult = createRuntimeResult('PAPER', 0);
    const sessionPolicy = createExecutionSessionPolicy({
      sessionId: 'session-limited',
      sessionMode: 'PAPER',
      maximumSessionItems: 0,
    });

    const sessionResult = createExecutionSession(runtimeResult, sessionPolicy);

    expect(sessionResult.sessionItems).toHaveLength(0);
    expect(sessionResult.warnings).toContainEqual(expect.objectContaining({
      type: 'RUNTIME_WARNINGS_PRESENT',
      severity: 'WARNING',
    }));
    expect(sessionResult.warnings).toContainEqual(expect.objectContaining({
      type: 'MAXIMUM_SESSION_ITEMS_EXCEEDED',
      severity: 'WARNING',
    }));
  });

  test('warns when session mode differs from runtime mode', () => {
    const runtimeResult = createRuntimeResult('PAPER');
    const sessionPolicy = createExecutionSessionPolicy({
      sessionId: 'session-mode-mismatch',
      sessionMode: 'SIMULATION',
      maximumSessionItems: 10,
    });

    const sessionResult = createExecutionSession(runtimeResult, sessionPolicy);

    expect(sessionResult.warnings).toContainEqual(expect.objectContaining({
      type: 'SESSION_MODE_MISMATCH',
      severity: 'WARNING',
    }));
  });
});

function createRuntimeResult(mode: 'PAPER' | 'SIMULATION' | 'BROKER', maximumRuntimeItems = 10) {
  const executionPlan = createExecutionPlan(mode === 'BROKER' ? 'PAPER' : mode);
  const runtimePolicy = createExecutionRuntimePolicy({
    runtimeId: `runtime-${mode.toLowerCase()}-v1`,
    runtimeMode: mode,
    supportedAdapters: [mode],
    maximumRuntimeItems,
  });

  return executePlan(executionPlan, runtimePolicy);
}

function createExecutionPlan(mode: 'PAPER' | 'SIMULATION') {
  const snapshots = [
    ...createSnapshots('session-aplus-tp', 'A+', 80),
    ...createSnapshots('session-aplus-sl', 'A+', 20),
    ...createSnapshots('session-a-tp', 'A', 40),
    ...createSnapshots('session-a-sl', 'A', 60),
  ];
  const outcomes = [
    ...createOutcomes('session-aplus-tp', 80, 'TP'),
    ...createOutcomes('session-aplus-sl', 20, 'SL'),
    ...createOutcomes('session-a-tp', 40, 'TP'),
    ...createOutcomes('session-a-sl', 60, 'SL'),
  ];
  const dataset = createValidatedDataset({
    snapshots,
    outcomes,
    validationReport: validateDataset({ snapshots, outcomes }),
  });
  const learningReport = generateLearningReport(generateSegmentedBenchmark(dataset));
  const decisionPolicy = createDecisionPolicy({
    policyId: 'decision-policy',
    name: 'Decision policy',
    minimumSampleSize: 30,
    minimumCoverage: 0.8,
    minimumConfidence: 'LOW',
    allowedPatternTypes: ['PERFORMANCE_ADVANTAGE'],
    requiredMetrics: ['TPRate'],
    allowedSegments: ['grade'],
  });
  const decisionReport = generateDecisionReport(learningReport, decisionPolicy);
  const planningPolicy = createExecutionPlanningPolicy({
    planningId: 'planning-v1',
    name: 'Planning policy',
    mode,
    requireEligibleDecision: true,
    requiredExecutionEligibility: false,
    maximumPlannedActions: 10,
    allowedExecutionModes: ['PAPER', 'SIMULATION'],
    defaultExecutionIntent: 'PLAN_ONLY',
  });

  return generateExecutionPlan(decisionReport, planningPolicy);
}

function createSnapshots(prefix: string, grade: 'A+' | 'A', count: number) {
  return Array.from({ length: count }, (_, index) => snapshotWithGrade(`${prefix}-${index}`, grade));
}

function createOutcomes(prefix: string, count: number, status: 'TP' | 'SL') {
  return Array.from({ length: count }, (_, index) => outcome(`${prefix}-${index}`, status));
}

function snapshotWithGrade(candidateId: string, grade: 'A+' | 'A') {
  const result = snapshot(candidateId);
  result.grade.grade = grade;
  return result;
}

