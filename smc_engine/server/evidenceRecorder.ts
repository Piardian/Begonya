import * as fs from 'fs';
import * as path from 'path';
import { NotificationCandidate } from './pipeline';
import { RuntimeExecutionPipelineResult } from './runtimeExecutionPipeline';
import { StoredCandle, Symbol } from './candleStore';
import { JsonlEvidenceStore, EvidenceStore } from './evidenceStore';
import { buildOverlayInput } from './overlayMetadata';
import { buildCommunicationLayer } from './communicationLayer';
import { buildExecutionCardView } from './notificationBuilder';
import { buildPresentationPlan } from './presentationPolicyEngine';
import { createSmartScreenshotPlan, refineSmartScreenshotPlan } from './smartScreenshotEngine';
import type { GovernanceEvidenceSummary } from '../src/governanceFramework';
import {
  CompletedSignalOutcomeEvidence,
  createCompletedSignalOutcomeEvidence,
  createSignalEvidenceRecord,
  SIGNAL_EVIDENCE_DETECTOR_VERSION,
  SIGNAL_EVIDENCE_ENGINE_VERSION,
  SIGNAL_EVIDENCE_GRADE_VERSION,
  SignalEvidenceRecord,
} from '../src/signalEvidence';
import { evaluateSignalValidationGate } from '../src/signalValidationGate';
import { assessPresentationV1 } from '../src/presentationAssessment';
import { FVG, OrderBlock } from '../src/types';

const defaultStore = new JsonlEvidenceStore();

export function recordApprovedSignalEvidenceAsync(
  candidate: NotificationCandidate,
  execution: RuntimeExecutionPipelineResult,
  candles15m: readonly StoredCandle[],
  store: EvidenceStore = defaultStore,
  operational?: SignalOperationalEvidence
): void {
  if (process.env.ENABLE_EVIDENCE_RECORDER === 'false') {
    return;
  }

  const record = buildSignalEvidenceRecord(candidate, execution, candles15m, operational);
  void store.appendSignalEvidence(record).catch(error => {
    console.warn(`[EvidenceRecorder] Signal evidence write failed for ${record.metadata.signalId}:`, error);
  });
}

export interface SignalOperationalEvidence {
  readonly stageDurationsMs: {
    readonly detection: number;
    readonly analysis: number;
    readonly presentation: number;
    readonly communication: number;
    readonly transport: number;
  };
  readonly executionTimeline: readonly import('./telemetry').PipelineTimelineEntry[];
  readonly healthStatus: import('./telemetry').OperationalHealthSnapshot;
  readonly retrySummary: import('./telemetry').OperationalRetrySummary;
  readonly errorSummary: import('./telemetry').OperationalErrorSummary;
  readonly validationGate?: import('../src/signalValidationGate').SignalValidationGateDecision;
  readonly diagnostics: {
    readonly slowStages: readonly string[];
    readonly bottlenecks: readonly string[];
    readonly skippedStages: readonly string[];
  };
}

export function appendCompletedSignalOutcomeEvidenceAsync(
  input: {
    readonly signalId: string;
    readonly outcomeType: CompletedSignalOutcomeEvidence['outcome']['type'];
    readonly holdingTimeMs?: number | null;
    readonly rrAchieved?: number | null;
    readonly maximumFavorableExcursion?: number | null;
    readonly maximumAdverseExcursion?: number | null;
    readonly exitTimestamp: number;
    readonly exitReason: string;
  },
  store: EvidenceStore = defaultStore
): void {
  if (process.env.ENABLE_EVIDENCE_RECORDER === 'false') {
    return;
  }

  const record = createCompletedSignalOutcomeEvidence({
    signalId: input.signalId,
    outcome: {
      type: input.outcomeType,
      holdingTimeMs: input.holdingTimeMs ?? null,
      rrAchieved: input.rrAchieved ?? null,
      maximumFavorableExcursion: input.maximumFavorableExcursion ?? null,
      maximumAdverseExcursion: input.maximumAdverseExcursion ?? null,
      exitTimestamp: input.exitTimestamp,
      exitReason: input.exitReason,
    },
  });

  void store.appendOutcomeEvidence(record).catch(error => {
    console.warn(`[EvidenceRecorder] Outcome evidence write failed for ${record.signalId}:`, error);
  });
}

export function buildSignalEvidenceRecord(
  candidate: NotificationCandidate,
  execution: RuntimeExecutionPipelineResult,
  candles15m: readonly StoredCandle[],
  operational?: SignalOperationalEvidence
): SignalEvidenceRecord {
  const signalId = candidate.signalId ?? candidate.uniqueKey;
  const event = candidate.poi.relatedEvent;
  const createdAt = candidate.signalContext?.timestamp ?? event.breakTimestamp;
  const recordedAt = new Date(createdAt).toISOString();
  const zone = resolvePoiZone(candidate);
  const eventCandle = candles15m.find(candle => candle.timestamp === event.breakTimestamp) ?? null;
  const firstRisk = execution.riskResult.items[0];
  const executionAllowed = firstRisk?.evaluation.executionAllowed === true;
  const initialScreenshotPlan = createSmartScreenshotPlan([...candles15m], candidate, '15m', 100);
  const initialOverlayInput = buildOverlayInput([...candles15m], candidate, 1000, 600, '15m', { visibleRange: initialScreenshotPlan.visibleRange });
  const initialPresentationAssessment = assessPresentationV1(initialOverlayInput ? {
    timeframe: initialOverlayInput.metadata.timeframe,
    metadata: initialOverlayInput.metadata,
    annotations: initialOverlayInput.annotations,
    overlaySimplification: initialOverlayInput.simplification,
  } : null);
  const smartScreenshotPlan = refineSmartScreenshotPlan(initialScreenshotPlan, candles15m.length, initialPresentationAssessment);
  const presentationPlan = buildPresentationPlan({
    assessment: initialPresentationAssessment,
    screenshotPlan: smartScreenshotPlan,
    overlaySimplification: initialOverlayInput?.simplification ?? fallbackOverlaySimplification(),
    candlesLength: candles15m.length,
  });
  const overlayInput = buildOverlayInput([...candles15m], candidate, 1000, 600, '15m', {
    visibleRange: presentationPlan.screenshotPlan.visibleRange,
    overlayBudget: presentationPlan.overlayBudget,
  });
  const presentationAssessmentShadow = assessPresentationV1(overlayInput ? {
    timeframe: overlayInput.metadata.timeframe,
    metadata: overlayInput.metadata,
    annotations: overlayInput.annotations,
    overlaySimplification: overlayInput.simplification,
  } : null);
  const executionView = buildExecutionCardView(candidate, execution);
  const communication = buildCommunicationLayer({ candidate, executionView });
  const validationGate = evaluateSignalValidationGate(candidate, execution);
  const lifecycleSummary = buildLifecycleSummary(candidate, execution, createdAt, recordedAt, operational);
  const benchmarkSummary = buildBenchmarkSummary(execution);
  const governanceSummary = buildGovernanceEvidenceSummary(candidate, recordedAt, communication);

  return createSignalEvidenceRecord({
    metadata: {
      signalId,
      timestamp: createdAt,
      recordedAt,
      symbol: candidate.symbol,
      direction: candidate.tradeDirection,
      timeframe: '15m',
      engineVersion: SIGNAL_EVIDENCE_ENGINE_VERSION,
      detectorVersion: SIGNAL_EVIDENCE_DETECTOR_VERSION,
      gradeVersion: SIGNAL_EVIDENCE_GRADE_VERSION,
    },
    htfContext: {
      bias4H: candidate.bias4H,
      bias1H: candidate.bias1H,
      pd4H: candidate.pd4H,
      pd1H: candidate.pd1H,
      pd15M: candidate.pd15M ?? null,
    },
    structure: {
      eventType: event.type,
      eventTimestamp: event.breakTimestamp,
      eventTimeframe: '15m',
      structureScore: candidate.gradeResult.breakdown.structure,
    },
    poi: {
      poiType: candidate.poiType,
      timeframe: '15m',
      zoneHigh: zone.high,
      zoneLow: zone.low,
      poiAgeMs: Math.max(0, (candidate.signalContext?.timestamp ?? event.breakTimestamp) - candidate.poiFormedTimestamp),
      poiTestCount: candidate.poiTestCount,
    },
    displacement: {
      displacementScore: candidate.gradeResult.breakdown.displacement,
      bodyPercentage: eventCandle ? calculateBodyPercentage(eventCandle) : null,
      range: eventCandle ? eventCandle.high - eventCandle.low : null,
      impulseDirection: event.direction,
    },
    sweep: {
      sweepDetected: candidate.gradeResult.breakdown.sweep > 0,
      sweepDirection: candidate.tradeDirection,
      sweepQuality: sweepQuality(candidate.gradeResult.breakdown.sweep),
    },
    model: {
      modelState: modelState(candidate.gradeResult.breakdown.sweep),
      admissionProfile: candidate.admissionProfile ?? 'PRODUCTION',
    },
    grade: {
      totalScore: candidate.gradeResult.totalScore,
      grade: candidate.gradeResult.grade,
      entryAllowed: candidate.gradeResult.entryAllowed,
      breakdown: candidate.gradeResult.breakdown,
      blockReasons: candidate.gradeResult.blockReasons,
    },
    ...(candidate.setupAssessmentV2 && candidate.setupAssessmentComparison ? {
      setupAssessmentShadow: {
        version: candidate.setupAssessmentV2.version,
        grade: candidate.setupAssessmentV2.grade,
        narrativeAssessment: candidate.setupAssessmentV2.narrativeAssessment,
        quality: candidate.setupAssessmentV2.quality,
        decision: candidate.setupAssessmentV2.decision,
        explainability: candidate.setupAssessmentV2.explainability,
        comparison: candidate.setupAssessmentComparison,
      },
    } : {}),
    presentationAssessmentShadow,
    presentationPlanShadow: presentationPlan,
    presentationDesignValidationShadow: presentationPlan.designValidation,
    smartScreenshotPlanShadow: smartScreenshotPlan,
    overlaySimplificationShadow: overlayInput?.simplification,
    communicationShadow: {
      message: communication.message,
      validation: communication.validation,
      decisionLog: communication.decisionLog,
    },
    validationGate,
    governanceSummary,
    validationSummary: {
      validationVersion: 1,
      lifecycleStatus: candidate.signalContext?.lifecycle.currentState ?? 'DETECTED',
      lifecycleStates: candidate.signalContext?.lifecycle.states ?? ['DETECTED'],
      validationCoverage: 1,
      evidenceCoverage: 1,
      communicationCoverage: communication.validation.consistencyScore > 0 ? 1 : 0,
      presentationCoverage: presentationAssessmentShadow ? 1 : 0,
      validationGateCoverage: validationGate.validationDecision === 'PASS' ? 1 : 0,
    },
    lifecycleSummary,
    benchmarkSummary,
    ...(operational ? { operational } : {}),
    runtime: {
      executionEligibility: executionAllowed,
      decisionCalibration: execution.decisionCalibration,
      riskResult: {
        status: firstRisk?.riskStatus ?? 'NO_RISK',
        executionAllowed,
        reasonCode: firstRisk?.evaluation.reason.code ?? null,
        reasonMessage: firstRisk?.evaluation.reason.message ?? null,
      },
    },
  });
}

function buildGovernanceEvidenceSummary(
  candidate: NotificationCandidate,
  recordedAtIso: string,
  communication: ReturnType<typeof buildCommunicationLayer>
): GovernanceEvidenceSummary {
  const featureFlags = Object.freeze({
    ENABLE_TELEMETRY: process.env.ENABLE_TELEMETRY === 'true',
    ENABLE_VALIDATION_FRAMEWORK: process.env.ENABLE_VALIDATION_FRAMEWORK !== 'false',
    ENABLE_PRESENTATION_V2: process.env.ENABLE_PRESENTATION_V2 === 'true',
    ENABLE_COMMUNICATION_V2: process.env.ENABLE_COMMUNICATION_V2 === 'true',
    ENABLE_RUNTIME_MONITOR: process.env.ENABLE_RUNTIME_MONITOR === 'true',
  });

  return Object.freeze({
    policySummary: Object.freeze({
      featureFlags,
      runtimePolicies: Object.freeze(['Production immutability', 'Shadow-first validation', 'No trade logic mutation']),
      validationPolicies: Object.freeze(['Lifecycle tracking required', 'Benchmark visibility required', 'Trend reporting enabled']),
      communicationPolicies: Object.freeze(['Channel abstraction', 'Narrative preserved', 'Evidence-backed messaging']),
      operationalPolicies: Object.freeze(['Telemetry enabled', 'Retry visibility', 'Health snapshots']),
    }),
    versionSummary: Object.freeze({
      applicationVersion: readPackageVersion(),
      pipelineVersion: '1',
      rulebookVersion: process.env.RULEBOOK_VERSION ?? '1',
      presentationVersion: process.env.PRESENTATION_VERSION ?? '1',
      communicationVersion: process.env.COMMUNICATION_VERSION ?? '1',
      validationVersion: '1',
      governanceVersion: 1,
    }),
    configurationSummary: Object.freeze({
      configVersion: process.env.CONFIG_VERSION ?? '1.0',
      changedFields: Object.freeze(parseList(process.env.CONFIG_CHANGED_FIELDS ?? '')),
      appliedAt: process.env.CONFIG_APPLIED_AT ?? recordedAtIso,
      configurationHash: hashString(JSON.stringify({
        configVersion: process.env.CONFIG_VERSION ?? '1.0',
        changedFields: parseList(process.env.CONFIG_CHANGED_FIELDS ?? ''),
        appliedAt: process.env.CONFIG_APPLIED_AT ?? recordedAtIso,
        flags: featureFlags,
      })),
    }),
    auditSummary: Object.freeze({
      auditCount: 4,
      policyAppliedCount: 1,
      validationCompletedCount: 1,
      communicationSentCount: communication.message.channel === 'Telegram' ? 1 : 0,
    }),
  });
}

function buildLifecycleSummary(
  candidate: NotificationCandidate,
  execution: RuntimeExecutionPipelineResult,
  createdAt: number,
  recordedAtIso: string,
  operational?: SignalOperationalEvidence
): import('../src/signalEvidence').SignalLifecycleSummaryEvidence {
  const completedAt = isTerminalOutcome(execution.signalOutcome?.outcomeType)
    ? execution.signalOutcome?.timestamp ?? null
    : null;

  return {
    createdAt,
    presentedAt: findTimelineStageTime(operational, 'PRESENTATION') ?? createdAt,
    communicatedAt: findTimelineStageTime(operational, 'COMMUNICATION') ?? new Date(recordedAtIso).getTime(),
    completedAt,
    archivedAt: completedAt,
  };
}

function buildBenchmarkSummary(
  execution: RuntimeExecutionPipelineResult
): import('../src/signalEvidence').SignalBenchmarkSummaryEvidence {
  return {
    benchmarkStatus: execution.signalBenchmark?.benchmarkStatus ?? 'SKIPPED',
    predictedGrade: execution.signalBenchmark?.prediction?.predictedGrade ?? null,
    predictedScore: execution.signalBenchmark?.prediction?.predictedScore ?? null,
    outcomeType: normalizeEvidenceOutcomeType(
      execution.signalBenchmark?.reality?.outcomeType ?? execution.signalOutcome?.outcomeType ?? null
    ),
    benchmarkTimestamp: execution.signalBenchmark?.benchmarkTimestamp ?? null,
  };
}

function findTimelineStageTime(
  operational: SignalOperationalEvidence | undefined,
  stage: 'PRESENTATION' | 'COMMUNICATION'
): number | null {
  const entry = operational?.executionTimeline.find(item => item.stage === stage && item.status !== 'SKIPPED');
  if (!entry) return null;
  const timestamp = new Date(entry.endedAt).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isTerminalOutcome(
  outcomeType: RuntimeExecutionPipelineResult['signalOutcome']['outcomeType'] | undefined
): boolean {
  return (
    outcomeType === 'TAKE_PROFIT' ||
    outcomeType === 'STOP_LOSS' ||
    outcomeType === 'EXPIRED' ||
    outcomeType === 'CANCELLED' ||
    outcomeType === 'MANUAL_CANCELLED'
  );
}

function normalizeEvidenceOutcomeType(
  outcomeType: string | null
): import('../src/signalEvidence').SignalBenchmarkSummaryEvidence['outcomeType'] {
  switch (outcomeType) {
    case 'TP':
    case 'SL':
    case 'BE':
    case 'MANUAL':
    case 'EXPIRED':
    case 'CANCELLED':
    case 'UNKNOWN':
      return outcomeType;
    default:
      return null;
  }
}

function readPackageVersion(): string {
  try {
    const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')) as { version?: string };
    return packageJson.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function parseList(value: string): string[] {
  return value.split(',').map(item => item.trim()).filter(Boolean);
}

function hashString(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

function resolvePoiZone(candidate: NotificationCandidate): { high: number; low: number } {
  if (candidate.poiType === 'OB') {
    const ob = candidate.poi as OrderBlock;
    return { high: ob.high, low: ob.low };
  }
  const fvg = candidate.poi as FVG;
  return { high: fvg.gapHigh, low: fvg.gapLow };
}

function calculateBodyPercentage(candle: StoredCandle): number {
  const range = candle.high - candle.low;
  if (range <= 0) return 0;
  return Math.round((Math.abs(candle.close - candle.open) / range) * 10000) / 100;
}

function sweepQuality(score: number): 'strong' | 'weak' | 'missing' {
  if (score >= 2) return 'strong';
  if (score >= 0) return 'weak';
  return 'missing';
}

function modelState(score: number): 'confirmed' | 'weak' | 'missing' {
  if (score >= 2) return 'confirmed';
  if (score >= 0) return 'weak';
  return 'missing';
}

function fallbackOverlaySimplification() {
  return {
    version: 'OverlaySimplification.v1' as const,
    priorityEngineVersion: 'OverlayPriorityEngine.v1' as const,
    originalAnnotationCount: 0,
    annotations: [],
    decisionLog: [],
    metrics: {
      overlayDensity: 0,
      priorityCoverage: 0,
      hiddenAnnotations: 0,
      hiddenLabels: 0,
      visiblePriorityRatio: 0,
      clutterScore: 0,
      hierarchyScore: 0,
    },
    warnings: ['OVERLAY_PREVIEW_MISSING'],
  };
}
