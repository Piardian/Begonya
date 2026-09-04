import { SignalQuery, SignalRecord, SignalRepository } from './signalRepository';

export const SIGNAL_PATTERN_VERSION = 1 as const;

export type SignalPatternType =
  | 'PAIR_OUTCOME_CLUSTER'
  | 'GRADE_OUTCOME_CLUSTER'
  | 'TIMEFRAME_OUTCOME_CLUSTER'
  | 'OUTCOME_DENSITY'
  | 'GRADE_CLUSTER';

export interface SignalPatternEvidence {
  readonly signalIds: readonly string[];
  readonly distribution: Readonly<Record<string, number>>;
  readonly source: 'SIGNAL_REPOSITORY';
}

export interface SignalPatternMetadata {
  readonly recommendationGenerated: false;
  readonly policyChanged: false;
  readonly gradeChanged: false;
  readonly benchmarkChanged: false;
  readonly outcomeChanged: false;
  readonly tradingLogicChanged: false;
  readonly decisionMade: false;
}

export interface SignalPattern {
  readonly version: typeof SIGNAL_PATTERN_VERSION;
  readonly patternId: string;
  readonly patternType: SignalPatternType;
  readonly patternKey: string;
  readonly patternValue: string;
  readonly observationCount: number;
  readonly confidence: number;
  readonly evidence: SignalPatternEvidence;
  readonly createdTimestamp: number;
  readonly summary: string;
  readonly metadata: SignalPatternMetadata;
}

export interface PatternDiscoveryResult {
  readonly version: typeof SIGNAL_PATTERN_VERSION;
  readonly discoveryId: string;
  readonly createdTimestamp: number;
  readonly scope: {
    readonly source: 'SIGNAL_REPOSITORY';
    readonly query: SignalQuery;
  };
  readonly signalCount: number;
  readonly patterns: readonly SignalPattern[];
  readonly metadata: SignalPatternMetadata;
}

export function discoverSignalPatterns(input: {
  readonly repository: SignalRepository;
  readonly query?: SignalQuery;
  readonly createdTimestamp?: number;
}): PatternDiscoveryResult {
  const query = Object.freeze({ ...(input.query ?? {}) });
  const records = input.repository.listSignals(query);
  const createdTimestamp = input.createdTimestamp ?? deriveTimestamp(records);
  const metadata = createNeutralMetadata();
  const patterns = Object.freeze([
    ...createOutcomeClusterPatterns(records, 'PAIR_OUTCOME_CLUSTER', 'pair', record => record.context.pair, createdTimestamp),
    ...createOutcomeClusterPatterns(records, 'GRADE_OUTCOME_CLUSTER', 'grade', record => record.context.grade ?? 'UNKNOWN', createdTimestamp),
    ...createOutcomeClusterPatterns(records, 'TIMEFRAME_OUTCOME_CLUSTER', 'timeframe', record => record.context.timeframe, createdTimestamp),
    ...createDistributionPatterns(records, 'OUTCOME_DENSITY', 'outcome', record => record.outcome?.outcomeType ?? 'NO_OUTCOME', createdTimestamp),
    ...createDistributionPatterns(records, 'GRADE_CLUSTER', 'grade', record => record.context.grade ?? 'UNKNOWN', createdTimestamp),
  ].sort(comparePatterns));

  console.log('Pattern Discovery Complete');
  console.log(`Patterns Found: ${patterns.length}`);

  return Object.freeze({
    version: SIGNAL_PATTERN_VERSION,
    discoveryId: createDiscoveryId(query, records, createdTimestamp),
    createdTimestamp,
    scope: Object.freeze({
      source: 'SIGNAL_REPOSITORY' as const,
      query,
    }),
    signalCount: records.length,
    patterns,
    metadata,
  });
}

function createOutcomeClusterPatterns(
  records: readonly SignalRecord[],
  patternType: SignalPatternType,
  patternKey: string,
  selector: (record: SignalRecord) => string,
  createdTimestamp: number
): readonly SignalPattern[] {
  const groups = groupRecords(records, selector);

  return Object.entries(groups).map(([patternValue, groupRecordsForValue]) => {
    const outcomeDistribution = countBy(
      groupRecordsForValue,
      record => record.outcome?.outcomeType ?? 'NO_OUTCOME'
    );
    const dominantOutcome = findMostFrequent(outcomeDistribution) ?? 'NO_OUTCOME';

    return createPattern({
      patternType,
      patternKey,
      patternValue,
      records: groupRecordsForValue,
      distribution: outcomeDistribution,
      createdTimestamp,
      summary: `${patternKey}=${patternValue} most frequent outcome is ${dominantOutcome}`,
    });
  });
}

function createDistributionPatterns(
  records: readonly SignalRecord[],
  patternType: SignalPatternType,
  patternKey: string,
  selector: (record: SignalRecord) => string,
  createdTimestamp: number
): readonly SignalPattern[] {
  const groups = groupRecords(records, selector);

  return Object.entries(groups).map(([patternValue, groupRecordsForValue]) =>
    createPattern({
      patternType,
      patternKey,
      patternValue,
      records: groupRecordsForValue,
      distribution: Object.freeze({ [patternValue]: groupRecordsForValue.length }),
      createdTimestamp,
      summary: `${patternKey}=${patternValue} observed ${groupRecordsForValue.length} time(s)`,
    })
  );
}

function createPattern(input: {
  readonly patternType: SignalPatternType;
  readonly patternKey: string;
  readonly patternValue: string;
  readonly records: readonly SignalRecord[];
  readonly distribution: Readonly<Record<string, number>>;
  readonly createdTimestamp: number;
  readonly summary: string;
}): SignalPattern {
  const signalIds = Object.freeze(input.records.map(record => record.signalId).sort());
  const observationCount = input.records.length;

  return Object.freeze({
    version: SIGNAL_PATTERN_VERSION,
    patternId: createPatternId(
      input.patternType,
      input.patternKey,
      input.patternValue,
      signalIds,
      input.createdTimestamp
    ),
    patternType: input.patternType,
    patternKey: input.patternKey,
    patternValue: input.patternValue,
    observationCount,
    confidence: calculateDescriptiveConfidence(observationCount, signalIds.length),
    evidence: Object.freeze({
      signalIds,
      distribution: input.distribution,
      source: 'SIGNAL_REPOSITORY' as const,
    }),
    createdTimestamp: input.createdTimestamp,
    summary: input.summary,
    metadata: createNeutralMetadata(),
  });
}

function groupRecords(
  records: readonly SignalRecord[],
  selector: (record: SignalRecord) => string
): Record<string, readonly SignalRecord[]> {
  const groups: Record<string, SignalRecord[]> = {};

  for (const record of records) {
    const key = selector(record);
    groups[key] = groups[key] ?? [];
    groups[key].push(record);
  }

  return Object.keys(groups)
    .sort()
    .reduce<Record<string, readonly SignalRecord[]>>((sorted, key) => {
      sorted[key] = Object.freeze([...groups[key]].sort((left, right) => left.signalId.localeCompare(right.signalId)));
      return sorted;
    }, {});
}

function countBy(
  records: readonly SignalRecord[],
  selector: (record: SignalRecord) => string
): Readonly<Record<string, number>> {
  const counts: Record<string, number> = {};

  for (const record of records) {
    const key = selector(record);
    counts[key] = (counts[key] ?? 0) + 1;
  }

  return Object.freeze(sortRecord(counts));
}

function sortRecord(record: Record<string, number>): Record<string, number> {
  return Object.keys(record)
    .sort()
    .reduce<Record<string, number>>((sorted, key) => {
      sorted[key] = record[key];
      return sorted;
    }, {});
}

function findMostFrequent(distribution: Readonly<Record<string, number>>): string | null {
  const entries = Object.entries(distribution);
  if (entries.length === 0) return null;

  return entries.sort(([leftKey, leftCount], [rightKey, rightCount]) => {
    if (rightCount !== leftCount) return rightCount - leftCount;
    return leftKey.localeCompare(rightKey);
  })[0][0];
}

function calculateDescriptiveConfidence(observationCount: number, totalEvidence: number): number {
  if (totalEvidence === 0) return 0;
  return Number((observationCount / totalEvidence).toFixed(4));
}

function deriveTimestamp(records: readonly SignalRecord[]): number {
  if (records.length === 0) return 0;
  return Math.max(...records.map(record => record.context.timestamp));
}

function createDiscoveryId(
  query: SignalQuery,
  records: readonly SignalRecord[],
  createdTimestamp: number
): string {
  const signalIds = records.map(record => record.signalId).sort().join('|');
  return `PATTERN_DISCOVERY_${hashString(`${stableStringify(query)}|${signalIds}|${createdTimestamp}`)}`;
}

function createPatternId(
  patternType: SignalPatternType,
  patternKey: string,
  patternValue: string,
  signalIds: readonly string[],
  createdTimestamp: number
): string {
  return `SIGNAL_PATTERN_${hashString(
    `${patternType}|${patternKey}|${patternValue}|${signalIds.join('|')}|${createdTimestamp}`
  )}`;
}

function createNeutralMetadata(): SignalPatternMetadata {
  return Object.freeze({
    recommendationGenerated: false as const,
    policyChanged: false as const,
    gradeChanged: false as const,
    benchmarkChanged: false as const,
    outcomeChanged: false as const,
    tradingLogicChanged: false as const,
    decisionMade: false as const,
  });
}

function comparePatterns(left: SignalPattern, right: SignalPattern): number {
  return (
    left.patternType.localeCompare(right.patternType) ||
    left.patternKey.localeCompare(right.patternKey) ||
    left.patternValue.localeCompare(right.patternValue)
  );
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  const objectValue = value as Record<string, unknown>;
  return `{${Object.keys(objectValue)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stableStringify(objectValue[key])}`)
    .join(',')}}`;
}

function hashString(value: string): string {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, '0').toUpperCase();
}
