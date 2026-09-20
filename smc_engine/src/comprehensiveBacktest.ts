import * as fs from 'fs';
import * as path from 'path';
import { CandleStore, StoredCandle } from '../server/candleStore';
import { NotifiedStore } from '../server/notifiedStore';
import { runPipeline } from '../server/pipeline';
import { MacroGateAdapter } from '../server/macroGateAdapter';
import { Symbol } from '../server/universe';
import { getPipSize } from '../src/assetMetrics';
import { OrderBlock, FVG } from '../src/types';

class InMemoryCandleStore extends CandleStore {
  private cache: Map<string, StoredCandle[]> = new Map();
  appendCandle(symbol: Symbol, timeframe: any, candle: StoredCandle) {
    const key = symbol + '_' + timeframe;
    let arr = this.cache.get(key);
    if (!arr) {
      arr = [];
      this.cache.set(key, arr);
    }
    arr.push(candle);
    if (arr.length > 500) arr = arr.slice(arr.length - 500);
    this.cache.set(key, arr);
  }
  getCandles(symbol: Symbol, timeframe: any) {
    return this.cache.get(symbol + '_' + timeframe) || [];
  }
}

class InMemoryNotifiedStore extends NotifiedStore {
  private notified = new Set<string>();
  override hasBeenNotified(k: string) { return this.notified.has(k); }
  override hasDurablyBeenNotified(k: string) { return this.notified.has(k); }
  override markAsNotified(k: string) { this.notified.add(k); }
}

export interface DetailedTrade {
  id: string;
  symbol: Symbol;
  direction: 'long' | 'short';
  poiType: 'OB' | 'FVG';
  grade: string;
  score: number;
  macroAllowed: boolean;
  macroAction: string;
  macroMessage: string;
  signalTime: string;
  signalTimestamp: number;
  zoneLow: number;
  zoneHigh: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskDist: number;
  riskPips: number;
  status: 'PENDING' | 'OPEN' | 'CLOSED';
  entryTime?: string;
  entryTimestamp?: number;
  exitTime?: string;
  exitTimestamp?: number;
  exitPrice?: number;
  outcome?: 'TP' | 'SL' | 'BE' | 'EXPIRED' | 'PENDING_END_OF_DATA';
  rrAchieved?: number;
  mfeR: number;
  maeR: number;
  holdingBars: number;
  beArmed: boolean;
  reason: string;
  barLogs: string[];
}

const candlePath = path.join(__dirname, '..', 'data', 'backtest_candles.json');
const raw = JSON.parse(fs.readFileSync(candlePath, 'utf8'));
const macro = MacroGateAdapter.getInstance();

const rr = 2.0;
const beAtR = 1.0;
const bufferPips = 2.0;
const entryExpiryBars = 48; // 12h
const maxHoldBars = 96; // 24h

const allOrders: DetailedTrade[] = [];

for (const sym of Object.keys(raw)) {
  const store = new InMemoryCandleStore();
  const notif = new InMemoryNotifiedStore();
  const c15: StoredCandle[] = raw[sym]['15m'] || [];
  const c1h: StoredCandle[] = raw[sym]['1h'] || [];
  const c4h: StoredCandle[] = raw[sym]['4h'] || [];
  const pipSize = getPipSize(sym as Symbol);

  if (c15.length < 90) continue;

  for (let i = 0; i < 60; i++) store.appendCandle(sym as Symbol, '15m', c15[i]);
  for (const c of c1h) if (c.timestamp <= c15[59].timestamp) store.appendCandle(sym as Symbol, '1h', c);
  for (const c of c4h) if (c.timestamp <= c15[59].timestamp) store.appendCandle(sym as Symbol, '4h', c);

  let next1hIdx = c1h.findIndex(c => c.timestamp > c15[59].timestamp);
  let next4hIdx = c4h.findIndex(c => c.timestamp > c15[59].timestamp);

  const activeOrders: DetailedTrade[] = [];

  for (let i = 60; i < c15.length; i++) {
    const current = c15[i];
    store.appendCandle(sym as Symbol, '15m', current);
    while (next1hIdx !== -1 && next1hIdx < c1h.length && c1h[next1hIdx].timestamp <= current.timestamp) {
      store.appendCandle(sym as Symbol, '1h', c1h[next1hIdx]);
      next1hIdx++;
    }
    while (next4hIdx !== -1 && next4hIdx < c4h.length && c4h[next4hIdx].timestamp <= current.timestamp) {
      store.appendCandle(sym as Symbol, '4h', c4h[next4hIdx]);
      next4hIdx++;
    }

    const currentIso = new Date(current.timestamp).toISOString().replace('T', ' ').substring(0, 16);

    // 1. Process active orders with current candle
    for (const order of activeOrders) {
      if (order.status === 'CLOSED') continue;

      if (order.status === 'PENDING') {
        const barsWaiting = Math.round((current.timestamp - order.signalTimestamp) / (15 * 60 * 1000));
        if (barsWaiting >= entryExpiryBars) {
          order.status = 'CLOSED';
          order.outcome = 'EXPIRED';
          order.exitTime = currentIso;
          order.exitTimestamp = current.timestamp;
          order.reason = `Giriş bölgesi ${entryExpiryBars} bar (12 saat) boyunca test edilmedi; limit emir süresi doldu.`;
          continue;
        }

        const isLong = order.direction === 'long';
        const reachedEntry = isLong
          ? (current.low <= order.entryPrice && current.open >= order.stopLoss)
          : (current.high >= order.entryPrice && current.open <= order.stopLoss);

        if (reachedEntry) {
          order.status = 'OPEN';
          order.entryTime = currentIso;
          order.entryTimestamp = current.timestamp;
          order.barLogs.push(`[${currentIso}] EMİR TETİKLENDİ (GİRİŞ @ ${order.entryPrice}) | Mum: O=${current.open}, H=${current.high}, L=${current.low}, C=${current.close}`);

          const slHitOnEntry = isLong ? current.low <= order.stopLoss : current.high >= order.stopLoss;
          const tpHitOnEntry = isLong ? current.high >= order.takeProfit : current.low <= order.takeProfit;

          if (slHitOnEntry && tpHitOnEntry) {
            order.status = 'CLOSED';
            order.outcome = 'SL';
            order.exitTime = currentIso;
            order.exitTimestamp = current.timestamp;
            order.exitPrice = order.stopLoss;
            order.rrAchieved = -1.0;
            order.reason = 'Giriş mumu içinde hem TP hem SL görüldü; konservatif SL uygulandı (-1.0R).';
            continue;
          }

          if (tpHitOnEntry) {
            order.status = 'CLOSED';
            order.outcome = 'TP';
            order.exitTime = currentIso;
            order.exitTimestamp = current.timestamp;
            order.exitPrice = order.takeProfit;
            order.rrAchieved = rr;
            order.reason = `Giriş mumundaki yüksek momentum ile doğrudan ${rr.toFixed(1)}R Take Profit hedefine ulaşıldı.`;
            continue;
          }

          if (slHitOnEntry) {
            order.status = 'CLOSED';
            order.outcome = 'SL';
            order.exitTime = currentIso;
            order.exitTimestamp = current.timestamp;
            order.exitPrice = order.stopLoss;
            order.rrAchieved = -1.0;
            order.reason = 'Giriş mumunda bölge savunulamadı ve kırıldı (Zone Invalidation); Stop Loss tetiklendi (-1.0R).';
            continue;
          }

          continue;
        }
      }

      if (order.status === 'OPEN') {
        order.holdingBars++;
        const isLong = order.direction === 'long';

        const favorable = isLong
          ? Math.max(0, current.high - order.entryPrice)
          : Math.max(0, order.entryPrice - current.low);
        const adverse = isLong
          ? Math.max(0, order.entryPrice - current.low)
          : Math.max(0, current.high - order.entryPrice);

        const currentMfe = favorable / order.riskDist;
        const currentMae = adverse / order.riskDist;
        order.mfeR = Math.max(order.mfeR, currentMfe);
        order.maeR = Math.max(order.maeR, currentMae);

        if (!order.beArmed && currentMfe >= beAtR) {
          order.beArmed = true;
          order.barLogs.push(`[${currentIso}] Kâr +${beAtR.toFixed(1)}R seviyesini aştı -> Stop noktası Başabaş (BE) seviyesine taşındı.`);
        }

        const currentSL = order.beArmed ? order.entryPrice : order.stopLoss;
        const hitsTP = isLong ? current.high >= order.takeProfit : current.low <= order.takeProfit;
        const hitsSL = isLong ? current.low <= currentSL : current.high >= currentSL;

        if (hitsTP && hitsSL) {
          order.status = 'CLOSED';
          order.outcome = order.beArmed ? 'BE' : 'SL';
          order.exitTime = currentIso;
          order.exitTimestamp = current.timestamp;
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
          order.exitTimestamp = current.timestamp;
          order.exitPrice = order.takeProfit;
          order.rrAchieved = rr;
          order.reason = `Trend yönünde POI tepkisi hedefe ulaştı; +${rr.toFixed(1)}R Take Profit tamamlandı.`;
          order.barLogs.push(`[${currentIso}] 🎯 TAKE PROFIT TETİKLENDİ (+${rr}R) @ ${order.takeProfit}`);
          continue;
        }

        if (hitsSL) {
          order.status = 'CLOSED';
          order.outcome = order.beArmed ? 'BE' : 'SL';
          order.exitTime = currentIso;
          order.exitTimestamp = current.timestamp;
          order.exitPrice = currentSL;
          order.rrAchieved = order.beArmed ? 0.0 : -1.0;
          order.reason = order.beArmed
            ? `Fiyat +${beAtR.toFixed(1)}R kâr seviyesine ulaştıktan sonra başabaş (BE) stop noktasına geri döndü (0.0R).`
            : `Bölge geçersiz kılındı (Zone Invalidation); Stop Loss tetiklendi (-1.0R).`;
          order.barLogs.push(`[${currentIso}] ${order.beArmed ? '🛡️ BE STOP' : '🛑 STOP LOSS'} TETİKLENDİ @ ${currentSL}`);
          continue;
        }

        if (order.holdingBars >= maxHoldBars) {
          order.status = 'CLOSED';
          order.outcome = order.beArmed ? 'BE' : 'EXPIRED';
          order.exitTime = currentIso;
          order.exitTimestamp = current.timestamp;
          order.exitPrice = current.close;
          const finalGain = isLong ? current.close - order.entryPrice : order.entryPrice - current.close;
          order.rrAchieved = Math.round((finalGain / order.riskDist) * 100) / 100;
          order.reason = `Maksimum pozisyon taşıma süresi (${maxHoldBars} bar / 24 saat) doldu.`;
          continue;
        }
      }
    }

    // 2. Detect candidates on closed candle
    const candidates = runPipeline(sym as Symbol, store, notif);
    for (const cand of candidates) {
      notif.markAsNotified(cand.uniqueKey);
      if (cand.dedupeKey) notif.markAsNotified(cand.dedupeKey);

      const gate = macro.evaluateCandidate(sym, cand.tradeDirection, cand.gradeResult.totalScore);

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

      const newOrder: DetailedTrade = {
        id: `${sym}-${cand.tradeDirection.toUpperCase()}-${current.timestamp}`,
        symbol: sym as Symbol,
        direction: cand.tradeDirection,
        poiType: cand.poiType,
        grade: cand.gradeResult.grade,
        score: cand.gradeResult.totalScore,
        macroAllowed: gate.allowed,
        macroAction: gate.action,
        macroMessage: gate.allowed ? gate.gateStatusMessage : (gate.macroRationale || 'Makro Yön Veto'),
        signalTime: currentIso,
        signalTimestamp: current.timestamp,
        zoneLow: zone.low,
        zoneHigh: zone.high,
        entryPrice: round(entryPrice, 5),
        stopLoss: round(stopLoss, 5),
        takeProfit: round(takeProfit, 5),
        riskDist: round(riskDist, 5),
        riskPips: round(riskDist / pipSize, 1),
        status: 'PENDING',
        mfeR: 0,
        maeR: 0,
        holdingBars: 0,
        beArmed: false,
        reason: '',
        barLogs: [`[${currentIso}] Sinyal algılandı: ${cand.tradeDirection.toUpperCase()} ${cand.poiType} [${zone.low} - ${zone.high}] | Giriş: ${round(entryPrice, 5)} | SL: ${round(stopLoss, 5)} | TP: ${round(takeProfit, 5)}`],
      };

      activeOrders.push(newOrder);
      allOrders.push(newOrder);
    }
  }

  // Check any remaining pending at the end of data
  for (const o of activeOrders) {
    if (o.status === 'PENDING') {
      o.outcome = 'PENDING_END_OF_DATA';
      o.reason = 'Veri sonu itibariyle emir beklemekteydi (Henüz tetiklenmedi).';
    } else if (o.status === 'OPEN') {
      o.outcome = 'PENDING_END_OF_DATA';
      o.reason = 'Veri sonu itibariyle pozisyon henüz kapatılmadı (Açık).';
    }
  }
}

function round(val: number, dec: number): number {
  const f = Math.pow(10, dec);
  return Math.round(val * f) / f;
}

// Write full audit JSON
fs.writeFileSync(
  path.join(__dirname, '..', 'data', 'comprehensive_backtest_audit.json'),
  JSON.stringify(allOrders, null, 2),
  'utf8'
);

console.log('COMPREHENSIVE_AUDIT_COMPLETED');
console.log(`Total setups detected: ${allOrders.length}`);
console.log(`Macro Allowed: ${allOrders.filter(o => o.macroAllowed).length}`);
console.log(`Macro Vetoed: ${allOrders.filter(o => !o.macroAllowed).length}`);

const macroAllowedEntered = allOrders.filter(o => o.macroAllowed && o.entryTimestamp !== undefined);
const macroVetoedEntered = allOrders.filter(o => !o.macroAllowed && o.entryTimestamp !== undefined);

console.log('\n--- MACRO ALLOWED ENTERED TRADES ---');
for (const t of macroAllowedEntered) {
  console.log(`[${t.outcome}] ${t.symbol} ${t.direction.toUpperCase()} | Entry: ${t.entryTime} (${t.entryPrice}) -> Exit: ${t.exitTime} (${t.exitPrice}) | Net: ${t.rrAchieved}R | Reason: ${t.reason}`);
}

console.log('\n--- MACRO VETOED ENTERED TRADES (VETO AUDIT) ---');
for (const t of macroVetoedEntered) {
  console.log(`[${t.outcome}] ${t.symbol} ${t.direction.toUpperCase()} | Entry: ${t.entryTime} (${t.entryPrice}) -> Exit: ${t.exitTime} (${t.exitPrice}) | Simulated Net: ${t.rrAchieved}R | Veto Reason: ${t.macroMessage}`);
}
