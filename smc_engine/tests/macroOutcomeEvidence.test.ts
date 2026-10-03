import * as fs from 'fs';
import * as path from 'path';
import {
  captureMacroSnapshot,
  createFallbackMacroSnapshot,
  FileMacroOutcomeStore,
  MacroOutcomeEvidenceRecord,
} from '../server/macroOutcomeEvidence';
import { NotificationCandidate } from '../server/pipeline';
import { NewsGuard } from '../server/newsGuard';

function makeCandidate(overrides: Partial<NotificationCandidate>): NotificationCandidate {
  return {
    symbol: 'EURUSD',
    tradeDirection: 'long',
    poiType: 'OB',
    currentPrice: 1.0850,
    poiFormedTimestamp: Date.now() - 3600000,
    bias4H: 'bullish',
    bias1H: 'bullish',
    poiTestCount: 0,
    pd4H: 'discount',
    pd1H: 'discount',
    poi: {
      formedAtIndex: 10,
      low: 1.0840,
      high: 1.0850,
      relatedEvent: {
        breakTimestamp: Date.now() - 1800000,
      },
    } as any,
    gradeResult: {
      grade: 'A',
      totalScore: 85,
      entryAllowed: true,
      breakdown: {} as any,
      blockReasons: [],
    },
    uniqueKey: 'test_eurusd_1',
    ...overrides,
  };
}

describe('MacroOutcomeEvidence & Snapshot Capture', () => {
  const testEvidenceDir = path.join(__dirname, 'tmp_evidence_test');
  const testFilePath = path.join(testEvidenceDir, 'macro-outcome-test.jsonl');

  beforeEach(() => {
    if (fs.existsSync(testEvidenceDir)) {
      fs.rmSync(testEvidenceDir, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(testEvidenceDir)) {
      fs.rmSync(testEvidenceDir, { recursive: true, force: true });
    }
  });

  test('captures complete MacroSnapshot for candidate', () => {
    const candidate = makeCandidate({
      symbol: 'EURUSD',
      tradeDirection: 'long',
      uniqueKey: 'test_eurusd_1',
    });

    const snapshot = captureMacroSnapshot(candidate);

    expect(snapshot).toBeDefined();
    expect(snapshot.timestamp).toBeGreaterThan(0);
    expect(typeof snapshot.primaryRegime).toBe('string');
    expect(typeof snapshot.volatilityRiskScore).toBe('number');
    expect(typeof snapshot.begonyaScore).toBe('number');
    expect(typeof snapshot.scoreTier).toBe('string');
    expect(typeof snapshot.isCrypto).toBe('boolean');
    expect(snapshot.isCrypto).toBe(false);
  });

  test('captures Crypto 8-Factor details for crypto candidate', () => {
    const candidate = makeCandidate({
      symbol: 'BTCUSD',
      tradeDirection: 'short',
      uniqueKey: 'test_btcusd_1',
      gradeResult: {
        grade: 'A+',
        totalScore: 92,
        entryAllowed: true,
        breakdown: {} as any,
        blockReasons: [],
      },
    });

    const snapshot = captureMacroSnapshot(candidate);

    expect(snapshot).toBeDefined();
    expect(snapshot.isCrypto).toBe(true);
  });

  test('reflects NewsGuard proximity in snapshot', () => {
    const newsGuard = NewsGuard.getInstance();
    const eventTime = new Date(Date.now() + 20 * 60 * 1000).toISOString();
    newsGuard.registerEvent({
      id: 'test_cpi',
      name: 'US Core CPI',
      currency: 'USD',
      impact: 'CRITICAL',
      event_time_utc: eventTime,
      affects_all_symbols: true,
      freeze_minutes_before: 15,
      freeze_minutes_after: 15,
    });

    const candidate = makeCandidate({
      symbol: 'EURUSD',
      uniqueKey: 'test_news_1',
    });

    const snapshot = captureMacroSnapshot(candidate);
    expect(snapshot.nearestNewsEventName).toContain('US Core CPI');
    expect(snapshot.minutesToNewsEvent).toBeGreaterThanOrEqual(19);
    expect(snapshot.minutesToNewsEvent).toBeLessThanOrEqual(21);

    newsGuard.clearCustomEvents();
  });

  test('creates fallback snapshot correctly', () => {
    const fallback = createFallbackMacroSnapshot('SOLUSD', 'long', 1700000000000);
    expect(fallback.isCrypto).toBe(true);
    expect(fallback.primaryRegime).toContain('Fallback');
    expect(fallback.begonyaScore).toBe(75);
    expect(fallback.timestamp).toBe(1700000000000);
  });

  test('FileMacroOutcomeStore writes and reads records durably', async () => {
    const store = new FileMacroOutcomeStore(testFilePath);

    const record: MacroOutcomeEvidenceRecord = {
      schemaVersion: 2,
      signalId: 'sig_test_101',
      symbol: 'BTCUSD',
      direction: 'long',
      poiType: 'OB',
      grade: 'A',
      smcScore: 88,
      signalTimestamp: 1700000000000,
      entryTimestamp: 1700000900000,
      exitTimestamp: 1700005400000,
      holdingTimeMs: 4500000,
      outcome: 'TP',
      realizedR: 2.0,
      entryPrice: 64500,
      exitPrice: 65500,
      stopLoss: 64000,
      takeProfit: 65500,
      riskDistance: 500,
      maximumFavorableExcursion: 2.2,
      maximumAdverseExcursion: 0.3,
      exitReason: 'Synthetic take-profit reached at 2R.',
      macroSnapshot: {
        timestamp: 1700000000000,
        isoTimestamp: new Date(1700000000000).toISOString(),
        primaryRegime: 'Risk-On / Growth Accel',
        volatilityRiskScore: 0.35,
        vixLevel: 14.8,
        capitalPreservationMode: false,
        riskMultiplier: 1.0,
        macroGateMultiplier: 1,
        begonyaScore: 88,
        scoreTier: 'A',
        smcTechnicalScore: 88,
        macroBias: 'LONG_ONLY',
        macroAction: 'PROCEED',
        spreadDeUs2yBps: -180,
        spreadDeUs2yDelta5d: 2.5,
        spreadGbUs2yBps: null,
        spreadGbUs2yDelta5d: null,
        spreadCaUs2yBps: null,
        spreadCaUs2yDelta5d: null,
        spreadAuUs2yBps: null,
        spreadAuUs2yDelta5d: null,
        brentLevel: 78.5,
        brentRoc20d: 1.2,
        copperGoldDelta4wPct: 1.5,
        energyPenaltyActive: false,
        nearestNewsEventName: null,
        nearestNewsCurrency: null,
        nearestNewsImpact: null,
        minutesToNewsEvent: null,
        newsFreezeActive: false,
        isCrypto: true,
        pointInTimeVerified: true,
        cryptoRotation: {
          coin: 'BTC',
          sector: 'CORE_RESERVE',
          layer: 0,
          rotationScore: 80,
          rotationGate: 'LONG_ONLY',
          derivativesRegime: 'HEALTHY_ACCUMULATION',
          fundingRatePct: 0.01,
          effectiveRvol: 1.8,
          rsVsBtc24hPct: 0,
          btcDominancePct: 56.4,
        },
      },
      executionSource: 'PAPER',
      entryConfirmed: true,
      fillModel: 'STRICT_BID_ASK',
      spreadCostR: 0.015,
      slippageCostR: 0.02,
      commissionCostR: 0.05,
      totalCostR: 0.085,
      netRealizedR: 1.915,
      assetClass: 'CRYPTO',
      exAnteForecastHorizon: 'SCALP_INTRADAY',
      realizedHoldingDuration: 'SCALP_INTRADAY',
      macroGatingCohort: 'MACRO_APPROVED',
      macroDecisionAtSignal: 'PROCEED',
      signalGeneratedAt: new Date(1700000000000).toISOString(),
      candleClosedAt: new Date(1700000000000).toISOString(),
      entryTriggeredAt: new Date(1700000900000).toISOString(),
      exitOccurredAt: new Date(1700005400000).toISOString(),
      recordedAt: new Date().toISOString(),
      pipelineLatencyMs: 120,
      decisionEngineVersion: 'v2.1.0',
    };

    await store.appendRecord(record);

    const loaded = await store.readAllRecords();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].signalId).toBe('sig_test_101');
    expect(loaded[0].outcome).toBe('TP');
    expect(loaded[0].schemaVersion).toBe(2);
    expect(loaded[0].entryConfirmed).toBe(true);
    expect(loaded[0].macroSnapshot.vixLevel).toBe(14.8);
    expect(loaded[0].macroSnapshot.cryptoRotation?.derivativesRegime).toBe('HEALTHY_ACCUMULATION');
  });
});
