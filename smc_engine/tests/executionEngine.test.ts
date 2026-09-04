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
import { createValidatedDataset } from '../src/validatedDataset';
import { outcome, snapshot } from './outcomeValidation.test';

describe('Execution Engine', () => {
  test('creates one immutable orchestration command per session item without mutating session output', () => {
    const sessionResult = createSessionResult('PAPER');
    const before = JSON.stringify(sessionResult);
    const enginePolicy = createExecutionEnginePolicy({
      engineId: 'engine-paper-v1',
      engineMode: 'PAPER',
      maximumCommands: 10,
    });

    const result = executeSession(sessionResult, enginePolicy);

    expect(Object.isFrozen(enginePolicy)).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.commands)).toBe(true);
    expect(Object.isFrozen(result.warnings)).toBe(true);
    expect(result.metadata).toEqual({
      executionEngineResultVersion: 1,
      sessionResultVersion: sessionResult.metadata.sessionResultVersion,
      runtimeResultVersion: sessionResult.metadata.runtimeResultVersion,
      sessionPolicyVersion: sessionResult.metadata.sessionPolicyVersion,
      enginePolicyVersion: enginePolicy.version,
      datasetFingerprint: sessionResult.metadata.datasetFingerprint,
    });
    expect(result.engineReference).toEqual({
      engineId: 'engine-paper-v1',
      sessionId: sessionResult.sessionReference.sessionId,
      runtimeId: sessionResult.sessionReference.runtimeId,
      engineMode: 'PAPER',
      sessionMode: 'PAPER',
      runtimeMode: 'PAPER',
    });
    expect(result.commands).toHaveLength(sessionResult.sessionItems.length);
    expect(result.commands[0]).toMatchObject({
      commandType: 'PREPARE_EXECUTION',
      commandStatus: 'READY',
      audit: {
        validatedSessionItem: true,
        executionReady: true,
        executed: false,
      },
    });
    expect(result.commands[0].explanation.executionSessionItem).toBe(sessionResult.sessionItems[0]);
    expect(JSON.stringify(sessionResult)).toBe(before);
    expect(JSON.stringify(result)).not.toContain('orderId');
    expect(JSON.stringify(result)).not.toContain('ticket');
    expect(JSON.stringify(result)).not.toContain('BUY');
    expect(JSON.stringify(result)).not.toContain('SELL');
  });

  test('produces deterministic engine results for the same session result and policy', () => {
    const sessionResult = createSessionResult('SIMULATION');
    const enginePolicy = createExecutionEnginePolicy({
      engineId: 'engine-simulation-v1',
      engineMode: 'SIMULATION',
      maximumCommands: 10,
    });

    const first = executeSession(sessionResult, enginePolicy);
    const second = executeSession(sessionResult, enginePolicy);

    expect(first).toEqual(second);
    expect(first.commands[0].commandReason.code).toBe('EXECUTION_READY_FOR_FUTURE_LAYER');
  });

  test('keeps broker execution reserved and blocks commands without execution', () => {
    const sessionResult = createSessionResult('BROKER');
    const enginePolicy = createExecutionEnginePolicy({
      engineId: 'engine-broker-reserved',
      engineMode: 'BROKER',
      maximumCommands: 10,
    });

    const result = executeSession(sessionResult, enginePolicy);

    expect(result.warnings).toContainEqual(expect.objectContaining({
      type: 'BROKER_ENGINE_RESERVED',
      severity: 'ERROR',
    }));
    expect(result.commands[0]).toMatchObject({
      commandType: 'BLOCK_EXECUTION',
      commandStatus: 'BLOCKED',
      commandReason: {
        code: 'BROKER_ENGINE_RESERVED',
      },
    });
    expect(result.commands[0].audit.executed).toBe(false);
    expect(result.audit.blockedCommands).toBe(result.commands.length);
  });

  test('reports session warnings and maximum command limits', () => {
    const sessionResult = createSessionResult('PAPER');
    const enginePolicy = createExecutionEnginePolicy({
      engineId: 'engine-limited',
      engineMode: 'PAPER',
      maximumCommands: 0,
    });

    const result = executeSession(sessionResult, enginePolicy);

    expect(result.commands).toHaveLength(0);
    expect(result.warnings).toContainEqual(expect.objectContaining({
      type: 'SESSION_WARNINGS_PRESENT',
      severity: 'WARNING',
    }));
    expect(result.warnings).toContainEqual(expect.objectContaining({
      type: 'MAXIMUM_COMMANDS_EXCEEDED',
      severity: 'WARNING',
    }));
  });

  test('warns when engine mode differs from session mode', () => {
    const sessionResult = createSessionResult('PAPER');
    const enginePolicy = createExecutionEnginePolicy({
      engineId: 'engine-mode-mismatch',
      engineMode: 'SIMULATION',
      maximumCommands: 10,
    });

    const result = executeSession(sessionResult, enginePolicy);

    expect(result.warnings).toContainEqual(expect.objectContaining({
      type: 'ENGINE_MODE_MISMATCH',
      severity: 'WARNING',
    }));
  });
});

function createSessionResult(mode: 'PAPER' | 'SIMULATION' | 'BROKER') {
  const executionPlan = createExecutionPlan(mode === 'BROKER' ? 'PAPER' : mode);
  const runtimePolicy = createExecutionRuntimePolicy({
    runtimeId: `runtime-${mode.toLowerCase()}-for-engine`,
    runtimeMode: mode,
    supportedAdapters: [mode],
    maximumRuntimeItems: 10,
  });
  const runtimeResult = executePlan(executionPlan, runtimePolicy);
  const sessionPolicy = createExecutionSessionPolicy({
    sessionId: `session-${mode.toLowerCase()}-for-engine`,
    sessionMode: mode,
    maximumSessionItems: 10,
  });

  return createExecutionSession(runtimeResult, sessionPolicy);
}

function createExecutionPlan(mode: 'PAPER' | 'SIMULATION') {
  const snapshots = [
    ...createSnapshots('engine-aplus-tp', 'A+', 80),
    ...createSnapshots('engine-aplus-sl', 'A+', 20),
    ...createSnapshots('engine-a-tp', 'A', 40),
    ...createSnapshots('engine-a-sl', 'A', 60),
  ];
  const outcomes = [
    ...createOutcomes('engine-aplus-tp', 80, 'TP'),
    ...createOutcomes('engine-aplus-sl', 20, 'SL'),
    ...createOutcomes('engine-a-tp', 40, 'TP'),
    ...createOutcomes('engine-a-sl', 60, 'SL'),
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

