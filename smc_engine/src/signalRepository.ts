import { SignalBenchmark } from './signalBenchmark';
import { SignalContext } from './signalContext';
import { SignalOutcome } from './signalOutcome';

export interface SignalRecord {
  readonly signalId: string;
  readonly context: SignalContext;
  readonly outcome?: SignalOutcome;
  readonly benchmark?: SignalBenchmark;
}

export interface SignalQuery {
  readonly signalId?: string;
  readonly pair?: SignalContext['pair'];
  readonly timeframe?: SignalContext['timeframe'];
  readonly grade?: string;
  readonly outcomeType?: SignalOutcome['outcomeType'];
  readonly benchmarkStatus?: SignalBenchmark['benchmarkStatus'];
}

export interface SignalRepository {
  createSignalRecord(context: SignalContext): SignalRecord;
  updateSignalRecord(context: SignalContext): SignalRecord;
  loadSignalRecord(signalId: string): SignalRecord | undefined;
  findSignal(query: SignalQuery): SignalRecord | undefined;
  listSignals(query?: SignalQuery): readonly SignalRecord[];
  saveOutcome(outcome: SignalOutcome): SignalRecord;
  saveBenchmark(benchmark: SignalBenchmark): SignalRecord;
}

export class InMemorySignalRepository implements SignalRepository {
  private readonly records = new Map<string, SignalRecord>();

  createSignalRecord(context: SignalContext): SignalRecord {
    const existing = this.records.get(context.signalId);
    if (existing) {
      return existing;
    }

    const record = freezeRecord({ signalId: context.signalId, context });
    this.records.set(context.signalId, record);
    return record;
  }

  updateSignalRecord(context: SignalContext): SignalRecord {
    const existing = this.records.get(context.signalId);
    const record = freezeRecord({
      signalId: context.signalId,
      context,
      outcome: existing?.outcome,
      benchmark: existing?.benchmark,
    });
    this.records.set(context.signalId, record);
    return record;
  }

  loadSignalRecord(signalId: string): SignalRecord | undefined {
    return this.records.get(signalId);
  }

  findSignal(query: SignalQuery): SignalRecord | undefined {
    return this.listSignals(query)[0];
  }

  listSignals(query: SignalQuery = {}): readonly SignalRecord[] {
    return Object.freeze(
      [...this.records.values()].filter(record => matchesQuery(record, query))
    );
  }

  saveOutcome(outcome: SignalOutcome): SignalRecord {
    const existing = this.records.get(outcome.signalId);
    const context = existing?.context ?? createMissingContext(outcome.signalId, outcome.timestamp);
    const record = freezeRecord({
      signalId: outcome.signalId,
      context,
      outcome,
      benchmark: existing?.benchmark,
    });
    this.records.set(outcome.signalId, record);
    return record;
  }

  saveBenchmark(benchmark: SignalBenchmark): SignalRecord {
    const existing = this.records.get(benchmark.signalId);
    const context = existing?.context ?? createMissingContext(benchmark.signalId, benchmark.benchmarkTimestamp);
    const record = freezeRecord({
      signalId: benchmark.signalId,
      context,
      outcome: existing?.outcome,
      benchmark,
    });
    this.records.set(benchmark.signalId, record);
    return record;
  }
}

export class NoopSignalRepository implements SignalRepository {
  createSignalRecord(context: SignalContext): SignalRecord {
    return freezeRecord({ signalId: context.signalId, context });
  }

  updateSignalRecord(context: SignalContext): SignalRecord {
    return freezeRecord({ signalId: context.signalId, context });
  }

  loadSignalRecord(_signalId: string): SignalRecord | undefined {
    return undefined;
  }

  findSignal(): SignalRecord | undefined {
    return undefined;
  }

  listSignals(): readonly SignalRecord[] {
    return Object.freeze([]);
  }

  saveOutcome(outcome: SignalOutcome): SignalRecord {
    return freezeRecord({
      signalId: outcome.signalId,
      context: createMissingContext(outcome.signalId, outcome.timestamp),
      outcome,
    });
  }

  saveBenchmark(benchmark: SignalBenchmark): SignalRecord {
    return freezeRecord({
      signalId: benchmark.signalId,
      context: createMissingContext(benchmark.signalId, benchmark.benchmarkTimestamp),
      benchmark,
    });
  }
}

function matchesQuery(record: SignalRecord, query: SignalQuery): boolean {
  if (query.signalId && record.signalId !== query.signalId) return false;
  if (query.pair && record.context.pair !== query.pair) return false;
  if (query.timeframe && record.context.timeframe !== query.timeframe) return false;
  if (query.grade && record.context.grade !== query.grade) return false;
  if (query.outcomeType && record.outcome?.outcomeType !== query.outcomeType) return false;
  if (query.benchmarkStatus && record.benchmark?.benchmarkStatus !== query.benchmarkStatus) return false;
  return true;
}

function freezeRecord(record: SignalRecord): SignalRecord {
  return Object.freeze({ ...record });
}

function createMissingContext(signalId: string, timestamp: number): SignalContext {
  return Object.freeze({
    signalId,
    pair: 'EURUSD',
    direction: 'long',
    timeframe: '15m',
    timestamp,
    lifecycle: Object.freeze({
      states: Object.freeze(['DETECTED'] as const),
      currentState: 'DETECTED' as const,
    }),
  });
}
