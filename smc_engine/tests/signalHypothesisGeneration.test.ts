import { createPendingSignalBenchmark } from '../src/signalBenchmark';
import { createSignalContext } from '../src/signalContext';
import { generateSignalHypotheses } from '../src/signalHypothesisGeneration';
import { createSignalOutcome } from '../src/signalOutcome';
import { discoverSignalPatterns } from '../src/signalPatternDiscovery';
import { InMemorySignalRepository } from '../src/signalRepository';

describe('Signal Hypothesis Generation Foundation', () => {
  it('generates immutable proposed hypotheses from pattern discovery results', () => {
    const patternDiscoveryResult = discoverSignalPatterns({
      repository: createSeededRepository(),
      createdTimestamp: 5000,
    });

    const result = generateSignalHypotheses({
      patternDiscoveryResult,
      createdTimestamp: 6000,
    });

    expect(result.sourceDiscoveryId).toBe(patternDiscoveryResult.discoveryId);
    expect(result.hypothesisCount).toBe(patternDiscoveryResult.patterns.length);
    expect(result.hypotheses.length).toBeGreaterThan(0);
    expect(result.hypotheses.every(hypothesis => hypothesis.status === 'PROPOSED')).toBe(true);
    expect(result.hypotheses[0].relatedPatternId).toMatch(/^SIGNAL_PATTERN_/);
    expect(result.hypotheses[0].hypothesisStatement).toContain('may');
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.hypotheses)).toBe(true);
    expect(Object.isFrozen(result.hypotheses[0])).toBe(true);
    expect(Object.isFrozen(result.hypotheses[0].supportingMetrics)).toBe(true);
    expect(Object.isFrozen(result.hypotheses[0].metadata)).toBe(true);
  });

  it('keeps hypotheses unaccepted and does not mutate policy, grade, or trading logic', () => {
    const patternDiscoveryResult = discoverSignalPatterns({
      repository: createSeededRepository(),
      createdTimestamp: 5000,
    });

    const result = generateSignalHypotheses({ patternDiscoveryResult });

    expect(result.metadata).toEqual({
      source: 'PATTERN_DISCOVERY',
      recommendationGenerated: false,
      policyChanged: false,
      gradeChanged: false,
      tradingLogicChanged: false,
      acceptedAsTrue: false,
      validationPerformed: false,
    });
    for (const hypothesis of result.hypotheses) {
      expect(hypothesis.metadata).toEqual(result.metadata);
      expect(hypothesis.status).not.toBe('READY_FOR_VALIDATION');
    }
  });

  it('uses only pattern discovery output as source data', () => {
    const patternDiscoveryResult = discoverSignalPatterns({
      repository: createSeededRepository(),
      query: { grade: 'A+' },
      createdTimestamp: 5000,
    });

    const result = generateSignalHypotheses({
      patternDiscoveryResult,
      createdTimestamp: 6000,
    });

    expect(result.sourceDiscoveryId).toBe(patternDiscoveryResult.discoveryId);
    expect(result.hypotheses.every(hypothesis =>
      patternDiscoveryResult.patterns.some(pattern => pattern.patternId === hypothesis.relatedPatternId)
    )).toBe(true);
  });

  it('is deterministic for the same pattern discovery result and timestamp', () => {
    const patternDiscoveryResult = discoverSignalPatterns({
      repository: createSeededRepository(),
      createdTimestamp: 5000,
    });

    const first = generateSignalHypotheses({
      patternDiscoveryResult,
      createdTimestamp: 6000,
    });
    const second = generateSignalHypotheses({
      patternDiscoveryResult,
      createdTimestamp: 6000,
    });

    expect(second).toEqual(first);
  });

  it('handles empty pattern discovery results without inventing hypotheses', () => {
    const patternDiscoveryResult = discoverSignalPatterns({
      repository: new InMemorySignalRepository(),
      createdTimestamp: 0,
    });

    const result = generateSignalHypotheses({ patternDiscoveryResult });

    expect(result.hypothesisCount).toBe(0);
    expect(result.hypotheses).toEqual([]);
  });
});

function createSeededRepository(): InMemorySignalRepository {
  const repository = new InMemorySignalRepository();

  addSignal(repository, {
    signalId: 'EURUSD_15m_OB_1000_2000',
    pair: 'EURUSD',
    timeframe: '15m',
    grade: 'A+',
    outcomeType: 'TAKE_PROFIT',
    timestamp: 1000,
  });
  addSignal(repository, {
    signalId: 'EURUSD_15m_FVG_1100_2100',
    pair: 'EURUSD',
    timeframe: '15m',
    grade: 'A+',
    outcomeType: 'TAKE_PROFIT',
    timestamp: 1100,
  });
  addSignal(repository, {
    signalId: 'GBPUSD_1h_OB_1200_2200',
    pair: 'GBPUSD',
    timeframe: '1h',
    grade: 'B',
    outcomeType: 'STOP_LOSS',
    timestamp: 1200,
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
    score: input.grade === 'A+' ? 9 : 5,
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
