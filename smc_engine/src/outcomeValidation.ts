import {
  OUTCOME_LABELING_CONFIG_VERSION,
  OUTCOME_RESULT_VERSION,
  OutcomeResult,
} from './outcomeResult';
import {
  SIGNAL_INTELLIGENCE_SNAPSHOT_VERSION,
  SignalIntelligenceSnapshot,
} from './signalIntelligenceSnapshot';
import { OutcomeReadError } from './outcomeReader';
import { SnapshotReadError } from './signalIntelligenceSnapshotReader';
import { createValidationReport, DatasetCoverage, ValidationIssue, ValidationReport } from './validationReport';

export interface DatasetValidationInput {
  snapshots: readonly SignalIntelligenceSnapshot[];
  outcomes: readonly OutcomeResult[];
  snapshotReadErrors?: readonly SnapshotReadError[];
  outcomeReadErrors?: readonly OutcomeReadError[];
}

export function validateDataset(input: DatasetValidationInput): ValidationReport {
  const issues: ValidationIssue[] = [];
  const snapshotsByCandidateId = new Map<string, SignalIntelligenceSnapshot>();
  const outcomesByCandidateId = new Map<string, OutcomeResult>();
  const snapshotCounts = new Map<string, number>();
  const outcomeCounts = new Map<string, number>();

  for (const error of input.snapshotReadErrors ?? []) {
    issues.push({
      severity: 'error',
      code: 'SNAPSHOT_READ_ERROR',
      message: `Snapshot could not be read: ${error.message}`,
    });
  }

  for (const error of input.outcomeReadErrors ?? []) {
    issues.push({
      severity: 'error',
      code: 'OUTCOME_READ_ERROR',
      message: `Outcome could not be read: ${error.message}`,
    });
  }

  input.snapshots.forEach(snapshot => {
    const schemaIssue = validateSnapshot(snapshot);
    if (schemaIssue) {
      issues.push(schemaIssue);
      return;
    }

    snapshotsByCandidateId.set(snapshot.candidateId, snapshot);
    snapshotCounts.set(snapshot.candidateId, (snapshotCounts.get(snapshot.candidateId) ?? 0) + 1);
  });

  input.outcomes.forEach(outcome => {
    const schemaIssue = validateOutcome(outcome);
    if (schemaIssue) {
      issues.push(schemaIssue);
      return;
    }

    outcomesByCandidateId.set(outcome.candidateId, outcome);
    outcomeCounts.set(outcome.candidateId, (outcomeCounts.get(outcome.candidateId) ?? 0) + 1);
  });

  for (const [candidateId, count] of snapshotCounts.entries()) {
    if (count > 1) {
      issues.push({
        severity: 'error',
        code: 'DUPLICATE_SNAPSHOT',
        candidateId,
        message: `Duplicate snapshot candidateId found ${count} times.`,
      });
    }
  }

  for (const [candidateId, count] of outcomeCounts.entries()) {
    if (count > 1) {
      issues.push({
        severity: 'error',
        code: 'DUPLICATE_OUTCOME',
        candidateId,
        message: `Duplicate outcome candidateId found ${count} times.`,
      });
    }
  }

  for (const candidateId of snapshotsByCandidateId.keys()) {
    if (!outcomesByCandidateId.has(candidateId)) {
      issues.push({
        severity: 'warning',
        code: 'MISSING_OUTCOME',
        candidateId,
        message: 'Snapshot does not have an outcome yet.',
      });
    }
  }

  for (const [candidateId, outcome] of outcomesByCandidateId.entries()) {
    const snapshot = snapshotsByCandidateId.get(candidateId);
    if (!snapshot) {
      issues.push({
        severity: 'error',
        code: 'ORPHAN_OUTCOME',
        candidateId,
        message: 'Outcome does not have a matching snapshot.',
      });
      continue;
    }

    const consistencyIssues = validateSnapshotOutcomeConsistency(snapshot, outcome);
    issues.push(...consistencyIssues);
  }

  return createValidationReport(issues, calculateCoverage(input.snapshots, outcomesByCandidateId));
}

function calculateCoverage(
  snapshots: readonly SignalIntelligenceSnapshot[],
  outcomesByCandidateId: ReadonlyMap<string, OutcomeResult>
): DatasetCoverage {
  const snapshotCandidateIds = new Set<string>();
  for (const snapshot of snapshots) {
    if (typeof snapshot?.candidateId === 'string') {
      snapshotCandidateIds.add(snapshot.candidateId);
    }
  }

  let labeledCount = 0;
  for (const candidateId of snapshotCandidateIds) {
    if (outcomesByCandidateId.has(candidateId)) {
      labeledCount++;
    }
  }

  const snapshotCount = snapshotCandidateIds.size;
  const missingOutcomeCount = Math.max(0, snapshotCount - labeledCount);

  return {
    snapshotCount,
    labeledCount,
    missingOutcomeCount,
    coverageRate: snapshotCount === 0 ? 0 : roundRate(labeledCount / snapshotCount),
  };
}

function validateSnapshot(snapshot: SignalIntelligenceSnapshot): ValidationIssue | null {
  if (!isObject(snapshot)) {
    return issue('error', 'INVALID_SNAPSHOT_SCHEMA', undefined, 'Snapshot is not an object.');
  }

  if (
    snapshot.snapshotVersion !== SIGNAL_INTELLIGENCE_SNAPSHOT_VERSION ||
    typeof snapshot.candidateId !== 'string' ||
    typeof snapshot.timestamp !== 'string'
  ) {
    return issue(
      'error',
      snapshot.snapshotVersion !== SIGNAL_INTELLIGENCE_SNAPSHOT_VERSION
        ? 'UNSUPPORTED_SNAPSHOT_VERSION'
        : 'INVALID_SNAPSHOT_SCHEMA',
      typeof snapshot.candidateId === 'string' ? snapshot.candidateId : undefined,
      'Snapshot has invalid mandatory fields or unsupported version.'
    );
  }

  return null;
}

function validateOutcome(outcome: OutcomeResult): ValidationIssue | null {
  if (!isObject(outcome)) {
    return issue('error', 'INVALID_OUTCOME_SCHEMA', undefined, 'Outcome is not an object.');
  }

  if (outcome.outcomeVersion !== OUTCOME_RESULT_VERSION) {
    return issue('error', 'UNSUPPORTED_OUTCOME_VERSION', outcome.candidateId, 'Outcome version is unsupported.');
  }

  if (typeof outcome.candidateId !== 'string' || typeof outcome.labeledAt !== 'string') {
    return issue('error', 'INVALID_OUTCOME_SCHEMA', undefined, 'Outcome is missing mandatory fields.');
  }

  if (!['TP', 'SL', 'BE', 'EXPIRED', 'UNKNOWN'].includes(outcome.outcomeStatus)) {
    return issue('error', 'INVALID_OUTCOME_STATUS', outcome.candidateId, 'Outcome status is invalid.');
  }

  if (!isObject(outcome.reason) || typeof outcome.reason.reasonCode !== 'string' || typeof outcome.reason.reasonMessage !== 'string') {
    return issue('error', 'INVALID_OUTCOME_REASON', outcome.candidateId, 'Outcome reason is invalid.');
  }

  if (
    !isObject(outcome.metadata) ||
    outcome.metadata.labelingConfigVersion !== OUTCOME_LABELING_CONFIG_VERSION ||
    typeof outcome.metadata.evaluatedCandles !== 'number' ||
    typeof outcome.metadata.startTimestamp !== 'number' ||
    typeof outcome.metadata.maxFavorableExcursionPips !== 'number' ||
    typeof outcome.metadata.maxAdverseExcursionPips !== 'number' ||
    typeof outcome.metadata.evaluationDurationBars !== 'number' ||
    typeof outcome.metadata.evaluationCompleted !== 'boolean'
  ) {
    return issue(
      'error',
      outcome.metadata?.labelingConfigVersion !== OUTCOME_LABELING_CONFIG_VERSION
        ? 'LABELING_CONFIG_VERSION_MISMATCH'
        : 'INVALID_OUTCOME_METADATA',
      outcome.candidateId,
      'Outcome metadata is invalid or has unsupported labeling config version.'
    );
  }

  return null;
}

function validateSnapshotOutcomeConsistency(
  snapshot: SignalIntelligenceSnapshot,
  outcome: OutcomeResult
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const snapshotTimestamp = Date.parse(snapshot.timestamp);
  const labeledAt = Date.parse(outcome.labeledAt);

  if (!Number.isFinite(snapshotTimestamp) || !Number.isFinite(labeledAt)) {
    issues.push(issue('error', 'INCONSISTENT_TIMESTAMPS', outcome.candidateId, 'Snapshot or outcome timestamp is invalid.'));
    return issues;
  }

  if (outcome.metadata.startTimestamp < snapshotTimestamp) {
    issues.push(issue('error', 'INCONSISTENT_TIMESTAMPS', outcome.candidateId, 'Outcome evaluation starts before snapshot timestamp.'));
  }

  if (outcome.metadata.endTimestamp !== null && outcome.metadata.endTimestamp < outcome.metadata.startTimestamp) {
    issues.push(issue('error', 'INCONSISTENT_TIMESTAMPS', outcome.candidateId, 'Outcome evaluation end is before start.'));
  }

  if (outcome.metadata.resolvedAtTimestamp !== null && outcome.metadata.resolvedAtTimestamp < outcome.metadata.startTimestamp) {
    issues.push(issue('error', 'INCONSISTENT_TIMESTAMPS', outcome.candidateId, 'Outcome resolution is before evaluation start.'));
  }

  return issues;
}

function issue(
  severity: 'error' | 'warning',
  code: string,
  candidateId: string | undefined,
  message: string
): ValidationIssue {
  return { severity, code, candidateId, message };
}

function isObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function roundRate(value: number): number {
  return Math.round(value * 10000) / 10000;
}
