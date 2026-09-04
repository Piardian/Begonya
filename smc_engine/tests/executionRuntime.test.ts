import { createDecisionPolicy } from '../src/decisionPolicy';
import { generateDecisionReport } from '../src/decisionEngine';
import { createExecutionPlanningPolicy } from '../src/executionPlanningPolicy';
import { generateExecutionPlan } from '../src/executionPlanner';
import { createExecutionRuntimePolicy } from '../src/executionRuntimePolicy';
import { executePlan } from '../src/executionRuntime';
import { generateLearningReport } from '../src/learningEngine';
import { generateSegmentedBenchmark } from '../src/segmentedBenchmark';
import { createValidatedDataset } from '../src/validatedDataset';
import { validateDataset } from '../src/outcomeValidation';
import { outcome, snapshot } from './outcomeValidation.test';

describe('Execution Runtime', () => {
  test('prepares plan-only items in paper mode without mutating the execution plan', () => {
    const executionPlan = createExecutionPlan('PAPER');
    const before = JSON.stringify(executionPlan);
    const runtimePolicy = createExecutionRuntimePolicy({
      runtimeId: 'runtime-paper-v1',
      runtimeMode: 'PAPER',
      supportedAdapters: ['PAPER'],
      maximumRuntimeItems: 10,
    });

    const result = executePlan(executionPlan, runtimePolicy);

    expect(Object.isFrozen(runtimePolicy)).toBe(true);
    expect(Object.isFrozen(runtimePolicy.supportedAdapters)).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.processedItems)).toBe(true);
    expect(result.metadata).toMatchObject({
      runtimeResultVersion: 1,
      executionPlanVersion: 1,
      runtimePolicyVersion: 1,
      datasetFingerprint: executionPlan.metadata.datasetFingerprint,
    });
    expect(result.runtimeReference).toEqual({
      runtimeId: 'runtime-paper-v1',
      runtimeMode: 'PAPER',
    });
    expect(result.processedItems.length).toBeGreaterThan(0);
    expect(result.processedItems[0]).toMatchObject({
      runtimeStatus: 'PREPARED',
      adapter: 'PAPER',
      preparedAction: 'PLAN_ONLY',
    });
    expect(result.processedItems[0].explanation.executionPlanItem).toBe(executionPlan.plannedActions[0]);
    expect(result.processedItems[0].explanation.decisionPolicyReference.policyId).toBe('decision-policy');
    expect(JSON.stringify(executionPlan)).toBe(before);
    expect(JSON.stringify(result)).not.toContain('orderId');
    expect(JSON.stringify(result)).not.toContain('ticket');
  });

  test('produces deterministic runtime results for the same execution plan and policy', () => {
    const executionPlan = createExecutionPlan('SIMULATION');
    const runtimePolicy = createExecutionRuntimePolicy({
      runtimeId: 'runtime-simulation-v1',
      runtimeMode: 'SIMULATION',
      supportedAdapters: ['SIMULATION'],
      maximumRuntimeItems: 10,
    });

    const first = executePlan(executionPlan, runtimePolicy);
    const second = executePlan(executionPlan, runtimePolicy);

    expect(first).toEqual(second);
    expect(first.processedItems[0].adapter).toBe('SIMULATION');
    expect(first.processedItems[0].runtimeReason.code).toBe('SIMULATION_ACTION_PREPARED');
  });

  test('blocks broker runtime as reserved and never produces executable actions', () => {
    const executionPlan = createExecutionPlan('PAPER');
    const runtimePolicy = createExecutionRuntimePolicy({
      runtimeId: 'runtime-broker-reserved',
      runtimeMode: 'BROKER',
      supportedAdapters: ['BROKER'],
      maximumRuntimeItems: 10,
    });

    const result = executePlan(executionPlan, runtimePolicy);

    expect(result.warnings).toContainEqual(expect.objectContaining({
      type: 'BROKER_RUNTIME_RESERVED',
      severity: 'ERROR',
    }));
    expect(result.processedItems[0]).toMatchObject({
      runtimeStatus: 'BLOCKED',
      adapter: 'BROKER',
      preparedAction: 'PLAN_ONLY',
    });
    expect(result.audit.blockedItems).toBe(result.processedItems.length);
  });

  test('skips items when runtime policy does not support the selected adapter or maximum is exceeded', () => {
    const executionPlan = createExecutionPlan('PAPER');
    const runtimePolicy = createExecutionRuntimePolicy({
      runtimeId: 'runtime-limited',
      runtimeMode: 'PAPER',
      supportedAdapters: ['SIMULATION'],
      maximumRuntimeItems: 0,
    });

    const result = executePlan(executionPlan, runtimePolicy);

    expect(result.processedItems).toHaveLength(0);
    expect(result.skippedItems.length).toBeGreaterThan(0);
    expect(result.skippedItems[0].runtimeStatus).toBe('SKIPPED');
    expect(result.warnings).toContainEqual(expect.objectContaining({
      type: 'UNSUPPORTED_ADAPTER',
      severity: 'ERROR',
    }));
    expect(result.warnings).toContainEqual(expect.objectContaining({
      type: 'MAXIMUM_RUNTIME_ITEMS_EXCEEDED',
      severity: 'WARNING',
    }));
  });
});

function createExecutionPlan(mode: 'PAPER' | 'SIMULATION') {
  const snapshots = [
    ...createSnapshots('aplus-tp', 'A+', 80),
    ...createSnapshots('aplus-sl', 'A+', 20),
    ...createSnapshots('a-tp', 'A', 40),
    ...createSnapshots('a-sl', 'A', 60),
  ];
  const outcomes = [
    ...createOutcomes('aplus-tp', 80, 'TP'),
    ...createOutcomes('aplus-sl', 20, 'SL'),
    ...createOutcomes('a-tp', 40, 'TP'),
    ...createOutcomes('a-sl', 60, 'SL'),
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
