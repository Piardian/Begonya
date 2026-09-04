import * as fs from 'fs';
import * as path from 'path';
import { OutcomeResult } from '../src/outcomeResult';
import type { Symbol } from './universe';

export interface OutcomeWriter {
  write(outcome: OutcomeResult, context: { symbol: Symbol; timeframe: '15m' }): void;
}

export class FileOutcomeWriter implements OutcomeWriter {
  constructor(private readonly baseDir = path.join('data', 'signal-intelligence', 'outcomes')) {}

  write(outcome: OutcomeResult, context: { symbol: Symbol; timeframe: '15m' }): void {
    const dir = path.join(this.baseDir, context.symbol, context.timeframe);
    fs.mkdirSync(dir, { recursive: true });

    const filePath = path.join(dir, `${sanitizeFileName(outcome.candidateId)}.json`);
    const tempFilePath = `${filePath}.tmp`;
    fs.writeFileSync(tempFilePath, `${JSON.stringify(outcome, null, 2)}\n`, 'utf8');
    fs.renameSync(tempFilePath, filePath);
  }
}

function sanitizeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}
