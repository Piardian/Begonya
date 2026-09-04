import {
  EvidenceValidationResult,
  validateSignalEvidence,
} from './signalEvidenceValidation';
import {
  HypothesisGenerationResult,
  generateSignalHypotheses,
} from './signalHypothesisGeneration';
import {
  PatternDiscoveryResult,
  discoverSignalPatterns,
} from './signalPatternDiscovery';
import {
  RecommendationGenerationResult,
  generateSignalRecommendations,
} from './signalRecommendationFoundation';
import {
  SignalLearningObservation,
  createSignalLearningObservation,
} from './signalLearningObservation';
import { SignalQuery, SignalRepository } from './signalRepository';

export const INTELLIGENCE_PIPELINE_VERSION = 1 as const;

export interface IntelligencePipelineTimestamps {
  readonly observationTimestamp?: number;
  readonly patternDiscoveryTimestamp?: number;
  readonly hypothesisTimestamp?: number;
  readonly evidenceTimestamp?: number;
  readonly recommendationTimestamp?: number;
  readonly reportTimestamp?: number;
}

export interface IntelligencePipelineSummary {
  readonly observationSummary: string;
  readonly patternsFound: number;
  readonly hypothesesGenerated: number;
  readonly evidenceLevels: Readonly<Record<string, number>>;
  readonly recommendationsReadyForReview: number;
}

export interface IntelligencePipelineMetadata {
  readonly source: 'SIGNAL_REPOSITORY';
  readonly runtimeAffected: false;
  readonly tradingLogicChanged: false;
  readonly notificationChanged: false;
  readonly recommendationAutoApplied: false;
  readonly policyChanged: false;
}

export interface IntelligenceReport {
  readonly version: typeof INTELLIGENCE_PIPELINE_VERSION;
  readonly reportId: string;
  readonly createdTimestamp: number;
  readonly query: SignalQuery;
  readonly observation: SignalLearningObservation;
  readonly patternDiscovery: PatternDiscoveryResult;
  readonly hypothesisGeneration: HypothesisGenerationResult;
  readonly evidenceValidation: EvidenceValidationResult;
  readonly recommendationGeneration: RecommendationGenerationResult;
  readonly summary: IntelligencePipelineSummary;
  readonly metadata: IntelligencePipelineMetadata;
}

export function runIntelligencePipeline(input: {
  readonly repository: SignalRepository;
  readonly query?: SignalQuery;
  readonly timestamps?: IntelligencePipelineTimestamps;
}): IntelligenceReport {
  const query = Object.freeze({ ...(input.query ?? {}) });
  const timestamps = input.timestamps ?? {};

  const observation = createSignalLearningObservation({
    repository: input.repository,
    query,
    observationTimestamp: timestamps.observationTimestamp,
  });
  console.log('Observation Complete');

  const patternDiscovery = discoverSignalPatterns({
    repository: input.repository,
    query,
    createdTimestamp: timestamps.patternDiscoveryTimestamp ?? observation.observationTimestamp,
  });
  console.log('Pattern Discovery Complete');

  const hypothesisGeneration = generateSignalHypotheses({
    patternDiscoveryResult: patternDiscovery,
    createdTimestamp: timestamps.hypothesisTimestamp ?? patternDiscovery.createdTimestamp,
  });
  console.log('Hypothesis Complete');

  const evidenceValidation = validateSignalEvidence({
    hypothesisGenerationResult: hypothesisGeneration,
    createdTimestamp: timestamps.evidenceTimestamp ?? hypothesisGeneration.createdTimestamp,
  });
  console.log('Evidence Validation Complete');

  const recommendationGeneration = generateSignalRecommendations({
    evidenceValidationResult: evidenceValidation,
    createdTimestamp: timestamps.recommendationTimestamp ?? evidenceValidation.createdTimestamp,
  });
  console.log('Recommendation Complete');

  const createdTimestamp =
    timestamps.reportTimestamp ?? recommendationGeneration.createdTimestamp;
  const summary = createSummary(
    observation,
    patternDiscovery,
    hypothesisGeneration,
    evidenceValidation,
    recommendationGeneration
  );

  return Object.freeze({
    version: INTELLIGENCE_PIPELINE_VERSION,
    reportId: createReportId({
      observationId: observation.observationId,
      discoveryId: patternDiscovery.discoveryId,
      generationId: hypothesisGeneration.generationId,
      validationId: evidenceValidation.validationId,
      recommendationGenerationId: recommendationGeneration.generationId,
      createdTimestamp,
    }),
    createdTimestamp,
    query,
    observation,
    patternDiscovery,
    hypothesisGeneration,
    evidenceValidation,
    recommendationGeneration,
    summary,
    metadata: createMetadata(),
  });
}

function createSummary(
  observation: SignalLearningObservation,
  patternDiscovery: PatternDiscoveryResult,
  hypothesisGeneration: HypothesisGenerationResult,
  evidenceValidation: EvidenceValidationResult,
  recommendationGeneration: RecommendationGenerationResult
): IntelligencePipelineSummary {
  return Object.freeze({
    observationSummary: observation.summary,
    patternsFound: patternDiscovery.patterns.length,
    hypothesesGenerated: hypothesisGeneration.hypotheses.length,
    evidenceLevels: countEvidenceLevels(evidenceValidation),
    recommendationsReadyForReview: recommendationGeneration.recommendations.filter(
      recommendation => recommendation.status === 'READY_FOR_REVIEW'
    ).length,
  });
}

function countEvidenceLevels(
  evidenceValidation: EvidenceValidationResult
): Readonly<Record<string, number>> {
  const counts: Record<string, number> = {};

  for (const evidence of evidenceValidation.evidence) {
    counts[evidence.validationStatus] = (counts[evidence.validationStatus] ?? 0) + 1;
  }

  return Object.freeze(
    Object.keys(counts)
      .sort()
      .reduce<Record<string, number>>((sorted, key) => {
        sorted[key] = counts[key];
        return sorted;
      }, {})
  );
}

function createMetadata(): IntelligencePipelineMetadata {
  return Object.freeze({
    source: 'SIGNAL_REPOSITORY' as const,
    runtimeAffected: false as const,
    tradingLogicChanged: false as const,
    notificationChanged: false as const,
    recommendationAutoApplied: false as const,
    policyChanged: false as const,
  });
}

function createReportId(input: {
  readonly observationId: string;
  readonly discoveryId: string;
  readonly generationId: string;
  readonly validationId: string;
  readonly recommendationGenerationId: string;
  readonly createdTimestamp: number;
}): string {
  return `INTELLIGENCE_REPORT_${hashString(
    [
      input.observationId,
      input.discoveryId,
      input.generationId,
      input.validationId,
      input.recommendationGenerationId,
      input.createdTimestamp,
    ].join('|')
  )}`;
}

function hashString(value: string): string {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, '0').toUpperCase();
}
