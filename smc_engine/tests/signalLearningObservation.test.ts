import {
  SignalLearningObservation,
  createSignalLearningObservation,
} from '../src/signalLearningObservation';
import { createPendingSignalBenchmark } from '../src/signalBenchmark';
import { createSignalContext } from '../src/signalContext';
import { createSignalOutcome } from '../src/signalOutcome';
import {
  InMemorySignalRepository,
  SignalQuery,
  SignalRecord,
  SignalRepository,
} from '../src/signalRepository';

describe('Signal Learning Observation Foundation', () => {
  it('creates immutable descriptive metrics from repository records', () => {
    const repository = new InMemorySignalRepository();

    const first = createSignalContext({
      signalId: 'EURUSD_15m_OB_1000_2000',
      pair: 'EURUSD',
      direction: 'long',
      timeframe: '15m',
      grade: 'A+',
      score: 9,
      timestamp: 1000,
    });
    const second = createSignalContext({
      signalId: 'GBPUSD_1h_FVG_1100_2100',
      pair: 'GBPUSD',
      direction: 'short',
      timeframe: '1h',
      grade: 'A',
      score: 7,
      timestamp: 1100,
    });
    const third = createSignalContext({
      signalId: 'EURUSD_15m_FVG_1200_2200',
      pair: 'EURUSD',
      direction: 'long',
      timeframe: '15m',
      grade: 'A+',
      score: 8,
      timestamp: 1200,
    });

    repository.createSignalRecord(first);
    repository.createSignalRecord(second);
    repository.createSignalRecord(third);

    const firstOutcome = createSignalOutcome({ signalContext: first, outcomeType: 'TAKE_PROFIT' });
    const secondOutcome = createSignalOutcome({ signalContext: second, outcomeType: 'STOP_LOSS' });
    const thirdOutcome = createSignalOutcome({ signalContext: third, outcomeType: 'WAITING_ENTRY' });

    repository.saveOutcome(firstOutcome);
    repository.saveOutcome(secondOutcome);
    repository.saveOutcome(thirdOutcome);
    repository.saveBenchmark(createPendingSignalBenchmark({ signalContext: first, signalOutcome: firstOutcome }));
    repository.saveBenchmark(createPendingSignalBenchmark({ signalContext: second, signalOutcome: secondOutcome }));
    repository.saveBenchmark(createPendingSignalBenchmark({ signalContext: third, signalOutcome: thirdOutcome }));

    const observation = createSignalLearningObservation({ repository });

    expect(observation.signalCount).toBe(3);
    expect(observation.observationTimestamp).toBe(1200);
    expect(observation.metrics.gradeDistribution).toEqual({ A: 1, 'A+': 2 });
    expect(observation.metrics.outcomeDistribution).toEqual({
      STOP_LOSS: 1,
      TAKE_PROFIT: 1,
      WAITING_ENTRY: 1,
    });
    expect(observation.metrics.benchmarkStatusDistribution).toEqual({ PENDING: 3 });
    expect(observation.metrics.pairDistribution).toEqual({ EURUSD: 2, GBPUSD: 1 });
    expect(observation.metrics.timeframeDistribution).toEqual({ '15m': 2, '1h': 1 });
    expect(observation.metrics.mostFrequentPair).toBe('EURUSD');
    expect(observation.metrics.mostFrequentTimeframe).toBe('15m');
    expect(Object.isFrozen(observation)).toBe(true);
    expect(Object.isFrozen(observation.metrics)).toBe(true);
    expect(Object.isFrozen(observation.metadata)).toBe(true);
  });

  it('does not generate recommendations, policy changes, grade changes, or benchmark decisions', () => {
    const repository = new InMemorySignalRepository();
    const context = createSignalContext({
      signalId: 'EURUSD_15m_OB_1000_2000',
      pair: 'EURUSD',
      direction: 'long',
      timeframe: '15m',
      grade: 'A+',
      score: 9,
      timestamp: 1000,
    });

    repository.createSignalRecord(context);

    const observation = createSignalLearningObservation({ repository });

    expect(observation.metadata).toEqual({
      recommendationGenerated: false,
      policyChanged: false,
      gradeChanged: false,
      benchmarkDecisionMade: false,
      tradingLogicChanged: false,
    });
  });

  it('supports repository query scope without touching runtime layers', () => {
    const repository = new InMemorySignalRepository();

    repository.createSignalRecord(
      createSignalContext({
        signalId: 'EURUSD_15m_OB_1000_2000',
        pair: 'EURUSD',
        direction: 'long',
        timeframe: '15m',
        grade: 'A+',
        score: 9,
        timestamp: 1000,
      })
    );
    repository.createSignalRecord(
      createSignalContext({
        signalId: 'GBPUSD_1h_FVG_1100_2100',
        pair: 'GBPUSD',
        direction: 'short',
        timeframe: '1h',
        grade: 'B',
        score: 5,
        timestamp: 1100,
      })
    );

    const observation = createSignalLearningObservation({
      repository,
      query: { pair: 'EURUSD' },
    });

    expect(observation.signalCount).toBe(1);
    expect(observation.scope.query).toEqual({ pair: 'EURUSD' });
    expect(observation.metrics.pairDistribution).toEqual({ EURUSD: 1 });
  });

  it('is deterministic for the same repository, query, and timestamp', () => {
    const repository = new InMemorySignalRepository();
    repository.createSignalRecord(
      createSignalContext({
        signalId: 'EURUSD_15m_OB_1000_2000',
        pair: 'EURUSD',
        direction: 'long',
        timeframe: '15m',
        grade: 'A+',
        score: 9,
        timestamp: 1000,
      })
    );

    const first = createSignalLearningObservation({
      repository,
      query: { grade: 'A+' },
      observationTimestamp: 5000,
    });
    const second = createSignalLearningObservation({
      repository,
      query: { grade: 'A+' },
      observationTimestamp: 5000,
    });

    expect(second).toEqual(first);
  });

  it('handles an empty repository as a neutral observation', () => {
    const repository = new InMemorySignalRepository();

    const observation = createSignalLearningObservation({ repository });

    expect(observation.signalCount).toBe(0);
    expect(observation.observationTimestamp).toBe(0);
    expect(observation.metrics.totalSignals).toBe(0);
    expect(observation.metrics.mostFrequentPair).toBeNull();
    expect(observation.metrics.mostFrequentTimeframe).toBeNull();
  });

  it('reads only through the repository listSignals contract', () => {
    const calls: SignalQuery[] = [];
    const record = createRecord('EURUSD_15m_OB_1000_2000');
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
        return Object.freeze([record]);
      },
      saveOutcome: () => {
        throw new Error('not expected');
      },
      saveBenchmark: () => {
        throw new Error('not expected');
      },
    };

    const observation = createSignalLearningObservation({
      repository,
      query: { timeframe: '15m' },
    });

    expect(calls).toEqual([{ timeframe: '15m' }]);
    expect(observation.signalCount).toBe(1);
  });
});

function createRecord(signalId: string): SignalRecord {
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
