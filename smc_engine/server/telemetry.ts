import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { monitorEventLoopDelay } from 'perf_hooks';
import { Symbol, Timeframe } from './candleStore';
import { ALL_SYMBOLS, universeCohort, UNIVERSE_VERSION } from './universe';

type JsonRecord = Record<string, unknown>;

export interface TelemetryTimer {
  readonly startedAt: number;
  readonly startedAtIso: string;
}

export interface PipelineTelemetryRecord extends JsonRecord {
  readonly type: 'pipeline';
  readonly signalId: string;
  readonly symbol: Symbol;
  readonly profile: string;
  readonly detectionStart: string;
  readonly detectionEnd: string;
  readonly detectionTimeMs: number;
  readonly gradeTimeMs: number | null;
  readonly decisionTimeMs: number | null;
  readonly executionEligibilityTimeMs: number | null;
  readonly formatterTimeMs: number;
  readonly screenshotTimeMs: number;
  readonly telegramSendTimeMs: number;
  readonly totalPipelineTimeMs: number;
  readonly executionStatus: string;
  readonly riskStatus: string;
  readonly notificationDelivered: boolean;
  readonly stageDurationsMs?: Readonly<{
    readonly detection: number;
    readonly analysis: number;
    readonly presentation: number;
    readonly communication: number;
    readonly transport: number;
  }>;
  readonly executionTimeline?: readonly PipelineTimelineEntry[];
  readonly healthStatus?: OperationalHealthSnapshot;
  readonly retrySummary?: OperationalRetrySummary;
  readonly errorSummary?: OperationalErrorSummary;
  readonly bottlenecks?: readonly string[];
}

export interface ValidationTelemetryRecord extends JsonRecord {
  readonly type: 'validation';
  readonly signalId: string;
  readonly validationVersion: number;
  readonly lifecycleStatus: string;
  readonly lifecycleDurationMs: number | null;
  readonly validationDurationMs: number | null;
  readonly benchmarkDurationMs: number | null;
  readonly datasetGenerationTimeMs: number | null;
  readonly trendCalculationTimeMs: number | null;
  readonly coverage: {
    readonly validation: number;
    readonly evidence: number;
    readonly communication: number;
    readonly presentation: number;
    readonly benchmark: number;
  };
  readonly trendCounts: {
    readonly daily: number;
    readonly weekly: number;
    readonly monthly: number;
  };
  readonly datasetSize: number;
  readonly benchmarkSummary: {
    readonly matched: number;
    readonly mismatched: number;
    readonly pending: number;
    readonly insufficientData: number;
    readonly skipped: number;
  };
  readonly validationSummary: string;
  readonly lifecycleSummary: string;
  readonly trendSnapshot: string;
}

export interface GovernanceTelemetryRecord extends JsonRecord {
  readonly type: 'governance';
  readonly signalId: string;
  readonly policyEvaluationTimeMs: number;
  readonly configurationLoadTimeMs: number;
  readonly auditWriteTimeMs: number;
  readonly snapshotGenerationTimeMs: number;
  readonly reliabilityMetrics: {
    readonly successRate: number;
    readonly retryRate: number;
    readonly failureRate: number;
    readonly recoveryRate: number;
    readonly pipelineAvailability: number;
  };
  readonly auditEntries: readonly JsonRecord[];
}

export interface PipelineTimelineEntry extends JsonRecord {
  readonly stage: 'DETECTION' | 'ANALYSIS' | 'PRESENTATION' | 'COMMUNICATION' | 'TRANSPORT' | 'DELIVERY';
  readonly startedAt: string;
  readonly endedAt: string;
  readonly durationMs: number;
  readonly status: 'PASS' | 'FAIL' | 'SKIPPED';
}

export interface OperationalHealthSnapshot extends JsonRecord {
  readonly provider: 'OK' | 'DEGRADED' | 'FAILED' | 'SKIPPED';
  readonly telegram: 'OK' | 'DEGRADED' | 'FAILED' | 'SKIPPED';
  readonly screenshot: 'OK' | 'DEGRADED' | 'FAILED' | 'SKIPPED';
  readonly overlay: 'OK' | 'DEGRADED' | 'FAILED' | 'SKIPPED';
  readonly evidence: 'OK' | 'DEGRADED' | 'FAILED' | 'SKIPPED';
}

export interface OperationalRetrySummary extends JsonRecord {
  readonly retryCount: number;
  readonly recoverySuccess: boolean;
  readonly lastFailureReason: string | null;
  readonly retryDurationMs: number;
}

export interface OperationalErrorSummary extends JsonRecord {
  readonly validationErrors: number;
  readonly networkErrors: number;
  readonly timeoutErrors: number;
  readonly renderingErrors: number;
  readonly providerErrors: number;
  readonly internalErrors: number;
  readonly lastErrorCategory: string | null;
  readonly lastErrorMessage: string | null;
}

export interface OperationalTelemetryRecord extends JsonRecord {
  readonly type: 'operational';
  readonly signalId: string;
  readonly symbol: Symbol;
  readonly timeframe: Timeframe;
  readonly profile: string;
  readonly validationDecision?: 'PASS' | 'FAIL';
  readonly entryValidation?: 'PASS' | 'FAIL';
  readonly confirmationValidation?: 'PASS' | 'FAIL';
  readonly htfConsistency?: 'PASS' | 'FAIL';
  readonly validationRejectReasons?: readonly string[];
  readonly totalPipelineTimeMs: number;
  readonly stageDurationsMs: Readonly<{
    readonly detection: number;
    readonly analysis: number;
    readonly presentation: number;
    readonly communication: number;
    readonly transport: number;
  }>;
  readonly executionTimeline: readonly PipelineTimelineEntry[];
  readonly healthStatus: OperationalHealthSnapshot;
  readonly retrySummary: OperationalRetrySummary;
  readonly errorSummary: OperationalErrorSummary;
  readonly diagnostics: {
    readonly slowStages: readonly string[];
    readonly bottlenecks: readonly string[];
    readonly skippedStages: readonly string[];
  };
}

export interface TelegramTelemetryRecord extends JsonRecord {
  readonly type: 'telegram';
  readonly signalId: string;
  readonly requestTimestamp: string;
  readonly responseTimeMs: number;
  readonly success: boolean;
  readonly retryCount: number;
  readonly failureReason: string | null;
}

export interface ScreenshotTelemetryRecord extends JsonRecord {
  readonly type: 'screenshot';
  readonly signalId: string;
  readonly symbol: Symbol;
  readonly timeframe: string;
  readonly chartLoadingTimeMs: number | null;
  readonly screenshotGenerationTimeMs: number;
  readonly uploadTimeMs: number;
  readonly success: boolean;
  readonly fallbackUsed: boolean;
  readonly oneMinuteAvailable: boolean;
  readonly fifteenMinuteFallback: boolean;
  readonly failureReason: string | null;
}

export interface PollingTelemetryRecord extends JsonRecord {
  readonly type: 'polling';
  readonly symbol: Symbol;
  readonly timeframe: Timeframe;
  readonly startedAt: string;
  readonly durationMs: number;
  readonly success: boolean;
  readonly fetchedCandles: number;
  readonly failedReason: string | null;
}

/**
 * One aggregate record per 15M pipeline run.  This makes it possible to answer
 * "what filtered the most setups?" without emitting one noisy log line per POI.
 */
export interface PipelineFilterTelemetryRecord extends JsonRecord {
  readonly type: 'pipeline_filter';
  readonly symbol: Symbol;
  readonly timeframe: '15m';
  readonly evaluatedPois: number;
  readonly candidatesCreated: number;
  readonly rejectionCounts: Readonly<Record<string, number>>;
  /** Observational split of the generic direction-conflict gate. */
  readonly directionConflictCounts?: Readonly<Record<string, number>>;
  /** Number of independent Grade Engine blocks on rejected POIs. */
  readonly gradeBlockOverlap?: Readonly<Record<string, number>>;
  /** Exact normalized combinations for identifying multiplicative veto patterns. */
  readonly gradeBlockCombinations?: Readonly<Record<string, number>>;
  /** Shadow-only: a qualifying grade blocked by exactly this one rule. */
  readonly singleRuleAblationCandidates?: Readonly<Record<string, number>>;
  /** Block combinations collapsed into evidence families. */
  readonly gradeBlockFamilyCombinations?: Readonly<Record<string, number>>;
  /** Grade-stage rule occurrence counts, used as conditional-probability denominators. */
  readonly gradeBlockRuleCounts?: Readonly<Record<string, number>>;
  /** Co-occurring grade-stage rule pairs; key order is canonical. */
  readonly gradeBlockPairCounts?: Readonly<Record<string, number>>;
  /** Shadow-only candidates that would clear grade blocks if an entire family were ignored. */
  readonly groupAblationCandidates?: Readonly<Record<string, number>>;
}

/**
 * Per-POI observation record. It is intentionally telemetry-only: it explains
 * when a POI first became actionable without changing candidate admission.
 */
export interface PoiLifecycleTelemetryRecord extends JsonRecord {
  readonly type: 'poi_lifecycle';
  readonly poiId: string;
  readonly symbol: Symbol;
  readonly timeframe: '15m';
  readonly poiType: 'OB' | 'FVG';
  readonly direction: 'long' | 'short';
  readonly poiCreatedAt: number;
  readonly originStructureEvent: Readonly<{
    readonly type: string;
    readonly direction: string;
    readonly timestamp: number;
  }>;
  readonly observedAt: number;
  readonly currentPrice: number;
  readonly zoneLow: number;
  readonly zoneHigh: number;
  readonly distancePips: number;
  /** Distance normalised by the current 15M ATR. Observational only. */
  readonly distanceAtr: number | null;
  readonly firstApproachAt: number | null;
  readonly firstTouchAt: number | null;
  readonly lastTouchAt: number | null;
  readonly firstGradeEligibleAt: number | null;
  readonly gradeAtFirstEligibility: string | null;
  readonly firstCandidateEligibleAt: number | null;
  readonly candidateCreatedAt: number | null;
  readonly distanceAtFirstApproach: number | null;
  readonly distanceAtrAtFirstApproach: number | null;
  readonly distanceAtFirstEligibility: number | null;
  readonly distanceAtrAtFirstEligibility: number | null;
  readonly distanceAtCandidateCreation: number | null;
  readonly distanceAtrAtCandidateCreation: number | null;
  /** Telemetry diagnostic only; never used to reject a candidate. */
  readonly candidateCreatedAfterOpportunityWindow: boolean | null;
  readonly oppositeStructureEventsSinceOrigin: readonly Readonly<{
    readonly type: string;
    readonly direction: string;
    readonly timestamp: number;
  }>[];
  readonly poiTestCount: number;
  readonly poiInvalidatedAt: number | null;
  /** Provisional reporting label; it never changes candidate admission. */
  readonly lifecycleOutcome:
    | 'OBSERVING'
    | 'NEVER_ELIGIBLE'
    | 'APPROACHED'
    | 'TOUCHED'
    | 'CANDIDATE_CREATED'
    | 'INVALIDATED'
    | 'SUPERSEDED_OBSERVED';
  readonly lifecycleOutcomeReason: string;
  readonly lifecycleCohort: 'OPEN' | 'PENDING_DOWNSTREAM' | 'CLOSED';
  readonly strategyVersion: string;
  readonly configHash: string;
  readonly session: 'ASIA' | 'LONDON' | 'NEW_YORK' | 'OFF_HOURS';
  readonly timing: Readonly<{
    readonly poiAgeMs: number;
    readonly createdToFirstApproachMs: number | null;
    readonly createdToFirstTouchMs: number | null;
    readonly firstTouchToGradeEligibleMs: number | null;
    readonly gradeEligibleToCandidateCreatedMs: number | null;
  }>;
  readonly grade: string | null;
  readonly poiIntegrity?: Readonly<{
    readonly decision: 'PASS' | 'FAIL';
    readonly contributingReasons: readonly string[];
  }>;
  readonly candidateEligible: boolean;
  readonly whyNotCandidateYet: readonly string[];
}

interface PoiLifecycleState {
  readonly poiCreatedAt: number;
  firstApproachAt: number | null;
  firstTouchAt: number | null;
  lastTouchAt: number | null;
  firstGradeEligibleAt: number | null;
  gradeAtFirstEligibility: string | null;
  firstCandidateEligibleAt: number | null;
  candidateCreatedAt: number | null;
  distanceAtFirstApproach: number | null;
  distanceAtrAtFirstApproach: number | null;
  distanceAtFirstEligibility: number | null;
  distanceAtrAtFirstEligibility: number | null;
  distanceAtCandidateCreation: number | null;
  distanceAtrAtCandidateCreation: number | null;
  poiInvalidatedAt: number | null;
}

export interface PoiLifecycleObservation {
  readonly type: 'poi_lifecycle';
  readonly poiId: string;
  readonly symbol: Symbol;
  readonly timeframe: '15m';
  readonly poiType: 'OB' | 'FVG';
  readonly direction: 'long' | 'short';
  readonly poiCreatedAt: number;
  readonly originStructureEvent: PoiLifecycleTelemetryRecord['originStructureEvent'];
  readonly observedAt: number;
  readonly currentPrice: number;
  readonly zoneLow: number;
  readonly zoneHigh: number;
  readonly distancePips: number;
  readonly distanceAtr: number | null;
  readonly oppositeStructureEventsSinceOrigin: PoiLifecycleTelemetryRecord['oppositeStructureEventsSinceOrigin'];
  readonly poiTestCount: number;
  readonly grade: string | null;
  readonly poiIntegrity?: PoiLifecycleTelemetryRecord['poiIntegrity'];
  readonly candidateEligible: boolean;
  readonly whyNotCandidateYet: readonly string[];
  readonly isApproaching: boolean;
  readonly isTouching: boolean;
  readonly isInvalidated: boolean;
}

export interface ProviderTelemetryRecord extends JsonRecord {
  readonly type: 'provider';
  readonly provider: 'TWELVE_DATA';
  readonly requestTimestamp: string;
  readonly responseTimestamp: string;
  readonly latencyMs: number;
  readonly endpoint: string;
  readonly symbol: Symbol;
  readonly timeframe: Timeframe;
  readonly httpStatus: number | null;
  readonly retryCount: number;
  readonly apiCreditsUsed: number | null;
  readonly apiCreditsLeft: number | null;
  readonly success: boolean;
  readonly errorType: string | null;
  readonly errorMessage: string | null;
}

export interface ProviderQueueTelemetryRecord extends JsonRecord {
  readonly type: 'provider_queue';
  readonly provider: 'TWELVE_DATA';
  readonly event: 'ENQUEUED' | 'STARTED' | 'RETRY_WAIT' | 'COMPLETED' | 'FAILED';
  readonly jobId: number;
  readonly endpoint: string;
  readonly symbol: Symbol;
  readonly timeframe: Timeframe;
  readonly jobRetryCount: number;
  readonly queueLength: number;
  readonly activeRequest: {
    readonly id: number;
    readonly endpoint: string;
    readonly symbol: Symbol;
    readonly timeframe: Timeframe;
    readonly retryCount: number;
  } | null;
  readonly waitingJobs: number;
  readonly completedJobs: number;
  readonly retryCount: number;
  readonly failedJobs: number;
}

export interface DeliveryQueueTelemetryRecord extends JsonRecord {
  readonly type: 'delivery_queue';
  readonly signalId: string;
  readonly symbol: Symbol;
  readonly cohort: ReturnType<typeof universeCohort>;
  readonly universeVersion: string;
  readonly event:
    | 'QUEUED'
    | 'DISPATCHING'
    | 'SENT'
    | 'EXPIRED_IN_QUEUE'
    | 'RATE_LIMIT_RETRY'
    | 'SCREENSHOT_FAILED'
    | 'DATA_FAILED'
    | 'TELEGRAM_FAILED';
  readonly state: string;
  readonly queueDepth: number;
  readonly deliveryAttemptCount: number;
  readonly queueDelayMs: number;
  readonly failureReason: string | null;
}

let runtimeMonitorStarted = false;
let consecutivePollingFailures = 0;
let pollCount = 0;
let successfulPollCount = 0;
let failedPollCount = 0;
let longestPollDurationMs = 0;
let totalPollDurationMs = 0;
const eventLoopDelay = monitorEventLoopDelay({ resolution: 20 });
const poiLifecycleState = new Map<string, PoiLifecycleState>();
let poiLifecycleStateLoaded = false;

export function telemetryEnabled(): boolean {
  return process.env.ENABLE_TELEMETRY === 'true';
}

export function runtimeMonitorEnabled(): boolean {
  return telemetryEnabled() && process.env.ENABLE_RUNTIME_MONITOR === 'true';
}

export function latencyMetricsEnabled(): boolean {
  return telemetryEnabled() && process.env.ENABLE_LATENCY_METRICS !== 'false';
}

export function dailyReportEnabled(): boolean {
  return telemetryEnabled() && process.env.ENABLE_DAILY_REPORT === 'true';
}

export function telemetryTimer(): TelemetryTimer {
  const now = new Date();
  return Object.freeze({ startedAt: now.getTime(), startedAtIso: now.toISOString() });
}

export function elapsedMs(timer: TelemetryTimer): number {
  return new Date().getTime() - timer.startedAt;
}

export function recordPipelineTelemetry(record: PipelineTelemetryRecord): void {
  writeJsonl('pipeline.jsonl', record);
}

export function recordOperationalTelemetry(record: OperationalTelemetryRecord): void {
  writeJsonl('operational.jsonl', record);
}

export function recordValidationTelemetry(record: ValidationTelemetryRecord): void {
  writeJsonl('validation.jsonl', record);
}

export function recordGovernanceTelemetry(record: GovernanceTelemetryRecord): void {
  writeJsonl('governance.jsonl', record);
}

export function recordTelegramTelemetry(record: TelegramTelemetryRecord): void {
  writeJsonl('telegram.jsonl', record);
}

export function recordScreenshotTelemetry(record: ScreenshotTelemetryRecord): void {
  writeJsonl('screenshot.jsonl', record);
}

export function recordPollingTelemetry(record: PollingTelemetryRecord): void {
  if (!telemetryEnabled()) return;
  pollCount += 1;
  totalPollDurationMs += record.durationMs;
  longestPollDurationMs = Math.max(longestPollDurationMs, record.durationMs);
  if (record.success) {
    successfulPollCount += 1;
    consecutivePollingFailures = 0;
  } else {
    failedPollCount += 1;
    consecutivePollingFailures += 1;
  }
  writeJsonl('polling.jsonl', {
    ...record,
    cohort: universeCohort(record.symbol),
    universeVersion: UNIVERSE_VERSION,
    pollCount,
    successfulPollCount,
    failedPollCount,
    consecutiveFailures: consecutivePollingFailures,
    averagePollDurationMs: pollCount ? totalPollDurationMs / pollCount : 0,
    longestPollDurationMs,
  });
}

export function recordDeliveryQueueTelemetry(record: DeliveryQueueTelemetryRecord): void {
  if (!telemetryEnabled()) return;
  writeJsonl('delivery-queue.jsonl', record);
}

export function recordPipelineFilterTelemetry(record: PipelineFilterTelemetryRecord): void {
  if (!telemetryEnabled()) return;
  writeJsonl('pipeline-filter.jsonl', record);
}

export function recordPoiLifecycleTelemetry(
  record: PoiLifecycleObservation
): void {
  if (!telemetryEnabled()) return;
  loadPoiLifecycleState();

  const state = normalizePoiLifecycleState(
    poiLifecycleState.get(record.poiId),
    record.poiCreatedAt
  );

  if (record.isApproaching && state.firstApproachAt === null) {
    state.firstApproachAt = record.observedAt;
    state.distanceAtFirstApproach = record.distancePips;
    state.distanceAtrAtFirstApproach = record.distanceAtr;
  }
  if (record.isTouching) {
    state.firstTouchAt ??= record.observedAt;
    state.lastTouchAt = record.observedAt;
  }
  if (record.grade !== null && record.candidateEligible && state.firstGradeEligibleAt === null) {
    state.firstGradeEligibleAt = record.observedAt;
    state.gradeAtFirstEligibility = record.grade;
    state.distanceAtFirstEligibility = record.distancePips;
    state.distanceAtrAtFirstEligibility = record.distanceAtr;
  }
  if (record.candidateEligible && state.firstCandidateEligibleAt === null) {
    state.firstCandidateEligibleAt = record.observedAt;
    state.candidateCreatedAt = record.observedAt;
    state.distanceAtCandidateCreation = record.distancePips;
    state.distanceAtrAtCandidateCreation = record.distanceAtr;
  }
  if (record.isInvalidated && state.poiInvalidatedAt === null) {
    state.poiInvalidatedAt = record.observedAt;
  }
  poiLifecycleState.set(record.poiId, state);
  persistPoiLifecycleState();

  const { isApproaching: _isApproaching, isTouching: _isTouching, isInvalidated: _isInvalidated, ...serializable } = record;
  const lifecycle = resolvePoiLifecycleOutcome(state, record);
  writeJsonl('poi-lifecycle.jsonl', {
    ...serializable,
    firstApproachAt: state.firstApproachAt,
    firstTouchAt: state.firstTouchAt,
    lastTouchAt: state.lastTouchAt,
    firstGradeEligibleAt: state.firstGradeEligibleAt,
    gradeAtFirstEligibility: state.gradeAtFirstEligibility,
    firstCandidateEligibleAt: state.firstCandidateEligibleAt,
    candidateCreatedAt: state.candidateCreatedAt,
    distanceAtFirstApproach: state.distanceAtFirstApproach,
    distanceAtrAtFirstApproach: state.distanceAtrAtFirstApproach,
    distanceAtFirstEligibility: state.distanceAtFirstEligibility,
    distanceAtrAtFirstEligibility: state.distanceAtrAtFirstEligibility,
    distanceAtCandidateCreation: state.distanceAtCandidateCreation,
    distanceAtrAtCandidateCreation: state.distanceAtrAtCandidateCreation,
    candidateCreatedAfterOpportunityWindow: state.candidateCreatedAt === null
      ? null
      : isBeyondTelemetryOpportunityWindow(state.distanceAtrAtCandidateCreation),
    poiInvalidatedAt: state.poiInvalidatedAt,
    lifecycleOutcome: lifecycle.outcome,
    lifecycleOutcomeReason: lifecycle.reason,
    lifecycleCohort: lifecycleCohort(lifecycle.outcome),
    strategyVersion: strategyVersion(),
    configHash: lifecycleConfigHash(),
    session: tradingSession(record.observedAt),
    timing: {
      poiAgeMs: Math.max(0, record.observedAt - record.poiCreatedAt),
      createdToFirstApproachMs: elapsedFrom(record.poiCreatedAt, state.firstApproachAt),
      createdToFirstTouchMs: elapsedFrom(record.poiCreatedAt, state.firstTouchAt),
      firstTouchToGradeEligibleMs: elapsedBetween(state.firstTouchAt, state.firstGradeEligibleAt),
      gradeEligibleToCandidateCreatedMs: elapsedBetween(state.firstGradeEligibleAt, state.candidateCreatedAt),
    },
  });
}

function resolvePoiLifecycleOutcome(
  state: PoiLifecycleState,
  record: PoiLifecycleObservation
): { outcome: PoiLifecycleTelemetryRecord['lifecycleOutcome']; reason: string } {
  // Ordering is deliberate: invalidation is factual, while an opposite event is
  // only an observation until future calibration proves it supersedes a POI.
  if (state.poiInvalidatedAt !== null) {
    return { outcome: 'INVALIDATED', reason: 'completed-candle invalidation threshold crossed' };
  }
  if (record.oppositeStructureEventsSinceOrigin.length > 0) {
    return { outcome: 'SUPERSEDED_OBSERVED', reason: 'opposite structure event observed; no automatic invalidation applied' };
  }
  if (state.candidateCreatedAt !== null) {
    return { outcome: 'CANDIDATE_CREATED', reason: 'candidate admission conditions were observed' };
  }
  if (state.firstTouchAt !== null) {
    return { outcome: 'TOUCHED', reason: 'price touched the POI before candidate admission' };
  }
  if (state.firstApproachAt !== null) {
    return { outcome: 'APPROACHED', reason: 'price came within the telemetry-only approach threshold' };
  }
  if (record.whyNotCandidateYet.length > 0) {
    return { outcome: 'OBSERVING', reason: `not yet eligible: ${record.whyNotCandidateYet.join(', ')}` };
  }
  return { outcome: 'OBSERVING', reason: 'no decisive lifecycle transition observed yet' };
}

function lifecycleCohort(outcome: PoiLifecycleTelemetryRecord['lifecycleOutcome']): PoiLifecycleTelemetryRecord['lifecycleCohort'] {
  if (outcome === 'INVALIDATED') return 'CLOSED';
  if (outcome === 'CANDIDATE_CREATED') return 'PENDING_DOWNSTREAM';
  return 'OPEN';
}

function strategyVersion(): string {
  return process.env.STRATEGY_VERSION ?? process.env.npm_package_version ?? '1.0.0';
}

function lifecycleConfigHash(): string {
  // Never hash the entire environment: it may contain credentials. This is only
  // the small set of settings that changes pipeline admission/calibration.
  const config = {
    profile: process.env.ENABLE_PVP_SIGNAL_ACCELERATION ?? 'false',
    telemetry: process.env.ENABLE_TELEMETRY ?? 'false',
    signalQuality: process.env.ENABLE_SIGNAL_QUALITY_ENGINE ?? 'false',
    approachPips: '15-observational-only',
    invalidationTolerancePips: '1',
    atrPeriod: 14,
  };
  return createHash('sha256').update(JSON.stringify(config)).digest('hex').slice(0, 12);
}

function tradingSession(timestamp: number): PoiLifecycleTelemetryRecord['session'] {
  const hour = new Date(timestamp).getUTCHours();
  if (hour < 7) return 'ASIA';
  if (hour < 13) return 'LONDON';
  if (hour < 21) return 'NEW_YORK';
  return 'OFF_HOURS';
}

function isBeyondTelemetryOpportunityWindow(distanceAtr: number | null): boolean {
  return distanceAtr !== null && distanceAtr >= 1.5;
}

function normalizePoiLifecycleState(
  existing: PoiLifecycleState | undefined,
  poiCreatedAt: number
): PoiLifecycleState {
  return {
    poiCreatedAt: existing?.poiCreatedAt ?? poiCreatedAt,
    firstApproachAt: existing?.firstApproachAt ?? null,
    firstTouchAt: existing?.firstTouchAt ?? null,
    lastTouchAt: existing?.lastTouchAt ?? null,
    firstGradeEligibleAt: existing?.firstGradeEligibleAt ?? null,
    gradeAtFirstEligibility: existing?.gradeAtFirstEligibility ?? null,
    firstCandidateEligibleAt: existing?.firstCandidateEligibleAt ?? null,
    candidateCreatedAt: existing?.candidateCreatedAt ?? null,
    distanceAtFirstApproach: existing?.distanceAtFirstApproach ?? null,
    distanceAtrAtFirstApproach: existing?.distanceAtrAtFirstApproach ?? null,
    distanceAtFirstEligibility: existing?.distanceAtFirstEligibility ?? null,
    distanceAtrAtFirstEligibility: existing?.distanceAtrAtFirstEligibility ?? null,
    distanceAtCandidateCreation: existing?.distanceAtCandidateCreation ?? null,
    distanceAtrAtCandidateCreation: existing?.distanceAtrAtCandidateCreation ?? null,
    poiInvalidatedAt: existing?.poiInvalidatedAt ?? null,
  };
}

function elapsedFrom(start: number, end: number | null): number | null {
  return end === null ? null : Math.max(0, end - start);
}

function elapsedBetween(start: number | null, end: number | null): number | null {
  return start === null || end === null ? null : Math.max(0, end - start);
}

export function recordProviderTelemetry(record: ProviderTelemetryRecord): void {
  writeJsonl('provider.jsonl', record);
}

export function recordProviderQueueTelemetry(record: ProviderQueueTelemetryRecord): void {
  writeJsonl('provider-queue.jsonl', record);
}

export function startRuntimeTelemetryMonitor(): void {
  if (!runtimeMonitorEnabled() || runtimeMonitorStarted) return;
  runtimeMonitorStarted = true;
  eventLoopDelay.enable();
  const intervalMs = numberFromEnv('RUNTIME_MONITOR_INTERVAL_MS') ?? 60_000;
  setInterval(() => {
    const memory = process.memoryUsage();
    const cpu = process.cpuUsage();
    writeJsonl('runtime.jsonl', {
      type: 'runtime',
      timestamp: new Date().toISOString(),
      memoryRssBytes: memory.rss,
      heapTotalBytes: memory.heapTotal,
      heapUsedBytes: memory.heapUsed,
      externalBytes: memory.external,
      cpuUserMicros: cpu.user,
      cpuSystemMicros: cpu.system,
      eventLoopDelayMeanMs: Number.isFinite(eventLoopDelay.mean) ? eventLoopDelay.mean / 1_000_000 : null,
      eventLoopDelayMaxMs: Number.isFinite(eventLoopDelay.max) ? eventLoopDelay.max / 1_000_000 : null,
      pollCount,
      successfulPollCount,
      failedPollCount,
      consecutivePollingFailures,
      averagePollDurationMs: pollCount ? totalPollDurationMs / pollCount : 0,
      longestPollDurationMs,
    });
    eventLoopDelay.reset();
  }, intervalMs).unref();
}

export function generateDailyQualificationReport(): string {
  const pipeline = readJsonl('pipeline.jsonl');
  const operational = readJsonl('operational.jsonl');
  const validation = readJsonl('validation.jsonl');
  const governance = readJsonl('governance.jsonl');
  const telegram = readJsonl('telegram.jsonl');
  const screenshot = readJsonl('screenshot.jsonl');
  const runtime = readJsonl('runtime.jsonl');
  const polling = readJsonl('polling.jsonl');
  const provider = readJsonl('provider.jsonl');
  const providerQueue = readJsonl('provider-queue.jsonl');
  const deliveryQueue = readJsonl('delivery-queue.jsonl');
  const pipelineFilters = readJsonl('pipeline-filter.jsonl');
  const lifecycle = latestPoiLifecycleRecords(readJsonl('poi-lifecycle.jsonl'));
  const approachedPois = lifecycle.filter(record => numberOrNull(record.firstApproachAt) !== null);
  const touchedPois = lifecycle.filter(record => numberOrNull(record.firstTouchAt) !== null);
  const gradeEligiblePois = lifecycle.filter(record => numberOrNull(record.firstGradeEligibleAt) !== null);
  const candidatePois = lifecycle.filter(record => numberOrNull(record.candidateCreatedAt) !== null);
  const lateCandidates = candidatePois.filter(record => record.candidateCreatedAfterOpportunityWindow === true);
  const lifecycleOutcomes = countByString(lifecycle, 'lifecycleOutcome');
  const lifecycleCohorts = countByString(lifecycle, 'lifecycleCohort');
  const byPairAndPoi = countByComposite(lifecycle, ['symbol', 'poiType']);
  const bySession = countByString(lifecycle, 'session');
  const touchToEligible = nestedNumbers(lifecycle, ['timing', 'firstTouchToGradeEligibleMs']);
  const eligibleToCandidate = nestedNumbers(lifecycle, ['timing', 'gradeEligibleToCandidateCreatedMs']);
  const directionConflictCounts = sumNestedCountRecords(pipelineFilters, 'directionConflictCounts');
  const gradeBlockOverlap = sumNestedCountRecords(pipelineFilters, 'gradeBlockOverlap');
  const gradeBlockCombinations = sumNestedCountRecords(pipelineFilters, 'gradeBlockCombinations');
  const singleRuleAblationCandidates = sumNestedCountRecords(pipelineFilters, 'singleRuleAblationCandidates');
  const gradeBlockFamilyCombinations = sumNestedCountRecords(pipelineFilters, 'gradeBlockFamilyCombinations');
  const gradeBlockRuleCounts = sumNestedCountRecords(pipelineFilters, 'gradeBlockRuleCounts');
  const gradeBlockPairCounts = sumNestedCountRecords(pipelineFilters, 'gradeBlockPairCounts');
  const groupAblationCandidates = sumNestedCountRecords(pipelineFilters, 'groupAblationCandidates');
  const funnelLines = diagnosticFunnelLines(lifecycle, operational, deliveryQueue);
  const symbolFunnelLines = diagnosticSymbolFunnelLines(lifecycle, operational, deliveryQueue);
  const validationDiagnosticLines = diagnosticValidationLines(operational);
  const candidateTimingLines = diagnosticCandidateTimingLines(lifecycle);
  const deliveryDiagnosticLines = diagnosticDeliveryLines(deliveryQueue, telegram);
  const providerDiagnosticLines = diagnosticProviderLines(polling, provider, providerQueue);
  const diagnosticWarnings = diagnosticWarningLines(lifecycle, operational, deliveryQueue, polling, provider);
  const telemetryFreshnessLines = diagnosticTelemetryFreshnessLines({
    pipeline,
    operational,
    validation,
    governance,
    telegram,
    screenshot,
    runtime,
    polling,
    provider,
    providerQueue,
    deliveryQueue,
    pipelineFilters,
    lifecycle,
  });

  const totalSignals = pipeline.length;
  const pipelineLatencies = numbers(pipeline, 'totalPipelineTimeMs');
  const telegramSuccessRate = rate(telegram, 'success');
  const screenshotSuccessRate = rate(screenshot, 'success');
  const pollingSuccessRate = rate(polling, 'success');
  const heapUsed = numbers(runtime, 'heapUsedBytes');
  const rss = numbers(runtime, 'memoryRssBytes');
  const cpuUser = numbers(runtime, 'cpuUserMicros');
  const cpuSystem = numbers(runtime, 'cpuSystemMicros');
  const stageDetection = nestedNumbers(operational, ['stageDurationsMs', 'detection']);
  const stageAnalysis = nestedNumbers(operational, ['stageDurationsMs', 'analysis']);
  const stagePresentation = nestedNumbers(operational, ['stageDurationsMs', 'presentation']);
  const stageCommunication = nestedNumbers(operational, ['stageDurationsMs', 'communication']);
  const stageTransport = nestedNumbers(operational, ['stageDurationsMs', 'transport']);
  const validationDuration = numbers(validation, 'validationDurationMs');
  const benchmarkDuration = numbers(validation, 'benchmarkDurationMs');
  const datasetGenerationTime = numbers(validation, 'datasetGenerationTimeMs');
  const trendCalculationTime = numbers(validation, 'trendCalculationTimeMs');
  const policyEvaluationTime = numbers(governance, 'policyEvaluationTimeMs');
  const configurationLoadTime = numbers(governance, 'configurationLoadTimeMs');
  const auditWriteTime = numbers(governance, 'auditWriteTimeMs');
  const snapshotGenerationTime = numbers(governance, 'snapshotGenerationTimeMs');
  const validationPassRate = ratioOfString(operational, 'validationDecision', 'PASS');
  const validationRejectRate = ratioOfString(operational, 'validationDecision', 'FAIL');
  const expiredSetupCount = countString(operational, 'validationRejectReasons', 'setup timeout exceeded');
  const invalidEntryCount = countString(operational, 'validationRejectReasons', 'price moved too far from entry zone');
  const confirmationTimeoutCount = countString(operational, 'validationRejectReasons', 'manual confirmation is no longer reachable');
  const htfMismatchCount = countString(operational, 'validationRejectReasons', 'HTF bias does not match trade direction');

  const thresholds = qualificationThresholds();
  const verdict = resolveDailyVerdict({
    averagePipelineLatencyMs: average(pipelineLatencies),
    telegramSuccessRate,
    screenshotSuccessRate,
    pollingSuccessRate,
    thresholds,
  });

  const report = [
    '# Daily Operational Qualification Report',
    '',
    `Generated At: ${new Date().toISOString()}`,
    '',
    '## Summary',
    '',
    `Total Signals: ${totalSignals}`,
    `Average Pipeline Latency: ${formatNumber(average(pipelineLatencies))} ms`,
    `Max Pipeline Latency: ${formatNumber(max(pipelineLatencies))} ms`,
    `Telegram Success Rate: ${formatPercent(telegramSuccessRate)}`,
    `Screenshot Success Rate: ${formatPercent(screenshotSuccessRate)}`,
    `Polling Success Rate: ${formatPercent(pollingSuccessRate)}`,
    `Operational Samples: ${operational.length}`,
    `Validation Samples: ${validation.length}`,
    `Governance Samples: ${governance.length}`,
    '',
    '## Telemetry Freshness',
    '',
    ...telemetryFreshnessLines,
    '',
    '## Runtime Health',
    '',
    `Memory RSS Average: ${formatNumber(average(rss))} bytes`,
    `Memory RSS Max: ${formatNumber(max(rss))} bytes`,
    `Heap Used Average: ${formatNumber(average(heapUsed))} bytes`,
    `Heap Used Max: ${formatNumber(max(heapUsed))} bytes`,
    `CPU User Max: ${formatNumber(max(cpuUser))} microseconds`,
    `CPU System Max: ${formatNumber(max(cpuSystem))} microseconds`,
    '',
    '## Poll Stability',
    '',
    `Poll Count: ${polling.length}`,
    `Successful Polls: ${polling.filter(entry => entry.success === true).length}`,
    `Failed Polls: ${polling.filter(entry => entry.success === false).length}`,
    `Longest Poll Duration: ${formatNumber(max(numbers(polling, 'durationMs')))} ms`,
    `Average Detection Stage: ${formatNumber(average(stageDetection))} ms`,
    `Average Analysis Stage: ${formatNumber(average(stageAnalysis))} ms`,
    `Average Presentation Stage: ${formatNumber(average(stagePresentation))} ms`,
    `Average Communication Stage: ${formatNumber(average(stageCommunication))} ms`,
    `Average Transport Stage: ${formatNumber(average(stageTransport))} ms`,
    `Average Validation Duration: ${formatNumber(average(validationDuration))} ms`,
    `Average Benchmark Duration: ${formatNumber(average(benchmarkDuration))} ms`,
    `Average Dataset Generation Time: ${formatNumber(average(datasetGenerationTime))} ms`,
    `Average Trend Calculation Time: ${formatNumber(average(trendCalculationTime))} ms`,
    `Average Policy Evaluation Time: ${formatNumber(average(policyEvaluationTime))} ms`,
    `Average Configuration Load Time: ${formatNumber(average(configurationLoadTime))} ms`,
    `Average Audit Write Time: ${formatNumber(average(auditWriteTime))} ms`,
    `Average Snapshot Generation Time: ${formatNumber(average(snapshotGenerationTime))} ms`,
    `Validation Pass Rate: ${formatPercent(validationPassRate)}`,
    `Validation Reject Rate: ${formatPercent(validationRejectRate)}`,
    `Expired Setup Count: ${expiredSetupCount}`,
    `Invalid Entry Count: ${invalidEntryCount}`,
    `Confirmation Timeout Count: ${confirmationTimeoutCount}`,
    `HTF Mismatch Count: ${htfMismatchCount}`,
    '',
    '## POI Lifecycle Funnel (Observational)',
    '',
    `Active POIs: ${lifecycle.length}`,
    `Approached: ${approachedPois.length} (${formatPercentOf(approachedPois.length, lifecycle.length)})`,
    `Touched: ${touchedPois.length} (${formatPercentOf(touchedPois.length, lifecycle.length)})`,
    `Grade Eligible: ${gradeEligiblePois.length} (${formatPercentOf(gradeEligiblePois.length, lifecycle.length)})`,
    `Candidate Created: ${candidatePois.length} (${formatPercentOf(candidatePois.length, lifecycle.length)})`,
    `Candidate Created Beyond 1.5 ATR (telemetry diagnostic): ${lateCandidates.length} (${formatPercentOf(lateCandidates.length, candidatePois.length)})`,
    `Lifecycle Outcomes: ${formatCounts(lifecycleOutcomes)}`,
    `Lifecycle Cohorts: ${formatCounts(lifecycleCohorts)}`,
    `Pair / POI Type: ${formatCounts(byPairAndPoi)}`,
    `Session: ${formatCounts(bySession)}`,
    `Median first-touch → grade-eligible: ${formatNumber(median(touchToEligible))} ms`,
    `P90 first-touch → grade-eligible: ${formatNumber(percentile(touchToEligible, 0.9))} ms`,
    `Median grade-eligible → candidate-created: ${formatNumber(median(eligibleToCandidate))} ms`,
    `P90 grade-eligible → candidate-created: ${formatNumber(percentile(eligibleToCandidate, 0.9))} ms`,
    '',
    '## Filter Anatomy (Observational)',
    '',
    `Direction Conflict Breakdown: ${formatCounts(directionConflictCounts)}`,
    `Grade Block Overlap: ${formatCounts(gradeBlockOverlap)}`,
    `Top Grade Block Combinations: ${formatCountsLimited(gradeBlockCombinations, 10)}`,
    `Single-rule Shadow Admission Candidates: ${formatCounts(singleRuleAblationCandidates)}`,
    `Top Evidence-family Combinations: ${formatCountsLimited(gradeBlockFamilyCombinations, 10)}`,
    `Top Rule Pair Co-occurrence: ${formatConditionalPairs(gradeBlockPairCounts, gradeBlockRuleCounts, 10)}`,
    `Group-ablation Shadow Admission Candidates: ${formatCounts(groupAblationCandidates)}`,
    '',
    '## Production Diagnostic Funnel',
    '',
    ...funnelLines,
    '',
    '## Symbol Diagnostic Funnel',
    '',
    ...symbolFunnelLines,
    '',
    '## Candidate Timing Diagnostics',
    '',
    ...candidateTimingLines,
    '',
    '## Validation Rejection Diagnostics',
    '',
    ...validationDiagnosticLines,
    '',
    '## Delivery Queue Diagnostics',
    '',
    ...deliveryDiagnosticLines,
    '',
    '## Provider Diagnostics',
    '',
    ...providerDiagnosticLines,
    '',
    '## Diagnostic Warnings',
    '',
    ...diagnosticWarnings,
    '',
    '## Thresholds',
    '',
    `Pipeline Latency Threshold: ${thresholdText(thresholds.pipelineLatencyMs, 'ms')}`,
    `Telegram Success Threshold: ${thresholdText(thresholds.telegramSuccessRate, '')}`,
    `Screenshot Success Threshold: ${thresholdText(thresholds.screenshotSuccessRate, '')}`,
    `Polling Uptime Threshold: ${thresholdText(thresholds.pollingSuccessRate, '')}`,
    '',
    '## Qualification Verdict',
    '',
    verdict,
    '',
  ].join('\n');

  ensureTelemetryDir();
  const reportPath = path.join(telemetryDir(), `daily-report-${new Date().toISOString().slice(0, 10)}.md`);
  fs.writeFileSync(reportPath, report, 'utf8');
  return reportPath;
}

export function maybeGenerateDailyQualificationReport(): void {
  if (!dailyReportEnabled()) return;
  const intervalMs = numberFromEnv('REPORT_INTERVAL_MS') ?? 24 * 60 * 60 * 1000;
  setInterval(() => {
    const reportPath = generateDailyQualificationReport();
    console.log(`[Telemetry] Daily qualification report generated: ${reportPath}`);
  }, intervalMs).unref();
}

function writeJsonl(fileName: string, record: JsonRecord): void {
  if (!telemetryEnabled()) return;
  ensureTelemetryDir();
  fs.appendFileSync(path.join(telemetryDir(), fileName), `${JSON.stringify({ ...record, timestamp: new Date().toISOString() })}\n`, 'utf8');
}

function loadPoiLifecycleState(): void {
  if (poiLifecycleStateLoaded) return;
  poiLifecycleStateLoaded = true;
  const statePath = path.join(telemetryDir(), 'poi-lifecycle-state.json');
  if (!fs.existsSync(statePath)) return;
  try {
    const raw = JSON.parse(fs.readFileSync(statePath, 'utf8')) as Record<string, PoiLifecycleState>;
    for (const [poiId, state] of Object.entries(raw)) {
      if (state && typeof state.poiCreatedAt === 'number') poiLifecycleState.set(poiId, state);
    }
  } catch {
    // Telemetry must never affect production signal processing.
  }
}

function persistPoiLifecycleState(): void {
  try {
    ensureTelemetryDir();
    const statePath = path.join(telemetryDir(), 'poi-lifecycle-state.json');
    const serializable = Object.fromEntries(poiLifecycleState.entries());
    fs.writeFileSync(statePath, JSON.stringify(serializable), 'utf8');
  } catch {
    // Telemetry persistence is observational only.
  }
}

function telemetryDir(): string {
  return process.env.TELEMETRY_DIRECTORY || 'telemetry';
}

function ensureTelemetryDir(): void {
  fs.mkdirSync(telemetryDir(), { recursive: true });
}

function readJsonl(fileName: string): JsonRecord[] {
  const filePath = path.join(telemetryDir(), fileName);
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

function latestPoiLifecycleRecords(records: JsonRecord[]): JsonRecord[] {
  const latest = new Map<string, JsonRecord>();
  for (const record of records) {
    const poiId = typeof record.poiId === 'string' ? record.poiId : null;
    if (poiId) latest.set(poiId, record);
  }
  return [...latest.values()];
}

function diagnosticFunnelLines(
  lifecycle: JsonRecord[],
  operational: JsonRecord[],
  deliveryQueue: JsonRecord[]
): string[] {
  const cohorts = ['CORE_UNIVERSE', 'NEW_CROSS_UNIVERSE'] as const;
  const lines: string[] = [
    diagnosticFunnelLine('ALL', lifecycle, operational, deliveryQueue),
  ];
  for (const cohort of cohorts) {
    lines.push(diagnosticFunnelLine(
      cohort,
      lifecycle.filter(record => cohortOfRecord(record) === cohort),
      operational.filter(record => cohortOfRecord(record) === cohort),
      deliveryQueue.filter(record => cohortOfRecord(record) === cohort)
    ));
  }
  lines.push('');
  lines.push(`Funnel Conversion: ${formatFunnelConversions(funnelCounts(lifecycle, operational, deliveryQueue))}`);
  return lines;
}

function diagnosticFunnelLine(
  label: string,
  lifecycle: JsonRecord[],
  operational: JsonRecord[],
  deliveryQueue: JsonRecord[]
): string {
  const counts = funnelCounts(lifecycle, operational, deliveryQueue);
  return `${label}: POI=${counts.poi}, ACTIVE=${counts.active}, APPROACHED=${counts.approached}, TOUCHED=${counts.touched}, GRADE_ELIGIBLE=${counts.gradeEligible}, A=${counts.a}, A+=${counts.aPlus}, A_OR_A_PLUS=${counts.aOrAPlus}, CANDIDATE_ELIGIBLE=${counts.candidateEligible}, CANDIDATE_CREATED=${counts.candidateCreated}, VALIDATION_PASS=${counts.validationPass}, VALIDATION_REJECTED=${counts.validationRejected}, QUEUED=${counts.queued}, DISPATCHING=${counts.dispatching}, SENT=${counts.sent}`;
}

function diagnosticSymbolFunnelLines(
  lifecycle: JsonRecord[],
  operational: JsonRecord[],
  deliveryQueue: JsonRecord[]
): string[] {
  const lines = ALL_SYMBOLS.map(symbol => diagnosticFunnelLine(
    symbol,
    lifecycle.filter(record => record.symbol === symbol),
    operational.filter(record => record.symbol === symbol),
    deliveryQueue.filter(record => record.symbol === symbol)
  ));
  const bySession = groupByString(lifecycle, 'session');
  const byPoiType = groupByString(lifecycle, 'poiType');
  lines.push('');
  lines.push(`Session Split: ${Object.entries(bySession).map(([session, records]) => `${session}{${diagnosticFunnelLine('', records, operationalForPois(operational, records), deliveryForPois(deliveryQueue, records)).replace(/^: /, '')}}`).join(' | ') || 'None'}`);
  lines.push(`POI Type Split: ${Object.entries(byPoiType).map(([poiType, records]) => `${poiType}{${diagnosticFunnelLine('', records, operationalForPois(operational, records), deliveryForPois(deliveryQueue, records)).replace(/^: /, '')}}`).join(' | ') || 'None'}`);
  return lines;
}

function diagnosticCandidateTimingLines(lifecycle: JsonRecord[]): string[] {
  const candidates = lifecycle.filter(record => numberOrNull(record.candidateCreatedAt) !== null);
  const createdToApproach = nestedNumbers(lifecycle, ['timing', 'createdToFirstApproachMs']);
  const createdToTouch = nestedNumbers(lifecycle, ['timing', 'createdToFirstTouchMs']);
  const touchToGrade = nestedNumbers(lifecycle, ['timing', 'firstTouchToGradeEligibleMs']);
  const gradeToCandidate = nestedNumbers(lifecycle, ['timing', 'gradeEligibleToCandidateCreatedMs']);
  const latenessClasses = countByComputed(candidates, candidateLatenessClass);
  return [
    `Candidate Count: ${candidates.length}`,
    `Candidate Lateness Classes: ${formatCounts(latenessClasses)}`,
    `created → firstApproach: median=${formatDuration(median(createdToApproach))}, p90=${formatDuration(percentile(createdToApproach, 0.9))}, max=${formatDuration(max(createdToApproach))}`,
    `created → firstTouch: median=${formatDuration(median(createdToTouch))}, p90=${formatDuration(percentile(createdToTouch, 0.9))}, max=${formatDuration(max(createdToTouch))}`,
    `firstTouch → gradeEligible: median=${formatDuration(median(touchToGrade))}, p90=${formatDuration(percentile(touchToGrade, 0.9))}, max=${formatDuration(max(touchToGrade))}`,
    `gradeEligible → candidateCreated: median=${formatDuration(median(gradeToCandidate))}, p90=${formatDuration(percentile(gradeToCandidate, 0.9))}, max=${formatDuration(max(gradeToCandidate))}`,
    `distanceAtrAt firstApproach: median=${formatNumber(median(numbers(lifecycle, 'distanceAtrAtFirstApproach')))}, p90=${formatNumber(percentile(numbers(lifecycle, 'distanceAtrAtFirstApproach'), 0.9))}`,
    `distanceAtrAt firstGradeEligible: median=${formatNumber(median(numbers(lifecycle, 'distanceAtrAtFirstEligibility')))}, p90=${formatNumber(percentile(numbers(lifecycle, 'distanceAtrAtFirstEligibility'), 0.9))}`,
    `distanceAtrAt candidateCreated: median=${formatNumber(median(numbers(lifecycle, 'distanceAtrAtCandidateCreation')))}, p90=${formatNumber(percentile(numbers(lifecycle, 'distanceAtrAtCandidateCreation'), 0.9))}`,
  ];
}

function diagnosticValidationLines(operational: JsonRecord[]): string[] {
  const validationSamples = operational.filter(record => record.validationDecision === 'PASS' || record.validationDecision === 'FAIL');
  const fails = validationSamples.filter(record => record.validationDecision === 'FAIL');
  const reasons = countArrayValues(fails, 'validationRejectReasons');
  return [
    `Validation Samples: ${validationSamples.length}`,
    `PASS=${validationSamples.length - fails.length}, FAIL=${fails.length}, Reject Rate=${formatPercentOf(fails.length, validationSamples.length)}`,
    `Top Reject Reasons: ${formatCountsLimited(reasons, 12)}`,
    `Rejects By Symbol: ${formatCounts(countByString(fails, 'symbol'))}`,
    `Entry Validation: ${formatCounts(countByString(validationSamples, 'entryValidation'))}`,
    `Confirmation Validation: ${formatCounts(countByString(validationSamples, 'confirmationValidation'))}`,
    `HTF Consistency: ${formatCounts(countByString(validationSamples, 'htfConsistency'))}`,
  ];
}

function diagnosticDeliveryLines(deliveryQueue: JsonRecord[], telegram: JsonRecord[]): string[] {
  const latest = latestBySignalId(deliveryQueue);
  const finalStates = countByString([...latest.values()], 'state');
  const sentEvents = deliveryQueue.filter(record => record.event === 'SENT');
  const duplicatedSent = duplicateSignalIds(sentEvents);
  const queueDelay = numbers(deliveryQueue, 'queueDelayMs');
  const attempts = numbers(deliveryQueue, 'deliveryAttemptCount');
  const telegramRetries = telegram.reduce((sum, record) => sum + (numberOrNull(record.retryCount) ?? 0), 0);
  const deliveryRateLimitRetries = deliveryQueue.filter(record => record.event === 'RATE_LIMIT_RETRY').length;
  return [
    `Queue Events: ${formatCounts(countByString(deliveryQueue, 'event'))}`,
    `Latest Queue States: ${formatCounts(finalStates)}`,
    `Queue Delay: median=${formatDuration(median(queueDelay))}, p90=${formatDuration(percentile(queueDelay, 0.9))}, max=${formatDuration(max(queueDelay))}`,
    `Delivery Attempts: avg=${formatNumber(average(attempts))}, max=${formatNumber(max(attempts))}`,
    `Retry Source Breakdown: delivery_rate_limit=${deliveryRateLimitRetries}, telegram=${telegramRetries}, screenshot=0, provider=see Provider Diagnostics`,
    `Duplicate SENT Signal IDs: ${duplicatedSent.length === 0 ? 'None' : duplicatedSent.join(', ')}`,
  ];
}

function diagnosticTelemetryFreshnessLines(streams: Readonly<Record<string, JsonRecord[]>>): string[] {
  return Object.entries(streams).map(([name, records]) => {
    const latest = latestTimestamp(records, 'timestamp');
    return `${name}: samples=${records.length}, latest=${latest ?? 'N/A'}`;
  });
}

function diagnosticProviderLines(
  polling: JsonRecord[],
  provider: JsonRecord[],
  providerQueue: JsonRecord[]
): string[] {
  const lines = ALL_SYMBOLS.map(symbol => {
    const symbolPolls = polling.filter(record => record.symbol === symbol);
    const symbolProvider = provider.filter(record => record.symbol === symbol);
    const lastSuccess = latestTimestamp(symbolPolls.filter(record => record.success === true), 'timestamp')
      ?? latestTimestamp(symbolProvider.filter(record => record.success === true), 'timestamp');
    const lastError = latestTimestamp(symbolPolls.filter(record => record.success === false), 'timestamp')
      ?? latestTimestamp(symbolProvider.filter(record => record.success === false), 'timestamp');
    return `${symbol}: polls=${symbolPolls.length}, pollSuccess=${formatPercent(rate(symbolPolls, 'success'))}, providerCalls=${symbolProvider.length}, providerSuccess=${formatPercent(rate(symbolProvider, 'success'))}, providerRetries=${providerRetryCount(symbolProvider)}, lastSuccess=${lastSuccess ?? 'N/A'}, lastError=${lastError ?? 'N/A'}`;
  });
  lines.push(`Provider Queue Events: ${formatCounts(countByString(providerQueue, 'event'))}`);
  lines.push(`Provider Queue Retries: ${providerRetryCount(providerQueue)}`);
  return lines;
}

function diagnosticWarningLines(
  lifecycle: JsonRecord[],
  operational: JsonRecord[],
  deliveryQueue: JsonRecord[],
  polling: JsonRecord[],
  provider: JsonRecord[]
): string[] {
  const warnings: string[] = [];
  for (const symbol of ALL_SYMBOLS) {
    if (!polling.some(record => record.symbol === symbol)) {
      warnings.push(`WARN: ${symbol} has no polling telemetry in this report window.`);
    }
  }
  const providerFailures = provider.filter(record => record.success === false);
  if (provider.length > 0 && providerFailures.length / provider.length >= 0.2) {
    warnings.push(`WARN: Provider failure spike detected (${formatPercent(providerFailures.length / provider.length)} failed calls).`);
  }

  const queuedIds = new Set(deliveryQueue.filter(record => record.event === 'QUEUED').map(record => stringOrNull(record.signalId)).filter((value): value is string => value !== null));
  const validationPassRecords = operational.filter(record => record.validationDecision === 'PASS');
  const earliestDeliveryQueueTimestamp = earliestTimestampMs(deliveryQueue, 'timestamp');
  if (validationPassRecords.length > 0 && deliveryQueue.length === 0) {
    warnings.push('INFO: Validation PASS record(s) exist but delivery queue telemetry is empty. PASS→QUEUED comparison is skipped because records may belong to the pre-queue telemetry era.');
  } else if (earliestDeliveryQueueTimestamp !== null) {
    const comparableValidationPassIds = validationPassRecords
      .filter(record => {
        const timestamp = timestampMs(record);
        return timestamp !== null && timestamp >= earliestDeliveryQueueTimestamp;
      })
      .map(record => stringOrNull(record.signalId))
      .filter((value): value is string => value !== null);
    const passNotQueued = comparableValidationPassIds.filter(signalId => !queuedIds.has(signalId));
    if (passNotQueued.length > 0) {
      warnings.push(`WARN: ${passNotQueued.length} validation PASS record(s) after delivery-queue telemetry started have no QUEUED delivery event: ${passNotQueued.slice(0, 8).join(', ')}${passNotQueued.length > 8 ? ', ...' : ''}`);
    }
  }

  const latestPollingTimestamp = latestTimestampMs(polling, 'timestamp');
  const latestOperationalTimestamp = latestTimestampMs(operational, 'timestamp');
  if (
    latestPollingTimestamp !== null &&
    latestOperationalTimestamp !== null &&
    latestPollingTimestamp - latestOperationalTimestamp > (numberFromEnv('TELEMETRY_STALE_STREAM_WARNING_MS') ?? 60 * 60 * 1000)
  ) {
    warnings.push(`WARN: Operational telemetry is stale compared with polling telemetry (${formatDuration(latestPollingTimestamp - latestOperationalTimestamp)} behind). Validation PASS/FAIL counts may not represent the current runtime window.`);
  }

  const staleDispatches = staleDeliverySignals(deliveryQueue);
  if (staleDispatches.length > 0) {
    warnings.push(`WARN: Stuck delivery candidate(s): ${staleDispatches.join(', ')}`);
  }

  const duplicateSent = duplicateSignalIds(deliveryQueue.filter(record => record.event === 'SENT'));
  if (duplicateSent.length > 0) {
    warnings.push(`WARN: Duplicate SENT events detected: ${duplicateSent.join(', ')}`);
  }

  const openLifecycleCount = lifecycle.filter(record => record.lifecycleCohort === 'OPEN').length;
  if (openLifecycleCount > 0) {
    warnings.push(`INFO: ${openLifecycleCount} POI lifecycle record(s) are still OPEN; do not count them as final rejects.`);
  }
  return warnings.length === 0 ? ['No diagnostic warnings.'] : warnings;
}

function funnelCounts(
  lifecycle: JsonRecord[],
  operational: JsonRecord[],
  deliveryQueue: JsonRecord[]
): Readonly<Record<string, number>> {
  return {
    poi: lifecycle.length,
    active: lifecycle.length,
    approached: lifecycle.filter(record => numberOrNull(record.firstApproachAt) !== null).length,
    touched: lifecycle.filter(record => numberOrNull(record.firstTouchAt) !== null).length,
    gradeEligible: lifecycle.filter(record => numberOrNull(record.firstGradeEligibleAt) !== null).length,
    a: lifecycle.filter(record => record.gradeAtFirstEligibility === 'A').length,
    aPlus: lifecycle.filter(record => record.gradeAtFirstEligibility === 'A+').length,
    aOrAPlus: lifecycle.filter(record => record.gradeAtFirstEligibility === 'A' || record.gradeAtFirstEligibility === 'A+').length,
    candidateEligible: lifecycle.filter(record => numberOrNull(record.firstCandidateEligibleAt) !== null).length,
    candidateCreated: lifecycle.filter(record => numberOrNull(record.candidateCreatedAt) !== null).length,
    validationPass: operational.filter(record => record.validationDecision === 'PASS').length,
    validationRejected: operational.filter(record => record.validationDecision === 'FAIL').length,
    queued: deliveryQueue.filter(record => record.event === 'QUEUED').length,
    dispatching: deliveryQueue.filter(record => record.event === 'DISPATCHING').length,
    sent: deliveryQueue.filter(record => record.event === 'SENT').length,
  };
}

function formatFunnelConversions(counts: Readonly<Record<string, number>>): string {
  const chain = [
    ['ACTIVE→APPROACHED', counts.active, counts.approached],
    ['APPROACHED→TOUCHED', counts.approached, counts.touched],
    ['TOUCHED→GRADE_ELIGIBLE', counts.touched, counts.gradeEligible],
    ['GRADE_ELIGIBLE→A/A+', counts.gradeEligible, counts.aOrAPlus],
    ['A/A+→CANDIDATE_CREATED', counts.aOrAPlus, counts.candidateCreated],
    ['CANDIDATE_CREATED→VALIDATION_PASS', counts.candidateCreated, counts.validationPass],
    ['VALIDATION_PASS→QUEUED', counts.validationPass, counts.queued],
    ['QUEUED→SENT', counts.queued, counts.sent],
  ] as const;
  return chain.map(([label, from, to]) => `${label}=${formatFunnelConversion(from, to)}`).join(', ');
}

function formatFunnelConversion(from: number, to: number): string {
  if (from > 0 && to > from) {
    return `N/A (unaligned telemetry: ${to}/${from})`;
  }
  return formatPercentOf(to, from);
}

function candidateLatenessClass(record: JsonRecord): string {
  const firstGradeDistance = numberOrNull(record.distanceAtrAtFirstEligibility);
  const candidateDistance = numberOrNull(record.distanceAtrAtCandidateCreation);
  const opportunityThreshold = numberFromEnv('POI_LIFECYCLE_OPPORTUNITY_WINDOW_ATR') ?? 1.5;
  if (record.candidateCreatedAfterOpportunityWindow !== true) return 'ON_TIME';
  if (firstGradeDistance === null || candidateDistance === null) return 'UNKNOWN';
  if (firstGradeDistance < opportunityThreshold && candidateDistance >= opportunityThreshold) return 'LATE_AFTER_GRADE';
  if (firstGradeDistance >= opportunityThreshold) return 'LATE_GRADE_FORMATION';
  return 'UNKNOWN';
}

function operationalForPois(operational: JsonRecord[], pois: JsonRecord[]): JsonRecord[] {
  const symbols = new Set(pois.map(record => stringOrNull(record.symbol)).filter((value): value is string => value !== null));
  return operational.filter(record => symbols.has(String(record.symbol)));
}

function deliveryForPois(deliveryQueue: JsonRecord[], pois: JsonRecord[]): JsonRecord[] {
  const symbols = new Set(pois.map(record => stringOrNull(record.symbol)).filter((value): value is string => value !== null));
  return deliveryQueue.filter(record => symbols.has(String(record.symbol)));
}

function cohortOfRecord(record: JsonRecord): string {
  const explicit = stringOrNull(record.cohort);
  if (explicit) return explicit;
  const symbol = stringOrNull(record.symbol);
  if (symbol && (ALL_SYMBOLS as readonly string[]).includes(symbol)) {
    return universeCohort(symbol as Symbol);
  }
  return 'UNKNOWN';
}

function groupByString(records: JsonRecord[], key: string): Readonly<Record<string, JsonRecord[]>> {
  return records.reduce<Record<string, JsonRecord[]>>((groups, record) => {
    const value = typeof record[key] === 'string' ? String(record[key]) : 'UNKNOWN';
    groups[value] ??= [];
    groups[value].push(record);
    return groups;
  }, {});
}

function countByComputed(records: JsonRecord[], classify: (record: JsonRecord) => string): Readonly<Record<string, number>> {
  return records.reduce<Record<string, number>>((counts, record) => {
    const value = classify(record);
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function countArrayValues(records: JsonRecord[], key: string): Readonly<Record<string, number>> {
  return records.reduce<Record<string, number>>((counts, record) => {
    const value = record[key];
    if (!Array.isArray(value)) return counts;
    for (const item of value) {
      if (typeof item !== 'string') continue;
      counts[item] = (counts[item] ?? 0) + 1;
    }
    return counts;
  }, {});
}

function latestBySignalId(records: JsonRecord[]): Map<string, JsonRecord> {
  const latest = new Map<string, JsonRecord>();
  for (const record of records) {
    const signalId = stringOrNull(record.signalId);
    if (!signalId) continue;
    latest.set(signalId, record);
  }
  return latest;
}

function duplicateSignalIds(records: JsonRecord[]): string[] {
  const counts = countByString(records, 'signalId');
  return Object.entries(counts)
    .filter(([, count]) => count > 1)
    .map(([signalId]) => signalId);
}

function staleDeliverySignals(records: JsonRecord[]): string[] {
  const thresholdMs = numberFromEnv('DELIVERY_STUCK_WARNING_MS') ?? 10 * 60 * 1000;
  const now = Date.now();
  return [...latestBySignalId(records).entries()]
    .filter(([, record]) => {
      if (record.state !== 'DISPATCHING' && record.event !== 'DISPATCHING') return false;
      const timestamp = timestampMs(record);
      return timestamp !== null && now - timestamp > thresholdMs;
    })
    .map(([signalId]) => signalId);
}

function providerRetryCount(records: JsonRecord[]): number {
  return records.reduce((sum, record) => {
    return sum
      + (numberOrNull(record.retryCount) ?? 0)
      + (numberOrNull(record.jobRetryCount) ?? 0);
  }, 0);
}

function latestTimestamp(records: JsonRecord[], key: string): string | null {
  const timestamps = records
    .map(record => stringOrNull(record[key]))
    .filter((value): value is string => value !== null)
    .sort();
  return timestamps.length === 0 ? null : timestamps[timestamps.length - 1];
}

function latestTimestampMs(records: JsonRecord[], key: string): number | null {
  const timestamps = records
    .map(record => Date.parse(stringOrNull(record[key]) ?? ''))
    .filter(value => Number.isFinite(value))
    .sort((left, right) => left - right);
  return timestamps.length === 0 ? null : timestamps[timestamps.length - 1];
}

function earliestTimestampMs(records: JsonRecord[], key: string): number | null {
  const timestamps = records
    .map(record => Date.parse(stringOrNull(record[key]) ?? ''))
    .filter(value => Number.isFinite(value))
    .sort((left, right) => left - right);
  return timestamps.length === 0 ? null : timestamps[0];
}

function timestampMs(record: JsonRecord): number | null {
  const timestamp = stringOrNull(record.timestamp);
  if (!timestamp) return null;
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function countByString(records: JsonRecord[], key: string): Readonly<Record<string, number>> {
  return records.reduce<Record<string, number>>((counts, record) => {
    const value = typeof record[key] === 'string' ? record[key] : 'UNKNOWN';
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function countByComposite(records: JsonRecord[], keys: readonly string[]): Readonly<Record<string, number>> {
  return records.reduce<Record<string, number>>((counts, record) => {
    const value = keys.map(key => typeof record[key] === 'string' ? record[key] : 'UNKNOWN').join(' / ');
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function sumNestedCountRecords(records: JsonRecord[], key: string): Readonly<Record<string, number>> {
  return records.reduce<Record<string, number>>((counts, record) => {
    const value = record[key];
    if (!value || typeof value !== 'object' || Array.isArray(value)) return counts;
    for (const [name, count] of Object.entries(value)) {
      if (typeof count === 'number' && Number.isFinite(count)) {
        counts[name] = (counts[name] ?? 0) + count;
      }
    }
    return counts;
  }, {});
}

function formatCounts(counts: Readonly<Record<string, number>>): string {
  const entries = Object.entries(counts);
  return entries.length === 0 ? 'None' : entries.map(([key, value]) => `${key}=${value}`).join(', ');
}

function formatCountsLimited(counts: Readonly<Record<string, number>>, limit: number): string {
  const entries = Object.entries(counts).sort(([, left], [, right]) => right - left).slice(0, limit);
  return entries.length === 0 ? 'None' : entries.map(([key, value]) => `${key}=${value}`).join(', ');
}

function formatConditionalPairs(
  pairs: Readonly<Record<string, number>>,
  rules: Readonly<Record<string, number>>,
  limit: number
): string {
  const entries = Object.entries(pairs).sort(([, left], [, right]) => right - left).slice(0, limit);
  if (entries.length === 0) return 'None';
  return entries.map(([pair, count]) => {
    const [left, right] = pair.split(' + ');
    const leftRate = rules[left] ? formatPercent(count / rules[left]) : 'N/A';
    const rightRate = rules[right] ? formatPercent(count / rules[right]) : 'N/A';
    return `${pair}=${count} (P(${right}|${left})=${leftRate}; P(${left}|${right})=${rightRate})`;
  }).join(', ');
}

function formatPercentOf(numerator: number, denominator: number): string {
  return denominator === 0 ? 'N/A' : formatPercent(numerator / denominator);
}

function numbers(records: JsonRecord[], key: string): number[] {
  return records.flatMap(record => flattenNumbers(record[key])).filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
}

function nestedNumbers(records: JsonRecord[], pathParts: readonly string[]): number[] {
  return records
    .map(record => deepGet(record, pathParts))
    .flatMap(value => flattenNumbers(value))
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function max(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.max(...values);
}

function median(values: number[]): number | null {
  return percentile(values, 0.5);
}

function percentile(values: number[], quantile: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * quantile;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function rate(records: JsonRecord[], key: string): number | null {
  if (records.length === 0) return null;
  return records.filter(record => record[key] === true).length / records.length;
}

function ratioOfString(records: JsonRecord[], key: string, expected: string): number | null {
  if (records.length === 0) return null;
  const matches = records.filter(record => record[key] === expected).length;
  return matches / records.length;
}

function countString(records: JsonRecord[], key: string, expected: string): number {
  return records.filter(record => {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.includes(expected);
    }
    return value === expected;
  }).length;
}

function qualificationThresholds() {
  return Object.freeze({
    pipelineLatencyMs: numberFromEnv('TELEMETRY_PIPELINE_LATENCY_PASS_MS'),
    telegramSuccessRate: numberFromEnv('TELEMETRY_TELEGRAM_SUCCESS_RATE'),
    screenshotSuccessRate: numberFromEnv('TELEMETRY_SCREENSHOT_SUCCESS_RATE'),
    pollingSuccessRate: numberFromEnv('TELEMETRY_POLLING_SUCCESS_RATE'),
  });
}

function resolveDailyVerdict(input: {
  readonly averagePipelineLatencyMs: number | null;
  readonly telegramSuccessRate: number | null;
  readonly screenshotSuccessRate: number | null;
  readonly pollingSuccessRate: number | null;
  readonly thresholds: ReturnType<typeof qualificationThresholds>;
}): string {
  const checks = [
    thresholdCheck(input.averagePipelineLatencyMs, input.thresholds.pipelineLatencyMs, 'max'),
    thresholdCheck(input.telegramSuccessRate, input.thresholds.telegramSuccessRate, 'min'),
    thresholdCheck(input.screenshotSuccessRate, input.thresholds.screenshotSuccessRate, 'min'),
    thresholdCheck(input.pollingSuccessRate, input.thresholds.pollingSuccessRate, 'min'),
  ];
  if (checks.some(check => check === 'FAIL')) return 'FAIL';
  if (checks.some(check => check === 'UNKNOWN')) return 'PASS WITH LIMITATIONS';
  return 'PASS';
}

function thresholdCheck(value: number | null, threshold: number | null, mode: 'min' | 'max'): 'PASS' | 'FAIL' | 'UNKNOWN' {
  if (value === null || threshold === null) return 'UNKNOWN';
  return mode === 'min' ? (value >= threshold ? 'PASS' : 'FAIL') : (value <= threshold ? 'PASS' : 'FAIL');
}

function numberFromEnv(key: string): number | null {
  const raw = process.env[key];
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatNumber(value: number | null): string {
  return value === null ? 'N/A' : value.toFixed(2);
}

function formatDuration(value: number | null): string {
  if (value === null) return 'N/A';
  if (value < 1000) return `${value.toFixed(0)} ms`;
  const seconds = value / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = seconds / 60;
  if (minutes < 60) return `${minutes.toFixed(1)} min`;
  return `${(minutes / 60).toFixed(1)} h`;
}

function formatPercent(value: number | null): string {
  return value === null ? 'N/A' : `${(value * 100).toFixed(2)}%`;
}

function thresholdText(value: number | null, suffix: string): string {
  return value === null ? 'NOT CONFIGURED' : `${value}${suffix}`;
}

function flattenNumbers(value: unknown): number[] {
  if (typeof value === 'number') return [value];
  if (!value || typeof value !== 'object') return [];
  return Object.values(value as Record<string, unknown>).flatMap(item => flattenNumbers(item));
}

function deepGet(source: JsonRecord, pathParts: readonly string[]): unknown {
  let current: unknown = source;
  for (const part of pathParts) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
