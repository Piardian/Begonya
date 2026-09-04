import { createPendingSignalBenchmark } from '../src/signalBenchmark';
import { createSignalContext } from '../src/signalContext';
import { createSignalOutcome } from '../src/signalOutcome';
import {
  PatternDiscoveryResult,
  SignalPattern,
  discoverSignalPatterns,
} from '../src/signalPatternDiscovery';
import {
  InMemorySignalRepository,
  SignalQuery,
  SignalRecord,
  SignalRepository,
} from '../src/signalRepository';

describe('Signal Pattern Discovery Foundation', () => {
  it('discovers immutable descriptive patterns from repository signal records', () => {
    const repository = createSeededRepository();

    const result = discoverSignalPatterns({ repository, createdTimestamp: 5000 });

    expect(result.signalCount).toBe(5);
    expect(result.patterns.length).toBeGreaterThan(0);
    expect(findPattern(result, 'PAIR_OUTCOME_CLUSTER', 'pair', 'EURUSD')).toMatchObject({
      observationCount: 3,
      evidence: {
        distribution: {
          TAKE_PROFIT: 2,
          WAITING_ENTRY: 1,
        },
      },
    });
    expect(findPattern(result, 'GRADE_OUTCOME_CLUSTER', 'grade', 'A+')).toMatchObject({
      observationCount: 3,
      evidence: {
        distribution: {
          STOP_LOSS: 1,
          TAKE_PROFIT: 2,
        },
      },
    });
    expect(findPattern(result, 'OUTCOME_DENSITY', 'outcome', 'TAKE_PROFIT')).toMatchObject({
      observationCount: 2,
      evidence: {
        distribution: {
          TAKE_PROFIT: 2,
        },
      },
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.patterns)).toBe(true);
    expect(Object.isFrozen(result.patterns[0])).toBe(true);
    expect(Object.isFrozen(result.patterns[0].evidence)).toBe(true);
    expect(Object.isFrozen(result.patterns[0].metadata)).toBe(true);
  });

  it('does not generate recommendations or mutate policy, grade, benchmark, outcome, or trading logic', () => {
    const repository = createSeededRepository();

    const result = discoverSignalPatterns({ repository });

    expect(result.metadata).toEqual({
      recommendationGenerated: false,
      policyChanged: false,
      gradeChanged: false,
      benchmarkChanged: false,
      outcomeChanged: false,
      tradingLogicChanged: false,
      decisionMade: false,
    });
    for (const pattern of result.patterns) {
      expect(pattern.metadata).toEqual(result.metadata);
    }
  });

  it('supports scoped discovery through repository queries', () => {
    const repository = createSeededRepository();

    const result = discoverSignalPatterns({
      repository,
      query: { pair: 'GBPUSD' },
      createdTimestamp: 5000,
    });

    expect(result.signalCount).toBe(2);
    expect(result.scope.query).toEqual({ pair: 'GBPUSD' });
    expect(findPattern(result, 'PAIR_OUTCOME_CLUSTER', 'pair', 'GBPUSD')).toMatchObject({
      observationCount: 2,
      evidence: {
        distribution: {
          STOP_LOSS: 2,
        },
      },
    });
    expect(result.patterns.find(pattern => pattern.patternValue === 'EURUSD')).toBeUndefined();
  });

  it('is deterministic for the same repository, query, and timestamp', () => {
    const repository = createSeededRepository();

    const first = discoverSignalPatterns({
      repository,
      query: { grade: 'A+' },
      createdTimestamp: 9000,
    });
    const second = discoverSignalPatterns({
      repository,
      query: { grade: 'A+' },
      createdTimestamp: 9000,
    });

    expect(second).toEqual(first);
  });

  it('handles an empty repository without inventing patterns', () => {
    const repository = new InMemorySignalRepository();

    const result = discoverSignalPatterns({ repository });

    expect(result.signalCount).toBe(0);
    expect(result.createdTimestamp).toBe(0);
    expect(result.patterns).toEqual([]);
  });

  it('reads only through the repository listSignals contract', () => {
    const calls: SignalQuery[] = [];
    const repository: SignalRepository = {
      createSignalRecord: () => {
        throw new Error('not expected');
      },
      updateSignalRecord: () => {
        throw new Error('not expected');
      },
      loadSignalRecord: () => {
        throw new Error('not expected');
      },
      findSignal: () => {
        throw new Error('not expected');
      },
      listSignals: query => {
        calls.push(query ?? {});
        return Object.freeze([createBareRecord('EURUSD_15m_OB_1000_2000')]);
      },
      saveOutcome: () => {
        throw new Error('not expected');
      },
      saveBenchmark: () => {
        throw new Error('not expected');
      },
    };

    const result = discoverSignalPatterns({
      repository,
      query: { timeframe: '15m' },
    });

    expect(calls).toEqual([{ timeframe: '15m' }]);
    expect(result.signalCount).toBe(1);
  });
});

function createSeededRepository(): InMemorySignalRepository {
  const repository = new InMemorySignalRepository();

  addSignal(repository, {
    signalId: 'EURUSD_15m_OB_1000_2000',
    pair: 'EURUSD',
    timeframe: '15m',
    grade: 'A+',
    score: 9,
    outcomeType: 'TAKE_PROFIT',
    timestamp: 1000,
  });
  addSignal(repository, {
    signalId: 'EURUSD_15m_FVG_1100_2100',
    pair: 'EURUSD',
    timeframe: '15m',
    grade: 'A+',
    score: 8,
    outcomeType: 'TAKE_PROFIT',
    timestamp: 1100,
  });
  addSignal(repository, {
    signalId: 'GBPUSD_1h_OB_1200_2200',
    pair: 'GBPUSD',
    timeframe: '1h',
    grade: 'A+',
    score: 8,
    outcomeType: 'STOP_LOSS',
    timestamp: 1200,
  });
  addSignal(repository, {
    signalId: 'GBPUSD_1h_FVG_1300_2300',
    pair: 'GBPUSD',
    timeframe: '1h',
    grade: 'B',
    score: 5,
    outcomeType: 'STOP_LOSS',
    timestamp: 1300,
  });
  addSignal(repository, {
    signalId: 'EURUSD_4h_OB_1400_2400',
    pair: 'EURUSD',
    timeframe: '4h',
    grade: 'A',
    score: 7,
    outcomeType: 'WAITING_ENTRY',
    timestamp: 1400,
  });

  return repository;
}

function addSignal(
  repository: InMemorySignalRepository,
  input: {
    readonly signalId: string;
    readonly pair: 'EURUSD' | 'GBPUSD';
    readonly timeframe: '15m' | '1h' | '4h';
    readonly grade: string;
    readonly score: number;
    readonly outcomeType: 'TAKE_PROFIT' | 'STOP_LOSS' | 'WAITING_ENTRY';
    readonly timestamp: number;
  }
): void {
  const context = createSignalContext({
    signalId: input.signalId,
    pair: input.pair,
    direction: input.pair === 'EURUSD' ? 'long' : 'short',
    timeframe: input.timeframe,
    grade: input.grade,
    score: input.score,
    timestamp: input.timestamp,
  });
  const outcome = createSignalOutcome({
    signalContext: context,
    outcomeType: input.outcomeType,
  });

  repository.createSignalRecord(context);
  repository.saveOutcome(outcome);
  repository.saveBenchmark(createPendingSignalBenchmark({ signalContext: context, signalOutcome: outcome }));
}

function createBareRecord(signalId: string): SignalRecord {
  const context = createSignalContext({
    signalId,
    pair: 'EURUSD',
    direction: 'long',
    timeframe: '15m',
    grade: 'A',
    score: 7,
    timestamp: 1000,
  });

  return Object.freeze({
    signalId,
    context,
  });
}

function findPattern(
  result: PatternDiscoveryResult,
  patternType: SignalPattern['patternType'],
  patternKey: string,
  patternValue: string
): SignalPattern {
  const pattern = result.patterns.find(
    candidate =>
      candidate.patternType === patternType &&
      candidate.patternKey === patternKey &&
      candidate.patternValue === patternValue
  );

  if (!pattern) {
    throw new Error(`Pattern not found: ${patternType}/${patternKey}/${patternValue}`);
  }

  return pattern;
}
