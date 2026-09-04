import { OutcomeResult } from './outcomeResult';
import { SignalIntelligenceSnapshot } from './signalIntelligenceSnapshot';

export interface LabeledSignal {
  candidateId: string;
  snapshot: SignalIntelligenceSnapshot;
  outcome?: OutcomeResult;
}

export function joinSnapshotsWithOutcomes(
  snapshots: readonly SignalIntelligenceSnapshot[],
  outcomes: readonly OutcomeResult[]
): LabeledSignal[] {
  const outcomesByCandidateId = new Map<string, OutcomeResult>();
  for (const outcome of outcomes) {
    if (!outcomesByCandidateId.has(outcome.candidateId)) {
      outcomesByCandidateId.set(outcome.candidateId, outcome);
    }
  }

  return snapshots.map(snapshot => {
    const outcome = outcomesByCandidateId.get(snapshot.candidateId);
    return outcome
      ? { candidateId: snapshot.candidateId, snapshot, outcome }
      : { candidateId: snapshot.candidateId, snapshot };
  });
}
