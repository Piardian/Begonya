import { generateDecisionReport } from '../src/decisionEngine';
import { createDecisionPolicy } from '../src/decisionPolicy';
import { generateExecutionPlan } from '../src/executionPlanner';
import { createExecutionPlanningPolicy } from '../src/executionPlanningPolicy';
import { createExecutionRuntimePolicy } from '../src/executionRuntimePolicy';
import { executePlan } from '../src/executionRuntime';
import { createExecutionSession } from '../src/executionSessionManager';
import { createExecutionSessionPolicy } from '../src/executionSessionPolicy';
import { executeSession } from '../src/executionEngineManager';
import { createExecutionEnginePolicy } from '../src/executionEnginePolicy';
import { createPaperExecutionPolicy } from '../src/paperExecutionPolicy';
import { paperExecute } from '../src/paperExecutionManager';
import { createSimulationExecutionPolicy } from '../src/simulationExecutionPolicy';
import { simulateExecution } from '../src/simulationExecutionManager';
import { createRiskPolicy } from '../src/riskPolicy';
import { evaluateRisk } from '../src/riskEngineManager';
import { applyDecisionCalibration, calibrateDecision, DecisionCalibrationResult } from '../src/decisionCalibration';
import { LearningReport, LEARNING_REPORT_VERSION } from '../src/learningReport';
import { BENCHMARK_REPORT_VERSION } from '../src/benchmarkReport';
import { SEGMENTED_BENCHMARK_REPORT_VERSION } from '../src/segmentedBenchmarkReport';
import { SignalContext, createSignalContext } from '../src/signalContext';
import { SignalLifecycleState } from '../src/signalLifecycle';
import { SignalOutcome, createWaitingEntryOutcome } from '../src/signalOutcome';
import { SignalBenchmark, createPendingSignalBenchmark } from '../src/signalBenchmark';
import { NoopSignalRepository, SignalRepository } from '../src/signalRepository';
import { NotificationCandidate } from './pipeline';

export interface RuntimeExecutionPipelineResult {
  readonly decisionReport: ReturnType<typeof generateDecisionReport>;
  readonly executionPlan: ReturnType<typeof generateExecutionPlan>;
  readonly runtimeResult: ReturnType<typeof executePlan>;
  readonly sessionResult: ReturnType<typeof createExecutionSession>;
  readonly engineResult: ReturnType<typeof executeSession>;
  readonly paperResult: ReturnType<typeof paperExecute>;
  readonly simulationResult: ReturnType<typeof simulateExecution>;
  readonly riskResult: ReturnType<typeof evaluateRisk>;
  readonly signalContext: SignalContext;
  readonly signalOutcome: SignalOutcome;
  readonly signalBenchmark: SignalBenchmark;
  readonly decisionCalibration: DecisionCalibrationResult;
}

export function runRuntimeExecutionPipeline(
  candidate: NotificationCandidate,
  repository: SignalRepository = new NoopSignalRepository()
): RuntimeExecutionPipelineResult {
  const candidateId = sanitizeId(candidate.signalId ?? candidate.uniqueKey);
  const learningReport = createRuntimeLearningReport(candidate, candidateId);
  const decisionPolicy = createDecisionPolicy({
    policyId: `runtime-decision-policy:${candidateId}`,
    name: 'Runtime Decision Policy',
    minimumSampleSize: 1,
    minimumCoverage: 0,
    minimumConfidence: 'LOW',
    allowedPatternTypes: ['PERFORMANCE_ADVANTAGE'],
    requiredMetrics: ['TPRate'],
    allowedSegments: ['grade'],
  });
  const decisionCalibration = calibrateDecision({
    tradeDirection: candidate.tradeDirection,
    bias4H: candidate.bias4H,
    bias1H: candidate.bias1H,
    pd4H: candidate.pd4H,
    pd1H: candidate.pd1H,
    pd15M: candidate.pd15M,
    poiTestCount: candidate.poiTestCount,
    grade: candidate.gradeResult.grade,
    score: candidate.gradeResult.totalScore,
    admissionProfile: candidate.admissionProfile,
    blockReasons: candidate.gradeResult.blockReasons,
    breakdown: candidate.gradeResult.breakdown,
  });
  const decisionReport = applyDecisionCalibration(
    generateDecisionReport(learningReport, decisionPolicy),
    decisionCalibration
  );

  const executionPlan = generateExecutionPlan(decisionReport, createExecutionPlanningPolicy({
    planningId: `runtime-planning:${candidateId}`,
    name: 'Runtime Execution Planning',
    mode: 'SIMULATION',
    requireEligibleDecision: true,
    requiredExecutionEligibility: false,
    maximumPlannedActions: 1,
    allowedExecutionModes: ['PAPER', 'SIMULATION'],
    defaultExecutionIntent: 'PLAN_ONLY',
  }));

  const runtimeResult = executePlan(executionPlan, createExecutionRuntimePolicy({
    runtimeId: `runtime:${candidateId}`,
    runtimeMode: 'SIMULATION',
    supportedAdapters: ['SIMULATION'],
    maximumRuntimeItems: 1,
  }));

  const sessionResult = createExecutionSession(runtimeResult, createExecutionSessionPolicy({
    sessionId: `session:${candidateId}`,
    sessionMode: 'SIMULATION',
    maximumSessionItems: 1,
  }));

  const engineResult = executeSession(sessionResult, createExecutionEnginePolicy({
    engineId: `engine:${candidateId}`,
    engineMode: 'SIMULATION',
    maximumCommands: 1,
  }));

  const paperResult = paperExecute(engineResult, createPaperExecutionPolicy({
    paperExecutionId: `paper:${candidateId}`,
    maximumPaperItems: 1,
  }));

  const simulationResult = simulateExecution(engineResult, createSimulationExecutionPolicy({
    simulationExecutionId: `simulation:${candidateId}`,
    maximumSimulationItems: 1,
  }));

  const riskResult = evaluateRisk(simulationResult, createRiskPolicy({
    riskPolicyId: `risk:${candidateId}`,
    maximumRiskItems: 1,
  }));
  const firstRisk = riskResult.items[0];
  const hasPlannedAction = executionPlan.audit.plannedActions > 0;
  const hasReadyCommand = engineResult.audit.readyCommands > 0;
  const hasSimulatedItem = simulationResult.audit.simulatedItems > 0;
  const lifecycleStates: SignalLifecycleState[] = ['DETECTED', 'GRADED'];

  if (hasPlannedAction) {
    lifecycleStates.push('PLANNED');
  }
  if (hasReadyCommand) {
    lifecycleStates.push('EXECUTION_READY');
  }
  if (hasSimulatedItem) {
    lifecycleStates.push('SIMULATED');
  }
  if (firstRisk?.evaluation.executionAllowed) {
    lifecycleStates.push('RISK_ACCEPTED');
  }

  const signalContext = createSignalContext({
    signalId: candidate.signalId ?? candidate.uniqueKey,
    pair: candidate.symbol,
    direction: candidate.tradeDirection,
    timeframe: '15m',
    grade: candidate.gradeResult.grade,
    score: candidate.gradeResult.totalScore,
    executionStatus: engineResult.audit.readyCommands > 0 ? 'EXECUTION_READY' : 'EXECUTION_BLOCKED',
    riskStatus: firstRisk?.riskStatus ?? 'NO_RISK',
    timestamp: candidate.poi.relatedEvent.breakTimestamp,
    lifecycleStates,
  });
  const signalOutcome = createWaitingEntryOutcome(signalContext);
  const signalBenchmark = createPendingSignalBenchmark({ signalContext, signalOutcome });
  repository.createSignalRecord(signalContext);
  repository.saveOutcome(signalOutcome);
  repository.saveBenchmark(signalBenchmark);

  return Object.freeze({
    decisionReport,
    executionPlan,
    runtimeResult,
    sessionResult,
    engineResult,
    paperResult,
    simulationResult,
    riskResult,
    signalContext,
    signalOutcome,
    signalBenchmark,
    decisionCalibration,
  });
}

function createRuntimeLearningReport(candidate: NotificationCandidate, candidateId: string): LearningReport {
  const datasetFingerprint = `runtime:${candidateId}`;
  const observationId = `runtime-observation:${candidateId}`;
  const patternId = `runtime-pattern:${candidateId}`;
  const tpRate = Math.max(0, Math.min(1, candidate.gradeResult.totalScore / 9));
  const slRate = 1 - tpRate;
  const sampleSize = 1;
  const coverage = 1;
  const benchmarkReference = Object.freeze({
    datasetFingerprint,
    benchmarkVersion: BENCHMARK_REPORT_VERSION,
    segmentedBenchmarkVersion: SEGMENTED_BENCHMARK_REPORT_VERSION,
  });
  const comparisonEvidence = Object.freeze({
    metric: 'TPRate' as const,
    segment: Object.freeze({
      label: `Grade ${candidate.gradeResult.grade}`,
      value: tpRate,
    }),
    baseline: Object.freeze({
      label: 'overall' as const,
      value: 0,
    }),
    difference: tpRate,
    relativeDifference: tpRate,
  });
  const counts = Object.freeze({
    TP: tpRate,
    SL: slRate,
    BE: 0,
    EXPIRED: 0,
    UNKNOWN: 0,
  });
  const rates = Object.freeze({
    TPRate: tpRate,
    SLRate: slRate,
    BERate: 0,
    EXPIREDRate: 0,
    UNKNOWNRate: 0,
  });
  const duration = Object.freeze({
    averageEvaluationBars: 0,
    medianEvaluationBars: 0,
  });
  const excursion = Object.freeze({
    averageMFE: 0,
    averageMAE: 0,
  });
  const observation = Object.freeze({
    id: observationId,
    segment: 'grade' as const,
    value: candidate.gradeResult.grade,
    metric: 'TPRate' as const,
    direction: 'ABOVE_BASELINE' as const,
    sampleSize,
    coverage,
    comparisonEvidence,
    benchmarkReference,
    explanation: Object.freeze({
      because: Object.freeze([
        'Runtime adapter created a deterministic learning observation from the current detection candidate.',
      ]),
      segmentCoverage: coverage,
      overallCoverage: coverage,
      segmentBenchmark: Object.freeze({ counts, rates, duration, excursion }),
      overallBenchmark: Object.freeze({ counts, rates, duration, excursion }),
    }),
    summary: `${candidate.uniqueKey} runtime grade observation.`,
  });

  const pattern = Object.freeze({
    id: patternId,
    type: 'PERFORMANCE_ADVANTAGE' as const,
    metric: 'TPRate' as const,
    segment: 'grade' as const,
    value: candidate.gradeResult.grade,
    sampleSize,
    coverage,
    confidence: 'LOW' as const,
    confidenceFactors: Object.freeze({
      sample: 'LOW' as const,
      coverage: 'LOW' as const,
      stability: 'UNKNOWN' as const,
    }),
    comparisonEvidence,
    evidence: Object.freeze({
      observationId,
      segmentBenchmark: Object.freeze({
        TP: tpRate,
        SL: slRate,
        BE: 0,
        EXPIRED: 0,
        UNKNOWN: 0,
        sampleSize,
        coverage,
      }),
      overallBenchmark: Object.freeze({
        TP: tpRate,
        SL: slRate,
        sampleSize,
        coverage,
      }),
    }),
    summary: `${candidate.gradeResult.grade} candidate is available for runtime policy evaluation.`,
    explanation: Object.freeze({
      because: Object.freeze([
        'Detection produced a grade-allowed candidate.',
        'Runtime integration uses existing Decision/Execution/Risk contracts without modifying domain code.',
      ]),
      formula: 'runtime_candidate_grade / 9',
      interpretation: 'DESCRIPTIVE_HISTORICAL_PATTERN' as const,
    }),
    benchmarkReference,
  });

  return Object.freeze({
    metadata: Object.freeze({
      learningReportVersion: LEARNING_REPORT_VERSION,
      benchmarkVersion: BENCHMARK_REPORT_VERSION,
      segmentedBenchmarkVersion: SEGMENTED_BENCHMARK_REPORT_VERSION,
      datasetFingerprint,
      generatedAtDatasetCoverage: coverage,
      minSampleSize: 30 as const,
      minCoverageRate: 0.8 as const,
    }),
    overallLearning: Object.freeze({
      evaluatedSegments: 1,
      observations: 1,
      learnedPatterns: 1,
      skippedSegments: 0,
    }),
    observations: Object.freeze([observation]),
    patterns: Object.freeze([pattern]),
    warnings: Object.freeze([]),
  });
}

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9._:-]/g, '_');
}
