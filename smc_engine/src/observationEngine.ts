import { BenchmarkReport } from './benchmarkReport';
import { LearningMetric, LearningObservation, ObservationDirection } from './learningObservation';
import { LearningWarning } from './learningReport';
import { SegmentBenchmark, SegmentedBenchmarkReport } from './segmentedBenchmarkReport';
import { SegmentKey } from './segmentDefinitions';

export interface ObservationGenerationResult {
  observations: readonly LearningObservation[];
  warnings: readonly LearningWarning[];
  evaluatedSegments: number;
  skippedSegments: number;
}

const MIN_SAMPLE_SIZE = 30;
const MIN_COVERAGE_RATE = 0.8;
const RATE_DIFFERENCE_THRESHOLD = 0.05;
const RELATIVE_DIFFERENCE_THRESHOLD = 0.2;

export function generateObservations(report: SegmentedBenchmarkReport): ObservationGenerationResult {
  const observations: LearningObservation[] = [];
  const warnings: LearningWarning[] = [];
  let evaluatedSegments = 0;
  let skippedSegments = 0;

  if (report.metadata.generatedAtDatasetCoverage < MIN_COVERAGE_RATE) {
    warnings.push({
      type: 'LOW_COVERAGE',
      coverage: report.metadata.generatedAtDatasetCoverage,
      message: 'Learning skipped because overall dataset coverage is below the minimum threshold.',
    });
    return Object.freeze({
      observations: Object.freeze(observations),
      warnings: Object.freeze(warnings),
      evaluatedSegments,
      skippedSegments,
    });
  }

  for (const [segment, group] of Object.entries(report.segments) as [SegmentKey, Record<string, SegmentBenchmark>][]) {
    for (const [value, segmentBenchmark] of Object.entries(group)) {
      if (!isEligible(segment, value, segmentBenchmark, warnings)) {
        skippedSegments++;
        continue;
      }

      evaluatedSegments++;
      observations.push(...createSegmentObservations(report, segment, value, segmentBenchmark));
    }
  }

  if (observations.length === 0 && warnings.length === 0) {
    warnings.push({
      type: 'NO_DIFFERENCE',
      message: 'No meaningful segment difference was observed against the overall benchmark.',
    });
  }

  return Object.freeze({
    observations: Object.freeze(observations),
    warnings: Object.freeze(warnings),
    evaluatedSegments,
    skippedSegments,
  });
}

function isEligible(
  segment: SegmentKey,
  value: string,
  segmentBenchmark: SegmentBenchmark,
  warnings: LearningWarning[]
): boolean {
  if (segmentBenchmark.sampleSize < MIN_SAMPLE_SIZE || segmentBenchmark.belowRecommendedSample) {
    warnings.push({
      type: 'LOW_SAMPLE',
      segment,
      value,
      sampleSize: segmentBenchmark.sampleSize,
      coverage: segmentBenchmark.benchmark.coverage.coverageRate,
      message: 'Segment skipped because sample size is below the recommended minimum.',
    });
    return false;
  }

  if (segmentBenchmark.benchmark.coverage.coverageRate < MIN_COVERAGE_RATE) {
    warnings.push({
      type: 'LOW_COVERAGE',
      segment,
      value,
      sampleSize: segmentBenchmark.sampleSize,
      coverage: segmentBenchmark.benchmark.coverage.coverageRate,
      message: 'Segment skipped because coverage is below the minimum threshold.',
    });
    return false;
  }

  return true;
}

function createSegmentObservations(
  report: SegmentedBenchmarkReport,
  segment: SegmentKey,
  value: string,
  segmentBenchmark: SegmentBenchmark
): LearningObservation[] {
  const metrics: readonly LearningMetric[] = [
    'TPRate',
    'SLRate',
    'averageEvaluationBars',
    'averageMFE',
    'averageMAE',
  ];

  return metrics
    .map(metric => createObservation(report, segment, value, segmentBenchmark, metric))
    .filter((observation): observation is LearningObservation => observation !== undefined);
}

function createObservation(
  report: SegmentedBenchmarkReport,
  segment: SegmentKey,
  value: string,
  segmentBenchmark: SegmentBenchmark,
  metric: LearningMetric
): LearningObservation | undefined {
  const segmentValue = getMetricValue(segmentBenchmark.benchmark, metric);
  const baselineValue = getMetricValue(report.overallBenchmark, metric);
  const difference = roundMetric(segmentValue - baselineValue);
  const relativeDifference = baselineValue === 0 ? 0 : roundMetric(difference / Math.abs(baselineValue));

  if (!isMeaningfulDifference(metric, difference, relativeDifference)) {
    return undefined;
  }

  const direction: ObservationDirection = difference > 0 ? 'ABOVE_BASELINE' : 'BELOW_BASELINE';
  const id = createObservationId(segment, value, metric);

  return Object.freeze({
    id,
    segment,
    value,
    metric,
    direction,
    sampleSize: segmentBenchmark.sampleSize,
    coverage: segmentBenchmark.benchmark.coverage.coverageRate,
    comparisonEvidence: Object.freeze({
      metric,
      segment: Object.freeze({ label: `${segment}:${value}`, value: segmentValue }),
      baseline: Object.freeze({ label: 'overall' as const, value: baselineValue }),
      difference,
      relativeDifference,
    }),
    benchmarkReference: Object.freeze({
      datasetFingerprint: report.metadata.datasetFingerprint,
      benchmarkVersion: report.metadata.benchmarkVersion,
      segmentedBenchmarkVersion: report.metadata.segmentedBenchmarkVersion,
    }),
    explanation: Object.freeze({
      because: Object.freeze([
        `${segment}:${value} ${metric}=${segmentValue}`,
        `overall ${metric}=${baselineValue}`,
        `difference=${difference}`,
        `sampleSize=${segmentBenchmark.sampleSize}`,
        `coverage=${segmentBenchmark.benchmark.coverage.coverageRate}`,
      ]),
      segmentCoverage: segmentBenchmark.benchmark.coverage.coverageRate,
      overallCoverage: report.overallBenchmark.coverage.coverageRate,
      segmentBenchmark: pickBenchmarkEvidence(segmentBenchmark.benchmark),
      overallBenchmark: pickBenchmarkEvidence(report.overallBenchmark),
    }),
    summary: `${segment}:${value} has ${metric} ${direction === 'ABOVE_BASELINE' ? 'above' : 'below'} overall benchmark by ${difference}.`,
  });
}

function getMetricValue(benchmark: BenchmarkReport, metric: LearningMetric): number {
  switch (metric) {
    case 'TPRate':
      return benchmark.rates.TPRate;
    case 'SLRate':
      return benchmark.rates.SLRate;
    case 'averageEvaluationBars':
      return benchmark.duration.averageEvaluationBars;
    case 'averageMFE':
      return benchmark.excursion.averageMFE;
    case 'averageMAE':
      return benchmark.excursion.averageMAE;
  }
}

function isMeaningfulDifference(metric: LearningMetric, difference: number, relativeDifference: number): boolean {
  if (metric === 'TPRate' || metric === 'SLRate') {
    return Math.abs(difference) >= RATE_DIFFERENCE_THRESHOLD;
  }

  return Math.abs(relativeDifference) >= RELATIVE_DIFFERENCE_THRESHOLD;
}

function pickBenchmarkEvidence(benchmark: BenchmarkReport): Pick<BenchmarkReport, 'counts' | 'rates' | 'duration' | 'excursion'> {
  return Object.freeze({
    counts: Object.freeze({ ...benchmark.counts }),
    rates: Object.freeze({ ...benchmark.rates }),
    duration: Object.freeze({ ...benchmark.duration }),
    excursion: Object.freeze({ ...benchmark.excursion }),
  });
}

function createObservationId(segment: SegmentKey, value: string, metric: LearningMetric): string {
  return `${segment}:${value}:${metric}`;
}

function roundMetric(value: number): number {
  return Math.round(value * 10000) / 10000;
}
