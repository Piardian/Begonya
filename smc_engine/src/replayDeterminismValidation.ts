import { ReplaySession, runHistoricalReplay } from './historicalReplay';
import { SignalQuery, SignalRepository } from './signalRepository';

export const REPLAY_VALIDATION_VERSION = 1 as const;

export interface ReplayDurationSummary {
  readonly min: number;
  readonly max: number;
  readonly average: number;
}

export interface ReplayValidationComparison {
  readonly runIndex: number;
  readonly resultHash: string;
  readonly hashMatchesBaseline: boolean;
  readonly structurallyMatchesBaseline: boolean;
}

export interface ReplayValidationMetadata {
  readonly repositoryMutated: false;
  readonly runtimeAffected: false;
  readonly notificationSent: false;
  readonly tradingLogicChanged: false;
  readonly policyChanged: false;
  readonly recommendationLogicChanged: false;
  readonly replayEngineChanged: false;
}

export interface ReplayValidationReport {
  readonly validationVersion: typeof REPLAY_VALIDATION_VERSION;
  readonly replayCount: number;
  readonly signalsProcessed: number;
  readonly recommendationsProduced: number;
  readonly baselineResultHash: string;
  readonly resultHashes: readonly string[];
  readonly reportHash: string;
  readonly hashEquality: boolean;
  readonly structuralEquality: boolean;
  readonly passed: boolean;
  readonly durationSummary: ReplayDurationSummary;
  readonly comparisons: readonly ReplayValidationComparison[];
  readonly metadata: ReplayValidationMetadata;
}

interface NormalizedReplaySession {
  readonly replayVersion: ReplaySession['replayVersion'];
  readonly replaySessionId: string;
  readonly startedTimestamp: number;
  readonly finishedTimestamp: number;
  readonly signalCount: number;
  readonly replayStatus: ReplaySession['replayStatus'];
  readonly processedSignals: readonly unknown[];
  readonly duration: number;
  readonly metadata: ReplaySession['metadata'];
}

export function validateReplayDeterminism(input: {
  readonly repository: SignalRepository;
  readonly replayCount: number;
  readonly query?: SignalQuery;
  readonly startedTimestamp?: number;
  readonly finishedTimestamp?: number;
}): ReplayValidationReport {
  if (!Number.isInteger(input.replayCount) || input.replayCount <= 0) {
    throw new Error('Replay determinism validation requires replayCount > 0');
  }

  const replaySessions = Object.freeze(
    Array.from({ length: input.replayCount }, () =>
      runHistoricalReplay({
        repository: input.repository,
        query: input.query,
        startedTimestamp: input.startedTimestamp,
        finishedTimestamp: input.finishedTimestamp,
      })
    )
  );
  const normalizedSessions = Object.freeze(replaySessions.map(normalizeReplaySession));
  const resultHashes = Object.freeze(
    normalizedSessions.map(session => hashString(stableStringify(session)))
  );
  const baselineSession = normalizedSessions[0];
  const baselineHash = resultHashes[0];
  const baselineStructuralValue = stableStringify(baselineSession);
  const comparisons = Object.freeze(
    normalizedSessions.map((session, index) =>
      Object.freeze({
        runIndex: index + 1,
        resultHash: resultHashes[index],
        hashMatchesBaseline: resultHashes[index] === baselineHash,
        structurallyMatchesBaseline: stableStringify(session) === baselineStructuralValue,
      })
    )
  );
  const hashEquality = comparisons.every(comparison => comparison.hashMatchesBaseline);
  const structuralEquality = comparisons.every(
    comparison => comparison.structurallyMatchesBaseline
  );
  const durationSummary = createDurationSummary(replaySessions);
  const reportCore = Object.freeze({
    validationVersion: REPLAY_VALIDATION_VERSION,
    replayCount: input.replayCount,
    signalsProcessed: baselineSession.signalCount,
    recommendationsProduced: countRecommendations(replaySessions[0]),
    baselineResultHash: baselineHash,
    resultHashes,
    hashEquality,
    structuralEquality,
    passed: hashEquality && structuralEquality,
    durationSummary,
    comparisons,
    metadata: createMetadata(),
  });

  return Object.freeze({
    ...reportCore,
    reportHash: hashString(stableStringify(reportCore)),
  });
}

function normalizeReplaySession(replaySession: ReplaySession): NormalizedReplaySession {
  return {
    replayVersion: replaySession.replayVersion,
    replaySessionId: replaySession.replaySessionId,
    startedTimestamp: replaySession.startedTimestamp,
    finishedTimestamp: replaySession.finishedTimestamp,
    signalCount: replaySession.signalCount,
    replayStatus: replaySession.replayStatus,
    processedSignals: replaySession.processedSignals.map(signal => ({
      signalId: signal.signalId,
      sourceTimestamp: signal.sourceTimestamp,
      sequence: signal.sequence,
      intelligenceReport: signal.intelligenceReport,
    })),
    duration: replaySession.duration,
    metadata: replaySession.metadata,
  };
}

function countRecommendations(replaySession: ReplaySession): number {
  return replaySession.processedSignals.reduce(
    (total, signal) =>
      total + signal.intelligenceReport.recommendationGeneration.recommendations.length,
    0
  );
}

function createDurationSummary(
  replaySessions: readonly ReplaySession[]
): ReplayDurationSummary {
  const durations = replaySessions.map(session => session.duration);
  const min = Math.min(...durations);
  const max = Math.max(...durations);
  const total = durations.reduce((sum, duration) => sum + duration, 0);

  return Object.freeze({
    min,
    max,
    average: total / durations.length,
  });
}

function createMetadata(): ReplayValidationMetadata {
  return Object.freeze({
    repositoryMutated: false as const,
    runtimeAffected: false as const,
    notificationSent: false as const,
    tradingLogicChanged: false as const,
    policyChanged: false as const,
    recommendationLogicChanged: false as const,
    replayEngineChanged: false as const,
  });
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(item => stableStringify(item)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

function hashString(value: string): string {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, '0').toUpperCase();
}
