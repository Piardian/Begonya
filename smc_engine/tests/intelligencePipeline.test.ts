import { runIntelligencePipeline } from '../src/intelligencePipeline';
import { createPendingSignalBenchmark } from '../src/signalBenchmark';
import { createSignalContext } from '../src/signalContext';
import { createSignalOutcome } from '../src/signalOutcome';
import { InMemorySignalRepository } from '../src/signalRepository';

describe('Intelligence Pipeline Integration', () => {
  it('runs repository to recommendation pipeline end-to-end', () => {
    const repository = createRepository(35);

    const report = runIntelligencePipeline({
      repository,
      query: { pair: 'EURUSD' },
      timestamps: {
        observationTimestamp: 5000,
        patternDiscoveryTimestamp: 5000,
        hypothesisTimestamp: 6000,
        evidenceTimestamp: 7000,
        recommendationTimestamp: 8000,
        reportTimestamp: 9000,
      },
    });

    expect(report.observation.signalCount).toBe(35);
    expect(report.patternDiscovery.patterns.length).toBeGreaterThan(0);
    expect(report.hypothesisGeneration.hypotheses.length).toBe(report.patternDiscovery.patterns.length);
    expect(report.evidenceValidation.evidence.length).toBe(report.hypothesisGeneration.hypotheses.length);
    expect(report.recommendationGeneration.recommendations.length).toBeGreaterThan(0);
    expect(report.summary.patternsFound).toBe(report.patternDiscovery.patterns.length);
    expect(report.summary.hypothesesGenerated).toBe(report.hypothesisGeneration.hypotheses.length);
    expect(report.summary.recommendationsReadyForReview).toBe(
      report.recommendationGeneration.recommendations.filter(
        recommendation => recommendation.status === 'READY_FOR_REVIEW'
      ).length
    );
  });

  it('keeps runtime, trading, notification, policy, and auto-apply behavior untouched', () => {
    const report = runIntelligencePipeline({
      repository: createRepository(5),
      timestamps: {
        observationTimestamp: 5000,
        patternDiscoveryTimestamp: 5000,
        hypothesisTimestamp: 6000,
        evidenceTimestamp: 7000,
        recommendationTimestamp: 8000,
        reportTimestamp: 9000,
      },
    });

    expect(report.metadata).toEqual({
      source: 'SIGNAL_REPOSITORY',
      runtimeAffected: false,
      tradingLogicChanged: false,
      notificationChanged: false,
      recommendationAutoApplied: false,
      policyChanged: false,
    });
    expect(report.recommendationGeneration.metadata.autoApplied).toBe(false);
  });

  it('is immutable and deterministic for the same repository, query, and timestamps', () => {
    const repository = createRepository(12);
    const input = {
      repository,
      query: { timeframe: '15m' as const },
      timestamps: {
        observationTimestamp: 5000,
        patternDiscoveryTimestamp: 5000,
        hypothesisTimestamp: 6000,
        evidenceTimestamp: 7000,
        recommendationTimestamp: 8000,
        reportTimestamp: 9000,
      },
    };

    const first = runIntelligencePipeline(input);
    const second = runIntelligencePipeline(input);

    expect(second).toEqual(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.summary)).toBe(true);
    expect(Object.isFrozen(first.metadata)).toBe(true);
  });

  it('handles an empty repository without inventing downstream artifacts', () => {
    const report = runIntelligencePipeline({
      repository: new InMemorySignalRepository(),
    });

    expect(report.observation.signalCount).toBe(0);
    expect(report.patternDiscovery.patterns).toEqual([]);
    expect(report.hypothesisGeneration.hypotheses).toEqual([]);
    expect(report.evidenceValidation.evidence).toEqual([]);
    expect(report.recommendationGeneration.recommendations).toEqual([]);
    expect(report.summary.evidenceLevels).toEqual({});
  });
});

function createRepository(signalCount: number): InMemorySignalRepository {
  const repository = new InMemorySignalRepository();

  for (let index = 0; index < signalCount; index += 1) {
    const signalId = `EURUSD_15m_OB_${1000 + index}_${2000 + index}`;
    const context = createSignalContext({
      signalId,
      pair: 'EURUSD',
      direction: 'long',
      timeframe: '15m',
      grade: 'A+',
      score: 9,
      timestamp: 1000 + index,
    });
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
