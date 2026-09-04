import { createPendingSignalBenchmark } from '../src/signalBenchmark';
import { createSignalContext } from '../src/signalContext';
import { createWaitingEntryOutcome } from '../src/signalOutcome';
import { InMemorySignalRepository, NoopSignalRepository } from '../src/signalRepository';

describe('Performance Persistence Foundation', () => {
  const context = createSignalContext({
    signalId: 'EURUSD_15m_OB_1717400000000_1717407600000',
    pair: 'EURUSD',
    direction: 'long',
    timeframe: '15m',
    grade: 'A+',
    score: 9,
    executionStatus: 'EXECUTION_READY',
    riskStatus: 'ACCEPTED',
    timestamp: 1717407600000,
    lifecycleStates: ['DETECTED', 'GRADED', 'PLANNED', 'EXECUTION_READY', 'SIMULATED', 'RISK_ACCEPTED'],
  });
  const outcome = createWaitingEntryOutcome(context);
  const benchmark = createPendingSignalBenchmark({ signalContext: context, signalOutcome: outcome });

  test('stores SignalContext, SignalOutcome, and SignalBenchmark without domain logic', () => {
    const repository = new InMemorySignalRepository();

    repository.createSignalRecord(context);
    repository.saveOutcome(outcome);
    repository.saveBenchmark(benchmark);

    const record = repository.loadSignalRecord(context.signalId);
    expect(record?.signalId).toBe(context.signalId);
    expect(record?.context).toBe(context);
    expect(record?.outcome).toBe(outcome);
    expect(record?.benchmark).toBe(benchmark);
    expect(Object.isFrozen(record)).toBe(true);
  });

  test('supports find and list queries for future Learning and Benchmark readers', () => {
    const repository = new InMemorySignalRepository();
    repository.createSignalRecord(context);
    repository.saveOutcome(outcome);
    repository.saveBenchmark(benchmark);

    expect(repository.findSignal({ signalId: context.signalId })?.signalId).toBe(context.signalId);
    expect(repository.listSignals({ pair: 'EURUSD' })).toHaveLength(1);
    expect(repository.listSignals({ grade: 'A+' })).toHaveLength(1);
    expect(repository.listSignals({ outcomeType: 'WAITING_ENTRY' })).toHaveLength(1);
    expect(repository.listSignals({ benchmarkStatus: 'PENDING' })).toHaveLength(1);
    expect(repository.listSignals({ pair: 'GBPUSD' })).toHaveLength(0);
  });

  test('noop repository satisfies the same abstraction without persistence side effects', () => {
    const repository = new NoopSignalRepository();

    expect(repository.createSignalRecord(context).signalId).toBe(context.signalId);
    expect(repository.saveOutcome(outcome).outcome).toBe(outcome);
    expect(repository.saveBenchmark(benchmark).benchmark).toBe(benchmark);
    expect(repository.loadSignalRecord(context.signalId)).toBeUndefined();
    expect(repository.listSignals()).toHaveLength(0);
  });
});

