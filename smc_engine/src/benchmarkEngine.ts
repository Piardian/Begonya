import { createHash } from 'crypto';
import { BENCHMARK_REPORT_VERSION, BenchmarkReport } from './benchmarkReport';
import { ValidatedLabeledDataset } from './validatedDataset';

export function generateBenchmark(dataset: ValidatedLabeledDataset): BenchmarkReport {
  const counts = { TP: 0, SL: 0, BE: 0, EXPIRED: 0, UNKNOWN: 0 };
  const durations: number[] = [];
  const mfe: number[] = [];
  const mae: number[] = [];

  for (const item of dataset.items) {
    counts[item.outcome.outcomeStatus]++;
    durations.push(item.outcome.metadata.evaluationDurationBars);
    mfe.push(item.outcome.metadata.maxFavorableExcursionPips);
    mae.push(item.outcome.metadata.maxAdverseExcursionPips);
  }

  const labeledSnapshots = dataset.items.length;
  const denominator = labeledSnapshots === 0 ? 1 : labeledSnapshots;
  const first = dataset.items[0];
  const snapshotVersion = first?.snapshot.snapshotVersion ?? 1;
  const outcomeVersion = first?.outcome.outcomeVersion ?? 1;
  const labelingConfigVersion = first?.outcome.metadata.labelingConfigVersion ?? 1;

  return {
    metadata: {
      benchmarkVersion: BENCHMARK_REPORT_VERSION,
      snapshotVersion,
      outcomeVersion,
      labelingConfigVersion,
      generatedAtDatasetCoverage: dataset.coverage.coverageRate,
      datasetFingerprint: calculateDatasetFingerprint(dataset),
    },
    coverage: {
      snapshotCount: dataset.coverage.snapshotCount,
      labeledCount: dataset.coverage.labeledCount,
      missingOutcomeCount: dataset.coverage.missingOutcomeCount,
      coverageRate: dataset.coverage.coverageRate,
    },
    totals: {
      totalSnapshots: dataset.coverage.snapshotCount,
      labeledSnapshots,
      unlabeledSnapshots: dataset.coverage.missingOutcomeCount,
    },
    counts,
    rates: {
      TPRate: roundRate(counts.TP / denominator),
      SLRate: roundRate(counts.SL / denominator),
      BERate: roundRate(counts.BE / denominator),
      EXPIREDRate: roundRate(counts.EXPIRED / denominator),
      UNKNOWNRate: roundRate(counts.UNKNOWN / denominator),
    },
    duration: {
      averageEvaluationBars: average(durations),
      medianEvaluationBars: median(durations),
    },
    excursion: {
      averageMFE: average(mfe),
      averageMAE: average(mae),
    },
  };
}

export function calculateDatasetFingerprint(dataset: ValidatedLabeledDataset): string {
  const candidateIds = dataset.items.map(item => item.candidateId).sort();
  const versions = dataset.items.map(item =>
    `${item.snapshot.snapshotVersion}:${item.outcome.outcomeVersion}:${item.outcome.metadata.labelingConfigVersion}`
  ).sort();

  return createHash('sha256')
    .update(JSON.stringify({ candidateIds, versions }))
    .digest('hex');
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return roundMetric(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return roundMetric(sorted[middle]);
  return roundMetric((sorted[middle - 1] + sorted[middle]) / 2);
}

function roundRate(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function roundMetric(value: number): number {
  return Math.round(value * 100) / 100;
}
