import * as fs from 'fs';
import * as path from 'path';

export interface RuntimeTraceEntry {
  readonly signalId: string;
  readonly file: string;
  readonly functionName: string;
  readonly timestamp: string;
  readonly input?: unknown;
  readonly output?: unknown;
  readonly note?: string;
}

export function recordRuntimeTrace(entry: RuntimeTraceEntry): void {
  ensureTraceDir();
  const filePath = path.join(traceDir(), 'runtime-trace.jsonl');
  fs.appendFileSync(filePath, `${JSON.stringify({ ...entry, timestamp: new Date().toISOString() })}\n`, 'utf8');
}

function traceDir(): string {
  return process.env.TELEMETRY_DIRECTORY || 'telemetry';
}

function ensureTraceDir(): void {
  fs.mkdirSync(traceDir(), { recursive: true });
}
