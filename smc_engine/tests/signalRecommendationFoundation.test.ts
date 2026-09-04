import { createPendingSignalBenchmark } from '../src/signalBenchmark';
import { createSignalContext } from '../src/signalContext';
import { validateSignalEvidence } from '../src/signalEvidenceValidation';
import { generateSignalHypotheses } from '../src/signalHypothesisGeneration';
import { createSignalOutcome } from '../src/signalOutcome';
import { discoverSignalPatterns } from '../src/signalPatternDiscovery';
import {
  generateSignalRecommendations,
} from '../src/signalRecommendationFoundation';
import { InMemorySignalRepository } from '../src/signalRepository';

describe('Signal Recommendation Foundation', () => {
  it('creates immutable human-review recommendations only from strong evidence', () => {
    const evidenceValidationResult = validateSignalEvidence({
      hypothesisGenerationResult: generateSignalHypotheses({
        patternDiscoveryResult: discoverSignalPatterns({
          repository: createRepository(35),
          query: { pair: 'EURUSD' },
          createdTimestamp: 5000,
        }),
        createdTimestamp: 6000,
      }),
      createdTimestamp: 7000,
    });

    const result = generateSignalRecommendations({
      evidenceValidationResult,
      createdTimestamp: 8000,
    });

    expect(result.sourceValidationId).toBe(evidenceValidationResult.validationId);
    expect(result.recommendationCount).toBeGreaterThan(0);
    expect(result.recommendations.every(recommendation => recommendation.supportingEvidenceLevel === 'STRONG')).toBe(true);
    expect(result.recommendations.every(recommendation =>
      recommendation.status === 'PROPOSED' || recommendation.status === 'READY_FOR_REVIEW'
    )).toBe(true);
    expect(result.recommendations[0].recommendationStatement).toContain('human');
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.recommendations)).toBe(true);
    expect(Object.isFrozen(result.recommendations[0])).toBe(true);
    expect(Object.isFrozen(result.recommendations[0].metadata)).toBe(true);
  });

  it('does not create recommendations from moderate, weak, insufficient, or rejected evidence', () => {
    const evidenceValidationResult = validateSignalEvidence({
      hypothesisGenerationResult: generateSignalHypotheses({
        patternDiscoveryResult: discoverSignalPatterns({
          repository: createRepository(2),
          createdTimestamp: 5000,
        }),
        createdTimestamp: 6000,
      }),
      createdTimestamp: 7000,
    });

    const result = generateSignalRecommendations({
      evidenceValidationResult,
      createdTimestamp: 8000,
    });

    expect(evidenceValidationResult.evidence.every(item => item.validationStatus !== 'STRONG')).toBe(true);
    expect(result.recommendationCount).toBe(0);
    expect(result.recommendations).toEqual([]);
  });

  it('never auto-applies policy, grade, runtime, or trading logic changes', () => {
    const evidenceValidationResult = validateSignalEvidence({
      hypothesisGenerationResult: generateSignalHypotheses({
        patternDiscoveryResult: discoverSignalPatterns({
          repository: createRepository(35),
          query: { pair: 'EURUSD' },
          createdTimestamp: 5000,
        }),
        createdTimestamp: 6000,
      }),
      createdTimestamp: 7000,
    });

    const result = generateSignalRecommendations({ evidenceValidationResult });

    expect(result.metadata).toEqual({
      source: 'SIGNAL_EVIDENCE',
      autoApplied: false,
      policyChanged: false,
      gradeChanged: false,
      tradingLogicChanged: false,
      runtimeChanged: false,
      humanReviewRequired: true,
    });
    for (const recommendation of result.recommendations) {
      expect(recommendation.metadata).toEqual(result.metadata);
      expect(recommendation.status).not.toBe('IMPLEMENTED');
      expect(recommendation.status).not.toBe('DISMISSED');
    }
  });

  it('is deterministic for the same evidence validation result and timestamp', () => {
    const evidenceValidationResult = validateSignalEvidence({
      hypothesisGenerationResult: generateSignalHypotheses({
        patternDiscoveryResult: discoverSignalPatterns({
          repository: createRepository(35),
          query: { pair: 'EURUSD' },
          createdTimestamp: 5000,
        }),
        createdTimestamp: 6000,
      }),
      createdTimestamp: 7000,
    });

    const first = generateSignalRecommendations({
      evidenceValidationResult,
      createdTimestamp: 8000,
    });
    const second = generateSignalRecommendations({
      evidenceValidationResult,
      createdTimestamp: 8000,
    });

    expect(second).toEqual(first);
  });

  it('handles empty evidence validation results without inventing recommendations', () => {
    const evidenceValidationResult = validateSignalEvidence({
      hypothesisGenerationResult: generateSignalHypotheses({
        patternDiscoveryResult: discoverSignalPatterns({
          repository: new InMemorySignalRepository(),
          createdTimestamp: 0,
        }),
        createdTimestamp: 0,
      }),
      createdTimestamp: 0,
    });

    const result = generateSignalRecommendations({ evidenceValidationResult });

    expect(result.recommendationCount).toBe(0);
    expect(result.recommendations).toEqual([]);
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
