import { generateBenchmark } from '../src/benchmarkEngine';
import { groupDatasetBySegment } from '../src/segmentAggregator';
import { generateSegmentedBenchmark } from '../src/segmentedBenchmark';
import { SegmentDefinition } from '../src/segmentDefinitions';
import { createValidatedDataset } from '../src/validatedDataset';
import { validateDataset } from '../src/outcomeValidation';
import { outcome, snapshot } from './outcomeValidation.test';

describe('Segmented Benchmark', () => {
  test('generates segment reports for grade, session, poiType, quality, direction, and event type', () => {
    const snapshots = [
      snapshotWith('a', { grade: 'A+', session: 'london', poiType: 'OB', quality: 'excellent', direction: 'long', eventType: 'BOS' }),
      snapshotWith('b', { grade: 'A+', session: 'london', poiType: 'FVG', quality: 'good', direction: 'short', eventType: 'CHoCH' }),
      snapshotWith('c', { grade: 'A', session: 'new_york', poiType: 'OB', quality: 'excellent', direction: 'long', eventType: 'BOS' }),
    ];
    const outcomes = [outcome('a', 'TP'), outcome('b', 'SL'), outcome('c', 'TP')];
    const dataset = createValidatedDataset({
      snapshots,
      outcomes,
      validationReport: validateDataset({ snapshots, outcomes }),
    });

    const report = generateSegmentedBenchmark(dataset);

    expect(report.overallBenchmark).toEqual(generateBenchmark(dataset));
    expect(report.segments.grade['A+'].sampleSize).toBe(2);
    expect(report.segments.grade['A+'].benchmark.counts).toMatchObject({ TP: 1, SL: 1 });
    expect(report.segments.grade['A'].benchmark.counts.TP).toBe(1);
    expect(report.segments.session.london.sampleSize).toBe(2);
    expect(report.segments.session.new_york.sampleSize).toBe(1);
    expect(report.segments.poiType.OB.sampleSize).toBe(2);
    expect(report.segments.poiType.FVG.sampleSize).toBe(1);
    expect(report.segments.signalQualityStatus.excellent.sampleSize).toBe(2);
    expect(report.segments.signalQualityStatus.good.sampleSize).toBe(1);
    expect(report.segments.direction.long.sampleSize).toBe(2);
    expect(report.segments.direction.short.sampleSize).toBe(1);
    expect(report.segments.eventType.BOS.sampleSize).toBe(2);
    expect(report.segments.eventType.CHoCH.sampleSize).toBe(1);
  });

  test('marks small segments with descriptive sample-size metadata', () => {
    const snapshots = [snapshotWith('tiny', { grade: 'A+' })];
    const outcomes = [outcome('tiny', 'TP')];
    const dataset = createValidatedDataset({
      snapshots,
      outcomes,
      validationReport: validateDataset({ snapshots, outcomes }),
    });

    const report = generateSegmentedBenchmark(dataset);

    expect(report.metadata.recommendedMinSegmentSampleSize).toBe(30);
    expect(report.segments.grade['A+']).toMatchObject({
      segmentValue: 'A+',
      sampleSize: 1,
      belowRecommendedSample: true,
    });
  });

  test('segment aggregator only groups datasets and does not calculate benchmark metrics', () => {
    const snapshots = [
      snapshotWith('a', { grade: 'A+' }),
      snapshotWith('b', { grade: 'A' }),
    ];
    const outcomes = [outcome('a', 'TP'), outcome('b', 'SL')];
    const dataset = createValidatedDataset({
      snapshots,
      outcomes,
      validationReport: validateDataset({ snapshots, outcomes }),
    });
    const customSegment: SegmentDefinition = {
      key: 'grade',
      label: 'Composite Example',
      getSegmentKey: item => `${item.snapshot.grade.grade}:${item.snapshot.candidate.tradeDirection}`,
    };

    const grouped = groupDatasetBySegment(dataset, customSegment);

    expect(Object.keys(grouped)).toEqual(['A:long', 'A+:long']);
    expect(grouped['A+:long'].items[0].candidateId).toBe('a');
    expect(grouped['A+:long']).not.toHaveProperty('counts');
    expect(grouped['A+:long']).not.toHaveProperty('rates');
  });

  test('segmented report metadata reuses overall dataset fingerprint and coverage', () => {
    const snapshots = [snapshotWith('a', { grade: 'A+' }), snapshotWith('b', { grade: 'A' })];
    const outcomes = [outcome('a', 'TP')];
    const dataset = createValidatedDataset({
      snapshots,
      outcomes,
      validationReport: validateDataset({ snapshots, outcomes }),
    });

    const report = generateSegmentedBenchmark(dataset);

    expect(report.metadata.datasetFingerprint).toBe(report.overallBenchmark.metadata.datasetFingerprint);
    expect(report.metadata.generatedAtDatasetCoverage).toBe(0.5);
    expect(report.overallBenchmark.coverage).toEqual({
      snapshotCount: 2,
      labeledCount: 1,
      missingOutcomeCount: 1,
      coverageRate: 0.5,
    });
  });
});

function snapshotWith(
  candidateId: string,
  overrides: {
    grade?: 'A+' | 'A' | 'B+' | 'B' | 'C';
    session?: 'asian' | 'london' | 'new_york' | 'overlap' | 'off_session';
    poiType?: 'OB' | 'FVG';
    quality?: 'excellent' | 'good' | 'risky' | 'invalid';
    direction?: 'long' | 'short';
    eventType?: 'BOS' | 'CHoCH';
  }
) {
  const result = snapshot(candidateId);
  result.grade.grade = overrides.grade ?? 'A+';
  result.signalQuality.marketContext.session = overrides.session ?? 'london';
  result.candidate.poiType = overrides.poiType ?? 'OB';
  result.signalQuality.status = overrides.quality ?? 'excellent';
  result.candidate.tradeDirection = overrides.direction ?? 'long';
  result.candidate.relatedEventType = overrides.eventType ?? 'BOS';
  return result;
}
