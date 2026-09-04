import { validateHistoricalDataset } from '../src/historicalDatasetValidation';
import { createPendingSignalBenchmark } from '../src/signalBenchmark';
import { createSignalContext, SignalContext } from '../src/signalContext';
import { createSignalOutcome } from '../src/signalOutcome';
import {
  InMemorySignalRepository,
  SignalQuery,
  SignalRecord,
  SignalRepository,
} from '../src/signalRepository';

describe('Historical Dataset Validation', () => {
  it('replays a historical dataset and reports pipeline metrics', () => {
    const repository = createRepository([
      createContext('SIGNAL_1000', 1000, 'A+'),
      createContext('SIGNAL_2000', 2000, 'A'),
      createContext('SIGNAL_3000', 3000, 'B'),
    ]);

    const report = validateHistoricalDataset({
      repository,
      startedTimestamp: 1000,
      finishedTimestamp: 3000,
    });

    expect(report.datasetSummary.totalSignalRecords).toBe(3);
    expect(report.datasetSummary.processableSignalRecords).toBe(3);
    expect(report.replaySummary.replayStatus).toBe('COMPLETED');
    expect(report.replaySummary.signalsProcessed).toBe(3);
    expect(report.pipelineSummary.observationCount).toBe(3);
    expect(report.pipelineSummary.patternCount).toBeGreaterThan(0);
    expect(report.pipelineSummary.hypothesisCount).toBeGreaterThan(0);
    expect(report.recommendationSummary.recommendationDensity).toBeGreaterThanOrEqual(0);
    expect(report.validationResult.passed).toBe(true);
  });

  it('reports missing data without mutating or repairing records', () => {
    const recordWithoutOutcome = createRecord(createContext('SIGNAL_A', 1000, 'A+'), {
      includeOutcome: false,
      includeBenchmark: false,
    });
    const invalidRecord = Object.freeze({
      signalId: 'SIGNAL_INVALID',
      context: Object.freeze({
        signalId: 'SIGNAL_INVALID',
        pair: 'EURUSD',
        direction: 'long',
        timeframe: '15m',
        timestamp: Number.NaN,
        lifecycle: Object.freeze({
          states: Object.freeze(['DETECTED']),
          currentState: 'DETECTED',
        }),
      }),
    }) as unknown as SignalRecord;
    const repository = createReadOnlyRepository([recordWithoutOutcome, invalidRecord]);

    const report = validateHistoricalDataset({ repository: repository.repository });

    expect(report.datasetSummary.totalSignalRecords).toBe(2);
    expect(report.datasetSummary.processableSignalRecords).toBe(1);
    expect(report.datasetSummary.skippedDueToMissingData).toBe(1);
    expect(report.dataQualityFindings.map(finding => finding.code)).toEqual(
      expect.arrayContaining(['MISSING_OUTCOME', 'MISSING_BENCHMARK', 'MISSING_TIMESTAMP'])
    );
    expect(report.validationResult.passed).toBe(false);
    expect(repository.writeCallCount()).toBe(0);
  });

  it('reports duplicate signal IDs and invalid ordering', () => {
    const repository = createReadOnlyRepository([
      createRecord(createContext('SIGNAL_DUPLICATE', 2000, 'A+')),
      createRecord(createContext('SIGNAL_DUPLICATE', 1000, 'A+')),
    ]);

    const report = validateHistoricalDataset({ repository: repository.repository });

    expect(report.datasetSummary.duplicateSignalCount).toBe(1);
    expect(report.dataQualityFindings.map(finding => finding.code)).toEqual(
      expect.arrayContaining(['DUPLICATE_SIGNAL_ID', 'INVALID_ORDERING'])
    );
    expect(report.validationResult.dataQualityAcceptable).toBe(false);
  });

  it('reports an empty historical repository without throwing', () => {
    const report = validateHistoricalDataset({
      repository: new InMemorySignalRepository(),
    });

    expect(report.datasetSummary.totalSignalRecords).toBe(0);
    expect(report.replaySummary.replayStatus).toBe('EMPTY');
    expect(report.pipelineSummary.observationCount).toBe(0);
    expect(report.recommendationSummary.recommendationCount).toBe(0);
    expect(report.dataQualityFindings[0]).toMatchObject({
      severity: 'warning',
      code: 'NO_SIGNAL_RECORDS',
    });
    expect(report.validationResult.passed).toBe(false);
  });

  it('creates an immutable validation report with architecture side effects disabled', () => {
    const report = validateHistoricalDataset({
      repository: createRepository([createContext('SIGNAL_A', 1000, 'A+')]),
      startedTimestamp: 1000,
      finishedTimestamp: 1000,
    });

    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.datasetSummary)).toBe(true);
    expect(Object.isFrozen(report.replaySummary)).toBe(true);
    expect(Object.isFrozen(report.pipelineSummary)).toBe(true);
    expect(Object.isFrozen(report.recommendationSummary)).toBe(true);
    expect(Object.isFrozen(report.dataQualityFindings)).toBe(true);
    expect(Object.isFrozen(report.validationResult)).toBe(true);
    expect(Object.isFrozen(report.architectureImpact)).toBe(true);
    expect(report.architectureImpact).toEqual({
      repositoryChanged: false,
      signalChanged: false,
      replayBehaviorChanged: false,
      recommendationAlgorithmChanged: false,
      runtimeAffected: false,
      notificationSent: false,
      tradingLogicChanged: false,
    });
  });
});

function createRepository(contexts: readonly SignalContext[]): InMemorySignalRepository {
  const repository = new InMemorySignalRepository();

  for (const context of contexts) {
    const record = createRecord(context);
    repository.createSignalRecord(record.context);
    if (record.outcome) repository.saveOutcome(record.outcome);
    if (record.benchmark) repository.saveBenchmark(record.benchmark);
  }

  return repository;
}

function createContext(signalId: string, timestamp: number, grade: string): SignalContext {
  return createSignalContext({
    signalId,
    pair: 'EURUSD',
    direction: 'long',
    timeframe: '15m',
    grade,
    score: grade === 'A+' ? 9 : grade === 'A' ? 8 : 7,
    timestamp,
  });
}

function createRecord(
  context: SignalContext,
  options: {
    readonly includeOutcome?: boolean;
    readonly includeBenchmark?: boolean;
  } = {}
): SignalRecord {
  const includeOutcome = options.includeOutcome ?? true;
  const includeBenchmark = options.includeBenchmark ?? true;
  const outcome = includeOutcome
    ? createSignalOutcome({
        signalContext: context,
        outcomeType: 'TAKE_PROFIT',
      })
    : undefined;

  return Object.freeze({
    signalId: context.signalId,
    context,
    ...(outcome ? { outcome } : {}),
    ...(outcome && includeBenchmark
      ? { benchmark: createPendingSignalBenchmark({ signalContext: context, signalOutcome: outcome }) }
      : {}),
  });
}

function createReadOnlyRepository(records: readonly SignalRecord[]): {
  readonly repository: SignalRepository;
  readonly writeCallCount: () => number;
} {
  let writes = 0;

  const repository: SignalRepository = {
    createSignalRecord(): SignalRecord {
      writes += 1;
      throw new Error('Historical dataset validation must not create signal records');
    },
    updateSignalRecord(): SignalRecord {
      writes += 1;
      throw new Error('Historical dataset validation must not update signal records');
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
      writes += 1;
      throw new Error('Historical dataset validation must not save outcomes');
    },
    saveBenchmark(): SignalRecord {
      writes += 1;
      throw new Error('Historical dataset validation must not save benchmarks');
    },
  };

  return {
    repository,
    writeCallCount: () => writes,
  };
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
