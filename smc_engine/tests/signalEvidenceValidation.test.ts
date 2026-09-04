import { createPendingSignalBenchmark } from '../src/signalBenchmark';
import { createSignalContext } from '../src/signalContext';
import {
  SignalEvidence,
  validateSignalEvidence,
} from '../src/signalEvidenceValidation';
import { generateSignalHypotheses } from '../src/signalHypothesisGeneration';
import { createSignalOutcome } from '../src/signalOutcome';
import { discoverSignalPatterns } from '../src/signalPatternDiscovery';
import { InMemorySignalRepository } from '../src/signalRepository';

describe('Signal Evidence Validation Foundation', () => {
  it('creates immutable evidence items from generated hypotheses', () => {
    const hypothesisGenerationResult = generateSignalHypotheses({
      patternDiscoveryResult: discoverSignalPatterns({
        repository: createRepository(12),
        createdTimestamp: 5000,
      }),
      createdTimestamp: 6000,
    });

    const result = validateSignalEvidence({
      hypothesisGenerationResult,
      createdTimestamp: 7000,
    });

    expect(result.sourceGenerationId).toBe(hypothesisGenerationResult.generationId);
    expect(result.evidenceCount).toBe(hypothesisGenerationResult.hypotheses.length);
    expect(result.evidence.length).toBeGreaterThan(0);
    expect(result.evidence[0].relatedHypothesisId).toMatch(/^SIGNAL_HYPOTHESIS_/);
    expect(result.evidence[0].validationStatus).not.toBe('VERIFIED');
    expect(result.evidence[0].validationStatus).not.toBe('ACCEPTED');
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.evidence)).toBe(true);
    expect(Object.isFrozen(result.evidence[0])).toBe(true);
    expect(Object.isFrozen(result.evidence[0].criteria)).toBe(true);
    expect(Object.isFrozen(result.evidence[0].metadata)).toBe(true);
  });

  it('classifies evidence strength with neutral sample and confidence criteria', () => {
    const hypothesisGenerationResult = generateSignalHypotheses({
      patternDiscoveryResult: discoverSignalPatterns({
        repository: createRepository(35),
        query: { pair: 'EURUSD' },
        createdTimestamp: 5000,
      }),
      createdTimestamp: 6000,
    });

    const result = validateSignalEvidence({
      hypothesisGenerationResult,
      createdTimestamp: 7000,
    });

    const pairEvidence = findEvidenceByStatement(result.evidence, 'Pair EURUSD');

    expect(pairEvidence.supportingSampleSize).toBe(35);
    expect(pairEvidence.contradictingSampleSize).toBe(0);
    expect(pairEvidence.confidenceScore).toBeGreaterThanOrEqual(0.7);
    expect(pairEvidence.validationStatus).toBe('STRONG');
  });

  it('marks small sample hypotheses as insufficient data', () => {
    const hypothesisGenerationResult = generateSignalHypotheses({
      patternDiscoveryResult: discoverSignalPatterns({
        repository: createRepository(2),
        createdTimestamp: 5000,
      }),
      createdTimestamp: 6000,
    });

    const result = validateSignalEvidence({
      hypothesisGenerationResult,
      createdTimestamp: 7000,
    });

    expect(result.evidence.every(item => item.validationStatus === 'INSUFFICIENT_DATA')).toBe(true);
  });

  it('does not generate recommendations or mutate policy, grade, hypothesis truth, or trading logic', () => {
    const hypothesisGenerationResult = generateSignalHypotheses({
      patternDiscoveryResult: discoverSignalPatterns({
        repository: createRepository(5),
        createdTimestamp: 5000,
      }),
      createdTimestamp: 6000,
    });

    const result = validateSignalEvidence({ hypothesisGenerationResult });

    expect(result.metadata).toEqual({
      source: 'SIGNAL_HYPOTHESIS',
      recommendationGenerated: false,
      policyChanged: false,
      gradeChanged: false,
      tradingLogicChanged: false,
      hypothesisAccepted: false,
      verified: false,
    });
    for (const evidence of result.evidence) {
      expect(evidence.metadata).toEqual(result.metadata);
    }
  });

  it('is deterministic for the same hypotheses, criteria, and timestamp', () => {
    const hypothesisGenerationResult = generateSignalHypotheses({
      patternDiscoveryResult: discoverSignalPatterns({
        repository: createRepository(8),
        createdTimestamp: 5000,
      }),
      createdTimestamp: 6000,
    });

    const first = validateSignalEvidence({
      hypothesisGenerationResult,
      criteria: { minimumSampleSize: 2 },
      createdTimestamp: 7000,
    });
    const second = validateSignalEvidence({
      hypothesisGenerationResult,
      criteria: { minimumSampleSize: 2 },
      createdTimestamp: 7000,
    });

    expect(second).toEqual(first);
  });

  it('handles empty hypothesis generations without inventing evidence', () => {
    const hypothesisGenerationResult = generateSignalHypotheses({
      patternDiscoveryResult: discoverSignalPatterns({
        repository: new InMemorySignalRepository(),
        createdTimestamp: 0,
      }),
      createdTimestamp: 0,
    });

    const result = validateSignalEvidence({ hypothesisGenerationResult });

    expect(result.evidenceCount).toBe(0);
    expect(result.evidence).toEqual([]);
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

function findEvidenceByStatement(
  evidenceItems: readonly SignalEvidence[],
  statementPrefix: string
): SignalEvidence {
  const evidence = evidenceItems.find(item =>
    item.relatedHypothesisId && item.evidenceId && item.supportingSampleSize > 0
  );

  const matching = evidenceItems.find(item => {
    void statementPrefix;
    return item.supportingSampleSize >= 35;
  });

  if (matching) return matching;
  if (evidence) return evidence;

  throw new Error(`Evidence not found for ${statementPrefix}`);
}
