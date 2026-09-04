import { runHistoricalReplay } from '../src/historicalReplay';
import { createPendingSignalBenchmark } from '../src/signalBenchmark';
import { createSignalContext, SignalContext } from '../src/signalContext';
import { createSignalOutcome } from '../src/signalOutcome';
import {
  InMemorySignalRepository,
  SignalQuery,
  SignalRecord,
  SignalRepository,
} from '../src/signalRepository';

describe('Historical Replay Foundation', () => {
  it('replays historical signals in chronological order', () => {
    const repository = createRepository([
      createContext('SIGNAL_3000', 3000),
      createContext('SIGNAL_1000', 1000),
      createContext('SIGNAL_2000', 2000),
    ]);

    const replay = runHistoricalReplay({
      repository,
      startedTimestamp: 1000,
      finishedTimestamp: 3000,
    });

    expect(replay.replayStatus).toBe('COMPLETED');
    expect(replay.signalCount).toBe(3);
    expect(replay.processedSignals.map(signal => signal.signalId)).toEqual([
      'SIGNAL_1000',
      'SIGNAL_2000',
      'SIGNAL_3000',
    ]);
    expect(replay.processedSignals.map(signal => signal.sequence)).toEqual([1, 2, 3]);
  });

  it('runs each replayed signal through the Intelligence Pipeline with signal-scoped queries', () => {
    const repository = createRepository([
      createContext('SIGNAL_A', 1000),
      createContext('SIGNAL_B', 2000),
    ]);

    const replay = runHistoricalReplay({
      repository,
      startedTimestamp: 1000,
      finishedTimestamp: 2000,
    });

    expect(replay.processedSignals[0].intelligenceReport.query).toEqual({
      signalId: 'SIGNAL_A',
    });
    expect(replay.processedSignals[0].intelligenceReport.observation.signalCount).toBe(1);
    expect(replay.processedSignals[1].intelligenceReport.query).toEqual({
      signalId: 'SIGNAL_B',
    });
    expect(replay.processedSignals[1].intelligenceReport.observation.signalCount).toBe(1);
  });

  it('is deterministic for the same repository and replay timestamps', () => {
    const repository = createRepository([
      createContext('SIGNAL_A', 1000),
      createContext('SIGNAL_B', 2000),
    ]);
    const input = {
      repository,
      startedTimestamp: 1000,
      finishedTimestamp: 2000,
    };

    const first = runHistoricalReplay(input);
    const second = runHistoricalReplay(input);

    expect(second).toEqual(first);
  });

  it('does not mutate the repository while replaying history', () => {
    const readOnlyRepository = createReadOnlyRepository([
      createFrozenRecord(createContext('SIGNAL_A', 1000)),
      createFrozenRecord(createContext('SIGNAL_B', 2000)),
    ]);

    const replay = runHistoricalReplay({
      repository: readOnlyRepository.repository,
      startedTimestamp: 1000,
      finishedTimestamp: 2000,
    });

    expect(replay.signalCount).toBe(2);
    expect(readOnlyRepository.writeCallCount()).toBe(0);
  });

  it('keeps replay artifacts immutable and marks runtime side effects as disabled', () => {
    const replay = runHistoricalReplay({
      repository: createRepository([createContext('SIGNAL_A', 1000)]),
      startedTimestamp: 1000,
      finishedTimestamp: 1000,
    });

    expect(Object.isFrozen(replay)).toBe(true);
    expect(Object.isFrozen(replay.processedSignals)).toBe(true);
    expect(Object.isFrozen(replay.processedSignals[0])).toBe(true);
    expect(Object.isFrozen(replay.metadata)).toBe(true);
    expect(replay.metadata).toEqual({
      repositoryMutated: false,
      runtimeAffected: false,
      notificationSent: false,
      tradingLogicChanged: false,
      policyChanged: false,
      outcomeChanged: false,
      benchmarkChanged: false,
    });
  });

  it('handles empty history without inventing replay output', () => {
    const replay = runHistoricalReplay({
      repository: new InMemorySignalRepository(),
      startedTimestamp: 0,
      finishedTimestamp: 0,
    });

    expect(replay.replayStatus).toBe('EMPTY');
    expect(replay.signalCount).toBe(0);
    expect(replay.processedSignals).toEqual([]);
    expect(replay.duration).toBe(0);
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

function createContext(signalId: string, timestamp: number): SignalContext {
  return createSignalContext({
    signalId,
    pair: 'EURUSD',
    direction: 'long',
    timeframe: '15m',
    grade: 'A+',
    score: 9,
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
      throw new Error('Replay must not create signal records');
    },
    updateSignalRecord(): SignalRecord {
      writes += 1;
      throw new Error('Replay must not update signal records');
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
      throw new Error('Replay must not save outcomes');
    },
    saveBenchmark(): SignalRecord {
      writes += 1;
      throw new Error('Replay must not save benchmarks');
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
