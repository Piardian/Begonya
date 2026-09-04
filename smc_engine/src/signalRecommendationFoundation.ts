import {
  EvidenceValidationResult,
  SignalEvidence,
} from './signalEvidenceValidation';

export const SIGNAL_RECOMMENDATION_VERSION = 1 as const;

export type SignalRecommendationType =
  | 'REVIEW_STRONG_EVIDENCE'
  | 'REVIEW_RECURRING_PATTERN';

export type SignalRecommendationPriority = 'LOW' | 'MEDIUM' | 'HIGH';

export type SignalRecommendationStatus =
  | 'PROPOSED'
  | 'READY_FOR_REVIEW'
  | 'DISMISSED'
  | 'IMPLEMENTED';

export interface SignalRecommendationMetadata {
  readonly source: 'SIGNAL_EVIDENCE';
  readonly autoApplied: false;
  readonly policyChanged: false;
  readonly gradeChanged: false;
  readonly tradingLogicChanged: false;
  readonly runtimeChanged: false;
  readonly humanReviewRequired: true;
}

export interface SignalRecommendation {
  readonly version: typeof SIGNAL_RECOMMENDATION_VERSION;
  readonly recommendationId: string;
  readonly relatedEvidenceId: string;
  readonly recommendationType: SignalRecommendationType;
  readonly recommendationStatement: string;
  readonly supportingEvidenceLevel: SignalEvidence['evidenceLevel'];
  readonly confidenceScore: number;
  readonly priority: SignalRecommendationPriority;
  readonly createdTimestamp: number;
  readonly status: SignalRecommendationStatus;
  readonly metadata: SignalRecommendationMetadata;
}

export interface RecommendationGenerationResult {
  readonly version: typeof SIGNAL_RECOMMENDATION_VERSION;
  readonly generationId: string;
  readonly sourceValidationId: string;
  readonly createdTimestamp: number;
  readonly recommendationCount: number;
  readonly recommendations: readonly SignalRecommendation[];
  readonly metadata: SignalRecommendationMetadata;
}

export function generateSignalRecommendations(input: {
  readonly evidenceValidationResult: EvidenceValidationResult;
  readonly createdTimestamp?: number;
}): RecommendationGenerationResult {
  const createdTimestamp =
    input.createdTimestamp ?? input.evidenceValidationResult.createdTimestamp;
  const metadata = createNeutralMetadata();
  const recommendations = Object.freeze(
    input.evidenceValidationResult.evidence
      .filter(evidence => evidence.validationStatus === 'STRONG')
      .map(evidence => createRecommendation(evidence, createdTimestamp))
      .sort((left, right) => left.recommendationId.localeCompare(right.recommendationId))
  );

  console.log('Recommendation Generation Complete');
  console.log(`Recommendations Generated: ${recommendations.length}`);

  return Object.freeze({
    version: SIGNAL_RECOMMENDATION_VERSION,
    generationId: createGenerationId(
      input.evidenceValidationResult.validationId,
      recommendations.map(recommendation => recommendation.recommendationId),
      createdTimestamp
    ),
    sourceValidationId: input.evidenceValidationResult.validationId,
    createdTimestamp,
    recommendationCount: recommendations.length,
    recommendations,
    metadata,
  });
}

function createRecommendation(
  evidence: SignalEvidence,
  createdTimestamp: number
): SignalRecommendation {
  return Object.freeze({
    version: SIGNAL_RECOMMENDATION_VERSION,
    recommendationId: createRecommendationId(evidence, createdTimestamp),
    relatedEvidenceId: evidence.evidenceId,
    recommendationType: chooseRecommendationType(evidence),
    recommendationStatement: createRecommendationStatement(evidence),
    supportingEvidenceLevel: evidence.evidenceLevel,
    confidenceScore: evidence.confidenceScore,
    priority: choosePriority(evidence.confidenceScore),
    createdTimestamp,
    status: chooseStatus(evidence.confidenceScore),
    metadata: createNeutralMetadata(),
  });
}

function chooseRecommendationType(evidence: SignalEvidence): SignalRecommendationType {
  if (evidence.supportingSampleSize >= evidence.criteria.strongSampleSize) {
    return 'REVIEW_STRONG_EVIDENCE';
  }

  return 'REVIEW_RECURRING_PATTERN';
}

function createRecommendationStatement(evidence: SignalEvidence): string {
  return [
    `Strong evidence ${evidence.evidenceId} should be reviewed by a human before any policy evolution is considered.`,
    `Supporting sample size: ${evidence.supportingSampleSize}.`,
    `Confidence score: ${evidence.confidenceScore}.`,
  ].join(' ');
}

function choosePriority(confidenceScore: number): SignalRecommendationPriority {
  if (confidenceScore >= 0.85) return 'HIGH';
  if (confidenceScore >= 0.7) return 'MEDIUM';
  return 'LOW';
}

function chooseStatus(confidenceScore: number): SignalRecommendationStatus {
  if (confidenceScore >= 0.85) return 'READY_FOR_REVIEW';
  return 'PROPOSED';
}

function createNeutralMetadata(): SignalRecommendationMetadata {
  return Object.freeze({
    source: 'SIGNAL_EVIDENCE' as const,
    autoApplied: false as const,
    policyChanged: false as const,
    gradeChanged: false as const,
    tradingLogicChanged: false as const,
    runtimeChanged: false as const,
    humanReviewRequired: true as const,
  });
}

function createGenerationId(
  validationId: string,
  recommendationIds: readonly string[],
  createdTimestamp: number
): string {
  return `RECOMMENDATION_GENERATION_${hashString(
    `${validationId}|${[...recommendationIds].sort().join('|')}|${createdTimestamp}`
  )}`;
}

function createRecommendationId(
  evidence: SignalEvidence,
  createdTimestamp: number
): string {
  return `SIGNAL_RECOMMENDATION_${hashString(
    `${evidence.evidenceId}|${evidence.relatedHypothesisId}|${createdTimestamp}`
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
