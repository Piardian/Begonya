import { MacroOutcomeEvidenceRecord } from './macroOutcomeEvidence';

export interface GroupPerformanceMetrics {
  readonly groupKey: string;
  readonly totalTrades: number;
  readonly tpCount: number;
  readonly slCount: number;
  readonly beCount: number;
  readonly expiredCount: number;
  readonly winRatePct: number;
  readonly winRateExcludingBePct: number;
  readonly stopOutRatePct: number;
  readonly totalRealizedR: number;
  readonly expectancyR: number;
  readonly avgMfeR: number;
  readonly avgMaeR: number;
  readonly avgHoldingTimeHours: number;
}

export interface MacroOutcomeReportSummary {
  readonly overall: GroupPerformanceMetrics;
  readonly byRegime: readonly GroupPerformanceMetrics[];
  readonly byVixBucket: readonly GroupPerformanceMetrics[];
  readonly byScoreTier: readonly GroupPerformanceMetrics[];
  readonly byNewsProximity: readonly GroupPerformanceMetrics[];
  readonly byDerivativesRegime: readonly GroupPerformanceMetrics[];
  readonly byCryptoSector: readonly GroupPerformanceMetrics[];
  readonly bySymbolDirection: readonly GroupPerformanceMetrics[];
}

export function computeGroupMetrics(
  groupKey: string,
  records: readonly MacroOutcomeEvidenceRecord[]
): GroupPerformanceMetrics {
  const totalTrades = records.length;
  if (totalTrades === 0) {
    return {
      groupKey,
      totalTrades: 0,
      tpCount: 0,
      slCount: 0,
      beCount: 0,
      expiredCount: 0,
      winRatePct: 0,
      winRateExcludingBePct: 0,
      stopOutRatePct: 0,
      totalRealizedR: 0,
      expectancyR: 0,
      avgMfeR: 0,
      avgMaeR: 0,
      avgHoldingTimeHours: 0,
    };
  }

  let tpCount = 0;
  let slCount = 0;
  let beCount = 0;
  let expiredCount = 0;
  let sumRealizedR = 0;
  let sumMfe = 0;
  let sumMae = 0;
  let sumHoldingHours = 0;
  let holdingCount = 0;

  for (const r of records) {
    if (r.outcome === 'TP') tpCount++;
    else if (r.outcome === 'SL') slCount++;
    else if (r.outcome === 'BE') beCount++;
    else if (r.outcome === 'EXPIRED') expiredCount++;

    if (typeof r.realizedR === 'number') {
      sumRealizedR += r.realizedR;
    }
    sumMfe += r.maximumFavorableExcursion ?? 0;
    sumMae += r.maximumAdverseExcursion ?? 0;

    if (typeof r.holdingTimeMs === 'number') {
      sumHoldingHours += r.holdingTimeMs / (1000 * 60 * 60);
      holdingCount++;
    }
  }

  const finishedTrades = tpCount + slCount + beCount;
  const winRatePct = finishedTrades > 0 ? (tpCount / finishedTrades) * 100 : 0;
  const winLossTotal = tpCount + slCount;
  const winRateExcludingBePct = winLossTotal > 0 ? (tpCount / winLossTotal) * 100 : 0;
  const stopOutRatePct = totalTrades > 0 ? (slCount / totalTrades) * 100 : 0;
  const totalRealizedR = Math.round(sumRealizedR * 100) / 100;
  const expectancyR = Math.round((sumRealizedR / totalTrades) * 100) / 100;
  const avgMfeR = Math.round((sumMfe / totalTrades) * 100) / 100;
  const avgMaeR = Math.round((sumMae / totalTrades) * 100) / 100;
  const avgHoldingTimeHours = holdingCount > 0 ? Math.round((sumHoldingHours / holdingCount) * 10) / 10 : 0;

  return {
    groupKey,
    totalTrades,
    tpCount,
    slCount,
    beCount,
    expiredCount,
    winRatePct: Math.round(winRatePct * 10) / 10,
    winRateExcludingBePct: Math.round(winRateExcludingBePct * 10) / 10,
    stopOutRatePct: Math.round(stopOutRatePct * 10) / 10,
    totalRealizedR,
    expectancyR,
    avgMfeR,
    avgMaeR,
    avgHoldingTimeHours,
  };
}

export function generateMacroOutcomeAnalytics(
  records: readonly MacroOutcomeEvidenceRecord[]
): MacroOutcomeReportSummary {
  const overall = computeGroupMetrics('TOTAL', records);

  // 1. By Primary Macro Regime
  const regimeMap = new Map<string, MacroOutcomeEvidenceRecord[]>();
  for (const r of records) {
    const key = r.macroSnapshot?.primaryRegime || 'Bilinmeyen Rejim';
    if (!regimeMap.has(key)) regimeMap.set(key, []);
    regimeMap.get(key)!.push(r);
  }
  const byRegime = Array.from(regimeMap.entries()).map(([k, list]) => computeGroupMetrics(k, list));

  // 2. By VIX Buckets
  const vixMap = new Map<string, MacroOutcomeEvidenceRecord[]>();
  vixMap.set('VIX < 16 (Sakin / Risk-On)', []);
  vixMap.set('VIX 16-22 (Normal / Geçiş)', []);
  vixMap.set('VIX > 22 (Yüksek Oynaklık / Kriz)', []);
  vixMap.set('VIX Belirsiz / Yok', []);

  for (const r of records) {
    const vix = r.macroSnapshot?.vixLevel;
    if (typeof vix === 'number') {
      if (vix < 16) vixMap.get('VIX < 16 (Sakin / Risk-On)')!.push(r);
      else if (vix <= 22) vixMap.get('VIX 16-22 (Normal / Geçiş)')!.push(r);
      else vixMap.get('VIX > 22 (Yüksek Oynaklık / Kriz)')!.push(r);
    } else {
      vixMap.get('VIX Belirsiz / Yok')!.push(r);
    }
  }
  const byVixBucket = Array.from(vixMap.entries())
    .filter(([, list]) => list.length > 0)
    .map(([k, list]) => computeGroupMetrics(k, list));

  // 3. By Begonya Score Tier
  const tierMap = new Map<string, MacroOutcomeEvidenceRecord[]>();
  for (const r of records) {
    const key = `Tier ${r.macroSnapshot?.scoreTier || 'Belirsiz'} (Skor: ${r.macroSnapshot?.begonyaScore ?? 'N/A'})`;
    if (!tierMap.has(key)) tierMap.set(key, []);
    tierMap.get(key)!.push(r);
  }
  const byScoreTier = Array.from(tierMap.entries()).map(([k, list]) => computeGroupMetrics(k, list));

  // 4. By NewsGuard Proximity
  const newsMap = new Map<string, MacroOutcomeEvidenceRecord[]>();
  newsMap.set('Kritik Haber < 45 Dk (Haber Yakın)', []);
  newsMap.set('Haber 45-120 Dk (Orta Mesafe)', []);
  newsMap.set('Haber > 120 Dk / Yok (Temiz)', []);

  for (const r of records) {
    const mins = r.macroSnapshot?.minutesToNewsEvent;
    if (typeof mins === 'number') {
      const absMins = Math.abs(mins);
      if (absMins < 45 || r.macroSnapshot?.newsFreezeActive) newsMap.get('Kritik Haber < 45 Dk (Haber Yakın)')!.push(r);
      else if (absMins <= 120) newsMap.get('Haber 45-120 Dk (Orta Mesafe)')!.push(r);
      else newsMap.get('Haber > 120 Dk / Yok (Temiz)')!.push(r);
    } else {
      newsMap.get('Haber > 120 Dk / Yok (Temiz)')!.push(r);
    }
  }
  const byNewsProximity = Array.from(newsMap.entries())
    .filter(([, list]) => list.length > 0)
    .map(([k, list]) => computeGroupMetrics(k, list));

  // 5. By Crypto Derivatives Regime
  const derivMap = new Map<string, MacroOutcomeEvidenceRecord[]>();
  for (const r of records) {
    if (r.macroSnapshot?.isCrypto && r.macroSnapshot?.cryptoRotation) {
      const key = r.macroSnapshot.cryptoRotation.derivativesRegime || 'Türev Verisi Yok';
      if (!derivMap.has(key)) derivMap.set(key, []);
      derivMap.get(key)!.push(r);
    }
  }
  const byDerivativesRegime = Array.from(derivMap.entries()).map(([k, list]) => computeGroupMetrics(k, list));

  // 6. By Crypto Sector
  const sectorMap = new Map<string, MacroOutcomeEvidenceRecord[]>();
  for (const r of records) {
    if (r.macroSnapshot?.isCrypto && r.macroSnapshot?.cryptoRotation) {
      const key = r.macroSnapshot.cryptoRotation.sector || 'Sektörsüz';
      if (!sectorMap.has(key)) sectorMap.set(key, []);
      sectorMap.get(key)!.push(r);
    }
  }
  const byCryptoSector = Array.from(sectorMap.entries()).map(([k, list]) => computeGroupMetrics(k, list));

  // 7. By Symbol & Direction
  const symDirMap = new Map<string, MacroOutcomeEvidenceRecord[]>();
  for (const r of records) {
    const key = `${r.symbol} ${r.direction.toUpperCase()}`;
    if (!symDirMap.has(key)) symDirMap.set(key, []);
    symDirMap.get(key)!.push(r);
  }
  const bySymbolDirection = Array.from(symDirMap.entries()).map(([k, list]) => computeGroupMetrics(k, list));

  return {
    overall,
    byRegime,
    byVixBucket,
    byScoreTier,
    byNewsProximity,
    byDerivativesRegime,
    byCryptoSector,
    bySymbolDirection,
  };
}

export function formatMacroOutcomeReport(summary: MacroOutcomeReportSummary): string {
  const lines: string[] = [];

  lines.push('═══════════════════════════════════════════════════════════════════════════════════');
  lines.push('               🌺 BEGONYA MAKRO-SMC GERÇEK SONUÇ & KANIT RAPORU');
  lines.push('═══════════════════════════════════════════════════════════════════════════════════');
  lines.push('');

  const o = summary.overall;
  lines.push(`📊 TOPLAM KAPALI İŞLEM : ${o.totalTrades}`);
  lines.push(`🎯 TP: ${o.tpCount} | 🛑 SL: ${o.slCount} | ⚖️ BE: ${o.beCount} | ⏳ Expired: ${o.expiredCount}`);
  lines.push(`📈 Win Rate (BE dahil) : %${o.winRatePct.toFixed(1)}`);
  lines.push(`📈 Win Rate (BE hariç) : %${o.winRateExcludingBePct.toFixed(1)}`);
  lines.push(`💰 Toplam Kazanılan R  : ${o.totalRealizedR > 0 ? '+' : ''}${o.totalRealizedR.toFixed(2)}R`);
  lines.push(`📐 İşlem Başına Beklenti: ${o.expectancyR > 0 ? '+' : ''}${o.expectancyR.toFixed(2)}R / işlem`);
  lines.push(`🚀 Ort. MFE (Zirve Kâr): ${o.avgMfeR.toFixed(2)}R | 📉 Ort. MAE (Dip Zarar): ${o.avgMaeR.toFixed(2)}R`);
  lines.push(`⏱️ Ort. Taşınma Süresi : ${o.avgHoldingTimeHours.toFixed(1)} saat`);
  lines.push('');

  const renderTable = (title: string, metrics: readonly GroupPerformanceMetrics[]) => {
    lines.push(`─── ${title} ───`);
    if (metrics.length === 0) {
      lines.push('  (Henüz kayıtlı veri bulunmuyor)');
      lines.push('');
      return;
    }
    lines.push(
      'Kategori'.padEnd(38) +
      'İşlem'.padStart(6) +
      'TP'.padStart(5) +
      'SL'.padStart(5) +
      'BE'.padStart(5) +
      'Win %'.padStart(8) +
      'Top R'.padStart(9) +
      'Ort R'.padStart(8)
    );
    lines.push('─'.repeat(84));
    for (const m of metrics) {
      const sign = m.totalRealizedR > 0 ? '+' : '';
      const expSign = m.expectancyR > 0 ? '+' : '';
      lines.push(
        m.groupKey.slice(0, 36).padEnd(38) +
        String(m.totalTrades).padStart(6) +
        String(m.tpCount).padStart(5) +
        String(m.slCount).padStart(5) +
        String(m.beCount).padStart(5) +
        `${m.winRatePct.toFixed(1)}%`.padStart(8) +
        `${sign}${m.totalRealizedR.toFixed(1)}R`.padStart(9) +
        `${expSign}${m.expectancyR.toFixed(2)}R`.padStart(8)
      );
    }
    lines.push('');
  };

  renderTable('1. MAKRO PİYASA REJİMLERİNE GÖRE PERFORMANS', summary.byRegime);
  renderTable('2. VIX OYNAKLIK SEVİYELERİNE GÖRE PERFORMANS', summary.byVixBucket);
  renderTable('3. BEGONYA PUAN VE TIER KALİTESİNE GÖRE PERFORMANS', summary.byScoreTier);
  renderTable('4. NEWSGUARD HABER YAKINLIĞINA GÖRE PERFORMANS', summary.byNewsProximity);
  renderTable('5. KRİPTO 8-FAKTÖR TÜREV REJİMİNE GÖRE PERFORMANS', summary.byDerivativesRegime);
  renderTable('6. KRİPTO SEKTÖRLERİNE GÖRE PERFORMANS', summary.byCryptoSector);
  renderTable('7. ENSTRÜMAN VE YÖNLERE GÖRE PERFORMANS', summary.bySymbolDirection);

  lines.push('═══════════════════════════════════════════════════════════════════════════════════');
  return lines.join('\n');
}
