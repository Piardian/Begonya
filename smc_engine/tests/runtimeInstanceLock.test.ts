import * as fs from 'fs';
import * as path from 'path';
import { acquireRuntimeInstanceLock } from '../server/runtimeInstanceLock';

describe('runtime instance lock', () => {
  const testDir = path.join(__dirname, 'temp_runtime_instance_lock_test');

  beforeEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  afterAll(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  test('rejects a second live bot process', () => {
    const first = acquireRuntimeInstanceLock({
      dataDir: testDir,
      pid: 101,
      now: () => 1_000,
      isProcessRunning: pid => pid === 101,
    });

    expect(() => acquireRuntimeInstanceLock({
      dataDir: testDir,
      pid: 202,
      now: () => 2_000,
      isProcessRunning: pid => pid === 101,
    })).toThrow('Bot is already running with PID 101.');

    first.release();
    expect(fs.existsSync(path.join(testDir, 'runtime.lock'))).toBe(false);
  });

  test('removes a stale lock and lets the replacement own it', () => {
    acquireRuntimeInstanceLock({
      dataDir: testDir,
      pid: 101,
      now: () => 1_000,
      isProcessRunning: () => false,
    });

    const replacement = acquireRuntimeInstanceLock({
      dataDir: testDir,
      pid: 202,
      now: () => 2_000,
      isProcessRunning: () => false,
    });

    expect(JSON.parse(fs.readFileSync(replacement.filePath, 'utf8'))).toEqual(expect.objectContaining({
      pid: 202,
      acquiredAt: new Date(2_000).toISOString(),
    }));
    replacement.touch?.();
    replacement.release();
  });
});

