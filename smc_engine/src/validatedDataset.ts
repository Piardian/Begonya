import { OutcomeResult } from './outcomeResult';
import { SignalIntelligenceSnapshot } from './signalIntelligenceSnapshot';
import { DatasetCoverage, ValidationReport } from './validationReport';

export interface ValidatedLabeledSignal {
  readonly candidateId: string;
  readonly snapshot: SignalIntelligenceSnapshot;
  readonly outcome: OutcomeResult;
}

export interface ValidatedLabeledDataset {
  readonly items: readonly ValidatedLabeledSignal[];
  readonly coverage: DatasetCoverage;
}

export interface CreateValidatedDatasetInput {
  snapshots: readonly SignalIntelligenceSnapshot[];
  outcomes: readonly OutcomeResult[];
  validationReport: ValidationReport;
}

export function createValidatedDataset(input: CreateValidatedDatasetInput): ValidatedLabeledDataset {
  if (!input.validationReport.valid) {
    throw new Error('Cannot create ValidatedLabeledDataset from invalid validation report.');
  }

  const outcomesByCandidateId = new Map<string, OutcomeResult>();
  for (const outcome of input.outcomes) {
    outcomesByCandidateId.set(outcome.candidateId, outcome);
  }

  const items: ValidatedLabeledSignal[] = [];
  for (const snapshot of input.snapshots) {
    const outcome = outcomesByCandidateId.get(snapshot.candidateId);
    if (outcome) {
      items.push(Object.freeze({
        candidateId: snapshot.candidateId,
        snapshot,
        outcome,
      }));
    }
  }

  return Object.freeze({
    items: Object.freeze(items),
    coverage: Object.freeze({ ...input.validationReport.coverage }),
  });
}
