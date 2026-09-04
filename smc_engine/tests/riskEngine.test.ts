import { createDecisionPolicy } from '../src/decisionPolicy';
import { generateDecisionReport } from '../src/decisionEngine';
import { createExecutionEnginePolicy } from '../src/executionEnginePolicy';
import { executeSession } from '../src/executionEngineManager';
import { generateExecutionPlan } from '../src/executionPlanner';
import { createExecutionPlanningPolicy } from '../src/executionPlanningPolicy';
import { createExecutionRuntimePolicy } from '../src/executionRuntimePolicy';
import { executePlan } from '../src/executionRuntime';
import { createExecutionSession } from '../src/executionSessionManager';
import { createExecutionSessionPolicy } from '../src/executionSessionPolicy';
import { generateLearningReport } from '../src/learningEngine';
import { validateDataset } from '../src/outcomeValidation';
import { createRiskPolicy } from '../src/riskPolicy';
import { evaluateRisk } from '../src/riskEngineManager';
import { generateSegmentedBenchmark } from '../src/segmentedBenchmark';
import { createSimulationExecutionPolicy } from '../src/simulationExecutionPolicy';
import { simulateExecution } from '../src/simulationExecutionManager';
import { createValidatedDataset } from '../src/validatedDataset';
import { outcome, snapshot } from './outcomeValidation.test';

describe('Risk Engine', () => {
  test('maps SIMULATED simulation items to ACCEPTED policy-level risk evaluations without mutating simulation output', () => {
    const simulationResult = createSimulationResult('SIMULATION');
    const before = JSON.stringify(simulationResult);
    const policy = createRiskPolicy({
      riskPolicyId: 'risk-policy-v1',
      maximumRiskItems: 10,
    });

    const result = evaluateRisk(simulationResult, policy);

    expect(Object.isFrozen(policy)).toBe(true);
    expect(Object.isFrozen(policy.rules)).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.items)).toBe(true);
    expect(Object.isFrozen(result.warnings)).toBe(true);
    expect(result.metadata).toEqual({
      riskEvaluationResultVersion: 1,
      simulationExecutionResultVersion: simulationResult.metadata.simulationExecutionResultVersion,
      simulationExecutionPolicyVersion: simulationResult.metadata.simulationExecutionPolicyVersion,
      scenarioPolicyVersion: simulationResult.metadata.scenarioPolicyVersion,
      riskPolicyVersion: policy.version,
      datasetFingerprint: simulationResult.metadata.datasetFingerprint,
    });
    expect(result.riskReference).toEqual({
      riskPolicyId: 'risk-policy-v1',
      simulationExecutionId: simulationResult.simulationExecutionReference.simulationExecutionId,
      engineId: simulationResult.simulationExecutionReference.engineId,
      sessionId: simulationResult.simulationExecutionReference.sessionId,
      runtimeId: simulationResult.simulationExecutionReference.runtimeId,
      mode: 'SIMULATION_RISK',
      riskType: 'POLICY_LEVEL_RISK',
    });
    expect(result.items).toHaveLength(simulationResult.items.length);
    expect(result.items[0]).toMatchObject({
      riskStatus: 'ACCEPTED',
      lifecycle: {
        initialState: 'QUEUED',
        activeState: 'EVALUATING',
        finalState: 'ACCEPTED',
      },
      evaluation: {
        evaluationStatus: 'ACCEPTED',
        executionAllowed: true,
        simulationAccepted: true,
        policyViolation: false,
        audit: {
          lotCalculated: false,
          marginCalculated: false,
          pnlCalculated: false,
          orderCreated: false,
          positionCreated: false,
          realExecution: false,
        },
      },
    });
    expect(result.items[0].evaluation.checks.every(check => check.status === 'PASS')).toBe(true);
    expect(result.items[0].explanation.simulationExecutionItem).toBe(simulationResult.items[0]);
    expect(JSON.stringify(simulationResult)).toBe(before);
    expect(JSON.stringify(result)).not.toContain('orderId');
    expect(JSON.stringify(result)).not.toContain('ticket');
    expect(JSON.stringify(result)).not.toContain('BUY');
    expect(JSON.stringify(result)).not.toContain('SELL');
    expect(result.audit.lotCalculations).toBe(0);
    expect(result.audit.marginCalculations).toBe(0);
    expect(result.audit.pnlCalculations).toBe(0);
    expect(result.audit.ordersCreated).toBe(0);
    expect(result.audit.positionsCreated).toBe(0);
    expect(result.audit.realExecutions).toBe(0);
  });

  test('maps REJECTED simulation items to REJECTED risk evaluations', () => {
    const simulationResult = createSimulationResult('BROKER');
    const policy = createRiskPolicy({
      riskPolicyId: 'risk-policy-rejected',
      maximumRiskItems: 10,
    });

    const result = evaluateRisk(simulationResult, policy);

    expect(result.warnings).toContainEqual(expect.objectContaining({
      type: 'NON_SIMULATED_ITEM_REJECTED',
      severity: 'WARNING',
    }));
    expect(result.items[0]).toMatchObject({
      riskStatus: 'REJECTED',
      lifecycle: {
        initialState: 'REJECTED',
        finalState: 'REJECTED',
      },
      evaluation: {
        evaluationStatus: 'REJECTED',
        executionAllowed: false,
        simulationAccepted: false,
        policyViolation: true,
      },
    });
    expect(result.items[0].evaluation.checks).toContainEqual(expect.objectContaining({
      code: 'SIMULATION_STATUS_SIMULATED',
      status: 'FAIL',
    }));
    expect(result.audit.rejectedItems).toBe(result.items.length);
  });

  test('maps SKIPPED simulation items to SKIPPED risk evaluations', () => {
    const simulationResult = createSkippedSimulationResult();
    const policy = createRiskPolicy({
      riskPolicyId: 'risk-policy-skipped',
      maximumRiskItems: 10,
    });

    const result = evaluateRisk(simulationResult, policy);

    expect(result.items[0]).toMatchObject({
      riskStatus: 'SKIPPED',
      lifecycle: {
        initialState: 'SKIPPED',
        finalState: 'SKIPPED',
      },
      evaluation: {
        evaluationStatus: 'SKIPPED',
        executionAllowed: false,
        simulationAccepted: false,
        policyViolation: true,
      },
    });
    expect(result.audit.skippedItems).toBe(result.items.length);
  });

  test('respects maximum risk item limit and emits warnings', () => {
    const simulationResult = createSimulationResult('SIMULATION');
    const policy = createRiskPolicy({
      riskPolicyId: 'risk-policy-limited',
      maximumRiskItems: 0,
    });

    const result = evaluateRisk(simulationResult, policy);

    expect(result.items).toHaveLength(0);
    expect(result.warnings).toContainEqual(expect.objectContaining({
      type: 'SIMULATION_WARNINGS_PRESENT',
      severity: 'WARNING',
    }));
    expect(result.warnings).toContainEqual(expect.objectContaining({
      type: 'MAXIMUM_RISK_ITEMS_EXCEEDED',
      severity: 'WARNING',
    }));
    expect(result.warnings).toContainEqual(expect.objectContaining({
      type: 'EXECUTION_DISABLED',
      severity: 'INFO',
    }));
    expect(result.warnings).toContainEqual(expect.objectContaining({
      type: 'POLICY_LEVEL_RISK_ONLY',
      severity: 'INFO',
    }));
  });

  test('produces deterministic risk results for the same simulation result and policy', () => {
    const simulationResult = createSimulationResult('SIMULATION');
    const policy = createRiskPolicy({
      riskPolicyId: 'risk-policy-deterministic',
      maximumRiskItems: 10,
    });

    const first = evaluateRisk(simulationResult, policy);
    const second = evaluateRisk(simulationResult, policy);

    expect(first).toEqual(second);
    expect(first.items[0].evaluation.reason.code).toBe('POLICY_LEVEL_RISK_ACCEPTED');
  });
});

function createSimulationResult(
  mode: 'PAPER' | 'SIMULATION' | 'BROKER',
  maximumRuntimeItems = 10
) {
  const executionPlan = createExecutionPlan(mode === 'BROKER' ? 'PAPER' : mode);
  const runtimePolicy = createExecutionRuntimePolicy({
    runtimeId: `runtime-${mode.toLowerCase()}-for-risk`,
    runtimeMode: mode,
    supportedAdapters: [mode],
    maximumRuntimeItems,
  });
  const runtimeResult = executePlan(executionPlan, runtimePolicy);
  const sessionPolicy = createExecutionSessionPolicy({
    sessionId: `session-${mode.toLowerCase()}-for-risk`,
    sessionMode: mode,
    maximumSessionItems: 10,
  });
  const sessionResult = createExecutionSession(runtimeResult, sessionPolicy);
  const enginePolicy = createExecutionEnginePolicy({
    engineId: `engine-${mode.toLowerCase()}-for-risk`,
    engineMode: mode,
    maximumCommands: 10,
  });
  const engineResult = executeSession(sessionResult, enginePolicy);
  const simulationPolicy = createSimulationExecutionPolicy({
    simulationExecutionId: `simulation-${mode.toLowerCase()}-for-risk`,
    maximumSimulationItems: 10,
  });

  return simulateExecution(engineResult, simulationPolicy);
}

function createSkippedSimulationResult() {
  const base = createSimulationResult('SIMULATION');
  const skippedItem = Object.freeze({
    ...base.items[0],
    simulationStatus: 'SKIPPED' as const,
    lifecycle: Object.freeze({
      initialState: 'SKIPPED' as const,
      finalState: 'SKIPPED' as const,
    }),
    simulationReason: Object.freeze({
      code: 'COMMAND_ONLY_SCENARIO_SKIPPED',
      message: 'Command-only scenario was skipped for risk test coverage.',
    }),
    scenario: Object.freeze({
      ...base.items[0].scenario,
      expectedPath: Object.freeze({
        queued: false,
        simulated: false,
        rejected: false,
        skipped: true,
      }),
      scenarioResult: Object.freeze({
        status: 'SKIPPED' as const,
        reasonCode: 'COMMAND_ONLY_SCENARIO_SKIPPED',
        reasonMessage: 'Command-only scenario was skipped for risk test coverage.',
      }),
    }),
  });

  return Object.freeze({
    ...base,
    items: Object.freeze([skippedItem]),
    audit: Object.freeze({
      ...base.audit,
      generatedSimulationItems: 1,
      attachedScenarios: 1,
      simulatedItems: 0,
      rejectedItems: 0,
      skippedItems: 1,
    }),
  });
}

function createExecutionPlan(mode: 'PAPER' | 'SIMULATION') {
  const snapshots = [
    ...createSnapshots('risk-aplus-tp', 'A+', 80),
    ...createSnapshots('risk-aplus-sl', 'A+', 20),
    ...createSnapshots('risk-a-tp', 'A', 40),
    ...createSnapshots('risk-a-sl', 'A', 60),
  ];
  const outcomes = [
    ...createOutcomes('risk-aplus-tp', 80, 'TP'),
    ...createOutcomes('risk-aplus-sl', 20, 'SL'),
    ...createOutcomes('risk-a-tp', 40, 'TP'),
    ...createOutcomes('risk-a-sl', 60, 'SL'),
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
