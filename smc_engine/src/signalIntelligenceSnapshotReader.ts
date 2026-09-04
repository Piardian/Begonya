import {
  SignalIntelligenceSnapshot,
} from './signalIntelligenceSnapshot';
import * as fs from 'fs';
import * as path from 'path';

export interface SnapshotReadEntry {
  id: string;
  raw: string;
  path?: string;
}

export interface SnapshotSource {
  list(): SnapshotReadEntry[];
}

export interface SnapshotReadError {
  id: string;
  path?: string;
  type: 'invalid_json';
  message: string;
}

export interface SnapshotReadResult {
  snapshots: SignalIntelligenceSnapshot[];
  errors: SnapshotReadError[];
}

export class InMemorySnapshotSource implements SnapshotSource {
  constructor(private readonly entries: SnapshotReadEntry[]) {}

  list(): SnapshotReadEntry[] {
    return [...this.entries].sort((a, b) => a.id.localeCompare(b.id));
  }
}

export class FileSignalIntelligenceSnapshotSource implements SnapshotSource {
  constructor(private readonly baseDir = path.join('data', 'signal-intelligence', 'snapshots')) {}

  list(): SnapshotReadEntry[] {
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

export class SignalIntelligenceSnapshotReader {
  constructor(private readonly source: SnapshotSource) {}

  readAll(): SnapshotReadResult {
    const snapshots: SignalIntelligenceSnapshot[] = [];
    const errors: SnapshotReadError[] = [];

    for (const entry of this.source.list()) {
      try {
        snapshots.push(JSON.parse(entry.raw) as SignalIntelligenceSnapshot);
      } catch (err) {
        errors.push({
          id: entry.id,
          path: entry.path,
          type: 'invalid_json',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return { snapshots, errors };
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
