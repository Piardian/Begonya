import {
  computeGroupMetrics,
  formatMacroOutcomeReport,
  generateMacroOutcomeAnalytics,
} from '../server/macroOutcomeAnalytics';
import { MacroOutcomeEvidenceRecord } from '../server/macroOutcomeEvidence';

describe('MacroOutcomeAnalytics', () => {
  const dummySnapshot = (overrides?: any) => ({
    timestamp: 1700000000000,
    isoTimestamp: '2026-10-01T12:00:00.000Z',
    primaryRegime: 'Risk-On / Growth',
    volatilityRiskScore: 0.3,
    vixLevel: 14.5,
    capitalPreservationMode: false,
    riskMultiplier: 1.0,
    macroGateMultiplier: 1 as const,
    begonyaScore: 90,
    scoreTier: 'A+',
    smcTechnicalScore: 90,
    macroBias: 'LONG_ONLY',
    macroAction: 'PROCEED',
    spreadDeUs2yBps: -180,
    spreadDeUs2yDelta5d: 1.2,
    spreadGbUs2yBps: null,
    spreadGbUs2yDelta5d: null,
    spreadCaUs2yBps: null,
    spreadCaUs2yDelta5d: null,
    spreadAuUs2yBps: null,
    spreadAuUs2yDelta5d: null,
    brentLevel: 75.0,
    brentRoc20d: 0.5,
    copperGoldDelta4wPct: 2.1,
    energyPenaltyActive: false,
    nearestNewsEventName: null,
    nearestNewsCurrency: null,
    nearestNewsImpact: null,
    minutesToNewsEvent: 180,
    newsFreezeActive: false,
    isCrypto: true,
    cryptoRotation: {
      coin: 'BTC',
      sector: 'CORE_RESERVE',
      layer: 0,
      rotationScore: 85,
      rotationGate: 'LONG_ONLY',
      derivativesRegime: 'HEALTHY_ACCUMULATION',
      fundingRatePct: 0.01,
      effectiveRvol: 2.1,
      rsVsBtc24hPct: 0,
      btcDominancePct: 56.5,
    },
    ...overrides,
  });

  const dummyRecord = (
    id: string,
    outcome: 'TP' | 'SL' | 'BE' | 'EXPIRED',
    realizedR: number,
    snapshotOverrides?: any
  ): MacroOutcomeEvidenceRecord => ({
    schemaVersion: 1,
    signalId: id,
    symbol: 'BTCUSD',
    direction: 'long',
    poiType: 'OB',
    grade: 'A',
    smcScore: 85,
    signalTimestamp: 1700000000000,
    entryTimestamp: 1700000900000,
    exitTimestamp: 1700004500000,
    holdingTimeMs: 3600000, // 1 hour
    outcome,
    realizedR,
    entryPrice: 65000,
    exitPrice: outcome === 'TP' ? 66000 : outcome === 'SL' ? 64500 : 65000,
    stopLoss: 64500,
    takeProfit: 66000,
    riskDistance: 500,
    maximumFavorableExcursion: outcome === 'TP' ? 2.1 : 0.8,
    maximumAdverseExcursion: outcome === 'SL' ? 1.0 : 0.3,
    exitReason: `Test outcome ${outcome}`,
    macroSnapshot: dummySnapshot(snapshotOverrides),
    recordedAt: '2026-10-01T13:00:00.000Z',
  });

  test('computes metrics on empty list gracefully', () => {
    const metrics = computeGroupMetrics('EMPTY', []);
    expect(metrics.totalTrades).toBe(0);
    expect(metrics.winRatePct).toBe(0);
    expect(metrics.expectancyR).toBe(0);
  });

  test('computes accurate Win Rate, Expectancy, and Excursions', () => {
    const records = [
      dummyRecord('t1', 'TP', 2.0),
      dummyRecord('t2', 'TP', 2.0),
      dummyRecord('t3', 'SL', -1.0),
      dummyRecord('t4', 'BE', 0.0),
    ];

    const metrics = computeGroupMetrics('TEST_BATCH', records);

    expect(metrics.totalTrades).toBe(4);
    expect(metrics.tpCount).toBe(2);
    expect(metrics.slCount).toBe(1);
    expect(metrics.beCount).toBe(1);
    // Win rate with BE: 2 / (2 + 1 + 1) = 50%
    expect(metrics.winRatePct).toBe(50.0);
    // Win rate without BE: 2 / (2 + 1) = 66.7%
    expect(metrics.winRateExcludingBePct).toBe(66.7);
    // Total R: 2 + 2 - 1 + 0 = 3.0R
    expect(metrics.totalRealizedR).toBe(3.0);
    // Expectancy: 3.0 / 4 = 0.75R
    expect(metrics.expectancyR).toBe(0.75);
    expect(metrics.avgHoldingTimeHours).toBe(1.0);
  });

  test('generates breakdown across macro dimensions', () => {
    const records = [
      dummyRecord('t1', 'TP', 2.0, {
        primaryRegime: 'Risk-On / Growth',
        vixLevel: 13.5,
        scoreTier: 'A+',
        cryptoRotation: { derivativesRegime: 'HEALTHY_ACCUMULATION', sector: 'CORE_RESERVE' },
      }),
      dummyRecord('t2', 'SL', -1.0, {
        primaryRegime: 'Stagflationary Pressure',
        vixLevel: 26.5,
        scoreTier: 'B',
        minutesToNewsEvent: 15,
        newsFreezeActive: true,
        cryptoRotation: { derivativesRegime: 'LEVERAGE_DRIVEN_LONG_SQUEEZE', sector: 'MEME_SECTOR' },
      }),
    ];

    const analytics = generateMacroOutcomeAnalytics(records);

    expect(analytics.overall.totalTrades).toBe(2);
    expect(analytics.byRegime.length).toBe(2);
    expect(analytics.byVixBucket.length).toBe(2);
    expect(analytics.byScoreTier.length).toBe(2);
    expect(analytics.byNewsProximity.length).toBe(2);
    expect(analytics.byDerivativesRegime.length).toBe(2);
    expect(analytics.byCryptoSector.length).toBe(2);
  });

  test('formats comprehensive report string without throwing', () => {
    const records = [dummyRecord('t1', 'TP', 2.0)];
    const analytics = generateMacroOutcomeAnalytics(records);
    const report = formatMacroOutcomeReport(analytics);
    expect(report).toContain('BEGONYA MAKRO-SMC GERÇEK SONUÇ & KANIT RAPORU');
    expect(report).toContain('TOPLAM KAPALI İŞLEM : 1');
    expect(report).toContain('MAKRO PİYASA REJİMLERİNE GÖRE PERFORMANS');
  });

  test('correctly segments ablation cohorts, asset classes, and transaction costs', () => {
    const records: MacroOutcomeEvidenceRecord[] = [
      {
        ...dummyRecord('fx1', 'TP', 2.0),
        symbol: 'EURUSD',
        assetClass: 'FOREX',
        macroGatingCohort: 'MACRO_PLUS_SMC',
        forecastHorizon: 'SCALP_INTRADAY',
        executionSource: 'PAPER',
        entryConfirmed: true,
        spreadCostR: 0.08,
        slippageCostR: 0.02,
        netRealizedR: 1.90,
      },
      {
        ...dummyRecord('crypto1', 'SL', -1.0),
        symbol: 'BTCUSD',
        assetClass: 'CRYPTO',
        macroGatingCohort: 'SMC_ONLY',
        forecastHorizon: 'SWING_4H_24H',
        executionSource: 'LIVE',
        entryConfirmed: true,
        spreadCostR: 0.04,
        slippageCostR: 0.05,
        netRealizedR: -1.09,
      },
    ];

    const analytics = generateMacroOutcomeAnalytics(records);

    // 1. Ablation cohorts
    expect(analytics.byMacroContribution.length).toBeGreaterThanOrEqual(1);
    const macroPlusSmc = analytics.byMacroContribution.find(c => c.groupKey.startsWith('MACRO_PLUS_SMC'));
    expect(macroPlusSmc?.totalTrades).toBe(1);
    expect(macroPlusSmc?.totalNetRealizedR).toBe(1.90);

    // 2. Asset classes strictly segmented
    expect(analytics.byAssetClass.length).toBe(2);
    const forexGroup = analytics.byAssetClass.find(c => c.groupKey.startsWith('FOREX'));
    const cryptoGroup = analytics.byAssetClass.find(c => c.groupKey.startsWith('CRYPTO'));
    expect(forexGroup?.totalTrades).toBe(1);
    expect(forexGroup?.winRatePct).toBe(100.0);
    expect(cryptoGroup?.totalTrades).toBe(1);
    expect(cryptoGroup?.winRatePct).toBe(0.0);

    // 3. Execution sources
    expect(analytics.byExecutionSource.length).toBe(2);
    expect(analytics.byExecutionSource.some(g => g.groupKey.startsWith('PAPER'))).toBe(true);
    expect(analytics.byExecutionSource.some(g => g.groupKey.startsWith('LIVE'))).toBe(true);

    // 4. Report includes new cost columns and sections
    const report = formatMacroOutcomeReport(analytics);
    expect(report).toContain('MAKRO VE SMC AYRI KATKI ANALİZİ');
    expect(report).toContain('VARLIK SINIFI AYRIMI (Forex ve Kripto Ayrı Ölçüm)');
    expect(report).toContain('TAHMİN UFKU VE TAŞINMA VADESİNE GÖRE PERFORMANS');
    expect(report).toContain('Net R');
    expect(report).toContain('Maliyet');
  });
});
