import { GradeResult } from './gradeCalculator';
import { DecisionCalibrationResult } from './decisionCalibration';
import { PresentationAssessment } from './presentationAssessment';
import { PresentationPlan } from './presentationPlan';
import { PresentationDesignValidation } from './presentationDesignSystem';
import { SetupAssessment } from './setupAssessment';
import { SetupAssessmentComparison } from './setupAssessmentComparison';
import type { SignalValidationGateDecision } from './signalValidationGate';
import { OverlaySimplificationResult } from '../server/overlaySimplifier';
import type { CommunicationDecisionLog, CommunicationMessage, CommunicationMessageQualityValidation } from './communicationModel';
import type { OperationalErrorSummary, OperationalHealthSnapshot, OperationalRetrySummary, PipelineTimelineEntry } from '../server/telemetry';
import type { GovernanceEvidenceSummary } from './governanceFramework';

export const SIGNAL_EVIDENCE_SCHEMA_VERSION = 1 as const;
export const SIGNAL_EVIDENCE_ENGINE_VERSION = 1 as const;
export const SIGNAL_EVIDENCE_DETECTOR_VERSION = 1 as const;
export const SIGNAL_EVIDENCE_GRADE_VERSION = 1 as const;

export type SignalEvidenceDirection = 'long' | 'short';
import type { Symbol } from '../server/universe';

export type SignalEvidenceSymbol = Symbol;
export type SignalEvidenceTimeframe = '15m';
export type SignalEvidencePoiType = 'OB' | 'FVG';
export type SignalEvidenceStructureType = 'BOS' | 'CHoCH';
export type SignalEvidenceOutcomeType = 'TP' | 'SL' | 'BE' | 'MANUAL' | 'EXPIRED' | 'CANCELLED' | 'UNKNOWN';

export interface SmartScreenshotPlanEvidence {
  readonly version: string;
  readonly timeframe: string;
  readonly focusIndex: number;
  readonly anchorIndices: readonly number[];
  readonly visibleBars: number;
  readonly visibleRange: {
    readonly from: number;
    readonly to: number;
  };
  readonly padding: {
    readonly leftBars: number;
    readonly rightBars: number;
  };
  readonly reasons: readonly string[];
  readonly warnings: readonly string[];
}

export interface SignalValidationSummaryEvidence {
  readonly validationVersion: number;
  readonly lifecycleStatus: string;
  readonly lifecycleStates: readonly string[];
  readonly validationCoverage: number;
  readonly evidenceCoverage: number;
  readonly communicationCoverage: number;
  readonly presentationCoverage: number;
  readonly validationGateCoverage?: number;
}

export interface SignalLifecycleSummaryEvidence {
  readonly createdAt: number;
  readonly presentedAt: number | null;
  readonly communicatedAt: number | null;
  readonly completedAt: number | null;
  readonly archivedAt: number | null;
}

export interface SignalBenchmarkSummaryEvidence {
  readonly benchmarkStatus: string;
  readonly predictedGrade: string | null;
  readonly predictedScore: number | null;
  readonly outcomeType: SignalEvidenceOutcomeType | null;
  readonly benchmarkTimestamp: number | null;
}

export interface SignalTrendSnapshotEvidence {
  readonly generatedAt: string;
  readonly dailySignalCount: number;
  readonly weeklySignalCount: number;
  readonly monthlySignalCount: number;
  readonly dailyCoverage: number;
  readonly weeklyCoverage: number;
  readonly monthlyCoverage: number;
}

export interface SignalEvidenceRecord {
  readonly evidenceSchemaVersion: typeof SIGNAL_EVIDENCE_SCHEMA_VERSION;
  readonly metadata: {
    readonly signalId: string;
    readonly timestamp: number;
    readonly recordedAt: string;
    readonly symbol: SignalEvidenceSymbol;
    readonly direction: SignalEvidenceDirection;
    readonly timeframe: SignalEvidenceTimeframe;
    readonly engineVersion: typeof SIGNAL_EVIDENCE_ENGINE_VERSION;
    readonly detectorVersion: typeof SIGNAL_EVIDENCE_DETECTOR_VERSION;
    readonly gradeVersion: typeof SIGNAL_EVIDENCE_GRADE_VERSION;
  };
  readonly htfContext: {
    readonly bias4H: string;
    readonly bias1H: string;
    readonly pd4H: string;
    readonly pd1H: string;
    readonly pd15M: string | null;
  };
  readonly structure: {
    readonly eventType: SignalEvidenceStructureType;
    readonly eventTimestamp: number;
    readonly eventTimeframe: SignalEvidenceTimeframe;
    readonly structureScore: number;
  };
  readonly poi: {
    readonly poiType: SignalEvidencePoiType;
    readonly timeframe: SignalEvidenceTimeframe;
    readonly zoneHigh: number;
    readonly zoneLow: number;
    readonly poiAgeMs: number;
    readonly poiTestCount: number;
  };
  readonly displacement: {
    readonly displacementScore: number;
    readonly bodyPercentage: number | null;
    readonly range: number | null;
    readonly impulseDirection: 'bullish' | 'bearish';
  };
  readonly sweep: {
    readonly sweepDetected: boolean;
    readonly sweepDirection: SignalEvidenceDirection;
    readonly sweepQuality: 'strong' | 'weak' | 'missing';
  };
  readonly model: {
    readonly modelState: 'confirmed' | 'weak' | 'missing';
    readonly admissionProfile: string;
  };
  readonly grade: {
    readonly totalScore: number;
    readonly grade: GradeResult['grade'];
    readonly entryAllowed: boolean;
    readonly breakdown: GradeResult['breakdown'];
    readonly blockReasons: readonly string[];
  };
  readonly setupAssessmentShadow?: {
    readonly version: SetupAssessment['version'];
    readonly grade: SetupAssessment['grade'];
    readonly narrativeAssessment?: SetupAssessment['narrativeAssessment'];
    readonly quality: SetupAssessment['quality'];
    readonly decision: SetupAssessment['decision'];
    readonly explainability: SetupAssessment['explainability'];
    readonly comparison: SetupAssessmentComparison;
  };
  readonly presentationAssessmentShadow?: PresentationAssessment;
  readonly presentationPlanShadow?: PresentationPlan;
  readonly presentationDesignValidationShadow?: PresentationDesignValidation;
  readonly smartScreenshotPlanShadow?: SmartScreenshotPlanEvidence;
  readonly overlaySimplificationShadow?: OverlaySimplificationResult;
  readonly communicationShadow?: {
    readonly message: CommunicationMessage;
    readonly validation: CommunicationMessageQualityValidation;
    readonly decisionLog: CommunicationDecisionLog;
  };
  readonly validationGate?: SignalValidationGateDecision;
  readonly validationSummary?: SignalValidationSummaryEvidence;
  readonly lifecycleSummary?: SignalLifecycleSummaryEvidence;
  readonly benchmarkSummary?: SignalBenchmarkSummaryEvidence;
  readonly trendSnapshot?: SignalTrendSnapshotEvidence;
  readonly governanceSummary?: GovernanceEvidenceSummary;
  readonly operational?: {
    readonly stageDurationsMs: {
      readonly detection: number;
      readonly analysis: number;
      readonly presentation: number;
      readonly communication: number;
      readonly transport: number;
    };
    readonly executionTimeline: readonly PipelineTimelineEntry[];
    readonly healthStatus: OperationalHealthSnapshot;
    readonly retrySummary: OperationalRetrySummary;
    readonly errorSummary: OperationalErrorSummary;
    readonly diagnostics: {
      readonly slowStages: readonly string[];
      readonly bottlenecks: readonly string[];
      readonly skippedStages: readonly string[];
    };
  };
  readonly runtime: {
    readonly executionEligibility: boolean;
    readonly decisionCalibration: DecisionCalibrationResult;
    readonly riskResult: {
      readonly status: string;
      readonly executionAllowed: boolean;
      readonly reasonCode: string | null;
      readonly reasonMessage: string | null;
    };
  };
}

export interface CompletedSignalOutcomeEvidence {
  readonly evidenceSchemaVersion: typeof SIGNAL_EVIDENCE_SCHEMA_VERSION;
  readonly signalId: string;
  readonly appendedAt: string;
  readonly outcome: {
    readonly type: SignalEvidenceOutcomeType;
    readonly holdingTimeMs: number | null;
    readonly rrAchieved: number | null;
    readonly maximumFavorableExcursion: number | null;
    readonly maximumAdverseExcursion: number | null;
    readonly exitTimestamp: number;
    readonly exitReason: string;
  };
}

export function createSignalEvidenceRecord(
  input: Omit<SignalEvidenceRecord, 'evidenceSchemaVersion'>
): SignalEvidenceRecord {
  return deepFreeze({
    evidenceSchemaVersion: SIGNAL_EVIDENCE_SCHEMA_VERSION,
    ...input,
  });
}

export function createCompletedSignalOutcomeEvidence(
  input: Omit<CompletedSignalOutcomeEvidence, 'evidenceSchemaVersion' | 'appendedAt'> & { readonly appendedAt?: string }
): CompletedSignalOutcomeEvidence {
  return deepFreeze({
    evidenceSchemaVersion: SIGNAL_EVIDENCE_SCHEMA_VERSION,
    appendedAt: input.appendedAt ?? new Date(input.outcome.exitTimestamp).toISOString(),
    signalId: input.signalId,
    outcome: input.outcome,
  });
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
  }
  return value;
}
