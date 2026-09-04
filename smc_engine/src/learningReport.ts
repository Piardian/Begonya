import { LearnedPattern } from './learningPattern';
import { LearningObservation } from './learningObservation';

export const LEARNING_REPORT_VERSION = 1 as const;
export const DEFAULT_LEARNING_MIN_SAMPLE_SIZE = 30 as const;
export const DEFAULT_LEARNING_MIN_COVERAGE_RATE = 0.8 as const;

export type LearningWarningType =
  | 'LOW_SAMPLE'
  | 'LOW_COVERAGE'
  | 'INSUFFICIENT_DATA'
  | 'NO_VARIATION'
  | 'NO_DIFFERENCE';

export interface LearningWarning {
  type: LearningWarningType;
  segment?: string;
  value?: string;
  sampleSize?: number;
  coverage?: number;
  message: string;
}

export interface LearningReport {
  metadata: {
    learningReportVersion: typeof LEARNING_REPORT_VERSION;
    benchmarkVersion: number;
    segmentedBenchmarkVersion: number;
    datasetFingerprint: string;
    generatedAtDatasetCoverage: number;
    minSampleSize: typeof DEFAULT_LEARNING_MIN_SAMPLE_SIZE;
    minCoverageRate: typeof DEFAULT_LEARNING_MIN_COVERAGE_RATE;
  };
  overallLearning: {
    evaluatedSegments: number;
    observations: number;
    learnedPatterns: number;
    skippedSegments: number;
  };
  observations: readonly LearningObservation[];
  patterns: readonly LearnedPattern[];
  warnings: readonly LearningWarning[];
}

