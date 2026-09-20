import * as fs from 'fs';
import * as path from 'path';
import { CandleStore, StoredCandle, Timeframe } from '../server/candleStore';
import { NotifiedStore } from '../server/notifiedStore';
import { runPipeline, NotificationCandidate } from '../server/pipeline';
import { MacroGateAdapter } from '../server/macroGateAdapter';
import { Symbol } from '../server/universe';
import { getPipSize } from '../src/assetMetrics';
import { OrderBlock, FVG } from '../src/types';

export type BacktestOutcome = 'TP' | 'SL' | 'BE' | 'EXPIRED' | 'PENDING_END_OF_DATA';

export interface BacktestTrade {
  tradeId: string;
  symbol: string;
  direction: 'long' | 'short';
  poiType: 'OB' | 'FVG';
  grade: string;
  score: number;
  macroAllowed: boolean;
  macroBias: string;
  macroRationale: string;
  signalTime: string;
  entryTime: string;
  exitTime: string;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  exitPrice: number;
  riskDistance: number;
  riskPips: number;
  outcome: BacktestOutcome;
  rrAchieved: number;
  mfeR: number;
  maeR: number;
  holdingBars: number;
  reason: string;
}

export interface BacktestSummary {
  totalSignalsDetected: number;
  macroAllowedSignals: number;
  macroSuppressedSignals: number;
  macroAllowedTrades: {
    total: number;
    entered: number;
    expired: number;
    pendingEndOfData: number;
    tpCount: number;
    slCount: number;
    beCount: number;
    winRatePct: number;
    profitFactor: number;
    totalRAchieved: number;
  };
  vetoAudit: {
    totalVetoed: number;
    enteredIfUnfiltered: number;
    slPrevented: number;
    tpMissed: number;
    expiredIfUnfiltered: number;
    unfilteredNetR: number;
    vetoEfficiencyPct: number;
  };
  pairBreakdown: {
    [symbol: string]: {
      signals: number;
      macroAllowed: number;
      macroVetoed: number;
      tradesEntered: number;
      tp: number;
      sl: number;
      be: number;
      expired: number;
      winRatePct: number;
      totalR: number;
    };
  };
  trades: BacktestTrade[];
}

/** In-memory high-performance CandleStore avoiding disk thrashing */
class InMemoryCandleStore extends CandleStore {
  private cache: Map<string, StoredCandle[]> = new Map();

  appendCandle(symbol: Symbol, timeframe: Timeframe, candle: StoredCandle): void {
    const key = `${symbol}_${timeframe}`;
    let candles = this.cache.get(key);
    if (!candles) {
      candles = [];
      this.cache.set(key, candles);
    }
    candles.push(candle);
    if (candles.length > 500) {
      this.cache.set(key, candles.slice(candles.length - 500));
    }
  }

  getCandles(symbol: Symbol, timeframe: Timeframe): StoredCandle[] {
    const key = `${symbol}_${timeframe}`;
    return this.cache.get(key) || [];
  }
}

/** In-memory isolated NotifiedStore ensuring zero disk interference during backtesting */
class InMemoryNotifiedStore extends NotifiedStore {
  private notified = new Set<string>();

  override hasBeenNotified(uniqueKey: string): boolean {
    return this.notified.has(uniqueKey);
  }

  override hasDurablyBeenNotified(uniqueKey: string): boolean {
    return this.notified.has(uniqueKey);
  }

  override markAsNotified(uniqueKey: string): void {
    this.notified.add(uniqueKey);
  }
}

interface SimulatedOrder {
  id: string;
  symbol: Symbol;
  direction: 'long' | 'short';
  poiType: 'OB' | 'FVG';
  grade: string;
  score: number;
  macroAllowed: boolean;
  macroBias: string;
  macroRationale: string;
  signalTimestamp: number;
  signalTime: string;
  zoneLow: number;
  zoneHigh: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskDistance: number;
  riskPips: number;
  status: 'PENDING' | 'OPEN' | 'CLOSED';
  entryTimestamp?: number;
  entryTime?: string;
  exitTimestamp?: number;
  exitTime?: string;
  exitPrice?: number;
  outcome?: BacktestOutcome;
  rrAchieved: number;
  beArmed: boolean;
  mfeR: number;
  maeR: number;
  holdingBars: number;
  reason: string;
}

export function runFullBacktest(options?: {
  readonly candleDataPath?: string;
  readonly riskReward?: number;
  readonly breakEvenAtR?: number;
  readonly stopBufferPips?: number;
  readonly entryExpiryBars?: number;
  readonly maxHoldBars?: number;
  readonly warmupBars?: number;
}): BacktestSummary {
  const root = path.resolve(__dirname, '..');
  const candlePath = options?.candleDataPath ?? path.join(root, 'data', 'backtest_candles.json');

  if (!fs.existsSync(candlePath)) {
    throw new Error(`Candle data file not found at ${candlePath}`);
  }

  const rawData: Record<string, { '15m': StoredCandle[]; '1h': StoredCandle[]; '4h': StoredCandle[] }> = JSON.parse(
    fs.readFileSync(candlePath, 'utf8')
  );
  const symbols = Object.keys(rawData) as Symbol[];

  const rr = options?.riskReward ?? 2.0;
  const beAtR = options?.breakEvenAtR ?? 1.0;
  const bufferPips = options?.stopBufferPips ?? 2.0;
  const entryExpiryBars = options?.entryExpiryBars ?? 48; // 12 hours
  const maxHoldBars = options?.maxHoldBars ?? 96; // 24 hours
  const warmup = options?.warmupBars ?? 60;

  const macroAdapter = MacroGateAdapter.getInstance();
  const allOrders: SimulatedOrder[] = [];

  for (const symbol of symbols) {
    const symCandles = rawData[symbol];
    if (!symCandles || !symCandles['15m'] || symCandles['15m'].length < warmup + 30) {
      continue;
    }

    const pipSize = getPipSize(symbol);
    const candleStore = new InMemoryCandleStore();
    const notifiedStore = new InMemoryNotifiedStore();

    const candles15m = symCandles['15m'];
    const candles1h = symCandles['1h'] || [];
    const candles4h = symCandles['4h'] || [];

    const warmupTimestamp = candles15m[warmup].timestamp;

    for (const c of candles4h) {
      if (c.timestamp <= warmupTimestamp) candleStore.appendCandle(symbol, '4h', c);
    }
    for (const c of candles1h) {
      if (c.timestamp <= warmupTimestamp) candleStore.appendCandle(symbol, '1h', c);
    }
    for (let i = 0; i <= warmup; i++) {
      candleStore.appendCandle(symbol, '15m', candles15m[i]);
    }

    let next1hIdx = candles1h.findIndex(c => c.timestamp > warmupTimestamp);
    let next4hIdx = candles4h.findIndex(c => c.timestamp > warmupTimestamp);

    const activeOrders: SimulatedOrder[] = [];

    // Step through 15M candles one by one (strictly no lookahead)
    for (let i = warmup + 1; i < candles15m.length; i++) {
      const currentCandle = candles15m[i];
      candleStore.appendCandle(symbol, '15m', currentCandle);

      while (next1hIdx !== -1 && next1hIdx < candles1h.length && candles1h[next1hIdx].timestamp <= currentCandle.timestamp) {
        candleStore.appendCandle(symbol, '1h', candles1h[next1hIdx]);
        next1hIdx++;
      }
      while (next4hIdx !== -1 && next4hIdx < candles4h.length && candles4h[next4hIdx].timestamp <= currentCandle.timestamp) {
        candleStore.appendCandle(symbol, '4h', candles4h[next4hIdx]);
        next4hIdx++;
      }

      const currentIso = new Date(currentCandle.timestamp).toISOString().replace('T', ' ').substring(0, 16);

      // A) Update existing pending and open orders with current candle
      for (const order of activeOrders) {
        if (order.status === 'CLOSED') continue;

        if (order.status === 'PENDING') {
          const barsWaiting = Math.round((currentCandle.timestamp - order.signalTimestamp) / (15 * 60 * 1000));
          if (barsWaiting >= entryExpiryBars) {
            order.status = 'CLOSED';
            order.outcome = 'EXPIRED';
            order.exitTime = currentIso;
            order.exitTimestamp = currentCandle.timestamp;
            order.reason = `Giriş bölgesi ${entryExpiryBars} bar (12 saat) boyunca test edilmedi; limit emir süresi doldu.`;
            continue;
          }

          const isLong = order.direction === 'long';
          const reachedEntry = isLong
            ? (currentCandle.low <= order.entryPrice && currentCandle.open >= order.stopLoss)
            : (currentCandle.high >= order.entryPrice && currentCandle.open <= order.stopLoss);

          if (reachedEntry) {
            order.status = 'OPEN';
            order.entryTime = currentIso;
            order.entryTimestamp = currentCandle.timestamp;

            const slHitOnEntry = isLong ? currentCandle.low <= order.stopLoss : currentCandle.high >= order.stopLoss;
            const tpHitOnEntry = isLong ? currentCandle.high >= order.takeProfit : currentCandle.low <= order.takeProfit;

            if (slHitOnEntry && tpHitOnEntry) {
              order.status = 'CLOSED';
              order.outcome = 'SL';
              order.exitTime = currentIso;
              order.exitTimestamp = currentCandle.timestamp;
              order.exitPrice = order.stopLoss;
              order.rrAchieved = -1.0;
              order.reason = 'Giriş mumu içinde hem TP hem SL görüldü; konservatif SL uygulandı (-1.0R).';
              continue;
            }

            if (tpHitOnEntry) {
              order.status = 'CLOSED';
              order.outcome = 'TP';
              order.exitTime = currentIso;
              order.exitTimestamp = currentCandle.timestamp;
              order.exitPrice = order.takeProfit;
              order.rrAchieved = rr;
              order.reason = `Giriş mumundaki yüksek momentum ile doğrudan ${rr.toFixed(1)}R Take Profit hedefine ulaşıldı.`;
              continue;
            }

            if (slHitOnEntry) {
              order.status = 'CLOSED';
              order.outcome = 'SL';
              order.exitTime = currentIso;
              order.exitTimestamp = currentCandle.timestamp;
              order.exitPrice = order.stopLoss;
              order.rrAchieved = -1.0;
              order.reason = 'Giriş mumunda bölge savunulamadı ve kırıldı (Zone Invalidation); Stop Loss tetiklendi (-1.0R).';
              continue;
            }

            // Successfully opened; evaluate excursions on subsequent candles
            continue;
          }
        }

        if (order.status === 'OPEN') {
          order.holdingBars++;
          const isLong = order.direction === 'long';

          const favorable = isLong
            ? Math.max(0, currentCandle.high - order.entryPrice)
            : Math.max(0, order.entryPrice - currentCandle.low);
          const adverse = isLong
            ? Math.max(0, order.entryPrice - currentCandle.low)
            : Math.max(0, currentCandle.high - order.entryPrice);

          const currentMfe = favorable / order.riskDistance;
          const currentMae = adverse / order.riskDistance;
          order.mfeR = Math.max(order.mfeR, currentMfe);
          order.maeR = Math.max(order.maeR, currentMae);

          if (!order.beArmed && currentMfe >= beAtR) {
            order.beArmed = true;
          }

          const currentSL = order.beArmed ? order.entryPrice : order.stopLoss;
          const hitsTP = isLong ? currentCandle.high >= order.takeProfit : currentCandle.low <= order.takeProfit;
          const hitsSL = isLong ? currentCandle.low <= currentSL : currentCandle.high >= currentSL;

          if (hitsTP && hitsSL) {
            order.status = 'CLOSED';
            order.outcome = order.beArmed ? 'BE' : 'SL';
            order.exitTime = currentIso;
            order.exitTimestamp = currentCandle.timestamp;
            order.exitPrice = currentSL;
            order.rrAchieved = order.beArmed ? 0.0 : -1.0;
            order.reason = order.beArmed
              ? 'Aynı mumda hem TP hem BE seviyesi test edildi; konservatif BE koruması uygulandı.'
              : 'Aynı mumda hem TP hem SL seviyesi test edildi; konservatif SL uygulandı.';
            continue;
          }

          if (hitsTP) {
            order.status = 'CLOSED';
            order.outcome = 'TP';
            order.exitTime = currentIso;
            order.exitTimestamp = currentCandle.timestamp;
            order.exitPrice = order.takeProfit;
            order.rrAchieved = rr;
            order.reason = `Trend yönünde POI tepkisi hedefe ulaştı; +${rr.toFixed(1)}R Take Profit tamamlandı.`;
            continue;
          }

          if (hitsSL) {
            order.status = 'CLOSED';
            order.outcome = order.beArmed ? 'BE' : 'SL';
            order.exitTime = currentIso;
            order.exitTimestamp = currentCandle.timestamp;
            order.exitPrice = currentSL;
            order.rrAchieved = order.beArmed ? 0.0 : -1.0;
            order.reason = order.beArmed
              ? `Fiyat +${beAtR.toFixed(1)}R kâr seviyesine ulaştıktan sonra başabaş (BE) stop noktasına geri döndü (0.0R).`
              : `Bölge geçersiz kılındı (Zone Invalidation); Stop Loss tetiklendi (-1.0R).`;
            continue;
          }

          if (order.holdingBars >= maxHoldBars) {
            order.status = 'CLOSED';
            order.outcome = order.beArmed ? 'BE' : 'EXPIRED';
            order.exitTime = currentIso;
            order.exitTimestamp = currentCandle.timestamp;
            order.exitPrice = currentCandle.close;
            const finalGain = isLong ? currentCandle.close - order.entryPrice : order.entryPrice - currentCandle.close;
            order.rrAchieved = Math.round((finalGain / order.riskDistance) * 100) / 100;
            order.reason = `Maksimum pozisyon taşıma süresi (${maxHoldBars} bar / 24 saat) doldu.`;
            continue;
          }
        }
      }

      // B) Run SMC detection pipeline on current closed candle
      const candidates = runPipeline(symbol, candleStore, notifiedStore);

      for (const cand of candidates) {
        notifMark(notifiedStore, cand.uniqueKey, cand.dedupeKey);

        const macroGate = macroAdapter.evaluateCandidate(
          symbol,
          cand.tradeDirection,
          cand.gradeResult.totalScore
        );

        const zone = cand.poiType === 'OB'
          ? { low: (cand.poi as OrderBlock).low, high: (cand.poi as OrderBlock).high }
          : { low: (cand.poi as FVG).gapLow, high: (cand.poi as FVG).gapHigh };

        const buffer = bufferPips * pipSize;
        const isLong = cand.tradeDirection === 'long';
        const entryPrice = isLong ? zone.high : zone.low;
        const stopLoss = isLong ? zone.low - buffer : zone.high + buffer;
        const riskDist = Math.abs(entryPrice - stopLoss);

        if (!Number.isFinite(riskDist) || riskDist <= 0) continue;

        const takeProfit = isLong ? entryPrice + riskDist * rr : entryPrice - riskDist * rr;

        const order: SimulatedOrder = {
          id: `${symbol}-${cand.tradeDirection.toUpperCase()}-${currentCandle.timestamp}`,
          symbol,
          direction: cand.tradeDirection,
          poiType: cand.poiType,
          grade: cand.gradeResult.grade,
          score: cand.gradeResult.totalScore,
          macroAllowed: macroGate.allowed,
          macroBias: macroGate.allowed ? macroGate.gateStatusMessage : (macroGate.macroRationale || 'Makro Yön Uyuşmazlığı'),
          macroRationale: macroGate.macroRationale || '',
          signalTimestamp: currentCandle.timestamp,
          signalTime: currentIso,
          zoneLow: round(zone.low, 5),
          zoneHigh: round(zone.high, 5),
          entryPrice: round(entryPrice, 5),
          stopLoss: round(stopLoss, 5),
          takeProfit: round(takeProfit, 5),
          riskDistance: round(riskDist, 5),
          riskPips: round(riskDist / pipSize, 1),
          status: 'PENDING',
          rrAchieved: 0,
          beArmed: false,
          mfeR: 0,
          maeR: 0,
          holdingBars: 0,
          reason: '',
        };

        activeOrders.push(order);
        allOrders.push(order);
      }
    }

    // Check open/pending at end of data
    for (const o of activeOrders) {
      if (o.status === 'PENDING') {
        o.outcome = 'PENDING_END_OF_DATA';
        o.reason = 'Veri sonu itibariyle emir havuzda beklemekteydi (Henüz tetiklenmedi).';
      } else if (o.status === 'OPEN') {
        o.outcome = 'PENDING_END_OF_DATA';
        o.reason = 'Veri sonu itibariyle pozisyon henüz kapatılmadı (Açık).';
      }
    }
  }

  function notifMark(store: InMemoryNotifiedStore, uKey: string, dKey?: string): void {
    store.markAsNotified(uKey);
    if (dKey) store.markAsNotified(dKey);
  }

  // Aggregate results
  const totalSignals = allOrders.length;
  const macroAllowedOrders = allOrders.filter(o => o.macroAllowed);
  const macroVetoedOrders = allOrders.filter(o => !o.macroAllowed);

  const allowedEntered = macroAllowedOrders.filter(o => o.entryTimestamp !== undefined);
  const allowedExpired = macroAllowedOrders.filter(o => o.outcome === 'EXPIRED');
  const allowedPending = macroAllowedOrders.filter(o => o.outcome === 'PENDING_END_OF_DATA');

  let tpCount = 0;
  let slCount = 0;
  let beCount = 0;
  let totalR = 0;

  for (const o of allowedEntered) {
    if (o.outcome === 'TP') {
      tpCount++;
      totalR += rr;
    } else if (o.outcome === 'SL') {
      slCount++;
      totalR -= 1.0;
    } else if (o.outcome === 'BE') {
      beCount++;
    }
  }

  const decisive = tpCount + slCount;
  const winRatePct = decisive > 0 ? round((tpCount / decisive) * 100, 1) : 0;
  const gains = tpCount * rr;
  const losses = slCount * 1.0;
  const profitFactor = losses > 0 ? round(gains / losses, 2) : gains > 0 ? 99.9 : 0;

  // Veto Audit stats
  const vetoEntered = macroVetoedOrders.filter(o => o.entryTimestamp !== undefined);
  const vetoExpired = macroVetoedOrders.filter(o => o.outcome === 'EXPIRED');
  const slPrevented = vetoEntered.filter(o => o.outcome === 'SL').length;
  const tpMissed = vetoEntered.filter(o => o.outcome === 'TP').length;
  const unfilteredNetR = (tpMissed * rr) - (slPrevented * 1.0);
  const vetoEfficiencyPct = vetoEntered.length > 0 ? round((slPrevented / vetoEntered.length) * 100, 1) : 0;

  const pairBreakdown: BacktestSummary['pairBreakdown'] = {};
  for (const s of symbols) {
    const symOrders = allOrders.filter(o => o.symbol === s);
    const symAllowed = symOrders.filter(o => o.macroAllowed);
    const symEntered = symAllowed.filter(o => o.entryTimestamp !== undefined);
    const sTp = symEntered.filter(o => o.outcome === 'TP').length;
    const sSl = symEntered.filter(o => o.outcome === 'SL').length;
    const sBe = symEntered.filter(o => o.outcome === 'BE').length;
    const sExp = symAllowed.filter(o => o.outcome === 'EXPIRED').length;
    const sDec = sTp + sSl;
    const sWr = sDec > 0 ? round((sTp / sDec) * 100, 1) : 0;
    const sR = round((sTp * rr) - (sSl * 1.0), 2);

    pairBreakdown[s] = {
      signals: symOrders.length,
      macroAllowed: symAllowed.length,
      macroVetoed: symOrders.length - symAllowed.length,
      tradesEntered: symEntered.length,
      tp: sTp,
      sl: sSl,
      be: sBe,
      expired: sExp,
      winRatePct: sWr,
      totalR: sR,
    };
  }

  const trades: BacktestTrade[] = allOrders.map(o => ({
    tradeId: o.id,
    symbol: o.symbol,
    direction: o.direction,
    poiType: o.poiType,
    grade: o.grade,
    score: o.score,
    macroAllowed: o.macroAllowed,
    macroBias: o.macroBias,
    macroRationale: o.macroRationale,
    signalTime: o.signalTime,
    entryTime: o.entryTime ?? 'N/A',
    exitTime: o.exitTime ?? (o.status === 'PENDING' ? 'Emir Havuzda' : 'Açık'),
    entryPrice: o.entryPrice,
    stopLoss: o.stopLoss,
    takeProfit: o.takeProfit,
    exitPrice: o.exitPrice ?? o.entryPrice,
    riskDistance: o.riskDistance,
    riskPips: o.riskPips,
    outcome: o.outcome ?? 'EXPIRED',
    rrAchieved: o.rrAchieved,
    mfeR: round(o.mfeR, 2),
    maeR: round(o.maeR, 2),
    holdingBars: o.holdingBars,
    reason: o.reason || 'Kural gereği kapatıldı',
  }));

  const summary: BacktestSummary = {
    totalSignalsDetected: totalSignals,
    macroAllowedSignals: macroAllowedOrders.length,
    macroSuppressedSignals: macroVetoedOrders.length,
    macroAllowedTrades: {
      total: macroAllowedOrders.length,
      entered: allowedEntered.length,
      expired: allowedExpired.length,
      pendingEndOfData: allowedPending.length,
      tpCount,
      slCount,
      beCount,
      winRatePct,
      profitFactor,
      totalRAchieved: round(totalR, 2),
    },
    vetoAudit: {
      totalVetoed: macroVetoedOrders.length,
      enteredIfUnfiltered: vetoEntered.length,
      slPrevented,
      tpMissed,
      expiredIfUnfiltered: vetoExpired.length,
      unfilteredNetR: round(unfilteredNetR, 2),
      vetoEfficiencyPct,
    },
    pairBreakdown,
    trades,
  };

  const reportOut = path.join(root, 'data', 'full_backtest_report.json');
  fs.writeFileSync(reportOut, JSON.stringify(summary, null, 2), 'utf8');

  return summary;
}

function round(val: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

// CLI Entry Point
if (require.main === module) {
  console.log('🚀 [BACKTEST RUNNER] SMC + Macro End-to-End Bütünleşik Backtest Başlatılıyor...\n');
  const result = runFullBacktest();

  console.log('======================================================================');
  console.log('             🌺 BEGONYA SMC + MAKRO BÜTÜNLEŞİK BACKTEST KARNESİ 🌺    ');
  console.log('======================================================================');
  console.log(`Toplam SMC Sinyali: ${result.totalSignalsDetected}`);
  console.log(`🛡️ Makro Kapı Tarafından Onaylanan: ${result.macroAllowedSignals}`);
  console.log(`🛑 Makro Kapı Tarafından Engellenen (Veto): ${result.macroSuppressedSignals}`);
  console.log('----------------------------------------------------------------------');
  console.log('📈 MAKRO ONAYLI İŞLEMLER (HİBRİT SİSTEM PERFORMANSI):');
  console.log(`  - İşleme Giren (Entry Tetiklenen): ${result.macroAllowedTrades.entered}`);
  console.log(`  - Giriş Test Edilmeden Süresi Dolan (Expired): ${result.macroAllowedTrades.expired}`);
  console.log(`  - Veri Sonu İtibariyle Bekleyen (Pending): ${result.macroAllowedTrades.pendingEndOfData}`);
  console.log(`  - 🎯 Take Profit (TP): ${result.macroAllowedTrades.tpCount}`);
  console.log(`  - 🛑 Stop Loss (SL): ${result.macroAllowedTrades.slCount}`);
  console.log(`  - 🛡️ Başabaş (BE): ${result.macroAllowedTrades.beCount}`);
  console.log(`  - 💰 Net Kazanılan R: ${result.macroAllowedTrades.totalRAchieved >= 0 ? '+' : ''}${result.macroAllowedTrades.totalRAchieved}R`);
  console.log('----------------------------------------------------------------------');
  console.log('🛡️ VETO DENETİMİ (MAKRO FİLTRE OLMASAYDI NE OLURDU?):');
  console.log(`  - Engellenen Toplam Sinyal: ${result.vetoAudit.totalVetoed}`);
  console.log(`  - Filtresiz Halde İşleme Girecek Olanlar: ${result.vetoAudit.enteredIfUnfiltered}`);
  console.log(`  - 🛑 ENGELLENEN STOP LOSS SAYISI: ${result.vetoAudit.slPrevented} adet (-${result.vetoAudit.slPrevented}.0R zarar portföyden korundu)`);
  console.log(`  - 🎯 Kaçırılan Take Profit: ${result.vetoAudit.tpMissed} adet (+${result.vetoAudit.tpMissed * 2.0}R)`);
  console.log(`  - ⚠️ Filtresiz Ham SMC Net Sonucu: ${result.vetoAudit.unfilteredNetR}R`);
  console.log(`  - 🏆 Makro Filtre Doğruluk/Zarar Önleme Başarısı: %${result.vetoAudit.vetoEfficiencyPct}`);
  console.log('======================================================================\n');

  console.log('📊 PARİTE BAZINDA PERFORMANS DAĞILIMI:');
  console.log('----------------------------------------------------------------------');
  for (const [sym, data] of Object.entries(result.pairBreakdown)) {
    console.log(`${sym.padEnd(8)} | Sinyal: ${data.signals.toString().padEnd(2)} | Onay: ${data.macroAllowed.toString().padEnd(2)} | Veto: ${data.macroVetoed.toString().padEnd(2)} | Giriş: ${data.tradesEntered.toString().padEnd(2)} | TP: ${data.tp.toString().padEnd(2)} | SL: ${data.sl.toString().padEnd(2)} | Net: ${data.totalR >= 0 ? '+' : ''}${data.totalR}R`);
  }
  console.log('----------------------------------------------------------------------\n');

  console.log('📝 TÜM İŞLEMLERİN VE SİNYALLERİN DETAYLI KARNESİ:');
  console.log('======================================================================');
  for (const t of result.trades) {
    const icon = !t.macroAllowed
      ? '🛡️ MAKRO VETO'
      : t.outcome === 'TP'
      ? '🎯 TP (+2.0R)'
      : t.outcome === 'SL'
      ? '🛑 SL (-1.0R)'
      : t.outcome === 'BE'
      ? '🛡️ BE (0.0R)'
      : t.outcome === 'EXPIRED'
      ? '⏳ SÜRESİ DOLDU'
      : '⏳ BEKLEYEN';

    console.log(`[${icon}] ${t.symbol} ${t.direction.toUpperCase()} | Grade: ${t.grade} (${t.score}/100)`);
    console.log(`       └ Sinyal Zamanı: ${t.signalTime} | ${t.poiType} | Seviyeler: Giriş: ${t.entryPrice} | SL: ${t.stopLoss} | TP: ${t.takeProfit} | Risk: ${t.riskPips} pips`);
    console.log(`       └ Makro Durumu: ${t.macroAllowed ? 'ONAY' : 'VETO'} -> ${t.macroBias}`);
    console.log(`       └ Sonuç / Kapanış Gerekçesi: ${t.reason}`);
    if (t.entryTime !== 'N/A') {
      console.log(`       └ Giriş: ${t.entryTime} -> Çıkış: ${t.exitTime} (${t.exitPrice}) | Gerçekleşen R: ${t.rrAchieved >= 0 ? '+' : ''}${t.rrAchieved}R`);
      console.log(`       └ Salınım: MFE +${t.mfeR}R, MAE -${t.maeR}R | Süre: ${t.holdingBars} bar (${t.holdingBars * 15} dk)`);
    }
    console.log('----------------------------------------------------------------------');
  }
}
