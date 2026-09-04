import * as fs from 'fs';
import * as path from 'path';

export class NotifiedStore {
  private dataDir: string;
  private pending = new Set<string>();

  constructor(dataDir = 'data') {
    this.dataDir = dataDir;
  }

  private getFilePath(): string {
    return path.join(this.dataDir, 'notified_pois.json');
  }

  hasBeenNotified(uniqueKey: string): boolean {
    if (this.pending.has(uniqueKey)) return true;
    return this.hasDurablyBeenNotified(uniqueKey);
  }

  hasDurablyBeenNotified(uniqueKey: string): boolean {
    const filePath = this.getFilePath();
    if (!fs.existsSync(filePath)) {
      return false;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const keys: string[] = JSON.parse(content);
      return keys.includes(uniqueKey);
    } catch (e) {
      return false;
    }
  }

  markPending(uniqueKey: string): void { this.pending.add(uniqueKey); }
  clearPending(uniqueKey: string): void { this.pending.delete(uniqueKey); }

  reservePending(keys: readonly string[]): boolean {
    const uniqueKeys = [...new Set(keys.filter(Boolean))];
    if (uniqueKeys.some(key => this.hasBeenNotified(key))) return false;
    for (const key of uniqueKeys) this.pending.add(key);
    return true;
  }

  markAsNotified(uniqueKey: string): void {
    this.pending.delete(uniqueKey);
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }

    const filePath = this.getFilePath();
    let keys: string[] = [];

    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        keys = JSON.parse(content);
      } catch (e) {
        keys = [];
      }
    }

    if (!keys.includes(uniqueKey)) {
      keys.push(uniqueKey);
    }

    // Limit to 1000 keys (prune oldest 500)
    if (keys.length > 1000) {
      keys = keys.slice(keys.length - 500);
    }

    // Safe atomic write logic
    const tempFilePath = `${filePath}.${Date.now()}.${Math.random().toString(36).substring(2, 6)}.tmp`;
    try {
      fs.writeFileSync(tempFilePath, JSON.stringify(keys, null, 2), 'utf8');
      try {
        fs.renameSync(tempFilePath, filePath);
      } catch {
        fs.copyFileSync(tempFilePath, filePath);
        try { fs.unlinkSync(tempFilePath); } catch {}
      }
    } catch {
      fs.writeFileSync(filePath, JSON.stringify(keys, null, 2), 'utf8');
    }
  }
}
