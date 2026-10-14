import * as fs from 'fs';
import * as path from 'path';
import { LtfExecutionStateMachine, LtfPoiContext } from '../src/executionStateMachine1m';
import { Candle } from '../src/types';

interface JournalTradeItem {
  id: string;
  num: number;
  symbol: string;
  direction: 'long' | 'short';
  zoneLow: number;
  zoneHigh: number;
  invalidationLevel: number;
  pipSize: number;
  timestamp: number | null;
  header: string;
  userStatus: string;
}

interface TestRunResult {
  tradeNum: number;
  symbol: string;
  direction: 'long' | 'short';
  dateStr: string;
  userOutcome: string;
  machineOutcome: string;
  machinePhase: string;
  rrAchieved: number;
  barsMonitored: number;
  entered: boolean;
  sweepDetected: boolean;
  displacementConfirmed: boolean;
  limitArmed: boolean;
  terminationReason: string;
}

function run1mJournalBacktest() {
  const dataDir = path.join(__dirname, '..', 'data', '1m_backtest');
  const journalJsonPath = path.join(dataDir, 'journal_trades_parsed.json');

  if (!fs.existsSync(journalJsonPath)) {
    console.error('Parsed journal trades file not found:', journalJsonPath);
    return;
  }

  const trades: JournalTradeItem[] = JSON.parse(fs.readFileSync(journalJsonPath, 'utf8'));
  console.log(`\n======================================================================`);
  console.log(`🔍 1 DAKİKALIK SNIPER İCRA MOTORU (1M STATE MACHINE) GERÇEKLEŞME TESTİ`);
  console.log(`   Son 1 Ay (13 Eylül - 12 Ekim 2026) Gerçek 1M Verileriyle Analiz`);
  console.log(`======================================================================\n`);

  const results: TestRunResult[] = [];
  const cache1m: Map<string, Candle[]> = new Map();

  function get1mCandles(sym: string): Candle[] {
    if (cache1m.has(sym)) return cache1m.get(sym)!;
    const p = path.join(dataDir, `${sym}_1m_30d.json`);
    if (!fs.existsSync(p)) return [];
    const raw: any[] = JSON.parse(fs.readFileSync(p, 'utf8'));
    const candles: Candle[] = raw.map(c => ({
      timestamp: c.timestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    cache1m.set(sym, candles);
    return candles;
  }

  for (const trade of trades) {
    const candles1m = get1mCandles(trade.symbol);
    if (!candles1m || candles1m.length === 0) {
      continue;
    }

    // Determine the monitoring start window
    let startIdx = 0;
    if (trade.timestamp) {
      // Find candle right around signal timestamp
      const idx = candles1m.findIndex(c => c.timestamp >= trade.timestamp!);
      startIdx = idx >= 0 ? idx : 0;
    }

    // Allow up to 1440 bars (24 hours) for retest and trade resolution
    const monitorCandles = candles1m.slice(startIdx, startIdx + 1440);
    if (monitorCandles.length < 5) continue;

    const context: LtfPoiContext = {
      id: trade.id,
      symbol: trade.symbol,
      direction: trade.direction,
      poiType: 'OB',
      zoneLow: trade.zoneLow,
      zoneHigh: trade.zoneHigh,
      invalidationLevel: trade.invalidationLevel,
      pipSize: trade.pipSize,
      targetRR: 3.0,
      breakEvenAtR: 1.0,
      maxMonitoringBars: 180,
    };

    const stateMachine = new LtfExecutionStateMachine(context);

    for (const c of monitorCandles) {
      const phase = stateMachine.processCandle(c);
      if (phase === 'EXITED' || phase === 'INVALIDATED' || phase === 'EXPIRED') {
        break;
      }
    }

    const snap = stateMachine.getSnapshot();
    const entered = snap.phase === 'FILLED' || snap.phase === 'EXITED';
    const sweepDetected = Boolean(snap.sweepEvent?.swept);
    const displacementConfirmed = Boolean(snap.displacementEvent?.displaced);
    const limitArmed = Boolean(snap.order);

    results.push({
      tradeNum: trade.num,
      symbol: trade.symbol,
      direction: trade.direction,
      dateStr: trade.header.split(']')[0].replace('[', ''),
      userOutcome: trade.userStatus,
      machineOutcome: snap.outcome || snap.phase,
      machinePhase: snap.phase,
      rrAchieved: snap.rrAchieved || 0,
      barsMonitored: snap.barsInMonitoring,
      entered,
      sweepDetected,
      displacementConfirmed,
      limitArmed,
      terminationReason: snap.terminationReason || snap.phase,
    });
  }

  // Print comparison table
  console.log(`Toplam Test Edilen İşlem: ${results.length}\n`);

  let avoidedLossCount = 0;
  let machineTpCount = 0;
  let machineSlCount = 0;
  let machineBeCount = 0;
  let machineExpiredCount = 0;
  let totalRAchieved = 0;

  for (const r of results) {
    if (r.machineOutcome === 'INVALIDATED') {
      avoidedLossCount++;
    } else if (r.machineOutcome === 'TP') {
      machineTpCount++;
      totalRAchieved += r.rrAchieved;
    } else if (r.machineOutcome === 'SL') {
      machineSlCount++;
      totalRAchieved += r.rrAchieved;
    } else if (r.machineOutcome === 'BE') {
      machineBeCount++;
    } else if (r.machineOutcome === 'EXPIRED') {
      machineExpiredCount++;
    }

    const outcomeSymbol =
      r.machineOutcome === 'TP'
        ? '🎯 TP (+3.0R)'
        : r.machineOutcome === 'SL'
        ? '🛑 SL (-1.0R)'
        : r.machineOutcome === 'BE'
        ? '🛡️ BE (0.0R)'
        : r.machineOutcome === 'INVALIDATED'
        ? '🚫 DELDİ/İPTAL'
        : '⏳ ZAMAN AŞIMI';

    console.log(
      `#${r.tradeNum.toString().padStart(2, '0')} | ${r.symbol.padEnd(6, ' ')} ${r.direction.toUpperCase().padEnd(5, ' ')} | ` +
      `${r.dateStr.padEnd(16, ' ')} | 1M MOTORU: ${outcomeSymbol.padEnd(16, ' ')} | KULLANICI: ${r.userOutcome.slice(0, 32)}`
    );
    if (r.machineOutcome === 'INVALIDATED') {
      console.log(`    ↳ 🛡️ KORUMA: Fiyat kutuyu deldi geçti, 1M CHoCH/Sweep onayı oluşmadı -> İşlem Alınmadı (Zarar Engellendi)`);
    } else if (r.machineOutcome === 'TP' || r.machineOutcome === 'SL') {
      console.log(`    ↳ 🎯 Sniper Emri: Giriş tetiklendi, Sonuç: ${r.terminationReason}`);
    }
  }

  console.log(`\n======================================================================`);
  console.log(`📊 1 DAKİKALIK SNIPER MEKANİZMASI 1 AYLIK PERFORMANS ÖZETİ`);
  console.log(`======================================================================`);
  console.log(`Toplam İncelenen Sinyal   : ${results.length}`);
  console.log(`🛡️ Engellenen Zarar/Kutu Delinmesi (Girilmedi) : ${avoidedLossCount} adet (%${((avoidedLossCount/results.length)*100).toFixed(1)})`);
  console.log(`⏳ Zaman Aşımı / Retest Vermedi (Girilmedi)     : ${machineExpiredCount} adet`);
  console.log(`🔥 1M Onayı Alınıp Tetiklenen İşlemler          : ${machineTpCount + machineSlCount + machineBeCount} adet`);
  console.log(`   - 🎯 Take Profit (TP) : ${machineTpCount}`);
  console.log(`   - 🛑 Stop Loss (SL)   : ${machineSlCount}`);
  console.log(`   - 🛡️ Break-Even (BE)  : ${machineBeCount}`);
  const filledCount = machineTpCount + machineSlCount + machineBeCount;
  const winRate = filledCount > 0 ? (machineTpCount / filledCount) * 100 : 0;
  console.log(`   - 🏆 Net Win Rate (Tetiklenen İşlemlerde)    : %${winRate.toFixed(1)}`);
  console.log(`   - 📈 Toplam Net R Getirisi                   : +${totalRAchieved.toFixed(1)} R`);
  console.log(`======================================================================\n`);

  // Write out results to JSON for deeper inspection
  const outPath = path.join(dataDir, '1m_backtest_results.json');
  fs.writeFileSync(outPath, JSON.stringify({ results, summary: { resultsCount: results.length, avoidedLossCount, machineExpiredCount, machineTpCount, machineSlCount, machineBeCount, winRate, totalRAchieved } }, null, 2));
}

run1mJournalBacktest();
