import * as fs from 'fs';
import * as path from 'path';
import { OutcomeResult } from './outcomeResult';

export interface OutcomeReadEntry {
  id: string;
  raw: string;
  path?: string;
}

export interface OutcomeSource {
  list(): OutcomeReadEntry[];
}

export interface OutcomeReadError {
  id: string;
  path?: string;
  type: 'invalid_json';
  message: string;
}

export interface OutcomeReadResult {
  outcomes: OutcomeResult[];
  errors: OutcomeReadError[];
}

export class InMemoryOutcomeSource implements OutcomeSource {
  constructor(private readonly entries: OutcomeReadEntry[]) {}

  list(): OutcomeReadEntry[] {
    return [...this.entries].sort((a, b) => a.id.localeCompare(b.id));
  }
}

export class FileOutcomeSource implements OutcomeSource {
  constructor(private readonly baseDir = path.join('data', 'signal-intelligence', 'outcomes')) {}

  list(): OutcomeReadEntry[] {
    if (!fs.existsSync(this.baseDir)) {
      return [];
    }

    const files = collectJsonFiles(this.baseDir).sort((a, b) => a.localeCompare(b));
    return files.map(filePath => ({
      id: path.relative(this.baseDir, filePath).replace(/\\/g, '/'),
      path: filePath,
      raw: fs.readFileSync(filePath, 'utf8'),
    }));
  }
}

export class OutcomeReader {
  constructor(private readonly source: OutcomeSource) {}

  readAll(): OutcomeReadResult {
    const outcomes: OutcomeResult[] = [];
    const errors: OutcomeReadError[] = [];

    for (const entry of this.source.list()) {
      try {
        outcomes.push(JSON.parse(entry.raw) as OutcomeResult);
      } catch (err) {
        errors.push({
          id: entry.id,
          path: entry.path,
          type: 'invalid_json',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return { outcomes, errors };
  }
}

function collectJsonFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectJsonFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(fullPath);
    }
  }

  return files;
}
