import {
  IntelligencePipelineTimestamps,
  IntelligenceReport,
  runIntelligencePipeline,
} from './intelligencePipeline';
import { SignalQuery, SignalRecord, SignalRepository } from './signalRepository';

export const HISTORICAL_REPLAY_VERSION = 1 as const;

export type ReplayStatus = 'EMPTY' | 'COMPLETED';

export interface ProcessedReplaySignal {
  readonly signalId: string;
  readonly sourceTimestamp: number;
  readonly sequence: number;
  readonly intelligenceReport: IntelligenceReport;
}

export interface ReplaySessionMetadata {
  readonly repositoryMutated: false;
  readonly runtimeAffected: false;
  readonly notificationSent: false;
  readonly tradingLogicChanged: false;
  readonly policyChanged: false;
  readonly outcomeChanged: false;
  readonly benchmarkChanged: false;
}

export interface ReplaySession {
  readonly replayVersion: typeof HISTORICAL_REPLAY_VERSION;
  readonly replaySessionId: string;
  readonly startedTimestamp: number;
  readonly finishedTimestamp: number;
  readonly signalCount: number;
  readonly replayStatus: ReplayStatus;
  readonly processedSignals: readonly ProcessedReplaySignal[];
  readonly duration: number;
  readonly metadata: ReplaySessionMetadata;
}

export function runHistoricalReplay(input: {
  readonly repository: SignalRepository;
  readonly query?: SignalQuery;
  readonly startedTimestamp?: number;
  readonly finishedTimestamp?: number;
}): ReplaySession {
  console.log('Replay Started');

  const query = Object.freeze({ ...(input.query ?? {}) });
  const signals = sortChronologically(input.repository.listSignals(query));

  console.log(`Signals Loaded: ${signals.length}`);

  const startedTimestamp =
    input.startedTimestamp ?? signals[0]?.context.timestamp ?? 0;
  const finishedTimestamp =
    input.finishedTimestamp ??
    signals[signals.length - 1]?.context.timestamp ??
    startedTimestamp;
  const processedSignals = Object.freeze(
    signals.map((signal, index) =>
      createProcessedReplaySignal({
        repository: input.repository,
        signal,
        sequence: index + 1,
      })
    )
  );
  const duration = Math.max(0, finishedTimestamp - startedTimestamp);

  console.log('Replay Complete');
  console.log(`Duration: ${duration}`);

  return Object.freeze({
    replayVersion: HISTORICAL_REPLAY_VERSION,
    replaySessionId: createReplaySessionId({
      query,
      signalIds: signals.map(signal => signal.signalId),
      startedTimestamp,
      finishedTimestamp,
    }),
    startedTimestamp,
    finishedTimestamp,
    signalCount: signals.length,
    replayStatus: signals.length === 0 ? 'EMPTY' : 'COMPLETED',
    processedSignals,
    duration,
    metadata: createMetadata(),
  });
}

function createProcessedReplaySignal(input: {
  readonly repository: SignalRepository;
  readonly signal: SignalRecord;
  readonly sequence: number;
}): ProcessedReplaySignal {
  const timestamps = createDeterministicPipelineTimestamps(
    input.signal.context.timestamp
  );
  const intelligenceReport = runIntelligencePipeline({
    repository: input.repository,
    query: Object.freeze({ signalId: input.signal.signalId }),
    timestamps,
  });

  return Object.freeze({
    signalId: input.signal.signalId,
    sourceTimestamp: input.signal.context.timestamp,
    sequence: input.sequence,
    intelligenceReport,
  });
}

function createDeterministicPipelineTimestamps(
  timestamp: number
): IntelligencePipelineTimestamps {
  return Object.freeze({
    observationTimestamp: timestamp,
    patternDiscoveryTimestamp: timestamp,
    hypothesisTimestamp: timestamp,
    evidenceTimestamp: timestamp,
    recommendationTimestamp: timestamp,
    reportTimestamp: timestamp,
  });
}

function sortChronologically(signals: readonly SignalRecord[]): readonly SignalRecord[] {
  return Object.freeze(
    [...signals].sort((left, right) => {
      const timestampDiff = left.context.timestamp - right.context.timestamp;
      if (timestampDiff !== 0) return timestampDiff;
      return left.signalId.localeCompare(right.signalId);
    })
  );
}

function createMetadata(): ReplaySessionMetadata {
  return Object.freeze({
    repositoryMutated: false as const,
    runtimeAffected: false as const,
    notificationSent: false as const,
    tradingLogicChanged: false as const,
    policyChanged: false as const,
    outcomeChanged: false as const,
    benchmarkChanged: false as const,
  });
}

function createReplaySessionId(input: {
  readonly query: SignalQuery;
  readonly signalIds: readonly string[];
  readonly startedTimestamp: number;
  readonly finishedTimestamp: number;
}): string {
  return `REPLAY_SESSION_${hashString(
    stableStringify({
      query: input.query,
      signalIds: input.signalIds,
      startedTimestamp: input.startedTimestamp,
      finishedTimestamp: input.finishedTimestamp,
      replayVersion: HISTORICAL_REPLAY_VERSION,
    })
  )}`;
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
