import { generateBenchmark } from '../src/benchmarkEngine';
import { createValidatedDataset } from '../src/validatedDataset';
import { validateDataset } from '../src/outcomeValidation';
import { outcome, snapshot } from './outcomeValidation.test';

describe('Benchmark Engine', () => {
  test('creates validated labeled dataset only from valid validation report', () => {
    const snapshots = [snapshot('a'), snapshot('b')];
    const outcomes = [outcome('a'), outcome('b', 'SL')];
    const validationReport = validateDataset({ snapshots, outcomes });

    const dataset = createValidatedDataset({ snapshots, outcomes, validationReport });

    expect(dataset.items.map(item => item.candidateId)).toEqual(['a', 'b']);
    expect(Object.isFrozen(dataset)).toBe(true);
    expect(Object.isFrozen(dataset.items)).toBe(true);
  });

  test('refuses to create validated dataset from invalid validation report', () => {
    const snapshots = [snapshot('a')];
    const outcomes = [outcome('orphan')];
    const validationReport = validateDataset({ snapshots, outcomes });

    expect(() => createValidatedDataset({ snapshots, outcomes, validationReport })).toThrow(
      'Cannot create ValidatedLabeledDataset'
    );
  });

  test('generates descriptive benchmark analytics from validated labeled dataset', () => {
    const snapshots = ['tp', 'sl', 'be', 'expired', 'unknown', 'missing'].map(id => snapshot(id));
    const outcomes = [
      outcome('tp', 'TP'),
      outcome('sl', 'SL'),
      outcome('be', 'BE'),
      outcome('expired', 'EXPIRED'),
      outcome('unknown', 'UNKNOWN'),
    ];
    outcomes[0].metadata.evaluationDurationBars = 1;
    outcomes[1].metadata.evaluationDurationBars = 2;
    outcomes[2].metadata.evaluationDurationBars = 3;
    outcomes[3].metadata.evaluationDurationBars = 4;
    outcomes[4].metadata.evaluationDurationBars = 5;
    outcomes[0].metadata.maxFavorableExcursionPips = 20;
    outcomes[1].metadata.maxFavorableExcursionPips = 10;
    outcomes[2].metadata.maxFavorableExcursionPips = 5;
    outcomes[3].metadata.maxFavorableExcursionPips = 0;
    outcomes[4].metadata.maxFavorableExcursionPips = 15;
    outcomes[0].metadata.maxAdverseExcursionPips = 1;
    outcomes[1].metadata.maxAdverseExcursionPips = 2;
    outcomes[2].metadata.maxAdverseExcursionPips = 3;
    outcomes[3].metadata.maxAdverseExcursionPips = 4;
    outcomes[4].metadata.maxAdverseExcursionPips = 5;

    const validationReport = validateDataset({ snapshots, outcomes });
    const dataset = createValidatedDataset({ snapshots, outcomes, validationReport });
    const report = generateBenchmark(dataset);

    expect(report.coverage).toEqual({
      snapshotCount: 6,
      labeledCount: 5,
      missingOutcomeCount: 1,
      coverageRate: 0.8333,
    });
    expect(report.totals).toEqual({
      totalSnapshots: 6,
      labeledSnapshots: 5,
      unlabeledSnapshots: 1,
    });
    expect(report.counts).toEqual({ TP: 1, SL: 1, BE: 1, EXPIRED: 1, UNKNOWN: 1 });
    expect(report.rates).toEqual({
      TPRate: 0.2,
      SLRate: 0.2,
      BERate: 0.2,
      EXPIREDRate: 0.2,
      UNKNOWNRate: 0.2,
    });
    expect(report.duration).toEqual({
      averageEvaluationBars: 3,
      medianEvaluationBars: 3,
    });
    expect(report.excursion).toEqual({
      averageMFE: 10,
      averageMAE: 3,
    });
    expect(report.metadata).toMatchObject({
      benchmarkVersion: 1,
      snapshotVersion: 1,
      outcomeVersion: 1,
      labelingConfigVersion: 1,
      generatedAtDatasetCoverage: 0.8333,
    });
    expect(report.metadata.datasetFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  test('dataset fingerprint is deterministic and changes when dataset identity changes', () => {
    const snapshotsA = [snapshot('a'), snapshot('b')];
    const outcomesA = [outcome('a'), outcome('b')];
    const datasetA1 = createValidatedDataset({
      snapshots: snapshotsA,
      outcomes: outcomesA,
      validationReport: validateDataset({ snapshots: snapshotsA, outcomes: outcomesA }),
    });
    const datasetA2 = createValidatedDataset({
      snapshots: [...snapshotsA].reverse(),
      outcomes: [...outcomesA].reverse(),
      validationReport: validateDataset({ snapshots: snapshotsA, outcomes: outcomesA }),
    });
    const snapshotsB = [snapshot('a'), snapshot('c')];
    const outcomesB = [outcome('a'), outcome('c')];
    const datasetB = createValidatedDataset({
      snapshots: snapshotsB,
      outcomes: outcomesB,
      validationReport: validateDataset({ snapshots: snapshotsB, outcomes: outcomesB }),
    });

    expect(generateBenchmark(datasetA2).metadata.datasetFingerprint).toBe(
      generateBenchmark(datasetA1).metadata.datasetFingerprint
    );
    expect(generateBenchmark(datasetB).metadata.datasetFingerprint).not.toBe(
      generateBenchmark(datasetA1).metadata.datasetFingerprint
    );
  });
});
