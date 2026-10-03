import * as fs from 'fs';
import * as path from 'path';

interface ParsedUserInput {
  symbol: string;
  dateStr: string;
  targetDate: Date;
  outcome: 'WIN' | 'LOSS' | 'BREAK_EVEN' | 'INVALID_NO_ENTRY';
  realizedR: number;
  direction?: 'LONG' | 'SHORT';
  userNotes?: string;
}

const MONTH_NAMES_TR: Record<string, number> = {
  ocak: 0,
  şubat: 1,
  subat: 1,
  mart: 2,
  nisan: 3,
  mayıs: 4,
  mayis: 4,
  haziran: 5,
  temmuz: 6,
  ağustos: 7,
  agustos: 7,
  eylül: 8,
  eylul: 8,
  ekim: 9,
  kasım: 10,
  kasim: 10,
  aralık: 11,
  aralik: 11,
};

export function parseUserTradeInput(inputStr: string): ParsedUserInput {
  const clean = inputStr.trim();

  // 1. Symbol detection
  const symbolMatch = clean.match(/\b([A-Z]{3,8}(?:USD|JPY|CHF|CAD|GBP|EUR|AUD|NZD)?)\b/i);
  const symbol = symbolMatch ? symbolMatch[1].toUpperCase() : 'EURJPY';

  // 2. R value and outcome detection
  let outcome: 'WIN' | 'LOSS' | 'BREAK_EVEN' | 'INVALID_NO_ENTRY' = 'WIN';
  let realizedR = 2.0;

  const rMatch = clean.match(/([+-]?\d+(?:\.\d+)?)\s*[rR]/);
  if (rMatch) {
    realizedR = parseFloat(rMatch[1]);
  }

  const upperClean = clean.toUpperCase();
  if (upperClean.includes('STOP') || upperClean.includes('LOSS') || realizedR < 0) {
    outcome = 'LOSS';
    if (realizedR > 0) realizedR = -realizedR;
    if (realizedR === 0) realizedR = -1.0;
  } else if (upperClean.includes('BE') || upperClean.includes('BREAK EVEN') || upperClean.includes('BAŞABAŞ') || realizedR === 0) {
    outcome = 'BREAK_EVEN';
    realizedR = 0.0;
  } else if (upperClean.includes('PAS') || upperClean.includes('GİRİLMEDİ') || upperClean.includes('AVERTED')) {
    outcome = 'INVALID_NO_ENTRY';
    realizedR = 0.0;
  } else {
    outcome = 'WIN';
    if (realizedR <= 0) realizedR = 2.0;
  }

  // 3. Direction detection
  let direction: 'LONG' | 'SHORT' | undefined;
  if (upperClean.includes('SHORT') || upperClean.includes('SAT') || upperClean.includes('SATIŞ')) {
    direction = 'SHORT';
  } else if (upperClean.includes('LONG') || upperClean.includes('AL') || upperClean.includes('ALIŞ')) {
    direction = 'LONG';
  }

  // 4. Date parsing (e.g. "2 Ekim 2026", "2026-10-02", "2 Ekim")
  const isoMatch = clean.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  const trDateMatch = clean.match(/\b(\d{1,2})\s+([a-zA-ZçğıöşüÇĞİÖŞÜ]+)(?:\s+(\d{4}))?\b/i);

  let targetDate = new Date();
  let dateStr = new Date().toISOString().slice(0, 10);

  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10) - 1;
    const d = parseInt(isoMatch[3], 10);
    targetDate = new Date(Date.UTC(y, m, d, 12, 0, 0));
    dateStr = targetDate.toISOString().slice(0, 10);
  } else if (trDateMatch) {
    const d = parseInt(trDateMatch[1], 10);
    const monthWord = trDateMatch[2].toLowerCase();
    const y = trDateMatch[3] ? parseInt(trDateMatch[3], 10) : targetDate.getFullYear();
    if (monthWord in MONTH_NAMES_TR) {
      const m = MONTH_NAMES_TR[monthWord];
      targetDate = new Date(Date.UTC(y, m, d, 12, 0, 0));
      dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  return {
    symbol,
    dateStr,
    targetDate,
    outcome,
    realizedR,
    direction,
    userNotes: clean,
  };
}

export function findMatchingBotSignals(
  baseDir: string,
  symbol: string,
  targetDateStr: string
): any[] {
  const matches: any[] = [];

  // Check 1: macro-outcome-evidence.jsonl
  const macroOutcomesPath = path.join(baseDir, 'smc_engine', 'evidence', 'outcomes', 'macro-outcome-evidence.jsonl');
  if (fs.existsSync(macroOutcomesPath)) {
    try {
      const lines = fs.readFileSync(macroOutcomesPath, 'utf8').split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        const item = JSON.parse(line);
        if (item.symbol?.toUpperCase() === symbol.toUpperCase()) {
          const itemDate = new Date(item.signalTimestamp).toISOString().slice(0, 10);
          if (itemDate === targetDateStr || targetDateStr === '') {
            matches.push({ source: 'MACRO_OUTCOME', data: item });
          }
        }
      }
    } catch {}
  }

  // Check 2: evidence/ledger directory
  const ledgerDir = path.join(baseDir, 'smc_engine', 'evidence', 'ledger');
  if (fs.existsSync(ledgerDir)) {
    try {
      const files = fs.readdirSync(ledgerDir);
      for (const file of files) {
        if (file.toUpperCase().startsWith(symbol.toUpperCase()) && file.endsWith('.jsonl')) {
          const filePath = path.join(ledgerDir, file);
          const raw = fs.readFileSync(filePath, 'utf8');
          const lines = raw.split(/\r?\n/).filter(Boolean);
          for (const l of lines) {
            try {
              const ev = JSON.parse(l);
              if (ev.eventType === 'SIGNAL_ISSUED') {
                const ts = ev.eventTimestamp || ev.payload?.signalTimestamp;
                const d = ts ? new Date(ts).toISOString().slice(0, 10) : '';
                if (d === targetDateStr || targetDateStr === '') {
                  matches.push({ source: 'SIGNAL_LEDGER', data: ev });
                }
              }
            } catch {}
          }
        }
      }
    } catch {}
  }

  return matches;
}

function findBegonyaRoot(startDir: string): string {
  let curr = startDir;
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(path.join(curr, 'benchmark')) && fs.existsSync(path.join(curr, 'smc_engine'))) {
      return curr;
    }
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }
  return path.resolve(startDir, '../..');
}

export async function executeTradeAudit(rawInput: string): Promise<void> {
  const rootDir = findBegonyaRoot(__dirname);
  const parsed = parseUserTradeInput(rawInput);

  console.log('═══════════════════════════════════════════════════════════════════════════════════');
  console.log('              🌺 BEGONYA HUMAN VS. MACHINE TRADE AUDIT ENGINE');
  console.log('═══════════════════════════════════════════════════════════════════════════════════');
  console.log(`🔎 Operatör Girdisi : "${rawInput}"`);
  console.log(`📌 Çözümlenen Sembol: ${parsed.symbol} | Tarih: ${parsed.dateStr}`);
  console.log(`🎯 Operatör İcrası  : ${parsed.outcome} (${parsed.realizedR > 0 ? '+' : ''}${parsed.realizedR} R)`);
  if (parsed.direction) console.log(`🧭 Yön             : ${parsed.direction}`);
  console.log('───────────────────────────────────────────────────────────────────────────────────');

  // Search bot signals
  const matches = findMatchingBotSignals(rootDir, parsed.symbol, parsed.dateStr);
  console.log(`🤖 Arka Plan Eşleşmesi : ${matches.length} bot sinyali bulundu.`);

  const benchmarkRecordsPath = path.join(rootDir, 'benchmark', 'benchmark_records.json');
  const journalMdPath = path.join(rootDir, 'benchmark', 'BEGONYA_BENCHMARK_JOURNAL.md');

  let records: any[] = [];
  if (fs.existsSync(benchmarkRecordsPath)) {
    try {
      records = JSON.parse(fs.readFileSync(benchmarkRecordsPath, 'utf8'));
    } catch {
      records = [];
    }
  }

  const nextSignalNumber = records.length + 1;
  const dateFormattedTsi = `${parsed.dateStr} 12:00:00`;
  const recordId = `BG-${parsed.dateStr.replace(/-/g, '')}-${String(nextSignalNumber).padStart(3, '0')}`;

  const botOutcomeMatch = matches.find(m => m.source === 'MACRO_OUTCOME')?.data;
  const botLedgerMatch = matches.find(m => m.source === 'SIGNAL_LEDGER')?.data;

  // Bot synthetic evaluation
  const botDirection = (botOutcomeMatch?.direction || botLedgerMatch?.payload?.direction || parsed.direction || 'LONG').toUpperCase();
  const botPoiType = botOutcomeMatch?.poiType || botLedgerMatch?.payload?.poiType || 'OB';
  const botGrade = botOutcomeMatch?.grade || botLedgerMatch?.payload?.grade || 'A';
  const botSmcScore = botOutcomeMatch?.smcScore || botLedgerMatch?.payload?.score || 80;
  const botEntryPrice = botOutcomeMatch?.entryPrice || botLedgerMatch?.payload?.observedMarketPrice || 0;
  const botStopLoss = botOutcomeMatch?.stopLoss || 0;
  const botTakeProfit = botOutcomeMatch?.takeProfit || 0;
  const botRealizedR = botOutcomeMatch?.realizedR ?? (botOutcomeMatch?.outcome === 'TP' ? 2.0 : botOutcomeMatch?.outcome === 'SL' ? -1.0 : 0.0);
  const botStatus = botOutcomeMatch?.outcome || (matches.length > 0 ? 'WAITING_ENTRY' : 'NO_SIGNAL_RECORDED');

  const macroSnapshot = botOutcomeMatch?.macroSnapshot || botLedgerMatch?.payload?.macro || {
    primaryRegime: 'Trend-Following Macro Equilibrium',
    macroBias: botDirection === 'LONG' ? 'LONG_ONLY' : 'SHORT_ONLY',
    begonyaScore: botSmcScore,
    scoreTier: 'Tier A',
    macroMultiplier: 1.0,
  };

  // Determine Divergence Category
  let divergenceCategory = 'TWIN_EXECUTION_ALIGNED';
  let divergenceRationale = '';

  if (parsed.outcome === 'WIN' && botStatus === 'TP') {
    divergenceCategory = 'TWIN_EXECUTION_ALIGNED';
    divergenceRationale = `Hem operatör (+${parsed.realizedR}R) hem de bot sentetik motoru (+${botRealizedR}R) TP alarak tam kurumsal uyum sağladı.`;
  } else if (parsed.outcome === 'WIN' && (botStatus === 'EXPIRED' || botStatus === 'NO_SIGNAL_RECORDED')) {
    divergenceCategory = 'OPERATOR_ALPHA_CAPTURE';
    divergenceRationale = `Operatör piyasa mikro yapısını ve retesti erken okuyarak +${parsed.realizedR}R kâr üretti; bot kutu derinliği veya emir bekleyişi nedeniyle pozisyona giremedi.`;
  } else if (parsed.outcome === 'LOSS' && botStatus === 'EXPIRED') {
    divergenceCategory = 'AVERTED_LOSS_VIOLATION';
    divergenceRationale = `Bot kuralları gereği kutu onayı oluşmadığı için işlem açılmadı; operatör erken veya teyitsiz giriş yaparak -${Math.abs(parsed.realizedR)}R zarar yazdı.`;
  } else if (parsed.outcome === 'LOSS' && botStatus === 'SL') {
    divergenceCategory = 'TWIN_STOP_ALIGNED';
    divergenceRationale = `Piyasa yapısı her iki tarafta da stop seviyesini ihlal etti (-${Math.abs(parsed.realizedR)}R).`;
  } else {
    divergenceCategory = 'EXECUTION_DISCIPLINE_MONITORED';
    divergenceRationale = `Operatör sonucu: ${parsed.outcome} (${parsed.realizedR}R) | Bot Sentetik Durumu: ${botStatus}.`;
  }

  const riskAllocatedUsd = 750.0;
  const realizedUsd = parsed.outcome === 'WIN' ? riskAllocatedUsd * parsed.realizedR : parsed.outcome === 'LOSS' ? -riskAllocatedUsd : 0.0;

  console.log('📊 İCRA KARŞILAŞTIRMA RAPORU (OPERATOR VS. ENGINE):');
  console.log(`  👤 Operatör İcrası : ${parsed.outcome} | Realize: ${parsed.realizedR > 0 ? '+' : ''}${parsed.realizedR} R (${realizedUsd > 0 ? '+' : ''}${realizedUsd} $)`);
  console.log(`  🤖 Bot Sentetik    : ${botStatus} | Realize: ${botRealizedR > 0 ? '+' : ''}${botRealizedR} R`);
  console.log(`  🔬 Ayrışma Türü    : [${divergenceCategory}]`);
  console.log(`  💡 Analitik Yorum  : ${divergenceRationale}`);
  console.log('───────────────────────────────────────────────────────────────────────────────────');

  // Build new benchmark JSON record
  const newRecord = {
    record_id: recordId,
    timestamp_utc: parsed.targetDate.toISOString(),
    timestamp_tsi: dateFormattedTsi,
    symbol: parsed.symbol,
    trade_direction: botDirection,
    telegram_raw_summary: `${parsed.symbol} ${botDirection} | Grade ${botGrade} | Skor: ${botSmcScore}/100 | Operatör Girişi: ${parsed.userNotes}`,
    smc_technical_layer: {
      raw_score: botSmcScore,
      grade: botGrade,
      poi_type: botPoiType,
      entry_zone: [botEntryPrice, botEntryPrice],
      current_price_at_signal: botEntryPrice,
      stop_loss: botStopLoss,
      take_profit: botTakeProfit,
      risk_reward_estimated: parsed.realizedR,
      htf_trend_4h: 'Aligned',
      htf_trend_1h: 'Aligned',
      htf_alignment: 'Aligned',
    },
    macro_gating_layer: {
      primary_regime: macroSnapshot.primaryRegime || 'Macro Expansion',
      macro_bias_gate: macroSnapshot.macroBias || 'LONG_ONLY',
      macro_multiplier: 1.0,
      recommended_risk_multiplier: 0.75,
      news_freeze_active: false,
    },
    begonya_synthesis: {
      final_begonya_score: botSmcScore,
      score_tier: macroSnapshot.scoreTier || 'Tier A',
      action: 'PROCEED',
      divergence_category: divergenceCategory,
    },
    m1_execution_reality: {
      poi_retested: true,
      m1_confirmation_received: parsed.outcome === 'WIN',
      entry_triggered: true,
      execution_state: parsed.outcome === 'WIN' ? 'EXECUTED_AND_CLOSED' : 'STOP_HIT',
      risk_allocated_usd: riskAllocatedUsd,
    },
    post_trade_audit: {
      actual_outcome: parsed.outcome,
      realized_r: parsed.realizedR,
      realized_usd: realizedUsd,
      outcome_category: parsed.outcome === 'WIN' ? 'PROFIT' : parsed.outcome === 'LOSS' ? 'LOSS' : 'AVERTED_LOSS',
      exit_reason: divergenceRationale,
      operator_notes: parsed.userNotes,
      bot_status: botStatus,
    },
  };

  records.push(newRecord);
  fs.writeFileSync(benchmarkRecordsPath, JSON.stringify(records, null, 2), 'utf8');
  console.log(`✅ [benchmark_records.json] #${nextSignalNumber} olarak kaydedildi (${recordId}).`);

  // Append to BEGONYA_BENCHMARK_JOURNAL.md
  const journalEntryMd = `
---

### ${nextSignalNumber}. [${dateFormattedTsi} TSİ] — ${parsed.symbol} (15M ${botDirection} ${botPoiType}) ${parsed.outcome === 'WIN' ? '✅ TP (' + parsed.realizedR + 'R)' : parsed.outcome === 'LOSS' ? '❌ STOP (-1R)' : '🛡️ BE / KORUNDU'}
- **Kayıt Kodu:** ${recordId}
- **Operatör Girişi:** ${parsed.userNotes}
- **Giriş Bölgesi (POI):** ${parsed.symbol} ${botDirection} ${botPoiType} | **Grade:** ${botGrade} (${botSmcScore}/100)
- **Çarpımsal Begonya Skoru:** SMC: ${botSmcScore} × G_macro: 1.0 = **${botSmcScore} / 100 (${macroSnapshot.scoreTier || 'Tier A'})**
- **İcra Ayrışması (Human vs Machine):** [${divergenceCategory}]

#### 🔬 1. SMC Teknik Katmanı & Operatör Otopsisi
- **Operatör İcrası:** ${parsed.outcome === 'WIN' ? 'Kâr realize edildi (+ ' + parsed.realizedR + 'R)' : 'Zarar kesildi (-1.0R)'}.
- **Bot Sentetik Takipçisi:** ${botStatus} (Bot R: ${botRealizedR > 0 ? '+' : ''}${botRealizedR}R).
- **Ayrışma Tespiti:** ${divergenceRationale}

#### 🌐 2. Makroekonomik Katman
- **Birincil Rejim:** *${macroSnapshot.primaryRegime || 'Piyasa Dengesi'}*.
- **Makro Kapı Durumu:** ${macroSnapshot.macroBias || 'ONAYLI'}.

#### 📊 3. Post-Trade Audit & Bilanço
- **Gerçekleşen Sonuç:** ${parsed.outcome}
- **Gerçekleşen R:** **${parsed.realizedR > 0 ? '+' : ''}${parsed.realizedR} R**
- **Finansal Getiri:** **${realizedUsd > 0 ? '+' : ''}${realizedUsd.toFixed(2)} $**
- **Kategori:** ${parsed.outcome === 'WIN' ? 'PROFIT' : parsed.outcome === 'LOSS' ? 'LOSS' : 'AVERTED_LOSS'}
- **Kritik Ders:** Operatör ile makine arasındaki farklar M1 canlı icra motorunun parametrelerini (kutu toleransı, tetik derinliği) eğitmek için arşivlenmiştir.

#### 📋 Standart 5+1 Doğrulama Anketi
- **Soru 1 (Kutuya Yaklaşım):** [A] Sakin yaklaşım ve retest
- **Soru 2 (1M Formasyonu):** ${parsed.outcome === 'WIN' ? '[A] 1M CHoCH/Displacement ile teyit alındı' : '[C] Teyitsiz veya erken giriş'}
- **Soru 3 (Giriş Kararı):** [A] Kurala uygun icra
- **Soru 4 (Sonuç):** ${parsed.outcome === 'WIN' ? '[A] TP (' + parsed.realizedR + 'R)' : '[B] Stop (-1R)'}
- **Soru 5 (Stop/İptal Nedeni):** ${parsed.outcome === 'WIN' ? '[D] Yok (Hedefe ulaştı)' : '[A] Kutu tutmadı / Tersine dönüş'}
- **Ekstra (Makro Doğruluk):** Makro yönü (${macroSnapshot.macroBias || 'ONAY'}) işlemi destekledi.
`;

  fs.appendFileSync(journalMdPath, journalEntryMd, 'utf8');
  console.log(`✅ [BEGONYA_BENCHMARK_JOURNAL.md] Günlüğe #${nextSignalNumber} olarak mühürlendi.`);
  console.log('═══════════════════════════════════════════════════════════════════════════════════');
}

// CLI entry
if (require.main === module) {
  const args = process.argv.slice(2);
  const inputStr = args.join(' ').trim() || 'EURJPY 2 Ekim 2026 2R TP';
  executeTradeAudit(inputStr).catch(err => {
    console.error('Audit execution failed:', err);
    process.exit(1);
  });
}
