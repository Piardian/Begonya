import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FileSignalLedger } from '../server/signalLedger';
import type { NotificationCandidate } from '../server/pipeline';
import type { RuntimeExecutionPipelineResult } from '../server/runtimeExecutionPipeline';

function buildCandidate(): NotificationCandidate {
  return {
    symbol: 'EURUSD',
    tradeDirection: 'long',
    poiType: 'OB',
    poi: {
      direction: 'bullish',
      low: 1.099,
      high: 1.101,
      formedAtIndex: 0,
      relatedEvent: {
        type: 'BOS',
        direction: 'bullish',
        breakTimestamp: 1_700_000_000_000,
        breakCandleIndex: 0,
      },
    } as any,
    gradeResult: {
      grade: 'A',
      totalScore: 8,
      entryAllowed: true,
      blockReasons: [],
      breakdown: {
        htfBiasPD: 2,
        displacement: 2,
        structure: 2,
        sweep: 1,
        poiQuality: 1,
      },
    },
    uniqueKey: 'EURUSD-15m-1700000000000-OB',
    signalId: 'signal-ledger-test-1',
    currentPrice: 1.1002,
    marketDataTimestamp: 1_700_000_060_000,
    poiFormedTimestamp: 1_700_000_000_000,
    bias4H: 'bullish',
    bias1H: 'bullish',
    poiTestCount: 0,
    pd4H: 'discount',
    pd1H: 'discount',
    pd15M: 'eq',
    admissionProfile: 'PRODUCTION',
    macroEvaluation: {
      allowed: true,
      action: 'PROCEED',
      symbol: 'EURUSD',
      mappedMacroKey: 'EURUSD',
      tradeDirection: 'long',
      macroBias: 'bullish',
      primaryRegime: 'normal',
      riskMultiplier: 1,
      capitalPreservationMode: false,
      btcDecouplingActive: false,
      macroRationale: 'test',
      gateStatusMessage: 'allowed',
      macroGateMultiplier: 1,
      smcTechnicalScore: 80,
      begonyaScore: 80,
      scoreTier: 'A',
      tierRationale: 'test',
    },
  };
}

function buildExecution(): RuntimeExecutionPipelineResult {
  return {
    engineResult: {
      engineReference: { engineMode: 'SIMULATION' },
    },
    paperResult: {
      paperExecutionReference: { paperExecutionId: 'paper:test' },
      items: [{ paperStatus: 'COMPLETED' }],
    },
    riskResult: {
      items: [{
        riskStatus: 'ACCEPTED',
        evaluation: { executionAllowed: true },
      }],
    },
  } as unknown as RuntimeExecutionPipelineResult;
}

describe('FileSignalLedger', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'begonya-signal-ledger-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('persists one SIGNAL_ISSUED event and is idempotent', async () => {
    const ledger = new FileSignalLedger(tempDir);
    const candidate = buildCandidate();
    const execution = buildExecution();

    const first = await ledger.recordSignalIssued({ candidate, execution });
    const second = await ledger.recordSignalIssued({ candidate, execution });

    expect(second).toEqual(first);

    const filePath = path.join(tempDir, 'signal-ledger-test-1.jsonl');
    const lines = fs.readFileSync(filePath, 'utf8').trim().split(/\r?\n/);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({
      eventType: 'SIGNAL_ISSUED',
      signalId: 'signal-ledger-test-1',
      payload: {
        symbol: 'EURUSD',
        observedMarketPrice: 1.1002,
        entryAllowed: true,
        execution: {
          realExecutionTracked: false,
          entryPrice: null,
          realizedR: null,
        },
        macro: {
          macroGateMultiplier: 1,
          begonyaScore: 80,
        },
      },
    });
  });

  test('enforces signal -> entry -> exit lifecycle', async () => {
    const ledger = new FileSignalLedger(tempDir);
    const signalId = 'signal-ledger-test-2';

    await expect(ledger.recordEntry(signalId, {
      executionSource: 'PAPER',
      entryTimestamp: 1,
      entryPrice: 1.1,
      brokerOrderId: null,
      positionId: null,
      slippageBps: null,
    })).rejects.toThrow('SIGNAL_ISSUED is required');

    await ledger.recordSignalIssued({ candidate: { ...buildCandidate(), signalId }, execution: buildExecution() });

    await ledger.recordEntry(signalId, {
      executionSource: 'PAPER',
      entryTimestamp: 2,
      entryPrice: 1.1001,
      brokerOrderId: null,
      positionId: 'paper-position-1',
      slippageBps: 0.5,
    });

    await ledger.recordExit(signalId, {
      executionSource: 'PAPER',
      exitTimestamp: 3,
      exitPrice: 1.1021,
      outcome: 'TAKE_PROFIT',
      realizedR: 2,
      holdingTimeMs: 1,
      slippageBps: 0.5,
    });

    const filePath = path.join(tempDir, `${signalId}.jsonl`);
    const events = fs.readFileSync(filePath, 'utf8').trim().split(/\r?\n/).map(line => JSON.parse(line));
    expect(events.map(event => event.eventType)).toEqual([
      'SIGNAL_ISSUED',
      'ENTRY_RECORDED',
      'EXIT_RECORDED',
    ]);
  });

  test('rejects exit without entry and duplicate entry/exit', async () => {
    const ledger = new FileSignalLedger(tempDir);
    const signalId = 'signal-ledger-test-3';
    await ledger.recordSignalIssued({ candidate: { ...buildCandidate(), signalId }, execution: buildExecution() });

    await expect(ledger.recordExit(signalId, {
      executionSource: 'MANUAL',
      exitTimestamp: 3,
      exitPrice: 1.101,
      outcome: 'UNKNOWN',
      realizedR: null,
      holdingTimeMs: null,
      slippageBps: null,
    })).rejects.toThrow('ENTRY_RECORDED is required');

    await ledger.recordEntry(signalId, {
      executionSource: 'MANUAL',
      entryTimestamp: 2,
      entryPrice: 1.1,
      brokerOrderId: 'broker-1',
      positionId: 'position-1',
      slippageBps: 0,
    });

    await expect(ledger.recordEntry(signalId, {
      executionSource: 'MANUAL',
      entryTimestamp: 2,
      entryPrice: 1.1001,
      brokerOrderId: 'broker-2',
      positionId: 'position-2',
      slippageBps: 0,
    })).rejects.toThrow('ENTRY_RECORDED already exists');

    await ledger.recordExit(signalId, {
      executionSource: 'MANUAL',
      exitTimestamp: 3,
      exitPrice: 1.099,
      outcome: 'STOP_LOSS',
      realizedR: -1,
      holdingTimeMs: 1,
      slippageBps: 0,
    });

    await expect(ledger.recordExit(signalId, {
      executionSource: 'MANUAL',
      exitTimestamp: 4,
      exitPrice: 1.098,
      outcome: 'STOP_LOSS',
      realizedR: -1.2,
      holdingTimeMs: 2,
      slippageBps: 0,
    })).rejects.toThrow('EXIT_RECORDED already exists');
  });
});
