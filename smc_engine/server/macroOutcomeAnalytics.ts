import { MacroOutcomeEvidenceRecord } from './macroOutcomeEvidence';

export interface GroupPerformanceMetrics {
  readonly groupKey: string;
  readonly candidateCount: number;
  readonly filledTradesCount: number;
  readonly fillRatePct: number;
  readonly expiredCount: number;
  readonly cancelledCount: number;

  // Realized execution metrics (computed strictly on confirmed filled trades)
  readonly totalTrades: number; // Alias for filledTradesCount for backward compatibility
  readonly tpCount: number;
  readonly slCount: number;
  readonly beCount: number;
  readonly winRatePct: number;
  readonly winRateExcludingBePct: number;
  readonly stopOutRatePct: number;
  readonly totalRealizedR: number;
  readonly expectancyR: number;
  readonly totalNetRealizedR: number;
  readonly netExpectancyR: number;
  readonly avgCostR: number;
  readonly avgMfeR: number;
  readonly avgMaeR: number;
  readonly avgHoldingTimeHours: number;

  // Statistical Rigor & Uncertainty Bounds (95% Confidence Intervals)
  readonly winRateLower95: number;
  readonly winRateUpper95: number;
  readonly netExpectancyLower95: number;
  readonly netExpectancyUpper95: number;
  readonly sampleAdequacy: 'INSUFFICIENT' | 'LOW' | 'ADEQUATE' | 'ROBUST';
  readonly pValueWinRate: number;
  readonly pValueExpectancy: number;

  // Causal edge attribution (if applicable)
  readonly avoidedLossR?: number;
}

export interface MacroOutcomeReportSummary {
  readonly overall: GroupPerformanceMetrics;
  readonly byMacroContribution: readonly GroupPerformanceMetrics[];
  readonly byAssetClass: readonly GroupPerformanceMetrics[];
  readonly byForecastHorizon: readonly GroupPerformanceMetrics[];
  readonly byExecutionSource: readonly GroupPerformanceMetrics[];
  readonly byRegime: readonly GroupPerformanceMetrics[];
  readonly byVixBucket: readonly GroupPerformanceMetrics[];
  readonly byScoreTier: readonly GroupPerformanceMetrics[];
  readonly byNewsProximity: readonly GroupPerformanceMetrics[];
  readonly byDerivativesRegime: readonly GroupPerformanceMetrics[];
  readonly byCryptoSector: readonly GroupPerformanceMetrics[];
  readonly bySymbolDirection: readonly GroupPerformanceMetrics[];
  readonly byCryptoFactors?: readonly GroupPerformanceMetrics[];
}

export interface AnalyticsFilterOptions {
  readonly allowSources?: readonly ('TEST' | 'PAPER' | 'LIVE')[];
  readonly requireEntryConfirmed?: boolean;
}

function standardNormalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

function computeWilsonScoreInterval(p: number, n: number): [number, number] {
  if (n <= 0) return [0, 0];
  const z = 1.95996; // 95% Confidence level
  const z2 = z * z;
  const center = (p + z2 / (2 * n)) / (1 + z2 / n);
  const margin = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
  return [
    Math.max(0, Math.round((center - margin) * 1000) / 10),
    Math.min(100, Math.round((center + margin) * 1000) / 10),
  ];
}

function computeExpectancyInterval(values: readonly number[]): [number, number] {
  const n = values.length;
  if (n <= 1) return [0, 0];
  const mean = values.reduce((sum, v) => sum + v, 0) / n;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (n - 1);
  const stdError = Math.sqrt(variance / n);
  const margin = 1.96 * stdError;
  return [
    Math.round((mean - margin) * 100) / 100,
    Math.round((mean + margin) * 100) / 100,
  ];
}

export function computeGroupMetrics(
  groupKey: string,
  records: readonly MacroOutcomeEvidenceRecord[]
): GroupPerformanceMetrics {
  const candidateCount = records.length;
  if (candidateCount === 0) {
    return {
      groupKey,
      candidateCount: 0,
      filledTradesCount: 0,
      fillRatePct: 0,
      expiredCount: 0,
      cancelledCount: 0,
      totalTrades: 0,
      tpCount: 0,
      slCount: 0,
      beCount: 0,
      winRatePct: 0,
      winRateExcludingBePct: 0,
      stopOutRatePct: 0,
      totalRealizedR: 0,
      expectancyR: 0,
      totalNetRealizedR: 0,
      netExpectancyR: 0,
      avgCostR: 0,
      avgMfeR: 0,
      avgMaeR: 0,
      avgHoldingTimeHours: 0,
      winRateLower95: 0,
      winRateUpper95: 0,
      netExpectancyLower95: 0,
      netExpectancyUpper95: 0,
      sampleAdequacy: 'INSUFFICIENT',
      pValueWinRate: 0.5,
      pValueExpectancy: 0.5,
    };
  }

  // 1. Candidate vs Filled Trade Separation
  const filledRecords = records.filter(r => r.entryConfirmed === true);
  const filledTradesCount = filledRecords.length;
  const fillRatePct = Math.round((filledTradesCount / candidateCount) * 1000) / 10;

  const expiredCount = records.filter(r => r.outcome === 'EXPIRED').length;
  const cancelledCount = records.filter(r => r.outcome === 'CANCELLED' || (!r.entryConfirmed && r.outcome !== 'EXPIRED')).length;

  if (filledTradesCount === 0) {
    return {
      groupKey,
      candidateCount,
      filledTradesCount: 0,
      fillRatePct,
      expiredCount,
      cancelledCount,
      totalTrades: 0,
      tpCount: 0,
      slCount: 0,
      beCount: 0,
      winRatePct: 0,
      winRateExcludingBePct: 0,
      stopOutRatePct: 0,
      totalRealizedR: 0,
      expectancyR: 0,
      totalNetRealizedR: 0,
      netExpectancyR: 0,
      avgCostR: 0,
      avgMfeR: 0,
      avgMaeR: 0,
      avgHoldingTimeHours: 0,
      winRateLower95: 0,
      winRateUpper95: 0,
      netExpectancyLower95: 0,
      netExpectancyUpper95: 0,
      sampleAdequacy: 'INSUFFICIENT',
      pValueWinRate: 0.5,
      pValueExpectancy: 0.5,
    };
  }

  // 2. Performance metrics strictly on confirmed filled trades
  let tpCount = 0;
  let slCount = 0;
  let beCount = 0;
  let sumGrossR = 0;
  let sumNetR = 0;
  let sumCostR = 0;
  let sumMfe = 0;
  let sumMae = 0;
  let sumHoldingHours = 0;
  let holdingCount = 0;
  const netRList: number[] = [];

  for (const r of filledRecords) {
    if (r.outcome === 'TP') tpCount++;
    else if (r.outcome === 'SL') slCount++;
    else if (r.outcome === 'BE') beCount++;

    const grossR = typeof r.realizedR === 'number' ? r.realizedR : 0;
    const netR = typeof r.netRealizedR === 'number' ? r.netRealizedR : grossR;
    const costR = typeof r.totalCostR === 'number' ? r.totalCostR : 0;

    sumGrossR += grossR;
    sumNetR += netR;
    sumCostR += costR;
    netRList.push(netR);

    sumMfe += r.maximumFavorableExcursion ?? 0;
    sumMae += r.maximumAdverseExcursion ?? 0;

    if (r.holdingTimeMs !== null && r.holdingTimeMs > 0) {
      sumHoldingHours += r.holdingTimeMs / (3600 * 1000);
      holdingCount++;
    }
  }

  const finishedTrades = tpCount + slCount + beCount;
  const winRatePct = finishedTrades > 0 ? (tpCount / finishedTrades) * 100 : 0;
  const winLossTotal = tpCount + slCount;
  const winRateExcludingBePct = winLossTotal > 0 ? (tpCount / winLossTotal) * 100 : 0;
  const stopOutRatePct = (slCount / filledTradesCount) * 100;

  const totalRealizedR = Math.round(sumGrossR * 100) / 100;
  const expectancyR = Math.round((sumGrossR / filledTradesCount) * 100) / 100;
  const totalNetRealizedR = Math.round(sumNetR * 100) / 100;
  const netExpectancyR = Math.round((sumNetR / filledTradesCount) * 100) / 100;
  const avgCostR = Math.round((sumCostR / filledTradesCount) * 1000) / 1000;
  const avgMfeR = Math.round((sumMfe / filledTradesCount) * 100) / 100;
  const avgMaeR = Math.round((sumMae / filledTradesCount) * 100) / 100;
  const avgHoldingTimeHours = holdingCount > 0 ? Math.round((sumHoldingHours / holdingCount) * 10) / 10 : 0;

  // 3. Statistical Rigor (Confidence Intervals & p-values)
  const [winRateLower95, winRateUpper95] = computeWilsonScoreInterval(winRatePct / 100, finishedTrades);
  const [netExpectancyLower95, netExpectancyUpper95] = computeExpectancyInterval(netRList);

  const sampleAdequacy: 'INSUFFICIENT' | 'LOW' | 'ADEQUATE' | 'ROBUST' =
    filledTradesCount < 10 ? 'INSUFFICIENT'
    : filledTradesCount < 30 ? 'LOW'
    : filledTradesCount < 100 ? 'ADEQUATE'
    : 'ROBUST';

  // p-value test against H0: Win Rate <= 50%
  const seWin = Math.sqrt(0.25 / Math.max(1, finishedTrades));
  const zWin = (winRatePct / 100 - 0.50) / seWin;
  const pValueWinRate = Math.round((1 - standardNormalCdf(zWin)) * 1000) / 1000;

  // p-value test against H0: Expectancy <= 0
  const varNet = netRList.length > 1
    ? netRList.reduce((s, v) => s + (v - netExpectancyR) ** 2, 0) / (netRList.length - 1)
    : 1;
  const seExp = Math.sqrt(varNet / Math.max(1, filledTradesCount));
  const zExp = netExpectancyR / (seExp > 0 ? seExp : 1);
  const pValueExpectancy = Math.round((1 - standardNormalCdf(zExp)) * 1000) / 1000;

  return {
    groupKey,
    candidateCount,
    filledTradesCount,
    fillRatePct,
    expiredCount,
    cancelledCount,
    totalTrades: filledTradesCount,
    tpCount,
    slCount,
    beCount,
    winRatePct: Math.round(winRatePct * 10) / 10,
    winRateExcludingBePct: Math.round(winRateExcludingBePct * 10) / 10,
    stopOutRatePct: Math.round(stopOutRatePct * 10) / 10,
    totalRealizedR,
    expectancyR,
    totalNetRealizedR,
    netExpectancyR,
    avgCostR,
    avgMfeR,
    avgMaeR,
    avgHoldingTimeHours,
    winRateLower95,
    winRateUpper95,
    netExpectancyLower95,
    netExpectancyUpper95,
    sampleAdequacy,
    pValueWinRate,
    pValueExpectancy,
  };
}

export function generateMacroOutcomeAnalytics(
  records: readonly MacroOutcomeEvidenceRecord[],
  options?: AnalyticsFilterOptions
): MacroOutcomeReportSummary {
  const allowedSources = options?.allowSources ?? ['PAPER', 'LIVE'];

  // Strict filtering: Exclude test fixtures, legacy unverified records, and demo signals
  const validRecords = records.filter(r => {
    if (!r.executionSource) return false;
    if (!allowedSources.includes(r.executionSource)) return false;
    if (r.signalId.startsWith('test_') || r.signalId.includes('demo')) return false;
    if (options?.requireEntryConfirmed && !r.entryConfirmed) return false;
    return true;
  });

  // Zero-fallback guarantee: If no valid records exist, return clean empty metrics (never fall back to dirty records)
  const effectiveRecords = validRecords;

  const overall = computeGroupMetrics('TOTAL', effectiveRecords);

  // A. Causal Macro Ablation (All SMC Candidates vs Macro Approved vs Macro Blocked)
  const macroMap = new Map<string, MacroOutcomeEvidenceRecord[]>();
  macroMap.set('ALL_SMC_BASELINE (Tüm SMC Sinyal Adayları)', []);
  macroMap.set('MACRO_APPROVED (Makro Onaylı SMC)', []);
  macroMap.set('MACRO_BLOCKED (Makro Tarafından Engellenen / Shadow)', []);
  macroMap.set('MACRO_ONLY (Yalnızca Makro Yön Eğilimi)', []);

  for (const r of effectiveRecords) {
    macroMap.get('ALL_SMC_BASELINE (Tüm SMC Sinyal Adayları)')!.push(r);

    const cohort = r.macroGatingCohort ?? (r.macroSnapshot?.macroAction === 'PROCEED' ? 'MACRO_APPROVED' : 'MACRO_BLOCKED');
    if (cohort === 'MACRO_APPROVED' || (cohort as string) === 'MACRO_PLUS_SMC') {
      macroMap.get('MACRO_APPROVED (Makro Onaylı SMC)')!.push(r);
    } else {
      macroMap.get('MACRO_BLOCKED (Makro Tarafından Engellenen / Shadow)')!.push(r);
    }

    const dir = r.direction;
    const mb = r.macroSnapshot?.macroBias;
    if ((dir === 'long' && (mb === 'LONG_ONLY' || mb === 'Bullish')) ||
        (dir === 'short' && (mb === 'SHORT_ONLY' || mb === 'Bearish'))) {
      macroMap.get('MACRO_ONLY (Yalnızca Makro Yön Eğilimi)')!.push(r);
    }
  }

  const byMacroContribution = Array.from(macroMap.entries())
    .filter(([, list]) => list.length > 0)
    .map(([k, list]) => computeGroupMetrics(k, list));

  // B. By Asset Class (FOREX vs. CRYPTO - Never blended!)
  const assetMap = new Map<string, MacroOutcomeEvidenceRecord[]>();
  for (const r of effectiveRecords) {
    const rawClass = r.assetClass || (r.macroSnapshot?.isCrypto ? 'CRYPTO' : 'FOREX');
    const label = rawClass.startsWith('FOREX') ? 'FOREX (Döviz Çiftleri)'
      : rawClass === 'CRYPTO' ? 'CRYPTO (Kripto Varlıklar)'
      : rawClass === 'COMMODITY' ? 'COMMODITY (Emtia / Altın)'
      : rawClass === 'INDEX' ? 'INDEX (Hisse Endeksleri)'
      : rawClass;
    if (!assetMap.has(label)) assetMap.set(label, []);
    assetMap.get(label)!.push(r);
  }
  const byAssetClass = Array.from(assetMap.entries()).map(([k, list]) => computeGroupMetrics(k, list));

  // C. By Ex-Ante Forecast Horizon (Intended duration determined at setup, NOT ex-post holding time)
  const horizonMap = new Map<string, MacroOutcomeEvidenceRecord[]>();
  horizonMap.set('SCALP_INTRADAY (< 4 Saat)', []);
  horizonMap.set('SWING_4H_24H (4 - 24 Saat)', []);
  horizonMap.set('MULTI_DAY (> 24 Saat)', []);

  for (const r of effectiveRecords) {
    const horizon = r.exAnteForecastHorizon ?? 'SCALP_INTRADAY';
    if (horizon === 'SCALP_INTRADAY') horizonMap.get('SCALP_INTRADAY (< 4 Saat)')!.push(r);
    else if (horizon === 'SWING_4H_24H') horizonMap.get('SWING_4H_24H (4 - 24 Saat)')!.push(r);
    else horizonMap.get('MULTI_DAY (> 24 Saat)')!.push(r);
  }
  const byForecastHorizon = Array.from(horizonMap.entries())
    .filter(([, list]) => list.length > 0)
    .map(([k, list]) => computeGroupMetrics(k, list));

  // D. By Execution Source
  const sourceMap = new Map<string, MacroOutcomeEvidenceRecord[]>();
  for (const r of effectiveRecords) {
    const src = r.executionSource ?? 'PAPER';
    const label = src === 'LIVE' ? 'LIVE (Gerçek İcra)'
      : src === 'PAPER' ? 'PAPER (Simülasyon / Paper Trade)'
      : 'TEST (Sentetik Test)';
    if (!sourceMap.has(label)) sourceMap.set(label, []);
    sourceMap.get(label)!.push(r);
  }
  const byExecutionSource = Array.from(sourceMap.entries()).map(([k, list]) => computeGroupMetrics(k, list));

  // 1. By Primary Regime
  const regimeMap = new Map<string, MacroOutcomeEvidenceRecord[]>();
  for (const r of effectiveRecords) {
    const reg = r.macroSnapshot?.primaryRegime ?? 'Bilinmeyen Rejim';
    if (!regimeMap.has(reg)) regimeMap.set(reg, []);
    regimeMap.get(reg)!.push(r);
  }
  const byRegime = Array.from(regimeMap.entries()).map(([k, list]) => computeGroupMetrics(k, list));

  // 2. By VIX Volatility Bucket
  const vixMap = new Map<string, MacroOutcomeEvidenceRecord[]>();
  vixMap.set('Düşük Oynaklık (VIX < 15)', []);
  vixMap.set('Normal Oynaklık (15 <= VIX <= 22)', []);
  vixMap.set('Yüksek Oynaklık (VIX > 22)', []);
  vixMap.set('VIX Verisi Yok / Kripto', []);

  for (const r of effectiveRecords) {
    const vix = r.macroSnapshot?.vixLevel;
    if (typeof vix !== 'number') vixMap.get('VIX Verisi Yok / Kripto')!.push(r);
    else if (vix < 15) vixMap.get('Düşük Oynaklık (VIX < 15)')!.push(r);
    else if (vix <= 22) vixMap.get('Normal Oynaklık (15 <= VIX <= 22)')!.push(r);
    else vixMap.get('Yüksek Oynaklık (VIX > 22)')!.push(r);
  }
  const byVixBucket = Array.from(vixMap.entries())
    .filter(([, list]) => list.length > 0)
    .map(([k, list]) => computeGroupMetrics(k, list));

  // 3. By Score Tier
  const tierMap = new Map<string, MacroOutcomeEvidenceRecord[]>();
  for (const r of effectiveRecords) {
    const tier = r.macroSnapshot?.scoreTier ? `Tier ${r.macroSnapshot.scoreTier}` : 'Bilinmeyen Tier';
    if (!tierMap.has(tier)) tierMap.set(tier, []);
    tierMap.get(tier)!.push(r);
  }
  const byScoreTier = Array.from(tierMap.entries()).map(([k, list]) => computeGroupMetrics(k, list));

  // 4. By News Proximity
  const newsMap = new Map<string, MacroOutcomeEvidenceRecord[]>();
  newsMap.set('Kritik Haber Bölgesi (<= 30 dk veya Donma)', []);
  newsMap.set('Yakın Haber (31 - 120 dk)', []);
  newsMap.set('Sakin Piyasa (> 120 dk veya Haber Yok)', []);

  for (const r of effectiveRecords) {
    const minutes = r.macroSnapshot?.minutesToNewsEvent;
    const freeze = r.macroSnapshot?.newsFreezeActive;
    if (freeze || (typeof minutes === 'number' && minutes <= 30)) {
      newsMap.get('Kritik Haber Bölgesi (<= 30 dk veya Donma)')!.push(r);
    } else if (typeof minutes === 'number' && minutes <= 120) {
      newsMap.get('Yakın Haber (31 - 120 dk)')!.push(r);
    } else {
      newsMap.get('Sakin Piyasa (> 120 dk veya Haber Yok)')!.push(r);
    }
  }
  const byNewsProximity = Array.from(newsMap.entries())
    .filter(([, list]) => list.length > 0)
    .map(([k, list]) => computeGroupMetrics(k, list));

  // 5. By Crypto Derivatives Regime
  const derivMap = new Map<string, MacroOutcomeEvidenceRecord[]>();
  for (const r of effectiveRecords) {
    const dReg = r.macroSnapshot?.cryptoRotation?.derivativesRegime;
    if (!dReg) continue;
    if (!derivMap.has(dReg)) derivMap.set(dReg, []);
    derivMap.get(dReg)!.push(r);
  }
  const byDerivativesRegime = Array.from(derivMap.entries()).map(([k, list]) => computeGroupMetrics(k, list));

  // 6. By Crypto Sector
  const sectorMap = new Map<string, MacroOutcomeEvidenceRecord[]>();
  for (const r of effectiveRecords) {
    const sec = r.macroSnapshot?.cryptoRotation?.sector;
    if (!sec) continue;
    if (!sectorMap.has(sec)) sectorMap.set(sec, []);
    sectorMap.get(sec)!.push(r);
  }
  const byCryptoSector = Array.from(sectorMap.entries()).map(([k, list]) => computeGroupMetrics(k, list));

  // 7. By Symbol & Direction
  const symMap = new Map<string, MacroOutcomeEvidenceRecord[]>();
  for (const r of effectiveRecords) {
    const key = `${r.symbol} ${r.direction.toUpperCase()}`;
    if (!symMap.has(key)) symMap.set(key, []);
    symMap.get(key)!.push(r);
  }
  const bySymbolDirection = Array.from(symMap.entries()).map(([k, list]) => computeGroupMetrics(k, list));

  // 8. Factor Isolation (Funding Rate, RVOL, RS vs BTC)
  const factorMap = new Map<string, MacroOutcomeEvidenceRecord[]>();
  factorMap.set('Funding: Negatif (< -0.01%)', []);
  factorMap.set('Funding: Nötr / Düşük Pozitif (-0.01% - +0.02%)', []);
  factorMap.set('Funding: Yüksek Pozitif (> +0.02%)', []);
  factorMap.set('RVOL: Yüksek Hacim (> 1.5x)', []);
  factorMap.set('RVOL: Normal / Düşük (<= 1.5x)', []);

  for (const r of effectiveRecords) {
    const rot = r.macroSnapshot?.cryptoRotation;
    if (rot) {
      if (rot.fundingRatePct < -0.01) factorMap.get('Funding: Negatif (< -0.01%)')!.push(r);
      else if (rot.fundingRatePct <= 0.02) factorMap.get('Funding: Nötr / Düşük Pozitif (-0.01% - +0.02%)')!.push(r);
      else factorMap.get('Funding: Yüksek Pozitif (> +0.02%)')!.push(r);

      if (rot.effectiveRvol > 1.5) factorMap.get('RVOL: Yüksek Hacim (> 1.5x)')!.push(r);
      else factorMap.get('RVOL: Normal / Düşük (<= 1.5x)')!.push(r);
    }
  }

  const byCryptoFactors = Array.from(factorMap.entries())
    .filter(([, list]) => list.length > 0)
    .map(([k, list]) => computeGroupMetrics(k, list));

  return {
    overall,
    byMacroContribution,
    byAssetClass,
    byForecastHorizon,
    byExecutionSource,
    byRegime,
    byVixBucket,
    byScoreTier,
    byNewsProximity,
    byDerivativesRegime,
    byCryptoSector,
    bySymbolDirection,
    byCryptoFactors,
  };
}

export function formatMacroOutcomeReport(summary: MacroOutcomeReportSummary): string {
  const lines: string[] = [];
  lines.push('═════════════════════════════════════════════════════════════════════════════════════════════════════');
  lines.push('                   BEGONYA MAKRO-SMC DOĞRULANMIŞ İCRA VE NEDENSEL KANIT RAPORU                       ');
  lines.push('═════════════════════════════════════════════════════════════════════════════════════════════════════');
  lines.push(`TOPLAM ADAY SİNYAL    : ${summary.overall.candidateCount}`);
  lines.push(`GERÇEKLEŞEN İŞLEM (Fill): ${summary.overall.filledTradesCount} (Dolum Oranı: %${summary.overall.fillRatePct})`);
  lines.push(`VADESİ DOLAN / İPTAL   : ${summary.overall.expiredCount} Expired, ${summary.overall.cancelledCount} Cancelled`);
  lines.push(`KAZANMA ORANI (WinRate): %${summary.overall.winRatePct.toFixed(1)} [95% CI: %${summary.overall.winRateLower95} - %${summary.overall.winRateUpper95}] (p=${summary.overall.pValueWinRate})`);
  lines.push(`BRÜT BEKLENTİ (Gross R): ${summary.overall.expectancyR.toFixed(2)}R | NET BEKLENTİ: ${summary.overall.netExpectancyR.toFixed(2)}R [95% CI: ${summary.overall.netExpectancyLower95}R - ${summary.overall.netExpectancyUpper95}R]`);
  lines.push(`İŞLEM MALİYETİ (Ort.)  : -${summary.overall.avgCostR.toFixed(2)}R | NET GERÇEKLEŞEN TOPLAM: ${summary.overall.totalNetRealizedR.toFixed(1)}R`);
  lines.push(`ÖRNEKLEM YETERLİLİĞİ  : ${summary.overall.sampleAdequacy} (N=${summary.overall.filledTradesCount})`);
  lines.push('');

  const renderTable = (title: string, groups: readonly GroupPerformanceMetrics[]) => {
    if (groups.length === 0) return;
    lines.push(`─── ${title} ───`);
    lines.push(
      'Grup / Kategori'.padEnd(38) +
      'Aday'.padStart(5) +
      'Fill'.padStart(5) +
      'TP'.padStart(4) +
      'SL'.padStart(4) +
      'Win%'.padStart(7) +
      '95% CI'.padStart(14) +
      'Maliyet'.padStart(8) +
      'Net R'.padStart(9) +
      'Net Exp'.padStart(9) +
      'Yeterlilik'.padStart(12)
    );
    lines.push('─'.repeat(115));

    for (const m of groups) {
      const netSign = m.totalNetRealizedR > 0 ? '+' : '';
      const expSign = m.netExpectancyR > 0 ? '+' : '';
      const ciStr = `[%${m.winRateLower95}-%${m.winRateUpper95}]`;
      lines.push(
        m.groupKey.padEnd(38).slice(0, 38) +
        String(m.candidateCount).padStart(5) +
        String(m.filledTradesCount).padStart(5) +
        String(m.tpCount).padStart(4) +
        String(m.slCount).padStart(4) +
        `${m.winRatePct.toFixed(1)}%`.padStart(7) +
        ciStr.padStart(14) +
        `-${m.avgCostR.toFixed(2)}R`.padStart(8) +
        `${netSign}${m.totalNetRealizedR.toFixed(1)}R`.padStart(9) +
        `${expSign}${m.netExpectancyR.toFixed(2)}R`.padStart(9) +
        m.sampleAdequacy.padStart(12)
      );
    }
    lines.push('');
  };

  renderTable('A. NEDENSEL MAKRO ABLASYON ANALİZİ (Baseline vs. Makro Onaylı vs. Engellenen)', summary.byMacroContribution);
  renderTable('B. VARLIK SINIFI AYRIMI (Forex ve Kripto Ayrı Ölçüm)', summary.byAssetClass);
  renderTable('C. EX-ANTE TAHMİN UFKUNA GÖRE PERFORMANS (Setup Anındaki Plan)', summary.byForecastHorizon);
  renderTable('D. İCRA KAYNAĞINA GÖRE PERFORMANS (Paper vs. Live)', summary.byExecutionSource);
  renderTable('E. FAKTÖR BAZINDA PERFORMANS AYRIŞTIRMASI (Funding & RVOL Katkısı)', summary.byCryptoFactors ?? []);
  renderTable('1. MAKRO PİYASA REJİMLERİNE GÖRE PERFORMANS', summary.byRegime);
  renderTable('2. VIX OYNAKLIK SEVİYELERİNE GÖRE PERFORMANS', summary.byVixBucket);
  renderTable('3. BEGONYA PUAN VE TIER KALİTESİNE GÖRE PERFORMANS', summary.byScoreTier);
  renderTable('4. NEWSGUARD HABER YAKINLIĞINA GÖRE PERFORMANS', summary.byNewsProximity);
  renderTable('5. KRİPTO 8-FAKTÖR TÜREV REJİMİNE GÖRE PERFORMANS', summary.byDerivativesRegime);
  renderTable('6. KRİPTO SEKTÖRLERİNE GÖRE PERFORMANS', summary.byCryptoSector);
  renderTable('7. ENSTRÜMAN VE YÖNLERE GÖRE PERFORMANS', summary.bySymbolDirection);

  lines.push('═════════════════════════════════════════════════════════════════════════════════════════════════════');
  return lines.join('\n');
}
