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
import { createPaperExecutionPolicy } from '../src/paperExecutionPolicy';
import { paperExecute } from '../src/paperExecutionManager';
import { generateSegmentedBenchmark } from '../src/segmentedBenchmark';
import { createValidatedDataset } from '../src/validatedDataset';
import { outcome, snapshot } from './outcomeValidation.test';

describe('Paper Execution', () => {
  test('creates one immutable paper item per READY execution command without mutating engine output', () => {
    const engineResult = createEngineResult('PAPER');
    const before = JSON.stringify(engineResult);
    const policy = createPaperExecutionPolicy({
      paperExecutionId: 'paper-execution-v1',
      maximumPaperItems: 10,
    });

    const result = paperExecute(engineResult, policy);

    expect(Object.isFrozen(policy)).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.items)).toBe(true);
    expect(Object.isFrozen(result.warnings)).toBe(true);
    expect(result.metadata).toEqual({
      paperExecutionResultVersion: 1,
      executionEngineResultVersion: engineResult.metadata.executionEngineResultVersion,
      enginePolicyVersion: engineResult.metadata.enginePolicyVersion,
      sessionResultVersion: engineResult.metadata.sessionResultVersion,
      paperExecutionPolicyVersion: policy.version,
      datasetFingerprint: engineResult.metadata.datasetFingerprint,
    });
    expect(result.paperExecutionReference).toEqual({
      paperExecutionId: 'paper-execution-v1',
      engineId: engineResult.engineReference.engineId,
      sessionId: engineResult.engineReference.sessionId,
      runtimeId: engineResult.engineReference.runtimeId,
      mode: 'PAPER',
    });
    expect(result.items).toHaveLength(engineResult.commands.length);
    expect(result.items[0]).toMatchObject({
      paperStatus: 'COMPLETED',
      lifecycle: {
        initialState: 'ACCEPTED',
        processedState: 'PROCESSED',
        finalState: 'COMPLETED',
      },
      audit: {
        accepted: true,
        processed: true,
        completed: true,
        realExecution: false,
        orderCreated: false,
        positionCreated: false,
        pnlCalculated: false,
      },
    });
    expect(result.items[0].explanation.executionCommand).toBe(engineResult.commands[0]);
    expect(JSON.stringify(engineResult)).toBe(before);
    expect(JSON.stringify(result)).not.toContain('orderId');
    expect(JSON.stringify(result)).not.toContain('ticket');
    expect(JSON.stringify(result)).not.toContain('BUY');
    expect(JSON.stringify(result)).not.toContain('SELL');
    expect(result.audit.pnlCalculations).toBe(0);
  });

  test('produces deterministic paper execution results for the same engine result and policy', () => {
    const engineResult = createEngineResult('PAPER');
    const policy = createPaperExecutionPolicy({
      paperExecutionId: 'paper-execution-deterministic',
      maximumPaperItems: 10,
    });

    const first = paperExecute(engineResult, policy);
    const second = paperExecute(engineResult, policy);

    expect(first).toEqual(second);
    expect(first.items[0].paperReason.code).toBe('PAPER_EXECUTION_LIFECYCLE_COMPLETED');
  });

  test('rejects broker-blocked commands and never creates real execution artifacts', () => {
    const engineResult = createEngineResult('BROKER');
    const policy = createPaperExecutionPolicy({
      paperExecutionId: 'paper-execution-broker-rejected',
      maximumPaperItems: 10,
    });

    const result = paperExecute(engineResult, policy);

    expect(result.warnings).toContainEqual(expect.objectContaining({
      type: 'NON_READY_COMMAND_REJECTED',
      severity: 'WARNING',
    }));
    expect(result.warnings).toContainEqual(expect.objectContaining({
      type: 'NON_PAPER_ENGINE_MODE',
      severity: 'WARNING',
    }));
    expect(result.items[0]).toMatchObject({
      paperStatus: 'REJECTED',
      lifecycle: {
        initialState: 'REJECTED',
        finalState: 'REJECTED',
      },
      audit: {
        realExecution: false,
        orderCreated: false,
        positionCreated: false,
        pnlCalculated: false,
      },
    });
    expect(result.audit.rejectedItems).toBe(result.items.length);
    expect(result.audit.realExecutions).toBe(0);
    expect(result.audit.ordersCreated).toBe(0);
    expect(result.audit.positionsCreated).toBe(0);
    expect(result.audit.pnlCalculations).toBe(0);
  });

  test('reports engine warnings and maximum paper item limits', () => {
    const engineResult = createEngineResult('PAPER');
    const policy = createPaperExecutionPolicy({
      paperExecutionId: 'paper-execution-limited',
      maximumPaperItems: 0,
    });

    const result = paperExecute(engineResult, policy);

    expect(result.items).toHaveLength(0);
    expect(result.warnings).toContainEqual(expect.objectContaining({
      type: 'ENGINE_WARNINGS_PRESENT',
      severity: 'WARNING',
    }));
    expect(result.warnings).toContainEqual(expect.objectContaining({
      type: 'MAXIMUM_PAPER_ITEMS_EXCEEDED',
      severity: 'WARNING',
    }));
    expect(result.warnings).toContainEqual(expect.objectContaining({
      type: 'REAL_EXECUTION_DISABLED',
      severity: 'INFO',
    }));
  });
});

function createEngineResult(mode: 'PAPER' | 'SIMULATION' | 'BROKER') {
  const executionPlan = createExecutionPlan(mode === 'BROKER' ? 'PAPER' : mode);
  const runtimePolicy = createExecutionRuntimePolicy({
    runtimeId: `runtime-${mode.toLowerCase()}-for-paper`,
    runtimeMode: mode,
    supportedAdapters: [mode],
    maximumRuntimeItems: 10,
  });
  const runtimeResult = executePlan(executionPlan, runtimePolicy);
  const sessionPolicy = createExecutionSessionPolicy({
    sessionId: `session-${mode.toLowerCase()}-for-paper`,
    sessionMode: mode,
    maximumSessionItems: 10,
  });
  const sessionResult = createExecutionSession(runtimeResult, sessionPolicy);
  const enginePolicy = createExecutionEnginePolicy({
    engineId: `engine-${mode.toLowerCase()}-for-paper`,
    engineMode: mode,
    maximumCommands: 10,
  });

  return executeSession(sessionResult, enginePolicy);
}

function createExecutionPlan(mode: 'PAPER' | 'SIMULATION') {
  const snapshots = [
    ...createSnapshots('paper-aplus-tp', 'A+', 80),
    ...createSnapshots('paper-aplus-sl', 'A+', 20),
    ...createSnapshots('paper-a-tp', 'A', 40),
    ...createSnapshots('paper-a-sl', 'A', 60),
  ];
  const outcomes = [
    ...createOutcomes('paper-aplus-tp', 80, 'TP'),
    ...createOutcomes('paper-aplus-sl', 20, 'SL'),
    ...createOutcomes('paper-a-tp', 40, 'TP'),
    ...createOutcomes('paper-a-sl', 60, 'SL'),
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
