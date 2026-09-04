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
import { generateSegmentedBenchmark } from '../src/segmentedBenchmark';
import { createSimulationExecutionPolicy } from '../src/simulationExecutionPolicy';
import { simulateExecution } from '../src/simulationExecutionManager';
import { createValidatedDataset } from '../src/validatedDataset';
import { outcome, snapshot } from './outcomeValidation.test';

describe('Simulation Execution', () => {
  test('creates one immutable COMMAND_ONLY scenario item per READY command without mutating engine output', () => {
    const engineResult = createEngineResult('SIMULATION');
    const before = JSON.stringify(engineResult);
    const policy = createSimulationExecutionPolicy({
      simulationExecutionId: 'simulation-execution-v1',
      maximumSimulationItems: 10,
    });

    const result = simulateExecution(engineResult, policy);

    expect(Object.isFrozen(policy)).toBe(true);
    expect(Object.isFrozen(policy.scenarioPolicy)).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.items)).toBe(true);
    expect(Object.isFrozen(result.warnings)).toBe(true);
    expect(result.metadata).toEqual({
      simulationExecutionResultVersion: 1,
      executionEngineResultVersion: engineResult.metadata.executionEngineResultVersion,
      enginePolicyVersion: engineResult.metadata.enginePolicyVersion,
      sessionResultVersion: engineResult.metadata.sessionResultVersion,
      simulationExecutionPolicyVersion: policy.version,
      scenarioPolicyVersion: policy.scenarioPolicy.version,
      datasetFingerprint: engineResult.metadata.datasetFingerprint,
    });
    expect(result.simulationExecutionReference).toEqual({
      simulationExecutionId: 'simulation-execution-v1',
      engineId: engineResult.engineReference.engineId,
      sessionId: engineResult.engineReference.sessionId,
      runtimeId: engineResult.engineReference.runtimeId,
      mode: 'SIMULATION',
      scenarioType: 'COMMAND_ONLY',
    });
    expect(result.items).toHaveLength(engineResult.commands.length);
    expect(result.items[0]).toMatchObject({
      simulationStatus: 'SIMULATED',
      lifecycle: {
        initialState: 'QUEUED',
        activeState: 'SIMULATING',
        finalState: 'SIMULATED',
      },
      scenario: {
        scenarioType: 'COMMAND_ONLY',
        scenarioVersion: 1,
        scenarioResult: {
          status: 'SIMULATED',
        },
      },
      audit: {
        scenarioAttached: true,
        marketDataUsed: false,
        realExecution: false,
        orderCreated: false,
        tradeCreated: false,
        positionCreated: false,
        pnlCalculated: false,
        riskCalculated: false,
      },
    });
    expect(result.items[0].scenario.scenarioCapabilities).toEqual(['COMMAND_ONLY', 'NO_MARKET_DATA', 'NO_PNL', 'NO_RISK']);
    expect(Object.isFrozen(result.items[0].scenario.scenarioCapabilities)).toBe(true);
    expect(result.items[0].explanation.executionCommand).toBe(engineResult.commands[0]);
    expect(JSON.stringify(engineResult)).toBe(before);
    expect(JSON.stringify(result)).not.toContain('orderId');
    expect(JSON.stringify(result)).not.toContain('ticket');
    expect(JSON.stringify(result)).not.toContain('BUY');
    expect(JSON.stringify(result)).not.toContain('SELL');
    expect(result.audit.pnlCalculations).toBe(0);
    expect(result.audit.riskCalculations).toBe(0);
    expect(result.audit.marketDataUsed).toBe(0);
  });

  test('produces deterministic simulation results for the same engine result and policy', () => {
    const engineResult = createEngineResult('SIMULATION');
    const policy = createSimulationExecutionPolicy({
      simulationExecutionId: 'simulation-execution-deterministic',
      maximumSimulationItems: 10,
    });

    const first = simulateExecution(engineResult, policy);
    const second = simulateExecution(engineResult, policy);

    expect(first).toEqual(second);
    expect(first.items[0].simulationReason.code).toBe('COMMAND_ONLY_SCENARIO_SIMULATED');
  });

  test('rejects broker-blocked commands and never creates real execution artifacts', () => {
    const engineResult = createEngineResult('BROKER');
    const policy = createSimulationExecutionPolicy({
      simulationExecutionId: 'simulation-execution-broker-rejected',
      maximumSimulationItems: 10,
    });

    const result = simulateExecution(engineResult, policy);

    expect(result.warnings).toContainEqual(expect.objectContaining({
      type: 'NON_READY_COMMAND_REJECTED',
      severity: 'WARNING',
    }));
    expect(result.warnings).toContainEqual(expect.objectContaining({
      type: 'NON_SIMULATION_ENGINE_MODE',
      severity: 'WARNING',
    }));
    expect(result.items[0]).toMatchObject({
      simulationStatus: 'REJECTED',
      lifecycle: {
        initialState: 'REJECTED',
        finalState: 'REJECTED',
      },
      scenario: {
        scenarioResult: {
          status: 'REJECTED',
        },
      },
      audit: {
        marketDataUsed: false,
        realExecution: false,
        orderCreated: false,
        tradeCreated: false,
        positionCreated: false,
        pnlCalculated: false,
        riskCalculated: false,
      },
    });
    expect(result.audit.rejectedItems).toBe(result.items.length);
    expect(result.audit.realExecutions).toBe(0);
    expect(result.audit.ordersCreated).toBe(0);
    expect(result.audit.tradesCreated).toBe(0);
    expect(result.audit.positionsCreated).toBe(0);
  });

  test('reports engine warnings, market-data absence, and maximum simulation item limits', () => {
    const engineResult = createEngineResult('SIMULATION');
    const policy = createSimulationExecutionPolicy({
      simulationExecutionId: 'simulation-execution-limited',
      maximumSimulationItems: 0,
    });

    const result = simulateExecution(engineResult, policy);

    expect(result.items).toHaveLength(0);
    expect(result.warnings).toContainEqual(expect.objectContaining({
      type: 'ENGINE_WARNINGS_PRESENT',
      severity: 'WARNING',
    }));
    expect(result.warnings).toContainEqual(expect.objectContaining({
      type: 'MAXIMUM_SIMULATION_ITEMS_EXCEEDED',
      severity: 'WARNING',
    }));
    expect(result.warnings).toContainEqual(expect.objectContaining({
      type: 'REAL_EXECUTION_DISABLED',
      severity: 'INFO',
    }));
    expect(result.warnings).toContainEqual(expect.objectContaining({
      type: 'MARKET_DATA_NOT_AVAILABLE_BY_DESIGN',
      severity: 'INFO',
    }));
  });
});

function createEngineResult(mode: 'PAPER' | 'SIMULATION' | 'BROKER') {
  const executionPlan = createExecutionPlan(mode === 'BROKER' ? 'PAPER' : mode);
  const runtimePolicy = createExecutionRuntimePolicy({
    runtimeId: `runtime-${mode.toLowerCase()}-for-simulation`,
    runtimeMode: mode,
    supportedAdapters: [mode],
    maximumRuntimeItems: 10,
  });
  const runtimeResult = executePlan(executionPlan, runtimePolicy);
  const sessionPolicy = createExecutionSessionPolicy({
    sessionId: `session-${mode.toLowerCase()}-for-simulation`,
    sessionMode: mode,
    maximumSessionItems: 10,
  });
  const sessionResult = createExecutionSession(runtimeResult, sessionPolicy);
  const enginePolicy = createExecutionEnginePolicy({
    engineId: `engine-${mode.toLowerCase()}-for-simulation`,
    engineMode: mode,
    maximumCommands: 10,
  });

  return executeSession(sessionResult, enginePolicy);
}

function createExecutionPlan(mode: 'PAPER' | 'SIMULATION') {
  const snapshots = [
    ...createSnapshots('simulation-aplus-tp', 'A+', 80),
    ...createSnapshots('simulation-aplus-sl', 'A+', 20),
    ...createSnapshots('simulation-a-tp', 'A', 40),
    ...createSnapshots('simulation-a-sl', 'A', 60),
  ];
  const outcomes = [
    ...createOutcomes('simulation-aplus-tp', 80, 'TP'),
    ...createOutcomes('simulation-aplus-sl', 20, 'SL'),
    ...createOutcomes('simulation-a-tp', 40, 'TP'),
    ...createOutcomes('simulation-a-sl', 60, 'SL'),
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

