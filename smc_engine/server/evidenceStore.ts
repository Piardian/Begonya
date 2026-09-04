import * as fs from 'fs';
import * as path from 'path';
import { CompletedSignalOutcomeEvidence, SignalEvidenceRecord } from '../src/signalEvidence';

export interface EvidenceStore {
  appendSignalEvidence(record: SignalEvidenceRecord): Promise<void>;
  appendOutcomeEvidence(record: CompletedSignalOutcomeEvidence): Promise<void>;
}

export class JsonlEvidenceStore implements EvidenceStore {
  constructor(private readonly baseDir = process.env.EVIDENCE_DIRECTORY ?? 'evidence') {}

  async appendSignalEvidence(record: SignalEvidenceRecord): Promise<void> {
    await appendJsonl(path.join(this.baseDir, 'signals', 'signal-evidence.jsonl'), record);
  }

  async appendOutcomeEvidence(record: CompletedSignalOutcomeEvidence): Promise<void> {
    await appendJsonl(path.join(this.baseDir, 'outcomes', 'outcome-evidence.jsonl'), record);
  }
}

async function appendJsonl(filePath: string, record: unknown): Promise<void> {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.appendFile(filePath, `${JSON.stringify(record)}\n`, 'utf8');
}
