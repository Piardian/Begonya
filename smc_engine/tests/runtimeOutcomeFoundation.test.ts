import { runRuntimeExecutionPipeline } from '../server/runtimeExecutionPipeline';
import { NotificationCandidate } from '../server/pipeline';
import { InMemorySignalRepository } from '../src/signalRepository';

describe('Runtime Outcome Foundation Integration', () => {
  test('runtime carries a Signal Outcome without changing the Signal ID', () => {
    const candidate = buildCandidate();
    const result = runRuntimeExecutionPipeline(candidate);

    expect(result.signalContext.signalId).toBe(candidate.signalId);
    expect(result.signalOutcome.signalId).toBe(candidate.signalId);
    expect(result.signalOutcome.outcomeType).toBe('WAITING_ENTRY');
    expect(result.signalOutcome.metadata.createdFromRuntime).toBe(true);
    expect(result.signalOutcome.metadata.realExecutionTracked).toBe(false);
    expect(result.signalOutcome.metadata.brokerStatusTracked).toBe(false);
    expect(result.signalBenchmark.signalId).toBe(candidate.signalId);
    expect(result.signalBenchmark.benchmarkStatus).toBe('PENDING');
    expect(result.signalBenchmark.prediction).toEqual({ predictedGrade: 'A+', predictedScore: 9 });
    expect(Object.isFrozen(result.signalOutcome)).toBe(true);
  });

  test('runtime can persist SignalContext, SignalOutcome, and SignalBenchmark through repository abstraction', () => {
    const repository = new InMemorySignalRepository();
    const candidate = buildCandidate();
    const result = runRuntimeExecutionPipeline(candidate, repository);
    const record = repository.loadSignalRecord(candidate.signalId!);

    expect(record?.context).toBe(result.signalContext);
    expect(record?.outcome).toBe(result.signalOutcome);
    expect(record?.benchmark).toBe(result.signalBenchmark);
  });
});

function buildCandidate(): NotificationCandidate {
  const relatedEvent = {
    type: 'BOS' as const,
    direction: 'bullish' as const,
    brokenSwing: {} as any,
    breakCandleIndex: 12,
    breakTimestamp: 1717407600000,
    breakClosePrice: 1.056,
  };

  return {
    symbol: 'EURUSD',
    tradeDirection: 'long',
    poiType: 'OB',
    poi: {
      direction: 'bullish',
      candleIndex: 10,
      high: 1.055,
      low: 1.053,
      formedAtIndex: 10,
      relatedEvent,
    },
    gradeResult: {
      totalScore: 9,
      grade: 'A+',
      entryAllowed: true,
      blockReasons: [],
      breakdown: { htfBiasPD: 2, displacement: 2, structure: 2, sweep: 2, poiQuality: 1 },
    },
    uniqueKey: 'EURUSD_15m_OB_1717400000000_1717407600000',
    signalId: 'EURUSD_15m_OB_1717400000000_1717407600000',
    currentPrice: 1.0585,
    poiFormedTimestamp: 1717400000000,
    bias4H: 'bullish',
    bias1H: 'bullish',
    poiTestCount: 0,
    pd4H: 'discount',
    pd1H: 'discount',
    pd15M: 'eq',
  };
}
