import {
  GRADE_ENGINE_VERSION,
  SIGNAL_INTELLIGENCE_SNAPSHOT_VERSION,
  SignalIntelligenceSnapshot,
} from './signalIntelligenceSnapshot';
import { SIGNAL_QUALITY_RESULT_VERSION } from './signalQualityEngine';
import { SnapshotReadError } from './signalIntelligenceSnapshotReader';
import { ALL_SYMBOLS, type Symbol } from '../server/universe';

export interface SnapshotQuery {
  where?: {
    symbol?: Symbol;
    timeframe?: '15m';
    grade?: 'A+' | 'A' | 'B+' | 'B' | 'C';
    signalQualityStatus?: 'excellent' | 'good' | 'risky' | 'invalid';
    snapshotVersion?: number;
  };
  sort?: {
    by: 'timestamp' | 'candidateId';
    direction?: 'asc' | 'desc';
  };
  limit?: number;
}

export interface DatasetValidationIssue {
  severity: 'error' | 'warning';
  code:
    | 'READ_ERROR'
    | 'DUPLICATE_CANDIDATE_ID'
    | 'INVALID_SCHEMA'
    | 'UNSUPPORTED_SNAPSHOT_VERSION'
    | 'VERSION_COMPATIBILITY_WARNING';
  candidateId?: string;
  snapshotIndex?: number;
  message: string;
}

export interface DatasetValidationReport {
  valid: boolean;
  totalSnapshots: number;
  issues: DatasetValidationIssue[];
}

export interface DatasetStatistics {
  totalSnapshots: number;
  symbols: Record<string, number>;
  timeframes: Record<string, number>;
  grades: Record<string, number>;
  signalQualityStatuses: Record<string, number>;
  snapshotVersions: Record<string, number>;
}

export class SignalIntelligenceDataset {
  private constructor(private readonly items: readonly SignalIntelligenceSnapshot[]) {}

  static fromSnapshots(snapshots: readonly SignalIntelligenceSnapshot[]): SignalIntelligenceDataset {
    return new SignalIntelligenceDataset(Object.freeze([...snapshots]));
  }

  snapshots(): readonly SignalIntelligenceSnapshot[] {
    return this.items;
  }

  query(query: SnapshotQuery = {}): SignalIntelligenceDataset {
    let result = this.items.filter(snapshot => matchesWhere(snapshot, query.where));

    if (query.sort) {
      const direction = query.sort.direction ?? 'asc';
      const sortBy = query.sort.by;
      result = [...result].sort((a, b) => {
        const left = sortBy === 'timestamp' ? a.timestamp : a.candidateId;
        const right = sortBy === 'timestamp' ? b.timestamp : b.candidateId;
        const comparison = left.localeCompare(right);
        return direction === 'asc' ? comparison : -comparison;
      });
    }

    if (query.limit !== undefined) {
      result = result.slice(0, Math.max(0, query.limit));
    }

    return SignalIntelligenceDataset.fromSnapshots(result);
  }

  validate(readErrors: readonly SnapshotReadError[] = []): DatasetValidationReport {
    return validateSignalIntelligenceDataset(this.items, readErrors);
  }

  statistics(): DatasetStatistics {
    return calculateDatasetStatistics(this.items);
  }
}

export function validateSignalIntelligenceDataset(
  snapshots: readonly SignalIntelligenceSnapshot[],
  readErrors: readonly SnapshotReadError[] = []
): DatasetValidationReport {
  const issues: DatasetValidationIssue[] = readErrors.map(error => ({
    severity: 'error',
    code: 'READ_ERROR',
    message: `Snapshot could not be read: ${error.message}`,
  }));

  const candidateCounts = new Map<string, number>();

  snapshots.forEach((snapshot, index) => {
    const schemaIssue = validateSnapshotSchema(snapshot, index);
    if (schemaIssue) {
      issues.push(schemaIssue);
      return;
    }

    candidateCounts.set(snapshot.candidateId, (candidateCounts.get(snapshot.candidateId) ?? 0) + 1);

    if (snapshot.snapshotVersion !== SIGNAL_INTELLIGENCE_SNAPSHOT_VERSION) {
      issues.push({
        severity: 'error',
        code: 'UNSUPPORTED_SNAPSHOT_VERSION',
        candidateId: snapshot.candidateId,
        snapshotIndex: index,
        message: `Unsupported snapshotVersion: ${snapshot.snapshotVersion}`,
      });
    }

    if (
      snapshot.engine.signalQualityVersion !== SIGNAL_QUALITY_RESULT_VERSION ||
      snapshot.signalQuality.version !== SIGNAL_QUALITY_RESULT_VERSION ||
      snapshot.engine.gradeVersion !== GRADE_ENGINE_VERSION
    ) {
      issues.push({
        severity: 'warning',
        code: 'VERSION_COMPATIBILITY_WARNING',
        candidateId: snapshot.candidateId,
        snapshotIndex: index,
        message: 'Snapshot engine versions differ from the currently supported versions.',
      });
    }
  });

  for (const [candidateId, count] of candidateCounts.entries()) {
    if (count > 1) {
      issues.push({
        severity: 'error',
        code: 'DUPLICATE_CANDIDATE_ID',
        candidateId,
        message: `Duplicate candidateId found ${count} times.`,
      });
    }
  }

  return {
    valid: issues.every(issue => issue.severity !== 'error'),
    totalSnapshots: snapshots.length,
    issues,
  };
}

export function calculateDatasetStatistics(
  snapshots: readonly SignalIntelligenceSnapshot[]
): DatasetStatistics {
  const stats: DatasetStatistics = {
    totalSnapshots: snapshots.length,
    symbols: {},
    timeframes: {},
    grades: {},
    signalQualityStatuses: {},
    snapshotVersions: {},
  };

  for (const snapshot of snapshots) {
    increment(stats.symbols, snapshot.symbol);
    increment(stats.timeframes, snapshot.timeframe);
    increment(stats.grades, snapshot.grade?.grade);
    increment(stats.signalQualityStatuses, snapshot.signalQuality?.status);
    increment(stats.snapshotVersions, String(snapshot.snapshotVersion));
  }

  return stats;
}

function matchesWhere(
  snapshot: SignalIntelligenceSnapshot,
  where: SnapshotQuery['where'] = {}
): boolean {
  if (where.symbol !== undefined && snapshot.symbol !== where.symbol) return false;
  if (where.timeframe !== undefined && snapshot.timeframe !== where.timeframe) return false;
  if (where.grade !== undefined && snapshot.grade.grade !== where.grade) return false;
  if (where.signalQualityStatus !== undefined && snapshot.signalQuality.status !== where.signalQualityStatus) return false;
  if (where.snapshotVersion !== undefined && snapshot.snapshotVersion !== where.snapshotVersion) return false;
  return true;
}

function validateSnapshotSchema(
  snapshot: SignalIntelligenceSnapshot,
  snapshotIndex: number
): DatasetValidationIssue | null {
  if (!isObject(snapshot)) {
    return invalidSchema(snapshotIndex, 'Snapshot is not an object.');
  }

  if (
    typeof snapshot.snapshotVersion !== 'number' ||
    typeof snapshot.timestamp !== 'string' ||
    !(ALL_SYMBOLS as readonly string[]).includes(snapshot.symbol) ||
    snapshot.timeframe !== '15m' ||

    typeof snapshot.candidateId !== 'string' ||
    !isObject(snapshot.candidate) ||
    !isObject(snapshot.signalQuality) ||
    !isObject(snapshot.grade) ||
    !isObject(snapshot.engine)
  ) {
    return invalidSchema(snapshotIndex, 'Snapshot is missing one or more mandatory top-level fields.');
  }

  if (
    !['OB', 'FVG'].includes(snapshot.candidate.poiType) ||
    !['long', 'short'].includes(snapshot.candidate.tradeDirection) ||
    typeof snapshot.candidate.currentPrice !== 'number' ||
    typeof snapshot.candidate.poiFormedTimestamp !== 'number' ||
    !['BOS', 'CHoCH'].includes(snapshot.candidate.relatedEventType) ||
    typeof snapshot.candidate.relatedEventTimestamp !== 'number'
  ) {
    return invalidSchema(snapshotIndex, 'Snapshot candidate payload is invalid.');
  }

  if (
    typeof snapshot.signalQuality.version !== 'number' ||
    typeof snapshot.signalQuality.score !== 'number' ||
    typeof snapshot.signalQuality.confidence !== 'number' ||
    !['excellent', 'good', 'risky', 'invalid'].includes(snapshot.signalQuality.status)
  ) {
    return invalidSchema(snapshotIndex, 'Snapshot signalQuality payload is invalid.');
  }

  if (
    typeof snapshot.grade.totalScore !== 'number' ||
    !['A+', 'A', 'B+', 'B', 'C'].includes(snapshot.grade.grade) ||
    typeof snapshot.grade.entryAllowed !== 'boolean'
  ) {
    return invalidSchema(snapshotIndex, 'Snapshot grade payload is invalid.');
  }

  if (
    typeof snapshot.engine.signalQualityVersion !== 'number' ||
    typeof snapshot.engine.gradeVersion !== 'number'
  ) {
    return invalidSchema(snapshotIndex, 'Snapshot engine payload is invalid.');
  }

  return null;
}

function invalidSchema(snapshotIndex: number, message: string): DatasetValidationIssue {
  return {
    severity: 'error',
    code: 'INVALID_SCHEMA',
    snapshotIndex,
    message,
  };
}

function isObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function increment(target: Record<string, number>, key: string | undefined): void {
  if (key === undefined) return;
  target[key] = (target[key] ?? 0) + 1;
}
