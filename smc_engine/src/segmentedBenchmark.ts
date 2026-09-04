import { generateBenchmark } from './benchmarkEngine';
import { groupDatasetBySegment } from './segmentAggregator';
import { SEGMENT_DEFINITIONS } from './segmentDefinitions';
import {
  RECOMMENDED_MIN_SEGMENT_SAMPLE_SIZE,
  SEGMENTED_BENCHMARK_REPORT_VERSION,
  SegmentedBenchmarkGroups,
  SegmentedBenchmarkReport,
} from './segmentedBenchmarkReport';
import { BENCHMARK_REPORT_VERSION } from './benchmarkReport';
import { ValidatedLabeledDataset } from './validatedDataset';

export function generateSegmentedBenchmark(dataset: ValidatedLabeledDataset): SegmentedBenchmarkReport {
  const overallBenchmark = generateBenchmark(dataset);
  const segments = {} as SegmentedBenchmarkGroups;

  for (const definition of SEGMENT_DEFINITIONS) {
    const grouped = groupDatasetBySegment(dataset, definition);
    segments[definition.key] = {};

    for (const [segmentValue, segmentDataset] of Object.entries(grouped)) {
      const sampleSize = segmentDataset.items.length;
      segments[definition.key][segmentValue] = {
        segmentValue,
        sampleSize,
        belowRecommendedSample: sampleSize < RECOMMENDED_MIN_SEGMENT_SAMPLE_SIZE,
        benchmark: generateBenchmark(segmentDataset),
      };
    }
  }

  return {
    metadata: {
      segmentedBenchmarkVersion: SEGMENTED_BENCHMARK_REPORT_VERSION,
      benchmarkVersion: BENCHMARK_REPORT_VERSION,
      datasetFingerprint: overallBenchmark.metadata.datasetFingerprint,
      generatedAtDatasetCoverage: overallBenchmark.metadata.generatedAtDatasetCoverage,
      recommendedMinSegmentSampleSize: RECOMMENDED_MIN_SEGMENT_SAMPLE_SIZE,
    },
    overallBenchmark,
    segments,
  };
}
