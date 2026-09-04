import { DatasetCoverage } from './validationReport';
import { SegmentDefinition } from './segmentDefinitions';
import { ValidatedLabeledDataset, ValidatedLabeledSignal } from './validatedDataset';

export type GroupedDataset = Record<string, ValidatedLabeledDataset>;

export function groupDatasetBySegment(
  dataset: ValidatedLabeledDataset,
  definition: SegmentDefinition
): GroupedDataset {
  const groups = new Map<string, ValidatedLabeledSignal[]>();

  for (const item of dataset.items) {
    const key = definition.getSegmentKey(item);
    const existing = groups.get(key) ?? [];
    existing.push(item);
    groups.set(key, existing);
  }

  const result: GroupedDataset = {};
  for (const [key, items] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    result[key] = Object.freeze({
      items: Object.freeze([...items]),
      coverage: Object.freeze(createSegmentCoverage(items.length)),
    });
  }

  return result;
}

function createSegmentCoverage(sampleSize: number): DatasetCoverage {
  return {
    snapshotCount: sampleSize,
    labeledCount: sampleSize,
    missingOutcomeCount: 0,
    coverageRate: sampleSize === 0 ? 0 : 1,
  };
}
