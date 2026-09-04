import { runHistoricalReplay } from './historicalReplay';
import { SignalQuery, SignalRecord, SignalRepository } from './signalRepository';

export const HISTORICAL_DATASET_VALIDATION_VERSION = 1 as const;

export interface HistoricalDatasetSummary {
  readonly totalSignalRecords: number;
  readonly processableSignalRecords: number;
  readonly skippedDueToMissingData: number;
  readonly duplicateSignalCount: number;
  readonly query: SignalQuery;
}

export interface HistoricalReplaySummary {
  readonly replayStatus: 'COMPLETED' | 'EMPTY' | 'FAILED';
  readonly signalsProcessed: number;
  readonly processedSignalIds: readonly string[];
  readonly unprocessedRecords: number;
  readonly replayError?: string;
}

export interface HistoricalPipelineSummary {
  readonly observationCount: number;
  readonly patternCount: number;
  readonly hypothesisCount: number;
  readonly evidenceDistribution: Readonly<Record<string, number>>;
}

export interface HistoricalRecommendationSummary {
  readonly recommendationCount: number;
  readonly recommendationDensity: number;
}

export type HistoricalDataQualitySeverity = 'info' | 'warning' | 'error';

export interface HistoricalDataQualityFinding {
  readonly severity: HistoricalDataQualitySeverity;
  readonly code:
    | 'NO_SIGNAL_RECORDS'
    | 'DUPLICATE_SIGNAL_ID'
    | 'MISSING_CONTEXT'
    | 'MISSING_TIMESTAMP'
    | 'MISSING_OUTCOME'
    | 'MISSING_BENCHMARK'
    | 'INVALID_ORDERING';
  readonly signalId?: string;
  readonly message: string;
}

export interface HistoricalValidationResult {
  readonly replayCompleted: boolean;
  readonly pipelineProcessedAllEligibleRecords: boolean;
  readonly dataQualityAcceptable: boolean;
  readonly passed: boolean;
}

export interface HistoricalArchitectureImpact {
  readonly repositoryChanged: false;
  readonly signalChanged: false;
  readonly replayBehaviorChanged: false;
  readonly recommendationAlgorithmChanged: false;
  readonly runtimeAffected: false;
  readonly notificationSent: false;
  readonly tradingLogicChanged: false;
}

export interface HistoricalDatasetValidationReport {
  readonly validationVersion: typeof HISTORICAL_DATASET_VALIDATION_VERSION;
  readonly datasetSummary: HistoricalDatasetSummary;
  readonly replaySummary: HistoricalReplaySummary;
  readonly pipelineSummary: HistoricalPipelineSummary;
  readonly recommendationSummary: HistoricalRecommendationSummary;
  readonly dataQualityFindings: readonly HistoricalDataQualityFinding[];
  readonly validationResult: HistoricalValidationResult;
  readonly architectureImpact: HistoricalArchitectureImpact;
}

export function validateHistoricalDataset(input: {
  readonly repository: SignalRepository;
  readonly query?: SignalQuery;
  readonly startedTimestamp?: number;
  readonly finishedTimestamp?: number;
}): HistoricalDatasetValidationReport {
  const query = Object.freeze({ ...(input.query ?? {}) });
  const records = input.repository.listSignals(query);
  const findings = createDataQualityFindings(records);
  const processableRecords = records.filter(isProcessableSignalRecord);
  const replayRepository = createReadOnlyRepository(processableRecords);
  const replaySummary = runReplay({
    repository: replayRepository,
    startedTimestamp: input.startedTimestamp,
    finishedTimestamp: input.finishedTimestamp,
    skippedRecords: records.length - processableRecords.length,
  });
  const pipelineSummary = createPipelineSummary(replaySummary);
  const recommendationSummary = createRecommendationSummary(
    replaySummary,
    pipelineSummary
  );
  const datasetSummary = createDatasetSummary({
    records,
    processableRecords,
    query,
    findings,
  });
  const validationResult = createValidationResult({
    datasetSummary,
    replaySummary,
    findings,
  });

  return Object.freeze({
    validationVersion: HISTORICAL_DATASET_VALIDATION_VERSION,
    datasetSummary,
    replaySummary,
    pipelineSummary,
    recommendationSummary,
    dataQualityFindings: Object.freeze(findings),
    validationResult,
    architectureImpact: createArchitectureImpact(),
  });
}

function runReplay(input: {
  readonly repository: SignalRepository;
  readonly startedTimestamp?: number;
  readonly finishedTimestamp?: number;
  readonly skippedRecords: number;
}): HistoricalReplaySummary {
  try {
    const replay = runHistoricalReplay({
      repository: input.repository,
      startedTimestamp: input.startedTimestamp,
      finishedTimestamp: input.finishedTimestamp,
    });

    return Object.freeze({
      replayStatus: replay.replayStatus,
      signalsProcessed: replay.signalCount,
      processedSignalIds: Object.freeze(
        replay.processedSignals.map(signal => signal.signalId)
      ),
      unprocessedRecords: input.skippedRecords,
      replaySession: replay,
    } as HistoricalReplaySummary & { readonly replaySession: typeof replay });
  } catch (error) {
    return Object.freeze({
      replayStatus: 'FAILED' as const,
      signalsProcessed: 0,
      processedSignalIds: Object.freeze([]),
      unprocessedRecords: input.skippedRecords,
      replayError: error instanceof Error ? error.message : String(error),
    });
  }
}

function createPipelineSummary(
  replaySummary: HistoricalReplaySummary
): HistoricalPipelineSummary {
  const replaySession = (replaySummary as HistoricalReplaySummary & {
    readonly replaySession?: ReturnType<typeof runHistoricalReplay>;
  }).replaySession;

  if (!replaySession) {
    return Object.freeze({
      observationCount: 0,
      patternCount: 0,
      hypothesisCount: 0,
      evidenceDistribution: Object.freeze({}),
    });
  }

  const evidenceCounts: Record<string, number> = {};
  let patternCount = 0;
  let hypothesisCount = 0;

  for (const signal of replaySession.processedSignals) {
    patternCount += signal.intelligenceReport.patternDiscovery.patterns.length;
    hypothesisCount += signal.intelligenceReport.hypothesisGeneration.hypotheses.length;

    for (const evidence of signal.intelligenceReport.evidenceValidation.evidence) {
      evidenceCounts[evidence.validationStatus] =
        (evidenceCounts[evidence.validationStatus] ?? 0) + 1;
    }
  }

  return Object.freeze({
    observationCount: replaySession.processedSignals.length,
    patternCount,
    hypothesisCount,
    evidenceDistribution: Object.freeze(sortRecord(evidenceCounts)),
  });
}

function createRecommendationSummary(
  replaySummary: HistoricalReplaySummary,
  pipelineSummary: HistoricalPipelineSummary
): HistoricalRecommendationSummary {
  const replaySession = (replaySummary as HistoricalReplaySummary & {
    readonly replaySession?: ReturnType<typeof runHistoricalReplay>;
  }).replaySession;
  const recommendationCount =
    replaySession?.processedSignals.reduce(
      (total, signal) =>
        total +
        signal.intelligenceReport.recommendationGeneration.recommendations.length,
      0
    ) ?? 0;

  return Object.freeze({
    recommendationCount,
    recommendationDensity:
      pipelineSummary.observationCount === 0
        ? 0
        : Number((recommendationCount / pipelineSummary.observationCount).toFixed(4)),
  });
}

function createDatasetSummary(input: {
  readonly records: readonly SignalRecord[];
  readonly processableRecords: readonly SignalRecord[];
  readonly query: SignalQuery;
  readonly findings: readonly HistoricalDataQualityFinding[];
}): HistoricalDatasetSummary {
  return Object.freeze({
    totalSignalRecords: input.records.length,
    processableSignalRecords: input.processableRecords.length,
    skippedDueToMissingData:
      input.records.length - input.processableRecords.length,
    duplicateSignalCount: input.findings.filter(
      finding => finding.code === 'DUPLICATE_SIGNAL_ID'
    ).length,
    query: input.query,
  });
}

function createValidationResult(input: {
  readonly datasetSummary: HistoricalDatasetSummary;
  readonly replaySummary: HistoricalReplaySummary;
  readonly findings: readonly HistoricalDataQualityFinding[];
}): HistoricalValidationResult {
  const replayCompleted =
    input.replaySummary.replayStatus === 'COMPLETED' ||
    input.replaySummary.replayStatus === 'EMPTY';
  const hasErrors = input.findings.some(finding => finding.severity === 'error');
  const dataQualityAcceptable = input.datasetSummary.totalSignalRecords > 0 && !hasErrors;
  const pipelineProcessedAllEligibleRecords =
    input.replaySummary.signalsProcessed ===
    input.datasetSummary.processableSignalRecords;

  return Object.freeze({
    replayCompleted,
    pipelineProcessedAllEligibleRecords,
    dataQualityAcceptable,
    passed:
      replayCompleted &&
      pipelineProcessedAllEligibleRecords &&
      dataQualityAcceptable,
  });
}

function createDataQualityFindings(
  records: readonly SignalRecord[]
): readonly HistoricalDataQualityFinding[] {
  const findings: HistoricalDataQualityFinding[] = [];

  if (records.length === 0) {
    findings.push(finding('warning', 'NO_SIGNAL_RECORDS', 'Historical dataset does not contain Signal records.'));
  }

  findings.push(...findDuplicateSignalIds(records));

  records.forEach((record, index) => {
    if (!record.context) {
      findings.push(finding('error', 'MISSING_CONTEXT', 'Signal record is missing context.', record.signalId));
      return;
    }

    if (!Number.isFinite(record.context.timestamp)) {
      findings.push(finding('error', 'MISSING_TIMESTAMP', 'Signal record is missing a valid timestamp.', record.signalId));
    }

    if (!record.outcome) {
      findings.push(finding('warning', 'MISSING_OUTCOME', 'Signal record is missing outcome data.', record.signalId));
    }

    if (!record.benchmark) {
      findings.push(finding('warning', 'MISSING_BENCHMARK', 'Signal record is missing benchmark data.', record.signalId));
    }

    const previous = records[index - 1];
    if (
      previous?.context &&
      Number.isFinite(previous.context.timestamp) &&
      Number.isFinite(record.context.timestamp) &&
      compareRecords(previous, record) > 0
    ) {
      findings.push(finding('warning', 'INVALID_ORDERING', 'Signal records are not stored in chronological order.', record.signalId));
    }
  });

  return Object.freeze(findings);
}

function findDuplicateSignalIds(
  records: readonly SignalRecord[]
): readonly HistoricalDataQualityFinding[] {
  const counts = new Map<string, number>();

  for (const record of records) {
    if (typeof record.signalId === 'string') {
      counts.set(record.signalId, (counts.get(record.signalId) ?? 0) + 1);
    }
  }

  return Object.freeze(
    [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([signalId, count]) =>
        finding(
          'error',
          'DUPLICATE_SIGNAL_ID',
          `Signal ID appears ${count} times.`,
          signalId
        )
      )
  );
}

function isProcessableSignalRecord(record: SignalRecord): boolean {
  return (
    typeof record.signalId === 'string' &&
    Boolean(record.context) &&
    Number.isFinite(record.context.timestamp)
  );
}

function createReadOnlyRepository(records: readonly SignalRecord[]): SignalRepository {
  return Object.freeze({
    createSignalRecord(): SignalRecord {
      throw new Error('Historical dataset validation is read-only.');
    },
    updateSignalRecord(): SignalRecord {
      throw new Error('Historical dataset validation is read-only.');
    },
    loadSignalRecord(signalId: string): SignalRecord | undefined {
      return records.find(record => record.signalId === signalId);
    },
    findSignal(query: SignalQuery): SignalRecord | undefined {
      return this.listSignals(query)[0];
    },
    listSignals(query: SignalQuery = {}): readonly SignalRecord[] {
      return Object.freeze(records.filter(record => matchesQuery(record, query)));
    },
    saveOutcome(): SignalRecord {
      throw new Error('Historical dataset validation is read-only.');
    },
    saveBenchmark(): SignalRecord {
      throw new Error('Historical dataset validation is read-only.');
    },
  });
}

function matchesQuery(record: SignalRecord, query: SignalQuery): boolean {
  if (query.signalId && record.signalId !== query.signalId) return false;
  if (query.pair && record.context?.pair !== query.pair) return false;
  if (query.timeframe && record.context?.timeframe !== query.timeframe) return false;
  if (query.grade && record.context?.grade !== query.grade) return false;
  if (query.outcomeType && record.outcome?.outcomeType !== query.outcomeType) return false;
  if (query.benchmarkStatus && record.benchmark?.benchmarkStatus !== query.benchmarkStatus) return false;
  return true;
}

function compareRecords(left: SignalRecord, right: SignalRecord): number {
  const timestampDiff = left.context.timestamp - right.context.timestamp;
  if (timestampDiff !== 0) return timestampDiff;
  return left.signalId.localeCompare(right.signalId);
}

function finding(
  severity: HistoricalDataQualitySeverity,
  code: HistoricalDataQualityFinding['code'],
  message: string,
  signalId?: string
): HistoricalDataQualityFinding {
  return Object.freeze({
    severity,
    code,
    ...(signalId ? { signalId } : {}),
    message,
  });
}

function createArchitectureImpact(): HistoricalArchitectureImpact {
  return Object.freeze({
    repositoryChanged: false as const,
    signalChanged: false as const,
    replayBehaviorChanged: false as const,
    recommendationAlgorithmChanged: false as const,
    runtimeAffected: false as const,
    notificationSent: false as const,
    tradingLogicChanged: false as const,
  });
}

function sortRecord(record: Record<string, number>): Record<string, number> {
  return Object.keys(record)
    .sort()
    .reduce<Record<string, number>>((sorted, key) => {
      sorted[key] = record[key];
      return sorted;
    }, {});
}
