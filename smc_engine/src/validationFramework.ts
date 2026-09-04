import { SignalRecord, SignalRepository } from './signalRepository';
import { SignalOutcomeType } from './signalOutcome';
import { SignalBenchmarkStatus } from './signalBenchmark';
import { SignalEvidenceRecord } from './signalEvidence';
import type { OperationalTelemetryRecord } from '../server/telemetry';

export const VALIDATION_FRAMEWORK_VERSION = 1 as const;

export type ValidationLifecycleStatus =
  | 'DETECTED'
  | 'PRESENTED'
  | 'COMMUNICATED'
  | 'COMPLETED'
  | 'ARCHIVED';

export interface ValidationLifecycleRecord {
  readonly signalId: string;
  readonly createdAt: string;
  readonly presentedAt: string | null;
  readonly communicatedAt: string | null;
  readonly completedAt: string | null;
  readonly archivedAt: string | null;
  readonly lifecycleStatus: ValidationLifecycleStatus;
  readonly validationVersion: typeof VALIDATION_FRAMEWORK_VERSION;
}

export interface ValidationRecord {
  readonly signalId: string;
  readonly createdAt: string;
  readonly completedAt: string | null;
  readonly lifecycleStatus: ValidationLifecycleStatus;
  readonly validationVersion: typeof VALIDATION_FRAMEWORK_VERSION;
  readonly lifecycle: ValidationLifecycleRecord;
  readonly evidenceCoverage: boolean;
  readonly communicationCoverage: boolean;
  readonly presentationCoverage: boolean;
  readonly benchmarkCoverage: boolean;
}

export interface ValidationQualityMetrics {
  readonly signalCount: number;
  readonly completedSignals: number;
  readonly cancelledSignals: number;
  readonly validationCoverage: number;
  readonly evidenceCoverage: number;
  readonly communicationCoverage: number;
  readonly presentationCoverage: number;
}

export interface ValidationTrendPoint {
  readonly period: string;
  readonly signalCount: number;
  readonly completedSignals: number;
  readonly cancelledSignals: number;
  readonly validationCoverage: number;
  readonly evidenceCoverage: number;
  readonly communicationCoverage: number;
  readonly presentationCoverage: number;
}

export interface ValidationTrendSnapshot {
  readonly daily: readonly ValidationTrendPoint[];
  readonly weekly: readonly ValidationTrendPoint[];
  readonly monthly: readonly ValidationTrendPoint[];
}

export interface ValidationBenchmarkSummary {
  readonly benchmarkCoverage: number;
  readonly matchedSignals: number;
  readonly mismatchedSignals: number;
  readonly pendingSignals: number;
  readonly insufficientDataSignals: number;
  readonly skippedSignals: number;
  readonly outcomeCounts: Readonly<Record<SignalOutcomeType, number>>;
  readonly statusCounts: Readonly<Record<SignalBenchmarkStatus, number>>;
}

export interface NormalizedLearningDatasetItem {
  readonly signalId: string;
  readonly analysis: {
    readonly pair: SignalRecord['context']['pair'];
    readonly direction: SignalRecord['context']['direction'];
    readonly timeframe: SignalRecord['context']['timeframe'];
    readonly grade: string | undefined;
    readonly score: number | undefined;
    readonly lifecycleState: string;
    readonly outcomeType: SignalOutcomeType | null;
    readonly benchmarkStatus: SignalBenchmarkStatus | null;
  };
  readonly presentation: {
    readonly presentationAssessmentShadow: boolean;
    readonly presentationPlanShadow: boolean;
    readonly designValidationShadow: boolean;
    readonly smartScreenshotPlanShadow: boolean;
    readonly overlaySimplificationShadow: boolean;
  };
  readonly communication: {
    readonly communicationShadow: boolean;
    readonly messageLength: number | null;
    readonly consistencyScore: number | null;
  };
  readonly operational: {
    readonly available: boolean;
    readonly totalPipelineTimeMs: number | null;
    readonly bottlenecks: readonly string[];
  };
  readonly evidence: {
    readonly recordedAt: string | null;
    readonly evidenceCoverage: boolean;
  };
  readonly validation: {
    readonly lifecycle: ValidationLifecycleRecord;
    readonly evidenceCoverage: boolean;
    readonly communicationCoverage: boolean;
    readonly presentationCoverage: boolean;
    readonly benchmarkCoverage: boolean;
  };
}

export interface BenchmarkFrameworkReport {
  readonly benchmarkCoverage: number;
  readonly benchmarkedSignals: number;
  readonly outcomeCounts: Readonly<Record<SignalOutcomeType, number>>;
  readonly statusCounts: Readonly<Record<SignalBenchmarkStatus, number>>;
  readonly benchmarkCoverageByStatus: Readonly<Record<SignalBenchmarkStatus, number>>;
}

export interface ValidationFrameworkReport {
  readonly validationVersion: typeof VALIDATION_FRAMEWORK_VERSION;
  readonly generatedAt: string;
  readonly lifecycleRecords: readonly ValidationLifecycleRecord[];
  readonly validationRecords: readonly ValidationRecord[];
  readonly qualityMetrics: ValidationQualityMetrics;
  readonly historicalValidation: {
    readonly daily: readonly ValidationTrendPoint[];
    readonly weekly: readonly ValidationTrendPoint[];
    readonly monthly: readonly ValidationTrendPoint[];
  };
  readonly benchmarkFramework: BenchmarkFrameworkReport;
  readonly learningDataset: {
    readonly items: readonly NormalizedLearningDatasetItem[];
  };
  readonly trendReporting: ValidationTrendSnapshot;
  readonly evidenceSummary: {
    readonly validationSummary: string;
    readonly lifecycleSummary: string;
    readonly benchmarkSummary: string;
    readonly trendSnapshot: string;
  };
}

export interface BuildValidationFrameworkInput {
  readonly repository: SignalRepository;
  readonly signalEvidence?: readonly SignalEvidenceRecord[];
  readonly operationalTelemetry?: readonly OperationalTelemetryRecord[];
  readonly generatedAt?: string;
}

export function buildValidationTelemetryRecord(
  report: ValidationFrameworkReport,
  signalId: string
): import('../server/telemetry').ValidationTelemetryRecord {
  const lifecycle = report.lifecycleRecords.find(record => record.signalId === signalId) ?? report.lifecycleRecords[0];
  const benchmark = report.validationRecords.find(record => record.signalId === signalId) ?? report.validationRecords[0];
  return Object.freeze({
    type: 'validation' as const,
    signalId,
    validationVersion: report.validationVersion,
    lifecycleStatus: lifecycle?.lifecycleStatus ?? 'DETECTED',
    lifecycleDurationMs: durationMs(lifecycle?.createdAt, lifecycle?.archivedAt),
    validationDurationMs: null,
    benchmarkDurationMs: null,
    datasetGenerationTimeMs: null,
    trendCalculationTimeMs: null,
    coverage: Object.freeze({
      validation: report.qualityMetrics.validationCoverage,
      evidence: report.qualityMetrics.evidenceCoverage,
      communication: report.qualityMetrics.communicationCoverage,
      presentation: report.qualityMetrics.presentationCoverage,
      benchmark: report.benchmarkFramework.benchmarkCoverage,
    }),
    trendCounts: Object.freeze({
      daily: report.trendReporting.daily.length,
      weekly: report.trendReporting.weekly.length,
      monthly: report.trendReporting.monthly.length,
    }),
    datasetSize: report.learningDataset.items.length,
    benchmarkSummary: Object.freeze({
      matched: report.benchmarkFramework.statusCounts.MATCHED,
      mismatched: report.benchmarkFramework.statusCounts.MISMATCHED,
      pending: report.benchmarkFramework.statusCounts.PENDING,
      insufficientData: report.benchmarkFramework.statusCounts.INSUFFICIENT_DATA,
      skipped: report.benchmarkFramework.statusCounts.SKIPPED,
    }),
    validationSummary: `signalId=${signalId};validationCoverage=${formatRate(report.qualityMetrics.validationCoverage)}`,
    lifecycleSummary: `status=${lifecycle?.lifecycleStatus ?? 'DETECTED'};completed=${Boolean(benchmark?.completedAt)}`,
    trendSnapshot: `daily=${report.trendReporting.daily.length};weekly=${report.trendReporting.weekly.length};monthly=${report.trendReporting.monthly.length}`,
  });
}

export function buildValidationFramework(
  input: BuildValidationFrameworkInput
): ValidationFrameworkReport {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const records = input.repository.listSignals();
  const evidenceBySignalId = indexBySignalId(input.signalEvidence ?? []);
  const operationalBySignalId = indexOperationalBySignalId(input.operationalTelemetry ?? []);

  const lifecycleRecords = records.map(record =>
    buildLifecycleRecord(record, evidenceBySignalId.get(record.signalId), operationalBySignalId.get(record.signalId))
  );
  const validationRecords = records.map(record =>
    buildValidationRecord(record, evidenceBySignalId.get(record.signalId), operationalBySignalId.get(record.signalId))
  );
  const qualityMetrics = buildQualityMetrics(records, validationRecords);
  const historicalValidation = buildHistoricalValidation(validationRecords);
  const benchmarkFramework = buildBenchmarkFramework(records);
  const trendReporting = buildTrendSnapshot(historicalValidation);
  const learningDataset = buildLearningDataset(records, evidenceBySignalId, operationalBySignalId);

  return Object.freeze({
    validationVersion: VALIDATION_FRAMEWORK_VERSION,
    generatedAt,
    lifecycleRecords: Object.freeze(lifecycleRecords),
    validationRecords: Object.freeze(validationRecords),
    qualityMetrics,
    historicalValidation,
    benchmarkFramework,
    learningDataset: Object.freeze({
      items: Object.freeze(learningDataset),
    }),
    trendReporting,
    evidenceSummary: Object.freeze({
      validationSummary: `signals=${qualityMetrics.signalCount};coverage=${formatRate(qualityMetrics.validationCoverage)}`,
      lifecycleSummary: `completed=${qualityMetrics.completedSignals};cancelled=${qualityMetrics.cancelledSignals}`,
      benchmarkSummary: `benchmarked=${benchmarkFramework.benchmarkedSignals};coverage=${formatRate(benchmarkFramework.benchmarkCoverage)}`,
      trendSnapshot: `daily=${trendReporting.daily.length};weekly=${trendReporting.weekly.length};monthly=${trendReporting.monthly.length}`,
    }),
  });
}

function buildLifecycleRecord(
  record: SignalRecord,
  evidence?: SignalEvidenceRecord,
  operational?: OperationalTelemetryRecord
): ValidationLifecycleRecord {
  const createdAt = new Date(record.context.timestamp).toISOString();
  const presentedAt = stageTimestamp(operational, 'PRESENTATION') ?? evidence?.metadata.recordedAt ?? null;
  const communicatedAt = stageTimestamp(operational, 'COMMUNICATION') ?? evidence?.metadata.recordedAt ?? null;
  const completedAt = terminalOutcomeTimestamp(record) ?? null;
  const archivedAt = completedAt ?? null;

  return Object.freeze({
    signalId: record.signalId,
    createdAt,
    presentedAt,
    communicatedAt,
    completedAt,
    archivedAt,
    lifecycleStatus: normalizeLifecycleStatus(record.context.lifecycle.currentState),
    validationVersion: VALIDATION_FRAMEWORK_VERSION,
  });
}

function buildValidationRecord(
  record: SignalRecord,
  evidence?: SignalEvidenceRecord,
  operational?: OperationalTelemetryRecord
): ValidationRecord {
  const lifecycle = buildLifecycleRecord(record, evidence, operational);
  const completedAt = lifecycle.completedAt;
  return Object.freeze({
    signalId: record.signalId,
    createdAt: lifecycle.createdAt,
    completedAt,
    lifecycleStatus: lifecycle.lifecycleStatus,
    validationVersion: VALIDATION_FRAMEWORK_VERSION,
    lifecycle,
    evidenceCoverage: Boolean(evidence),
    communicationCoverage: Boolean(evidence?.communicationShadow),
    presentationCoverage: Boolean(
      evidence?.presentationAssessmentShadow ||
      evidence?.presentationPlanShadow ||
      evidence?.presentationDesignValidationShadow ||
      evidence?.smartScreenshotPlanShadow ||
      evidence?.overlaySimplificationShadow
    ),
    benchmarkCoverage: Boolean(record.benchmark),
  });
}

function buildQualityMetrics(
  records: readonly SignalRecord[],
  validationRecords: readonly ValidationRecord[]
): ValidationQualityMetrics {
  const signalCount = records.length;
  const completedSignals = validationRecords.filter(record => record.completedAt !== null).length;
  const cancelledSignals = records.filter(isCancelledSignal).length;
  const validationCoverage = ratio(validationRecords.length, signalCount);
  const evidenceCoverage = ratio(validationRecords.filter(record => record.evidenceCoverage).length, signalCount);
  const communicationCoverage = ratio(validationRecords.filter(record => record.communicationCoverage).length, signalCount);
  const presentationCoverage = ratio(validationRecords.filter(record => record.presentationCoverage).length, signalCount);

  return Object.freeze({
    signalCount,
    completedSignals,
    cancelledSignals,
    validationCoverage,
    evidenceCoverage,
    communicationCoverage,
    presentationCoverage,
  });
}

function buildHistoricalValidation(validationRecords: readonly ValidationRecord[]) {
  return Object.freeze({
    daily: Object.freeze(buildTrendPoints(validationRecords, 'day')),
    weekly: Object.freeze(buildTrendPoints(validationRecords, 'week')),
    monthly: Object.freeze(buildTrendPoints(validationRecords, 'month')),
  });
}

function buildTrendSnapshot(input: ReturnType<typeof buildHistoricalValidation>): ValidationTrendSnapshot {
  return Object.freeze({
    daily: input.daily,
    weekly: input.weekly,
    monthly: input.monthly,
  });
}

function buildTrendPoints(
  validationRecords: readonly ValidationRecord[],
  bucket: 'day' | 'week' | 'month'
): ValidationTrendPoint[] {
  const groups = new Map<string, ValidationRecord[]>();

  for (const record of validationRecords) {
    const key = bucketKey(record.createdAt, bucket);
    const group = groups.get(key) ?? [];
    group.push(record);
    groups.set(key, group);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([period, group]) => {
      const signalCount = group.length;
      const completedSignals = group.filter(item => item.completedAt !== null).length;
      const cancelledSignals = group.filter(item => item.lifecycleStatus === 'ARCHIVED' && item.completedAt !== null).length;
      return Object.freeze({
        period,
        signalCount,
        completedSignals,
        cancelledSignals,
        validationCoverage: ratio(signalCount, signalCount),
        evidenceCoverage: ratio(group.filter(item => item.evidenceCoverage).length, signalCount),
        communicationCoverage: ratio(group.filter(item => item.communicationCoverage).length, signalCount),
        presentationCoverage: ratio(group.filter(item => item.presentationCoverage).length, signalCount),
      });
    });
}

function buildBenchmarkFramework(records: readonly SignalRecord[]): BenchmarkFrameworkReport {
  const benchmarkedSignals = records.filter(record => Boolean(record.benchmark)).length;
  const benchmarkCoverage = ratio(benchmarkedSignals, records.length);
  const outcomeCounts = countOutcomes(records);
  const statusCounts = countBenchmarkStatuses(records);

  return Object.freeze({
    benchmarkCoverage,
    benchmarkedSignals,
    outcomeCounts,
    statusCounts,
    benchmarkCoverageByStatus: Object.freeze(
      Object.entries(statusCounts).reduce<Record<SignalBenchmarkStatus, number>>((acc, [status, count]) => {
        acc[status as SignalBenchmarkStatus] = ratio(count, records.length);
        return acc;
      }, {
        PENDING: 0,
        MATCHED: 0,
        MISMATCHED: 0,
        INSUFFICIENT_DATA: 0,
        SKIPPED: 0,
      })
    ),
  });
}

function buildLearningDataset(
  records: readonly SignalRecord[],
  evidenceBySignalId: Map<string, SignalEvidenceRecord>,
  operationalBySignalId: Map<string, OperationalTelemetryRecord>
): NormalizedLearningDatasetItem[] {
  return records.map(record => {
    const evidence = evidenceBySignalId.get(record.signalId);
    const operational = operationalBySignalId.get(record.signalId);
    const lifecycle = buildLifecycleRecord(record, evidence, operational);

    return Object.freeze({
      signalId: record.signalId,
      analysis: Object.freeze({
        pair: record.context.pair,
        direction: record.context.direction,
        timeframe: record.context.timeframe,
        grade: record.context.grade,
        score: record.context.score,
        lifecycleState: record.context.lifecycle.currentState,
        outcomeType: record.outcome?.outcomeType ?? null,
        benchmarkStatus: record.benchmark?.benchmarkStatus ?? null,
      }),
      presentation: Object.freeze({
        presentationAssessmentShadow: Boolean(evidence?.presentationAssessmentShadow),
        presentationPlanShadow: Boolean(evidence?.presentationPlanShadow),
        designValidationShadow: Boolean(evidence?.presentationDesignValidationShadow),
        smartScreenshotPlanShadow: Boolean(evidence?.smartScreenshotPlanShadow),
        overlaySimplificationShadow: Boolean(evidence?.overlaySimplificationShadow),
      }),
      communication: Object.freeze({
        communicationShadow: Boolean(evidence?.communicationShadow),
        messageLength: evidence?.communicationShadow ? JSON.stringify(evidence.communicationShadow.message).length : null,
        consistencyScore: evidence?.communicationShadow?.validation.consistencyScore ?? null,
      }),
      operational: Object.freeze({
        available: Boolean(operational),
        totalPipelineTimeMs: operational?.totalPipelineTimeMs ?? null,
        bottlenecks: Object.freeze([...(operational?.diagnostics.bottlenecks ?? [])]),
      }),
      evidence: Object.freeze({
        recordedAt: evidence?.metadata.recordedAt ?? null,
        evidenceCoverage: Boolean(evidence),
      }),
      validation: Object.freeze({
        lifecycle,
        evidenceCoverage: Boolean(evidence),
        communicationCoverage: Boolean(evidence?.communicationShadow),
        presentationCoverage: Boolean(
          evidence?.presentationAssessmentShadow ||
          evidence?.presentationPlanShadow ||
          evidence?.presentationDesignValidationShadow ||
          evidence?.smartScreenshotPlanShadow ||
          evidence?.overlaySimplificationShadow
        ),
        benchmarkCoverage: Boolean(record.benchmark),
      }),
    });
  });
}

function indexBySignalId(records: readonly SignalEvidenceRecord[]): Map<string, SignalEvidenceRecord> {
  const index = new Map<string, SignalEvidenceRecord>();
  for (const record of records) {
    index.set(record.metadata.signalId, record);
  }
  return index;
}

function indexOperationalBySignalId(records: readonly OperationalTelemetryRecord[]): Map<string, OperationalTelemetryRecord> {
  const index = new Map<string, OperationalTelemetryRecord>();
  for (const record of records) {
    index.set(record.signalId, record);
  }
  return index;
}

function terminalOutcomeTimestamp(record: SignalRecord): string | null {
  if (!record.outcome) return null;
  if (!isTerminalOutcome(record.outcome.outcomeType)) return null;
  return new Date(record.outcome.timestamp).toISOString();
}

function isTerminalOutcome(outcomeType: SignalOutcomeType): boolean {
  return outcomeType === 'TAKE_PROFIT' ||
    outcomeType === 'STOP_LOSS' ||
    outcomeType === 'EXPIRED' ||
    outcomeType === 'CANCELLED' ||
    outcomeType === 'MANUAL_CANCELLED';
}

function isCancelledSignal(record: SignalRecord): boolean {
  return record.outcome?.outcomeType === 'CANCELLED' || record.outcome?.outcomeType === 'MANUAL_CANCELLED';
}

function stageTimestamp(
  operational: OperationalTelemetryRecord | undefined,
  stage: 'PRESENTATION' | 'COMMUNICATION'
): string | null {
  const entry = operational?.executionTimeline.find(item => item.stage === stage && item.status !== 'SKIPPED');
  return entry ? entry.endedAt : null;
}

function normalizeLifecycleStatus(status: SignalRecord['context']['lifecycle']['currentState']): ValidationLifecycleStatus {
  switch (status) {
    case 'NOTIFIED':
    case 'WAITING_ENTRY':
    case 'ENTRY_TRIGGERED':
    case 'TAKE_PROFIT':
    case 'STOP_LOSS':
    case 'BREAK_EVEN':
    case 'INVALIDATED':
    case 'EXPIRED':
    case 'CANCELLED':
    case 'MANUAL_CANCELLED':
      return 'COMPLETED';
    case 'OPEN':
      return 'COMMUNICATED';
    case 'PLANNED':
    case 'EXECUTION_READY':
    case 'SIMULATED':
    case 'RISK_ACCEPTED':
      return 'PRESENTED';
    case 'GRADED':
    case 'ELIGIBLE':
    case 'WAIT':
    case 'LOW_CONFIDENCE':
    case 'FILTERED':
    case 'WAITING_RETEST':
    case 'TRIGGERED':
    case 'DETECTED':
    default:
      return 'DETECTED';
  }
}

function countOutcomes(records: readonly SignalRecord[]): Readonly<Record<SignalOutcomeType, number>> {
  return Object.freeze(
    records.reduce<Record<SignalOutcomeType, number>>((acc, record) => {
      const key = record.outcome?.outcomeType;
      if (key) {
        acc[key] = (acc[key] ?? 0) + 1;
      }
      return acc;
    }, {
      WAITING_ENTRY: 0,
      ENTRY_TRIGGERED: 0,
      TAKE_PROFIT: 0,
      STOP_LOSS: 0,
      EXPIRED: 0,
      CANCELLED: 0,
      MANUAL_CANCELLED: 0,
      UNKNOWN: 0,
    })
  );
}

function countBenchmarkStatuses(records: readonly SignalRecord[]): Readonly<Record<SignalBenchmarkStatus, number>> {
  return Object.freeze(
    records.reduce<Record<SignalBenchmarkStatus, number>>((acc, record) => {
      const key = record.benchmark?.benchmarkStatus ?? 'SKIPPED';
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {
      PENDING: 0,
      MATCHED: 0,
      MISMATCHED: 0,
      INSUFFICIENT_DATA: 0,
      SKIPPED: 0,
    })
  );
}

function bucketKey(isoTimestamp: string, bucket: 'day' | 'week' | 'month'): string {
  const date = new Date(isoTimestamp);
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${date.getUTCDate()}`.padStart(2, '0');
  if (bucket === 'day') return `${year}-${month}-${day}`;
  if (bucket === 'month') return `${year}-${month}`;
  return `${year}-W${String(getIsoWeek(date)).padStart(2, '0')}`;
}

function getIsoWeek(date: Date): number {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) {
    target.setUTCDate(1 + ((4 - target.getUTCDay()) + 7) % 7);
  }
  return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
}

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 10000) / 10000;
}

function formatRate(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function durationMs(startIso?: string | null, endIso?: string | null): number | null {
  if (!startIso || !endIso) return null;
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(0, end - start);
}
