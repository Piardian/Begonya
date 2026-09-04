import { SignalQuery, SignalRecord, SignalRepository } from './signalRepository';

export const SIGNAL_LEARNING_OBSERVATION_VERSION = 1 as const;

export interface LearningObservationScope {
  readonly source: 'SIGNAL_REPOSITORY';
  readonly query: SignalQuery;
}

export interface LearningObservationMetrics {
  readonly totalSignals: number;
  readonly gradeDistribution: Readonly<Record<string, number>>;
  readonly outcomeDistribution: Readonly<Record<string, number>>;
  readonly benchmarkStatusDistribution: Readonly<Record<string, number>>;
  readonly pairDistribution: Readonly<Record<string, number>>;
  readonly timeframeDistribution: Readonly<Record<string, number>>;
  readonly mostFrequentPair: string | null;
  readonly mostFrequentTimeframe: string | null;
}

export interface LearningObservationMetadata {
  readonly recommendationGenerated: false;
  readonly policyChanged: false;
  readonly gradeChanged: false;
  readonly benchmarkDecisionMade: false;
  readonly tradingLogicChanged: false;
}

export interface SignalLearningObservation {
  readonly version: typeof SIGNAL_LEARNING_OBSERVATION_VERSION;
  readonly observationId: string;
  readonly observationTimestamp: number;
  readonly scope: LearningObservationScope;
  readonly metrics: LearningObservationMetrics;
  readonly signalCount: number;
  readonly summary: string;
  readonly metadata: LearningObservationMetadata;
}

export function createSignalLearningObservation(input: {
  readonly repository: SignalRepository;
  readonly query?: SignalQuery;
  readonly observationTimestamp?: number;
}): SignalLearningObservation {
  const query = Object.freeze({ ...(input.query ?? {}) });
  const records = input.repository.listSignals(query);
  const observationTimestamp =
    input.observationTimestamp ?? deriveObservationTimestamp(records);
  const metrics = createMetrics(records);
  const observationId = createObservationId(query, records, observationTimestamp);

  console.log('Learning Observation Created');
  console.log(`Signals Analysed: ${records.length}`);

  return Object.freeze({
    version: SIGNAL_LEARNING_OBSERVATION_VERSION,
    observationId,
    observationTimestamp,
    scope: Object.freeze({
      source: 'SIGNAL_REPOSITORY' as const,
      query,
    }),
    metrics,
    signalCount: records.length,
    summary: createSummary(metrics),
    metadata: Object.freeze({
      recommendationGenerated: false as const,
      policyChanged: false as const,
      gradeChanged: false as const,
      benchmarkDecisionMade: false as const,
      tradingLogicChanged: false as const,
    }),
  });
}

function createMetrics(records: readonly SignalRecord[]): LearningObservationMetrics {
  const gradeDistribution = countBy(records, record => record.context.grade ?? 'UNKNOWN');
  const outcomeDistribution = countBy(records, record => record.outcome?.outcomeType ?? 'NO_OUTCOME');
  const benchmarkStatusDistribution = countBy(
    records,
    record => record.benchmark?.benchmarkStatus ?? 'NO_BENCHMARK'
  );
  const pairDistribution = countBy(records, record => record.context.pair);
  const timeframeDistribution = countBy(records, record => record.context.timeframe);

  return Object.freeze({
    totalSignals: records.length,
    gradeDistribution,
    outcomeDistribution,
    benchmarkStatusDistribution,
    pairDistribution,
    timeframeDistribution,
    mostFrequentPair: findMostFrequent(pairDistribution),
    mostFrequentTimeframe: findMostFrequent(timeframeDistribution),
  });
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

function deriveObservationTimestamp(records: readonly SignalRecord[]): number {
  if (records.length === 0) return 0;
  return Math.max(...records.map(record => record.context.timestamp));
}

function createObservationId(
  query: SignalQuery,
  records: readonly SignalRecord[],
  observationTimestamp: number
): string {
  const candidateIds = records.map(record => record.signalId).sort().join('|');
  const source = `${stableStringify(query)}|${candidateIds}|${observationTimestamp}`;
  return `LEARNING_OBSERVATION_${hashString(source)}`;
}

function createSummary(metrics: LearningObservationMetrics): string {
  return [
    `Signals analysed: ${metrics.totalSignals}`,
    `Most frequent pair: ${metrics.mostFrequentPair ?? 'N/A'}`,
    `Most frequent timeframe: ${metrics.mostFrequentTimeframe ?? 'N/A'}`,
  ].join(' | ');
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
