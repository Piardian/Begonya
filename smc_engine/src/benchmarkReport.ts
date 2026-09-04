export const BENCHMARK_REPORT_VERSION = 1 as const;

export interface BenchmarkReport {
  metadata: {
    benchmarkVersion: typeof BENCHMARK_REPORT_VERSION;
    snapshotVersion: number;
    outcomeVersion: number;
    labelingConfigVersion: number;
    generatedAtDatasetCoverage: number;
    datasetFingerprint: string;
  };
  coverage: {
    snapshotCount: number;
    labeledCount: number;
    missingOutcomeCount: number;
    coverageRate: number;
  };
  totals: {
    totalSnapshots: number;
    labeledSnapshots: number;
    unlabeledSnapshots: number;
  };
  counts: {
    TP: number;
    SL: number;
    BE: number;
    EXPIRED: number;
    UNKNOWN: number;
  };
  rates: {
    TPRate: number;
    SLRate: number;
    BERate: number;
    EXPIREDRate: number;
    UNKNOWNRate: number;
  };
  duration: {
    averageEvaluationBars: number;
    medianEvaluationBars: number;
  };
  excursion: {
    averageMFE: number;
    averageMAE: number;
  };
}
