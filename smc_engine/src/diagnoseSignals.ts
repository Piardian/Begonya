import * as fs from 'fs';
import * as path from 'path';
import { CandleStore, StoredCandle } from '../server/candleStore';
import { NotifiedStore } from '../server/notifiedStore';
import { runPipeline } from '../server/pipeline';
import { MacroGateAdapter } from '../server/macroGateAdapter';
import { Symbol } from '../server/universe';

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

const candlePath = path.join(__dirname, '..', 'data', 'backtest_candles.json');
const raw = JSON.parse(fs.readFileSync(candlePath, 'utf8'));
const macro = MacroGateAdapter.getInstance();

const counts: Record<string, {
  total: number;
  allowed: number;
  suppressed: number;
  longs: number;
  shorts: number;
  allowedDetails: Array<{
    time: string;
    dir: string;
    poiType: string;
    grade: string;
    score: number;
    gateMsg: string;
  }>;
}> = {};

for (const sym of Object.keys(raw)) {
  counts[sym] = {
    total: 0,
    allowed: 0,
    suppressed: 0,
    longs: 0,
    shorts: 0,
    allowedDetails: [],
  };

  const store = new InMemoryCandleStore();
  const notif = new InMemoryNotifiedStore();
  const c15: StoredCandle[] = raw[sym]['15m'] || [];
  const c1h: StoredCandle[] = raw[sym]['1h'] || [];
  const c4h: StoredCandle[] = raw[sym]['4h'] || [];

  for (let i = 0; i < 60 && i < c15.length; i++) store.appendCandle(sym as Symbol, '15m', c15[i]);
  for (const c of c1h) if (c.timestamp <= c15[59]?.timestamp) store.appendCandle(sym as Symbol, '1h', c);
  for (const c of c4h) if (c.timestamp <= c15[59]?.timestamp) store.appendCandle(sym as Symbol, '4h', c);

  let next1hIdx = c1h.findIndex(c => c.timestamp > c15[59]?.timestamp);
  let next4hIdx = c4h.findIndex(c => c.timestamp > c15[59]?.timestamp);

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

    const candidates = runPipeline(sym as Symbol, store, notif);
    for (const cand of candidates) {
      counts[sym].total++;
      if (cand.tradeDirection === 'long') counts[sym].longs++;
      else counts[sym].shorts++;

      const gate = macro.evaluateCandidate(sym, cand.tradeDirection, cand.gradeResult.totalScore);
      if (gate.allowed) {
        counts[sym].allowed++;
        counts[sym].allowedDetails.push({
          time: new Date(current.timestamp).toISOString().replace('T', ' ').substring(0, 16),
          dir: cand.tradeDirection.toUpperCase(),
          poiType: cand.poiType,
          grade: cand.gradeResult.grade,
          score: cand.gradeResult.totalScore,
          gateMsg: gate.gateStatusMessage,
        });
      } else {
        counts[sym].suppressed++;
      }

      notif.markAsNotified(cand.uniqueKey);
      if (cand.dedupeKey) notif.markAsNotified(cand.dedupeKey);
    }
  }
}

console.log('======================================================================');
console.log('             SMC SİNYAL & MAKRO KAPI TANI RAPORU                      ');
console.log('======================================================================');
for (const [sym, d] of Object.entries(counts)) {
  console.log(`${sym.padEnd(8)} | Toplam: ${d.total.toString().padEnd(3)} (L: ${d.longs}, S: ${d.shorts}) | Makro Onay: ${d.allowed.toString().padEnd(2)} | Makro Veto: ${d.suppressed.toString().padEnd(3)}`);
  if (d.allowedDetails.length > 0) {
    for (const det of d.allowedDetails) {
      console.log(`    └ [ONAYLANDI] ${det.time} | ${det.dir} | ${det.poiType} | Grade: ${det.grade} (${det.score}) | ${det.gateMsg}`);
    }
  }
}
console.log('======================================================================');
