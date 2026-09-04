import { ConfidenceLevel, LearnedPatternType } from './learningPattern';
import { LearningMetric } from './learningObservation';
import { SegmentKey } from './segmentDefinitions';

export const DECISION_POLICY_VERSION = 1 as const;

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface DecisionPolicy {
  readonly version: typeof DECISION_POLICY_VERSION;
  readonly policyId: string;
  readonly name: string;
  readonly minimumSampleSize: number;
  readonly minimumCoverage: number;
  readonly minimumConfidence: ConfidenceLevel;
  readonly allowedPatternTypes?: readonly LearnedPatternType[];
  readonly blockedPatternTypes?: readonly LearnedPatternType[];
  readonly requiredMetrics?: readonly LearningMetric[];
  readonly allowedSegments?: readonly SegmentKey[];
  readonly maximumRiskLevel?: RiskLevel;
}

export type CreateDecisionPolicyInput = Omit<DecisionPolicy, 'version'> & {
  version?: typeof DECISION_POLICY_VERSION;
};

export function createDecisionPolicy(input: CreateDecisionPolicyInput): DecisionPolicy {
  return Object.freeze({
    version: input.version ?? DECISION_POLICY_VERSION,
    policyId: input.policyId,
    name: input.name,
    minimumSampleSize: input.minimumSampleSize,
    minimumCoverage: input.minimumCoverage,
    minimumConfidence: input.minimumConfidence,
    allowedPatternTypes: freezeOptionalArray(input.allowedPatternTypes),
    blockedPatternTypes: freezeOptionalArray(input.blockedPatternTypes),
    requiredMetrics: freezeOptionalArray(input.requiredMetrics),
    allowedSegments: freezeOptionalArray(input.allowedSegments),
    maximumRiskLevel: input.maximumRiskLevel,
  });
}

function freezeOptionalArray<T>(values: readonly T[] | undefined): readonly T[] | undefined {
  return values ? Object.freeze([...values]) : undefined;
}

