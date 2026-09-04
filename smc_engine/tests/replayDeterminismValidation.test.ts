import { validateReplayDeterminism } from '../src/replayDeterminismValidation';
import { createPendingSignalBenchmark } from '../src/signalBenchmark';
import { createSignalContext, SignalContext } from '../src/signalContext';
import { createSignalOutcome } from '../src/signalOutcome';
import {
  InMemorySignalRepository,
  SignalQuery,
  SignalRecord,
  SignalRepository,
} from '../src/signalRepository';

describe('Replay Determinism Validation', () => {
  it('proves repeated replay runs produce the same result hash and structure', () => {
    const report = validateReplayDeterminism({
      repository: createRepository([
        createContext('SIGNAL_3000', 3000, 'A+'),
        createContext('SIGNAL_1000', 1000, 'A'),
        createContext('SIGNAL_2000', 2000, 'B'),
      ]),
      replayCount: 5,
      startedTimestamp: 1000,
      finishedTimestamp: 3000,
    });

    expect(report.replayCount).toBe(5);
    expect(report.signalsProcessed).toBe(3);
    expect(report.hashEquality).toBe(true);
    expect(report.structuralEquality).toBe(true);
    expect(report.passed).toBe(true);
    expect(new Set(report.resultHashes).size).toBe(1);
  });

  it('keeps signal replay order stable across validation runs', () => {
    const report = validateReplayDeterminism({
      repository: createRepository([
        createContext('SIGNAL_C', 1000, 'A+'),
        createContext('SIGNAL_A', 1000, 'A+'),
        createContext('SIGNAL_B', 1000, 'A+'),
      ]),
      replayCount: 4,
      startedTimestamp: 1000,
      finishedTimestamp: 1000,
    });

    expect(report.comparisons.every(comparison => comparison.hashMatchesBaseline)).toBe(true);
    expect(report.comparisons.every(comparison => comparison.structurallyMatchesBaseline)).toBe(true);
  });

  it('keeps recommendation counts stable across repeated replay runs', () => {
    const report = validateReplayDeterminism({
      repository: createRepository(
        Array.from({ length: 35 }, (_, index) =>
          createContext(`SIGNAL_${index.toString().padStart(2, '0')}`, 1000 + index, 'A+')
        )
      ),
      replayCount: 3,
      startedTimestamp: 1000,
      finishedTimestamp: 1034,
    });

    expect(report.recommendationsProduced).toBeGreaterThanOrEqual(0);
    expect(report.resultHashes).toEqual([
      report.baselineResultHash,
      report.baselineResultHash,
      report.baselineResultHash,
    ]);
  });

  it('does not mutate repository while validating replay determinism', () => {
    const readOnlyRepository = createReadOnlyRepository([
      createFrozenRecord(createContext('SIGNAL_A', 1000, 'A+')),
      createFrozenRecord(createContext('SIGNAL_B', 2000, 'A')),
    ]);

    const report = validateReplayDeterminism({
      repository: readOnlyRepository.repository,
      replayCount: 3,
      startedTimestamp: 1000,
      finishedTimestamp: 2000,
    });

    expect(report.passed).toBe(true);
    expect(readOnlyRepository.writeCallCount()).toBe(0);
  });

  it('creates an immutable validation report with side effects disabled', () => {
    const report = validateReplayDeterminism({
      repository: createRepository([createContext('SIGNAL_A', 1000, 'A+')]),
      replayCount: 2,
      startedTimestamp: 1000,
      finishedTimestamp: 1000,
    });

    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.durationSummary)).toBe(true);
    expect(Object.isFrozen(report.comparisons)).toBe(true);
    expect(Object.isFrozen(report.comparisons[0])).toBe(true);
    expect(Object.isFrozen(report.metadata)).toBe(true);
    expect(report.metadata).toEqual({
      repositoryMutated: false,
      runtimeAffected: false,
      notificationSent: false,
      tradingLogicChanged: false,
      policyChanged: false,
      recommendationLogicChanged: false,
      replayEngineChanged: false,
    });
  });

  it('rejects invalid replay counts', () => {
    expect(() =>
      validateReplayDeterminism({
        repository: new InMemorySignalRepository(),
        replayCount: 0,
      })
    ).toThrow('Replay determinism validation requires replayCount > 0');
  });
});

function createRepository(contexts: readonly SignalContext[]): InMemorySignalRepository {
  const repository = new InMemorySignalRepository();

  for (const context of contexts) {
    const outcome = createSignalOutcome({
      signalContext: context,
      outcomeType: 'TAKE_PROFIT',
    });

    repository.createSignalRecord(context);
    repository.saveOutcome(outcome);
    repository.saveBenchmark(createPendingSignalBenchmark({ signalContext: context, signalOutcome: outcome }));
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

function createFrozenRecord(context: SignalContext): SignalRecord {
  const outcome = createSignalOutcome({
    signalContext: context,
    outcomeType: 'TAKE_PROFIT',
  });

  return Object.freeze({
    signalId: context.signalId,
    context,
    outcome,
    benchmark: createPendingSignalBenchmark({ signalContext: context, signalOutcome: outcome }),
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
      throw new Error('Validation must not create signal records');
    },
    updateSignalRecord(): SignalRecord {
      writes += 1;
      throw new Error('Validation must not update signal records');
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
      throw new Error('Validation must not save outcomes');
    },
    saveBenchmark(): SignalRecord {
      writes += 1;
      throw new Error('Validation must not save benchmarks');
    },
  };

  return {
    repository,
    writeCallCount: () => writes,
  };
}

function matchesQuery(record: SignalRecord, query: SignalQuery): boolean {
  if (query.signalId && record.signalId !== query.signalId) return false;
  if (query.pair && record.context.pair !== query.pair) return false;
  if (query.timeframe && record.context.timeframe !== query.timeframe) return false;
  if (query.grade && record.context.grade !== query.grade) return false;
  if (query.outcomeType && record.outcome?.outcomeType !== query.outcomeType) return false;
  if (query.benchmarkStatus && record.benchmark?.benchmarkStatus !== query.benchmarkStatus) return false;
  return true;
}
