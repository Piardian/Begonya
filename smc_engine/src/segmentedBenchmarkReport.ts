import { BENCHMARK_REPORT_VERSION, BenchmarkReport } from './benchmarkReport';
import { SegmentKey } from './segmentDefinitions';

export const SEGMENTED_BENCHMARK_REPORT_VERSION = 1 as const;
export const RECOMMENDED_MIN_SEGMENT_SAMPLE_SIZE = 30 as const;

export interface SegmentBenchmark {
  segmentValue: string;
  sampleSize: number;
  belowRecommendedSample: boolean;
  benchmark: BenchmarkReport;
}

export type SegmentGroupReport = Record<string, SegmentBenchmark>;

export type SegmentedBenchmarkGroups = Record<SegmentKey, SegmentGroupReport>;

export interface SegmentedBenchmarkReport {
  metadata: {
    segmentedBenchmarkVersion: typeof SEGMENTED_BENCHMARK_REPORT_VERSION;
    benchmarkVersion: typeof BENCHMARK_REPORT_VERSION;
    datasetFingerprint: string;
    generatedAtDatasetCoverage: number;
    recommendedMinSegmentSampleSize: typeof RECOMMENDED_MIN_SEGMENT_SAMPLE_SIZE;
  };
  overallBenchmark: BenchmarkReport;
  segments: SegmentedBenchmarkGroups;
}
