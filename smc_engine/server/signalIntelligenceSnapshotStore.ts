import * as fs from 'fs';
import * as path from 'path';
import { SignalIntelligenceSnapshot } from '../src/signalIntelligenceSnapshot';

export interface SignalIntelligenceSnapshotWriter {
  write(snapshot: SignalIntelligenceSnapshot): void;
}

export class FileSignalIntelligenceSnapshotWriter implements SignalIntelligenceSnapshotWriter {
  constructor(private readonly baseDir = path.join('data', 'signal-intelligence', 'snapshots')) {}

  write(snapshot: SignalIntelligenceSnapshot): void {
    const dir = path.join(this.baseDir, snapshot.symbol, snapshot.timeframe);
    fs.mkdirSync(dir, { recursive: true });

    const filePath = path.join(dir, `${sanitizeFileName(snapshot.candidateId)}.json`);
    const tempFilePath = `${filePath}.tmp`;
    fs.writeFileSync(tempFilePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
    fs.renameSync(tempFilePath, filePath);
  }
}

function sanitizeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}
