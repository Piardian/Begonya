import { LearnedPatternType } from './learningPattern';
import { LearningMetric } from './learningObservation';
import { SegmentKey } from './segmentDefinitions';
import { PatternPolicyResult } from './policyResult';

export type DecisionEvaluationStatus =
  | 'ELIGIBLE'
  | 'WAIT'
  | 'LOW_CONFIDENCE'
  | 'FILTERED'
  | 'NOT_ELIGIBLE'
  | 'INSUFFICIENT_EVIDENCE'
  | 'BLOCKED_BY_POLICY'
  | 'NO_MATCHING_PATTERN';

export interface DecisionEvaluation {
  readonly id: string;
  readonly status: DecisionEvaluationStatus;
  readonly patternId?: string;
  readonly observationId?: string;
  readonly policyResults: PatternPolicyResult;
  readonly reason: {
    readonly code: string;
    readonly message: string;
  };
  readonly summary: string;
  readonly explanation: {
    readonly patternReference?: {
      readonly patternId: string;
      readonly type: LearnedPatternType;
      readonly metric: LearningMetric;
      readonly segment: SegmentKey;
      readonly value: string;
    };
    readonly observationReference?: {
      readonly observationId: string;
    };
    readonly benchmarkReference?: {
      readonly datasetFingerprint: string;
      readonly benchmarkVersion: number;
      readonly segmentedBenchmarkVersion: number;
    };
    readonly policyReference: {
      readonly policyId: string;
      readonly version: number;
    };
    readonly policyChecks: PatternPolicyResult['checks'];
  };
  readonly executionEligibility: {
    readonly executable: false;
    readonly reason: 'Execution Engine not implemented';
  };
}
