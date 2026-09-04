import { createDecisionPolicy } from '../src/decisionPolicy';
import { generateDecisionReport } from '../src/decisionEngine';
import { createExecutionPlanningPolicy } from '../src/executionPlanningPolicy';
import { generateExecutionPlan } from '../src/executionPlanner';
import { generateLearningReport } from '../src/learningEngine';
import { generateSegmentedBenchmark } from '../src/segmentedBenchmark';
import { createValidatedDataset } from '../src/validatedDataset';
import { validateDataset } from '../src/outcomeValidation';
import { outcome, snapshot } from './outcomeValidation.test';

describe('Execution Planner', () => {
  test('creates deterministic plan-only items from decision reports without broker-specific fields', () => {
    const decisionReport = createDecisionReport();
    const policy = createExecutionPlanningPolicy({
      planningId: 'planning-v1',
      name: 'Simulation planning',
      mode: 'SIMULATION',
      requireEligibleDecision: true,
      requiredExecutionEligibility: false,
      maximumPlannedActions: 10,
      allowedExecutionModes: ['PAPER', 'SIMULATION'],
      defaultExecutionIntent: 'PLAN_ONLY',
    });

    const plan = generateExecutionPlan(decisionReport, policy);
    const planned = plan.plannedActions[0];

    expect(Object.isFrozen(policy)).toBe(true);
    expect(Object.isFrozen(policy.allowedExecutionModes)).toBe(true);
    expect(plan.metadata).toMatchObject({
      executionPlanVersion: 1,
      decisionReportVersion: 1,
      datasetFingerprint: decisionReport.metadata.datasetFingerprint,
      generatedFromPlanningId: 'planning-v1',
      generatedFromPlanningPolicyVersion: 1,
    });
    expect(planned).toBeDefined();
    expect(planned.action).toBe('PLAN_ONLY');
    expect(planned.executionIntent).toBe('PLAN_ONLY');
    expect(planned.explanation.decisionPolicyReference.policyId).toBe(decisionReport.policyReference.policyId);
    expect(planned.explanation.planningPolicyReference).toEqual({
      planningId: 'planning-v1',
      version: 1,
      mode: 'SIMULATION',
    });
    expect(JSON.stringify(planned)).not.toContain('broker');
    expect(JSON.stringify(planned)).not.toContain('orderId');
    expect(JSON.stringify(planned)).not.toContain('ticket');
  });

  test('produces PlanningEvaluation and blocked action when execution eligibility is required', () => {
    const decisionReport = createDecisionReport();
    const policy = createExecutionPlanningPolicy({
      planningId: 'requires-executable',
      name: 'Requires executable decisions',
      mode: 'PAPER',
      requireEligibleDecision: true,
      requiredExecutionEligibility: true,
      maximumPlannedActions: 10,
      allowedExecutionModes: ['PAPER'],
      defaultExecutionIntent: 'PLAN_ONLY',
    });

    const plan = generateExecutionPlan(decisionReport, policy);

    expect(plan.planningEvaluations.some(evaluation => evaluation.status === 'BLOCKED')).toBe(true);
    expect(plan.blockedActions.some(item =>
      item.constraints.some(constraint => constraint.type === 'EXECUTION_ELIGIBILITY_FALSE')
    )).toBe(true);
    expect(plan.blockedActions[0].executionEligibility).toEqual({
      executable: false,
      reason: 'Execution Engine not implemented',
    });
  });

  test('blocks LIVE mode as reserved', () => {
    const decisionReport = createDecisionReport();
    const policy = createExecutionPlanningPolicy({
      planningId: 'live-reserved',
      name: 'Live reserved',
      mode: 'LIVE',
      requireEligibleDecision: true,
      requiredExecutionEligibility: false,
      maximumPlannedActions: 10,
      allowedExecutionModes: ['LIVE'],
      defaultExecutionIntent: 'PLAN_ONLY',
    });

    const plan = generateExecutionPlan(decisionReport, policy);

    expect(plan.blockedActions.some(item =>
      item.constraints.some(constraint => constraint.type === 'LIVE_MODE_RESERVED')
    )).toBe(true);
    expect(plan.warnings).toContainEqual(expect.objectContaining({
      type: 'LIVE_MODE_RESERVED',
      severity: 'ERROR',
    }));
  });

  test('same decision report can be planned with different immutable policies without mutation', () => {
    const decisionReport = createDecisionReport();
    const before = JSON.stringify(decisionReport);
    const paperPolicy = createExecutionPlanningPolicy({
      planningId: 'paper',
      name: 'Paper planning',
      mode: 'PAPER',
      requireEligibleDecision: true,
      requiredExecutionEligibility: false,
      maximumPlannedActions: 1,
      allowedExecutionModes: ['PAPER'],
      defaultExecutionIntent: 'PLAN_ONLY',
    });
    const simulationPolicy = createExecutionPlanningPolicy({
      planningId: 'simulation',
      name: 'Simulation planning',
      mode: 'SIMULATION',
      requireEligibleDecision: true,
      requiredExecutionEligibility: false,
      maximumPlannedActions: 2,
      allowedExecutionModes: ['SIMULATION'],
      defaultExecutionIntent: 'PLAN_ONLY',
    });

    const paperPlan = generateExecutionPlan(decisionReport, paperPolicy);
    const simulationPlan = generateExecutionPlan(decisionReport, simulationPolicy);

    expect(paperPlan.metadata.generatedFromPlanningId).toBe('paper');
    expect(simulationPlan.metadata.generatedFromPlanningId).toBe('simulation');
    expect(paperPlan).not.toEqual(simulationPlan);
    expect(JSON.stringify(decisionReport)).toBe(before);
  });
});

function createDecisionReport() {
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

  return generateDecisionReport(learningReport, decisionPolicy);
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
