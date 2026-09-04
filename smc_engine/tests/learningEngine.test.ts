import { generateLearningReport } from '../src/learningEngine';
import { generateSegmentedBenchmark } from '../src/segmentedBenchmark';
import { createValidatedDataset } from '../src/validatedDataset';
import { validateDataset } from '../src/outcomeValidation';
import { outcome, snapshot } from './outcomeValidation.test';

describe('Learning Engine', () => {
  test('generates explainable observations and patterns from segmented benchmark reports only', () => {
    const report = generateLearningReport(createSegmentedReport({
      aPlusTP: 80,
      aPlusSL: 20,
      aTP: 40,
      aSL: 60,
    }));

    const aPlusObservation = report.observations.find(
      observation => observation.segment === 'grade' && observation.value === 'A+' && observation.metric === 'TPRate'
    );
    const aPlusPattern = report.patterns.find(
      pattern => pattern.segment === 'grade' && pattern.value === 'A+' && pattern.metric === 'TPRate'
    );

    expect(aPlusObservation).toBeDefined();
    expect(aPlusObservation?.comparisonEvidence).toMatchObject({
      metric: 'TPRate',
      segment: { label: 'grade:A+', value: 0.8 },
      baseline: { label: 'overall', value: 0.6 },
      difference: 0.2,
    });
    expect(aPlusObservation?.explanation.because).toContain('grade:A+ TPRate=0.8');
    expect(aPlusPattern).toMatchObject({
      type: 'PERFORMANCE_ADVANTAGE',
      metric: 'TPRate',
      confidence: 'HIGH',
      confidenceFactors: {
        sample: 'HIGH',
        coverage: 'HIGH',
        stability: 'UNKNOWN',
      },
    });
    expect(aPlusPattern?.summary).toContain('PERFORMANCE_ADVANTAGE');
    expect(aPlusPattern?.explanation.interpretation).toBe('DESCRIPTIVE_HISTORICAL_PATTERN');
  });

  test('skips learning for low sample segments and emits typed warnings', () => {
    const report = generateLearningReport(createSegmentedReport({
      aPlusTP: 10,
      aPlusSL: 5,
      aTP: 30,
      aSL: 30,
    }));

    expect(report.patterns.some(pattern => pattern.segment === 'grade' && pattern.value === 'A+')).toBe(false);
    expect(report.warnings).toContainEqual(expect.objectContaining({
      type: 'LOW_SAMPLE',
      segment: 'grade',
      value: 'A+',
      sampleSize: 15,
    }));
  });

  test('skips all learning when overall dataset coverage is below threshold', () => {
    const snapshots = Array.from({ length: 100 }, (_, index) => snapshotWithGrade(`snapshot-${index}`, index < 50 ? 'A+' : 'A'));
    const outcomes = snapshots.slice(0, 60).map((item, index) => outcome(item.candidateId, index < 35 ? 'TP' : 'SL'));
    const dataset = createValidatedDataset({
      snapshots,
      outcomes,
      validationReport: validateDataset({ snapshots, outcomes }),
    });

    const report = generateLearningReport(generateSegmentedBenchmark(dataset));

    expect(report.patterns).toHaveLength(0);
    expect(report.observations).toHaveLength(0);
    expect(report.warnings).toContainEqual(expect.objectContaining({
      type: 'LOW_COVERAGE',
      coverage: 0.6,
    }));
  });

  test('preserves benchmark metadata and produces deterministic output', () => {
    const segmented = createSegmentedReport({
      aPlusTP: 80,
      aPlusSL: 20,
      aTP: 40,
      aSL: 60,
    });

    const first = generateLearningReport(segmented);
    const second = generateLearningReport(segmented);

    expect(first).toEqual(second);
    expect(first.metadata).toMatchObject({
      learningReportVersion: 1,
      benchmarkVersion: segmented.metadata.benchmarkVersion,
      segmentedBenchmarkVersion: segmented.metadata.segmentedBenchmarkVersion,
      datasetFingerprint: segmented.metadata.datasetFingerprint,
      generatedAtDatasetCoverage: 1,
      minSampleSize: 30,
      minCoverageRate: 0.8,
    });
  });
});

function createSegmentedReport(input: {
  aPlusTP: number;
  aPlusSL: number;
  aTP: number;
  aSL: number;
}) {
  const snapshots = [
    ...createSnapshots('aplus-tp', 'A+', input.aPlusTP),
    ...createSnapshots('aplus-sl', 'A+', input.aPlusSL),
    ...createSnapshots('a-tp', 'A', input.aTP),
    ...createSnapshots('a-sl', 'A', input.aSL),
  ];
  const outcomes = [
    ...createOutcomes('aplus-tp', input.aPlusTP, 'TP'),
    ...createOutcomes('aplus-sl', input.aPlusSL, 'SL'),
    ...createOutcomes('a-tp', input.aTP, 'TP'),
    ...createOutcomes('a-sl', input.aSL, 'SL'),
  ];
  const dataset = createValidatedDataset({
    snapshots,
    outcomes,
    validationReport: validateDataset({ snapshots, outcomes }),
  });

  return generateSegmentedBenchmark(dataset);
}

function createSnapshots(prefix: string, grade: 'A+' | 'A', count: number) {
  return Array.from({ length: count }, (_, index) => snapshotWithGrade(`${prefix}-${index}`, grade));
}

function createOutcomes(prefix: string, count: number, status: 'TP' | 'SL') {
  return Array.from({ length: count }, (_, index) => outcome(`${prefix}-${index}`, status));
}

function snapshotWithGrade(candidateId: string, grade: 'A+' | 'A') {
  const result = snapshot(candidateId);
  result.grade.grade = grade;
  return result;
}
