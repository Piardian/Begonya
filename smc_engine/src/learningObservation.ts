import { BenchmarkReport } from './benchmarkReport';
import { SegmentKey } from './segmentDefinitions';

export type LearningMetric =
  | 'TPRate'
  | 'SLRate'
  | 'averageEvaluationBars'
  | 'averageMFE'
  | 'averageMAE';

export type ObservationDirection = 'ABOVE_BASELINE' | 'BELOW_BASELINE' | 'NEAR_BASELINE';

export interface ComparisonEvidence {
  metric: LearningMetric;
  segment: {
    label: string;
    value: number;
  };
  baseline: {
    label: 'overall';
    value: number;
  };
  difference: number;
  relativeDifference: number;
}

export interface LearningObservation {
  id: string;
  segment: SegmentKey;
  value: string;
  metric: LearningMetric;
  direction: ObservationDirection;
  sampleSize: number;
  coverage: number;
  comparisonEvidence: ComparisonEvidence;
  benchmarkReference: {
    datasetFingerprint: string;
    benchmarkVersion: number;
    segmentedBenchmarkVersion: number;
  };
  explanation: {
    because: readonly string[];
    segmentCoverage: number;
    overallCoverage: number;
    segmentBenchmark: Pick<BenchmarkReport, 'counts' | 'rates' | 'duration' | 'excursion'>;
    overallBenchmark: Pick<BenchmarkReport, 'counts' | 'rates' | 'duration' | 'excursion'>;
  };
  summary: string;
}
