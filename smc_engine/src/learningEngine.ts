import { generateObservations } from './observationEngine';
import { detectPatterns } from './patternDetector';
import {
  DEFAULT_LEARNING_MIN_COVERAGE_RATE,
  DEFAULT_LEARNING_MIN_SAMPLE_SIZE,
  LEARNING_REPORT_VERSION,
  LearningReport,
} from './learningReport';
import { SegmentedBenchmarkReport } from './segmentedBenchmarkReport';

export function generateLearningReport(segmentedBenchmarkReport: SegmentedBenchmarkReport): LearningReport {
  const observationResult = generateObservations(segmentedBenchmarkReport);
  const patterns = detectPatterns(observationResult.observations);

  return Object.freeze({
    metadata: Object.freeze({
      learningReportVersion: LEARNING_REPORT_VERSION,
      benchmarkVersion: segmentedBenchmarkReport.metadata.benchmarkVersion,
      segmentedBenchmarkVersion: segmentedBenchmarkReport.metadata.segmentedBenchmarkVersion,
      datasetFingerprint: segmentedBenchmarkReport.metadata.datasetFingerprint,
      generatedAtDatasetCoverage: segmentedBenchmarkReport.metadata.generatedAtDatasetCoverage,
      minSampleSize: DEFAULT_LEARNING_MIN_SAMPLE_SIZE,
      minCoverageRate: DEFAULT_LEARNING_MIN_COVERAGE_RATE,
    }),
    overallLearning: Object.freeze({
      evaluatedSegments: observationResult.evaluatedSegments,
      observations: observationResult.observations.length,
      learnedPatterns: patterns.length,
      skippedSegments: observationResult.skippedSegments,
    }),
    observations: Object.freeze([...observationResult.observations]),
    patterns: Object.freeze([...patterns]),
    warnings: Object.freeze([...observationResult.warnings]),
  });
}

