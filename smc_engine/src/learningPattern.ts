import { ComparisonEvidence, LearningMetric } from './learningObservation';
import { SegmentKey } from './segmentDefinitions';

export type LearnedPatternType =
  | 'PERFORMANCE_ADVANTAGE'
  | 'PERFORMANCE_DISADVANTAGE'
  | 'RISK_ADVANTAGE'
  | 'RISK_DISADVANTAGE'
  | 'EFFICIENCY_ADVANTAGE'
  | 'EFFICIENCY_DISADVANTAGE'
  | 'STABILITY_SIGNAL';

export type ConfidenceLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type ConfidenceFactorLevel = ConfidenceLevel | 'UNKNOWN';

export interface ConfidenceFactors {
  sample: ConfidenceLevel;
  coverage: ConfidenceLevel;
  stability: ConfidenceFactorLevel;
}

export interface LearnedPattern {
  id: string;
  type: LearnedPatternType;
  metric: LearningMetric;
  segment: SegmentKey;
  value: string;
  sampleSize: number;
  coverage: number;
  confidence: ConfidenceLevel;
  confidenceFactors: ConfidenceFactors;
  comparisonEvidence: ComparisonEvidence;
  evidence: {
    observationId: string;
    segmentBenchmark: {
      TP: number;
      SL: number;
      BE: number;
      EXPIRED: number;
      UNKNOWN: number;
      sampleSize: number;
      coverage: number;
    };
    overallBenchmark: {
      TP: number;
      SL: number;
      sampleSize: number;
      coverage: number;
    };
  };
  summary: string;
  explanation: {
    because: readonly string[];
    formula: string;
    interpretation: 'DESCRIPTIVE_HISTORICAL_PATTERN';
  };
  benchmarkReference: {
    datasetFingerprint: string;
    benchmarkVersion: number;
    segmentedBenchmarkVersion: number;
  };
}

