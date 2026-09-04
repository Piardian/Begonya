import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';

interface RuntimeLockRecord {
  readonly pid: number;
  readonly acquiredAt: string;
  readonly updatedAt?: string;
}

export interface RuntimeInstanceLock {
  readonly filePath: string;
  readonly pid: number;
  release(): void;
  touch?(): void;
}

export interface RuntimeInstanceLockOptions {
  readonly dataDir?: string;
  readonly pid?: number;
  readonly now?: () => number;
  readonly isProcessRunning?: (pid: number) => boolean;
}

export function acquireRuntimeInstanceLock(
  options: RuntimeInstanceLockOptions = {}
): RuntimeInstanceLock {
  const dataDir = options.dataDir ?? 'data';
  const pid = options.pid ?? process.pid;
  const now = options.now ?? Date.now;
  const isProcessRunning = options.isProcessRunning ?? defaultIsProcessRunning;
  const filePath = path.join(dataDir, 'runtime.lock');

  fs.mkdirSync(dataDir, { recursive: true });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const acquiredAt = new Date(now()).toISOString();
      const descriptor = fs.openSync(filePath, 'wx');
      try {
        fs.writeFileSync(descriptor, JSON.stringify({ pid, acquiredAt, updatedAt: acquiredAt } satisfies RuntimeLockRecord), 'utf8');
      } finally {
        fs.closeSync(descriptor);
      }

      let released = false;
      return Object.freeze({
        filePath,
        pid,
        touch: () => {
          if (released) return;
          try {
            const current = readLock(filePath);
            if (current?.pid === pid) {
              const updatedAt = new Date(now()).toISOString();
              fs.writeFileSync(filePath, JSON.stringify({ pid, acquiredAt, updatedAt } satisfies RuntimeLockRecord), 'utf8');
            }
          } catch {
            // Ignore touch errors
          }
        },
        release: () => {
          if (released) return;
          released = true;
          try {
            const current = readLock(filePath);
            if (current?.pid === pid && current.acquiredAt === acquiredAt) {
              fs.unlinkSync(filePath);
            }
          } catch (error) {
            if (!isFileMissing(error)) throw error;
          }
        },
      });
    } catch (error) {
      if (!isAlreadyExists(error)) throw error;

      const existing = readLock(filePath);
      if (existing && isProcessRunning(existing.pid)) {
        throw new Error(`Bot is already running with PID ${existing.pid}.`);
      }

      try {
        fs.unlinkSync(filePath);
      } catch (unlinkError) {
        if (!isFileMissing(unlinkError)) throw unlinkError;
      }
    }
  }

  throw new Error('Unable to acquire runtime instance lock.');
}

function readLock(filePath: string): RuntimeLockRecord | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<RuntimeLockRecord>;
    if (typeof parsed.pid !== 'number' || typeof parsed.acquiredAt !== 'string') return null;
    return {
      pid: parsed.pid,
      acquiredAt: parsed.acquiredAt,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : undefined,
    };
  } catch (error) {
    if (isFileMissing(error)) return null;
    return null;
  }
}

export function defaultIsProcessRunning(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  if (pid === process.pid) return true;

  if (process.platform === 'win32') {
    try {
      const output = execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 3000,
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      const normalized = output.trim().toLowerCase();
      if (!normalized || normalized.includes('no tasks') || normalized.includes('info:')) {
        return false;
      }
      return normalized.includes('node') || normalized.includes('npm') || normalized.includes('ts-node');
    } catch {
      return false;
    }
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function isAlreadyExists(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'EEXIST';
}

function isFileMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT';
}

