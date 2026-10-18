const fs = require('fs');
const path = require('path');
const { ShadowCohortTracker } = require('../../swing-bos-core/dist/server/shadowCohortTracker');
ShadowCohortTracker.getInstance().persist = () => {};
const { detectSwings } = require('../../swing-bos-core/dist/src/swingDetector');
const { detectStructure } = require('../../swing-bos-core/dist/src/structureDetector');
const { runPipeline } = require('../../swing-bos-core/dist/server/pipeline');

const dataDir = path.resolve(__dirname, '../../swing-bos-core/data/replay_1year');
const all15m = JSON.parse(fs.readFileSync(path.join(dataDir, 'BTCUSD_15m.json'), 'utf8'));
const all1h = JSON.parse(fs.readFileSync(path.join(dataDir, 'BTCUSD_1h.json'), 'utf8'));
const all4h = JSON.parse(fs.readFileSync(path.join(dataDir, 'BTCUSD_4h.json'), 'utf8'));

const swings = detectSwings(all15m);
const struct = detectStructure(all15m, swings);
const breakIndices = Array.from(new Set(struct.events.map(e => e.breakCandleIndex))).sort((a,b) => a-b);

class FastCandleStore {
  constructor() { this.c15m = []; this.c1h = []; this.c4h = []; }
  set(c15m, c1h, c4h) { this.c15m = c15m; this.c1h = c1h; this.c4h = c4h; }
  getCandles(_s, tf) { if (tf === '15m') return this.c15m; if (tf === '1h') return this.c1h; if (tf === '4h') return this.c4h; return []; }
}
class FastNotifiedStore {
  constructor() { this.keys = new Set(); }
  hasBeenNotified(k) { return this.keys.has(k); }
  hasDurablyBeenNotified(k) { return this.keys.has(k); }
  markAsNotified(k) { this.keys.add(k); }
  reservePending() { return true; }
  hasImpulseOrNewerBeenNotified() { return false; }
}

const store = new FastCandleStore();
const notified = new FastNotifiedStore();

const t0 = new Date('2026-04-01T00:00:00Z').getTime();
const t1 = new Date('2026-09-30T23:59:59Z').getTime();

let idx1h = 0, idx4h = 0;
let signalCount = 0;

for (const idx of breakIndices) {
  if (idx < 50 || idx >= all15m.length - 15) continue;
  const curTime = all15m[idx].timestamp;
  if (curTime < t0 || curTime > t1) continue;

  while (idx1h < all1h.length && all1h[idx1h].timestamp <= curTime) idx1h++;
  while (idx4h < all4h.length && all4h[idx4h].timestamp <= curTime) idx4h++;

  const c15 = all15m.slice(Math.max(0, idx - 150), idx + 1);
  const c1h = all1h.slice(Math.max(0, idx1h - 100), idx1h);
  const c4h = all4h.slice(Math.max(0, idx4h - 60), idx4h);

  store.set(c15, c1h, c4h);
  const candidates = runPipeline('BTCUSD', store, notified, curTime);

  for (const cand of candidates) {
    if (notified.hasBeenNotified(cand.uniqueKey)) continue;
    notified.markAsNotified(cand.uniqueKey);
    signalCount++;
    console.log('--- Signal #' + signalCount + ' ---');
    console.log('breakCandleIdx in loop:', idx, 'timestamp:', curTime, new Date(curTime).toISOString());
    console.log('all15m[idx] open:', all15m[idx].open, 'close:', all15m[idx].close);
    console.log('Candidate uniqueKey:', cand.uniqueKey);
    console.log('Candidate poiFormedTs:', cand.poiFormedTimestamp, new Date(cand.poiFormedTimestamp).toISOString());
    console.log('Candidate validationCloseTs:', cand.validationCloseTimestamp, new Date(cand.validationCloseTimestamp).toISOString());
    const eventAtIdx = struct.events.find(e => e.breakCandleIndex === idx);
    console.log('struct.events at idx ' + idx + ':', eventAtIdx ? { type: eventAtIdx.type, dir: eventAtIdx.direction, breakTs: eventAtIdx.breakTimestamp } : 'None');

    // Inside c15: which candle was validationCloseTs?
    const valCandleIdx = all15m.findIndex(c => c.timestamp === cand.validationCloseTimestamp);
    console.log('Validation candle index in all15m:', valCandleIdx, '(idx - 1 = ' + (idx - 1) + ')');

    // Check what event produced cand.poi
    console.log('cand.poi relatedEvent:', cand.poi.relatedEvent ? {
      type: cand.poi.relatedEvent.type,
      dir: cand.poi.relatedEvent.direction,
      breakCandleIndex: cand.poi.relatedEvent.breakCandleIndex,
      breakTimestamp: cand.poi.relatedEvent.breakTimestamp,
      breakDt: new Date(cand.poi.relatedEvent.breakTimestamp).toISOString()
    } : 'None');

    if (signalCount >= 5) break;
  }
  if (signalCount >= 5) break;
}
