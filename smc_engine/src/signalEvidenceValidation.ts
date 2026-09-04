import {
  HypothesisGenerationResult,
  SignalHypothesis,
} from './signalHypothesisGeneration';

export const SIGNAL_EVIDENCE_VERSION = 1 as const;

export type SignalEvidenceLevel =
  | 'INSUFFICIENT_DATA'
  | 'WEAK'
  | 'MODERATE'
  | 'STRONG'
  | 'REJECTED';

export type SignalEvidenceValidationStatus = SignalEvidenceLevel;

export interface SignalEvidenceCriteria {
  readonly minimumSampleSize: number;
  readonly moderateSampleSize: number;
  readonly strongSampleSize: number;
  readonly moderateConfidence: number;
  readonly strongConfidence: number;
}

export interface SignalEvidenceMetadata {
  readonly source: 'SIGNAL_HYPOTHESIS';
  readonly recommendationGenerated: false;
  readonly policyChanged: false;
  readonly gradeChanged: false;
  readonly tradingLogicChanged: false;
  readonly hypothesisAccepted: false;
  readonly verified: false;
}

export interface SignalEvidence {
  readonly version: typeof SIGNAL_EVIDENCE_VERSION;
  readonly evidenceId: string;
  readonly relatedHypothesisId: string;
  readonly evidenceLevel: SignalEvidenceLevel;
  readonly supportingSampleSize: number;
  readonly contradictingSampleSize: number;
  readonly confidenceScore: number;
  readonly validationStatus: SignalEvidenceValidationStatus;
  readonly createdTimestamp: number;
  readonly criteria: SignalEvidenceCriteria;
  readonly metadata: SignalEvidenceMetadata;
}

export interface EvidenceValidationResult {
  readonly version: typeof SIGNAL_EVIDENCE_VERSION;
  readonly validationId: string;
  readonly sourceGenerationId: string;
  readonly createdTimestamp: number;
  readonly evidenceCount: number;
  readonly evidence: readonly SignalEvidence[];
  readonly metadata: SignalEvidenceMetadata;
}

export const DEFAULT_SIGNAL_EVIDENCE_CRITERIA: SignalEvidenceCriteria = Object.freeze({
  minimumSampleSize: 3,
  moderateSampleSize: 10,
  strongSampleSize: 30,
  moderateConfidence: 0.5,
  strongConfidence: 0.7,
});

export function validateSignalEvidence(input: {
  readonly hypothesisGenerationResult: HypothesisGenerationResult;
  readonly criteria?: Partial<SignalEvidenceCriteria>;
  readonly createdTimestamp?: number;
}): EvidenceValidationResult {
  const criteria = Object.freeze({
    ...DEFAULT_SIGNAL_EVIDENCE_CRITERIA,
    ...(input.criteria ?? {}),
  });
  const createdTimestamp =
    input.createdTimestamp ?? input.hypothesisGenerationResult.createdTimestamp;
  const metadata = createNeutralMetadata();
  const evidence = Object.freeze(
    input.hypothesisGenerationResult.hypotheses
      .map(hypothesis => createEvidence(hypothesis, criteria, createdTimestamp))
      .sort((left, right) => left.evidenceId.localeCompare(right.evidenceId))
  );

  console.log('Evidence Validation Complete');
  console.log(`Evidence Items: ${evidence.length}`);

  return Object.freeze({
    version: SIGNAL_EVIDENCE_VERSION,
    validationId: createValidationId(
      input.hypothesisGenerationResult.generationId,
      evidence.map(item => item.evidenceId),
      createdTimestamp
    ),
    sourceGenerationId: input.hypothesisGenerationResult.generationId,
    createdTimestamp,
    evidenceCount: evidence.length,
    evidence,
    metadata,
  });
}

function createEvidence(
  hypothesis: SignalHypothesis,
  criteria: SignalEvidenceCriteria,
  createdTimestamp: number
): SignalEvidence {
  const supportingSampleSize = hypothesis.observationCount;
  const contradictingSampleSize = calculateContradictingSampleSize(hypothesis);
  const confidenceScore = calculateConfidenceScore(hypothesis, supportingSampleSize, contradictingSampleSize);
  const evidenceLevel = classifyEvidence(
    supportingSampleSize,
    confidenceScore,
    criteria
  );

  return Object.freeze({
    version: SIGNAL_EVIDENCE_VERSION,
    evidenceId: createEvidenceId(hypothesis, createdTimestamp),
    relatedHypothesisId: hypothesis.hypothesisId,
    evidenceLevel,
    supportingSampleSize,
    contradictingSampleSize,
    confidenceScore,
    validationStatus: evidenceLevel,
    createdTimestamp,
    criteria,
    metadata: createNeutralMetadata(),
  });
}

function calculateContradictingSampleSize(hypothesis: SignalHypothesis): number {
  const distributionValues = Object.values(hypothesis.supportingMetrics.distribution);
  if (distributionValues.length === 0) return 0;

  const dominantCount = Math.max(...distributionValues);
  return Math.max(0, hypothesis.observationCount - dominantCount);
}

function calculateConfidenceScore(
  hypothesis: SignalHypothesis,
  supportingSampleSize: number,
  contradictingSampleSize: number
): number {
  if (supportingSampleSize <= 0) return 0;

  const dominanceRatio = Math.max(
    0,
    (supportingSampleSize - contradictingSampleSize) / supportingSampleSize
  );
  const blendedScore = (hypothesis.confidence + dominanceRatio) / 2;

  return Number(blendedScore.toFixed(4));
}

function classifyEvidence(
  supportingSampleSize: number,
  confidenceScore: number,
  criteria: SignalEvidenceCriteria
): SignalEvidenceLevel {
  if (supportingSampleSize <= 0) return 'REJECTED';
  if (supportingSampleSize < criteria.minimumSampleSize) return 'INSUFFICIENT_DATA';
  if (
    supportingSampleSize >= criteria.strongSampleSize &&
    confidenceScore >= criteria.strongConfidence
  ) {
    return 'STRONG';
  }
  if (
    supportingSampleSize >= criteria.moderateSampleSize &&
    confidenceScore >= criteria.moderateConfidence
  ) {
    return 'MODERATE';
  }

  return 'WEAK';
}

function createNeutralMetadata(): SignalEvidenceMetadata {
  return Object.freeze({
    source: 'SIGNAL_HYPOTHESIS' as const,
    recommendationGenerated: false as const,
    policyChanged: false as const,
    gradeChanged: false as const,
    tradingLogicChanged: false as const,
    hypothesisAccepted: false as const,
    verified: false as const,
  });
}

function createValidationId(
  generationId: string,
  evidenceIds: readonly string[],
  createdTimestamp: number
): string {
  return `EVIDENCE_VALIDATION_${hashString(
    `${generationId}|${[...evidenceIds].sort().join('|')}|${createdTimestamp}`
  )}`;
}

function createEvidenceId(
  hypothesis: SignalHypothesis,
  createdTimestamp: number
): string {
  return `SIGNAL_EVIDENCE_${hashString(
    `${hypothesis.hypothesisId}|${hypothesis.relatedPatternId}|${createdTimestamp}`
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
