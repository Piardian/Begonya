/**
 * BEGONYA - GERÇEK TARİHSEL REPLAY MOTORU (TRUE HISTORICAL REPLAY)
 * ==============================================================
 * Path: research/run_true_historical_replay.js
 * 
 * Amaç:
 * 1. 1 Nisan - 30 Eylül 2026 döneminde ham OHLC mumlarından (replay_1year)
 *    SMC sinyallerini baştan sona dedektörle (runPipeline) üretmek.
 * 2. signal_delivery_queue.json ve signal-evidence.jsonl dosyalarını sinyal kaynağı
 *    olarak KULLANMAMAK.
 * 3. 1H teyit edilmiş fraktal swing stop (T_conf <= T_sig) ve C/R <= 0.25 filtresi uygulamak.
 * 4. Mükerrer (OB/FVG aynı mumda) pozisyonları tekilleştirmek.
 * 5. Senaryo B (2.0R yapısal hedef) ve Senaryo C'yi aynı sinyaller üzerinde karşılaştırmak.
 */

process.env.ENABLE_TELEMETRY = 'false';
process.env.ENABLE_RESEARCH_LEDGER = 'false';
process.env.IS_REPLAY = 'true';

const fs = require('fs');
const path = require('path');

const { ShadowCohortTracker } = require('../../swing-bos-core/dist/server/shadowCohortTracker');
ShadowCohortTracker.getInstance().persist = () => {};

const { detectSwings } = require('../../swing-bos-core/dist/src/swingDetector');
const { detectStructure } = require('../../swing-bos-core/dist/src/structureDetector');
const { runPipeline } = require('../../swing-bos-core/dist/server/pipeline');
const { evaluateKillzoneFilter } = require('../../swing-bos-core/dist/server/killzone');

class FastCandleStore {
  constructor() { this.c15m = []; this.c1h = []; this.c4h = []; }
  set(c15m, c1h, c4h) { this.c15m = c15m; this.c1h = c1h; this.c4h = c4h; }
  getCandles(_s, tf) {
    if (tf === '15m') return this.c15m;
    if (tf === '1h') return this.c1h;
    if (tf === '4h') return this.c4h;
    return [];
  }
}

class FastNotifiedStore {
  constructor() { this.keys = new Set(); }
  hasBeenNotified(k) { return this.keys.has(k); }
  hasDurablyBeenNotified(k) { return this.keys.has(k); }
  markAsNotified(k) { this.keys.add(k); }
  reservePending(arr) {
    for (const k of arr) { if (this.keys.has(k)) return false; this.keys.add(k); }
    return true;
  }
  hasImpulseOrNewerBeenNotified(sym, breakTs) {
    const prefix = sym + '_15m_';
    for (const k of this.keys) {
      if (k.startsWith(prefix)) {
        const parts = k.split('_');
        if (parts.length === 5) {
          const nTs = Number(parts[4]);
          if (Number.isFinite(nTs) && nTs >= breakTs) return true;
        }
      }
    }
    return false;
  }
}

function getAssetCost(symbol, entryP, riskDist) {
  const sym = symbol.toUpperCase();
  let commUsd, sprdUsd, slipUsd;
  if (sym.includes('BTC')) {
    commUsd = entryP * 0.00040;
    sprdUsd = entryP * 0.00010;
    slipUsd = entryP * 0.00015;
  } else if (sym.includes('ETH')) {
    commUsd = entryP * 0.00040;
    sprdUsd = entryP * 0.00015;
    slipUsd = entryP * 0.00020;
  } else if (sym.includes('SOL')) {
    commUsd = entryP * 0.00050;
    sprdUsd = entryP * 0.00030;
    slipUsd = entryP * 0.00035;
  } else if (sym.includes('EURUSD')) {
    commUsd = 0.000060;
    sprdUsd = 0.000060;
    slipUsd = 0.000025;
  } else if (sym.includes('GBPUSD')) {
    commUsd = 0.000060;
    sprdUsd = 0.000095;
    slipUsd = 0.000030;
  } else if (sym.includes('XAU')) {
    commUsd = 0.20;
    sprdUsd = 0.15;
    slipUsd = 0.10;
  } else {
    commUsd = entryP * 0.00030;
    sprdUsd = entryP * 0.00010;
    slipUsd = entryP * 0.00010;
  }
  const totalCostUsd = commUsd + sprdUsd + slipUsd;
  const cr = riskDist > 0 ? totalCostUsd / riskDist : 999.0;
  return {
    totalCostUsd, commUsd, sprdUsd, slipUsd, cr,
    commR: riskDist > 0 ? commUsd / riskDist : 0,
    sprdR: riskDist > 0 ? sprdUsd / riskDist : 0,
    slipR: riskDist > 0 ? slipUsd / riskDist : 0
  };
}

function getAssetBuffer(symbol) {
  const sym = symbol.toUpperCase();
  if (sym.includes('BTC')) return 20.0;
  if (sym.includes('ETH')) return 2.0;
  if (sym.includes('SOL')) return 0.25;
  if (sym.includes('EURUSD')) return 0.00020;
  if (sym.includes('GBPUSD')) return 0.00025;
  if (sym.includes('XAU')) return 1.50;
  return 0.00020;
}

function getConfirmed1hSwings(candles1h, cutoffTs) {
  const closed = candles1h.filter(c => (c.timestamp + 3600 * 1000) <= cutoffTs);
  const n = closed.length;
  const swings = [];
  for (let i = 2; i < n - 2; i++) {
    const c = closed[i];
    const confTs = closed[i + 2].timestamp + 3600 * 1000;
    if (confTs > cutoffTs) continue;
    if (c.high > closed[i - 1].high && c.high > closed[i - 2].high &&
        c.high > closed[i + 1].high && c.high > closed[i + 2].high) {
      swings.push({ type: 'HIGH', price: c.high, confTs });
    }
    if (c.low < closed[i - 1].low && c.low < closed[i - 2].low &&
        c.low < closed[i + 1].low && c.low < closed[i + 2].low) {
      swings.push({ type: 'LOW', price: c.low, confTs });
    }
  }
  return swings;
}

function simulateTradeReplay(direction, entryP, slP, tpP, candles, isScenarioC = false, origTargetDist = null) {
  const riskDist = Math.abs(entryP - slP);
  let beArmed = false;
  let effectiveSl = slP;
  let mfeP = entryP;
  let maeP = entryP;

  for (const c of candles) {
    const h = c.high;
    const l = c.low;
    const ts = c.timestamp;

    if (direction === 'long') {
      if (h > mfeP) mfeP = h;
      if (l < maeP) maeP = l;

      if (!beArmed && (h - entryP) >= (1.0 * riskDist)) {
        beArmed = true;
        effectiveSl = entryP;
      }

      const hitSl = (l <= effectiveSl);
      const hitTp = (h >= tpP);

      if (hitSl && hitTp) {
        return {
          outcome: (beArmed && effectiveSl === entryP) ? 'BE' : 'SL',
          grossR: (beArmed && effectiveSl === entryP) ? 0.0 : -1.0,
          mfeR: (mfeP - entryP) / riskDist,
          maeR: (entryP - maeP) / riskDist,
          exitTs: ts,
          reason: 'CONFLICT_SL_FIRST'
        };
      } else if (hitSl) {
        return {
          outcome: (beArmed && effectiveSl === entryP) ? 'BE' : 'SL',
          grossR: (beArmed && effectiveSl === entryP) ? 0.0 : -1.0,
          mfeR: (mfeP - entryP) / riskDist,
          maeR: (entryP - maeP) / riskDist,
          exitTs: ts,
          reason: 'STOP_LOSS_HIT'
        };
      } else if (hitTp) {
        const grossR = isScenarioC ? (origTargetDist / riskDist) : 2.0;
        return {
          outcome: 'TP',
          grossR,
          mfeR: (tpP - entryP) / riskDist,
          maeR: (entryP - maeP) / riskDist,
          exitTs: ts,
          reason: 'TAKE_PROFIT_HIT'
        };
      }
    } else { // short
      if (l < mfeP) mfeP = l;
      if (h > maeP) maeP = h;

      if (!beArmed && (entryP - l) >= (1.0 * riskDist)) {
        beArmed = true;
        effectiveSl = entryP;
      }

      const hitSl = (h >= effectiveSl);
      const hitTp = (l <= tpP);

      if (hitSl && hitTp) {
        return {
          outcome: (beArmed && effectiveSl === entryP) ? 'BE' : 'SL',
          grossR: (beArmed && effectiveSl === entryP) ? 0.0 : -1.0,
          mfeR: (entryP - mfeP) / riskDist,
          maeR: (maeP - entryP) / riskDist,
          exitTs: ts,
          reason: 'CONFLICT_SL_FIRST'
        };
      } else if (hitSl) {
        return {
          outcome: (beArmed && effectiveSl === entryP) ? 'BE' : 'SL',
          grossR: (beArmed && effectiveSl === entryP) ? 0.0 : -1.0,
          mfeR: (entryP - mfeP) / riskDist,
          maeR: (maeP - entryP) / riskDist,
          exitTs: ts,
          reason: 'STOP_LOSS_HIT'
        };
      } else if (hitTp) {
        const grossR = isScenarioC ? (origTargetDist / riskDist) : 2.0;
        return {
          outcome: 'TP',
          grossR,
          mfeR: (entryP - tpP) / riskDist,
          maeR: (maeP - entryP) / riskDist,
          exitTs: ts,
          reason: 'TAKE_PROFIT_HIT'
        };
      }
    }
  }

  const lastC = candles[candles.length - 1];
  const openR = (direction === 'long' ? (lastC.close - entryP) : (entryP - lastC.close)) / riskDist;
  return {
    outcome: 'OPEN_TIMEOUT',
    grossR: openR,
    mfeR: (direction === 'long' ? (mfeP - entryP) : (entryP - mfeP)) / riskDist,
    maeR: (direction === 'long' ? (entryP - maeP) : (maeP - entryP)) / riskDist,
    exitTs: lastC.timestamp,
    reason: 'END_OF_DATA'
  };
}

async function runTrueReplay() {
  const symbols = ['BTCUSD', 'ETHUSD', 'SOLUSD', 'EURUSD', 'GBPUSD', 'XAUUSD'];
  const dataDir = path.resolve(__dirname, '../../swing-bos-core/data/replay_1year');

  const t0 = new Date('2026-04-01T00:00:00Z').getTime();
  const t1 = new Date('2026-09-30T23:59:59Z').getTime();

  console.log('='.repeat(100));
  console.log('BEGONYA TRUE HISTORICAL REPLAY (1 APRI - 30 SEPT 2026)');
  console.log('Detecting SMC candidates strictly from raw replay candles (NO queue/evidence files)');
  console.log('='.repeat(100));

  const allDetectedSignals = [];

  for (const sym of symbols) {
    const f15 = path.join(dataDir, `${sym}_15m.json`);
    const f1h = path.join(dataDir, `${sym}_1h.json`);
    const f4h = path.join(dataDir, `${sym}_4h.json`);

    if (!fs.existsSync(f15) || !fs.existsSync(f1h) || !fs.existsSync(f4h)) {
      console.log(`[!] Missing candle files for ${sym}`);
      continue;
    }

    const all15m = JSON.parse(fs.readFileSync(f15, 'utf8'));
    const all1h = JSON.parse(fs.readFileSync(f1h, 'utf8'));
    const all4h = JSON.parse(fs.readFileSync(f4h, 'utf8'));

    const swings = detectSwings(all15m);
    const struct = detectStructure(all15m, swings);
    const breakIndices = Array.from(new Set(struct.events.map(e => e.breakCandleIndex))).sort((a,b) => a-b);

    const store = new FastCandleStore();
    const notified = new FastNotifiedStore();

    let symSignals = 0;
    let idx1h = 0;
    let idx4h = 0;

    for (const idx of breakIndices) {
      if (idx < 50 || idx >= all15m.length - 15) continue;
      const curTime = all15m[idx].timestamp;
      if (curTime < t0 || curTime > t1) continue;

      const kz = evaluateKillzoneFilter(new Date(curTime));
      if (!kz.active) continue;

      while (idx1h < all1h.length && all1h[idx1h].timestamp <= curTime) idx1h++;
      while (idx4h < all4h.length && all4h[idx4h].timestamp <= curTime) idx4h++;

      const c15 = all15m.slice(Math.max(0, idx - 150), idx + 1);
      const c1h = all1h.slice(Math.max(0, idx1h - 100), idx1h);
      const c4h = all4h.slice(Math.max(0, idx4h - 60), idx4h);

      if (c1h.length < 15 || c4h.length < 15) continue;

      store.set(c15, c1h, c4h);
      const candidates = runPipeline(sym, store, notified, curTime);

      for (const cand of candidates) {
        if (notified.hasBeenNotified(cand.uniqueKey)) continue;
        notified.markAsNotified(cand.uniqueKey);
        symSignals++;

        const poi = cand.poi;
        const zl = cand.poiType === 'OB' ? poi.low : poi.gapLow;
        const zh = cand.poiType === 'OB' ? poi.high : poi.gapHigh;

        allDetectedSignals.push({
          signalId: cand.uniqueKey,
          symbol: sym,
          direction: cand.tradeDirection,
          poiType: cand.poiType,
          signalTs: curTime,
          signalDt: new Date(curTime).toISOString().replace('T', ' ').slice(0, 16),
          zoneLow: zl,
          zoneHigh: zh,
          grade: cand.gradeResult.grade,
          candleIndex: idx
        });
      }
    }
    console.log(`[+] ${sym.padEnd(8)}: Detected ${symSignals} signals from raw candles across 6 months`);
  }

  console.log(`\nTotal Detected Signals across 6 months: ${allDetectedSignals.length}`);

  // Sort chronologically
  allDetectedSignals.sort((a,b) => a.signalTs - b.signalTs);

  // Group by (symbol, signalTs, direction) for Deduplication
  const dedupedSignals = [];
  const dedupGroups = new Map();

  for (const sig of allDetectedSignals) {
    const key = `${sig.symbol}_${sig.signalTs}_${sig.direction}`;
    if (!dedupGroups.has(key)) {
      dedupGroups.set(key, []);
    }
    dedupGroups.get(key).push(sig);
  }

  let duplicatesRemoved = 0;
  for (const [key, group] of dedupGroups.entries()) {
    if (group.length === 1) {
      dedupedSignals.push(group[0]);
    } else {
      duplicatesRemoved += (group.length - 1);
      // Deduplication rule: Prioritize A+ over A; if equal, prioritize OB over FVG
      group.sort((a, b) => {
        if (a.grade === 'A+' && b.grade !== 'A+') return -1;
        if (b.grade === 'A+' && a.grade !== 'A+') return 1;
        if (a.poiType === 'OB' && b.poiType !== 'OB') return -1;
        if (b.poiType === 'OB' && a.poiType !== 'OB') return 1;
        return 0;
      });
      dedupedSignals.push(group[0]);
    }
  }

  console.log(`Deduplication Rule Applied: Removed ${duplicatesRemoved} duplicate concurrent signals.`);
  console.log(`Final Deduplicated Signal Set: ${dedupedSignals.length} signals\n`);

  // Run simulation on Deduplicated signals
  // Load candles map for fast replay
  const candles15mMap = {};
  const candles1hMap = {};
  for (const sym of symbols) {
    candles15mMap[sym] = JSON.parse(fs.readFileSync(path.join(dataDir, `${sym}_15m.json`), 'utf8'));
    candles1hMap[sym] = JSON.parse(fs.readFileSync(path.join(dataDir, `${sym}_1h.json`), 'utf8'));
  }

  const tradeRecords = [];

  for (const sig of dedupedSignals) {
    const sym = sig.symbol;
    const direction = sig.direction;
    const pt = sig.poiType;
    const zl = sig.zoneLow;
    const zh = sig.zoneHigh;
    const sigTs = sig.signalTs;

    const entryP = pt === 'FVG' ? (direction === 'long' ? zh : zl) : (zl + zh) / 2.0;
    const buf = getAssetBuffer(sym);
    const origSl = direction === 'long' ? (zl - buf) : (zh + buf);
    const origRisk = Math.abs(entryP - origSl);

    // 1H confirmed structural swing stop
    const swings = getConfirmed1hSwings(candles1hMap[sym], sigTs);
    let structSl, structRisk;
    if (direction === 'short') {
      const validSw = swings.filter(s => s.type === 'HIGH' && s.price > entryP);
      const selSw = validSw.length > 0 ? validSw[validSw.length - 1] : null;
      structSl = selSw ? selSw.price + buf : entryP + (origRisk * 3.0);
      structRisk = Math.abs(structSl - entryP);
    } else {
      const validSw = swings.filter(s => s.type === 'LOW' && s.price < entryP);
      const selSw = validSw.length > 0 ? validSw[validSw.length - 1] : null;
      structSl = selSw ? selSw.price - buf : entryP - (origRisk * 3.0);
      structRisk = Math.abs(entryP - structSl);
    }

    const costDict = getAssetCost(sym, entryP, structRisk);
    const crStruct = costDict.cr;

    const tpB = direction === 'long' ? entryP + (2.0 * structRisk) : entryP - (2.0 * structRisk);
    const origTargetDist = origRisk * 2.0;
    const tpC = direction === 'long' ? entryP + origTargetDist : entryP - origTargetDist;

    const fwdCandles = candles15mMap[sym].filter(c => c.timestamp >= sigTs);

    let entryFilled = false;
    let entryBarIdx = null;
    let entryTs = null;

    for (let idx = 0; idx < Math.min(16, fwdCandles.length); idx++) {
      const c = fwdCandles[idx];
      if (direction === 'long' && c.low <= entryP) {
        entryFilled = true;
        entryBarIdx = idx;
        entryTs = c.timestamp;
        break;
      } else if (direction === 'short' && c.high >= entryP) {
        entryFilled = true;
        entryBarIdx = idx;
        entryTs = c.timestamp;
        break;
      }
    }

    if (!entryFilled) {
      tradeRecords.push({
        signalId: sig.signalId, symbol: sym, direction, poiType: pt,
        signalTs: sigTs, signalDt: sig.signalDt, status: 'EXPIRED_UNFILLED',
        costDict, crPass: crStruct <= 0.25,
        outcomeB: 'EXPIRED', outcomeC: 'EXPIRED', netRB: 0.0, netRC: 0.0
      });
      continue;
    }

    if (crStruct > 0.25) {
      tradeRecords.push({
        signalId: sig.signalId, symbol: sym, direction, poiType: pt,
        signalTs: sigTs, signalDt: sig.signalDt, status: 'FILTERED_CR_EXCEEDED',
        costDict, crPass: false,
        outcomeB: 'FILTERED', outcomeC: 'FILTERED', netRB: 0.0, netRC: 0.0
      });
      continue;
    }

    const tradeCandles = fwdCandles.slice(entryBarIdx);

    const resB = simulateTradeReplay(direction, entryP, structSl, tpB, tradeCandles, false);
    const netRB = resB.grossR - crStruct;

    const resC = simulateTradeReplay(direction, entryP, structSl, tpC, tradeCandles, true, origTargetDist);
    const netRC = resC.grossR - crStruct;

    tradeRecords.push({
      signalId: sig.signalId, symbol: sym, direction, poiType: pt,
      signalTs: sigTs, signalDt: sig.signalDt,
      entryTs, entryDt: new Date(entryTs).toISOString().replace('T', ' ').slice(0, 16),
      status: 'FILLED',
      entryP, structSl, structRisk, origSl, origRisk,
      costDict, crPass: true,
      resB, resC, netRB, netRC
    });
  }

  // Save results
  const outJson = path.resolve(__dirname, 'true_historical_replay_results.json');
  fs.writeFileSync(outJson, JSON.stringify(tradeRecords, null, 2), 'utf8');
  console.log(`Saved ${tradeRecords.length} historical trade records to ${outJson}`);

  // Summary
  const filled = tradeRecords.filter(r => r.status === 'FILLED');
  const filtered = tradeRecords.filter(r => r.status === 'FILTERED_CR_EXCEEDED');
  const expired = tradeRecords.filter(r => r.status === 'EXPIRED_UNFILLED');

  console.log('\n' + '='.repeat(100));
  console.log('TRUE HISTORICAL REPLAY SUMMARY');
  console.log('='.repeat(100));
  console.log(`Total Deduplicated Signals:   ${tradeRecords.length}`);
  console.log(`Filtered (C/R > 0.25):        ${filtered.length}`);
  console.log(`Expired Unfilled (16 bars):   ${expired.length}`);
  console.log(`Valid Filled Trades Executed: ${filled.length}`);
  console.log(`Sample Size >= 50 Criterion:  ${filled.length >= 50 ? 'SUFFICIENT (PASS)' : 'INSUFFICIENT (WARN)'}`);

  function calcGroup(trades, scenKey) {
    if (!trades || trades.length === 0) return {};
    const tp = trades.filter(r => r[`res${scenKey}`].outcome === 'TP').length;
    const sl = trades.filter(r => r[`res${scenKey}`].outcome === 'SL').length;
    const be = trades.filter(r => r[`res${scenKey}`].outcome === 'BE').length;
    const gross = trades.reduce((acc, r) => acc + r[`res${scenKey}`].grossR, 0);
    const cost = trades.reduce((acc, r) => acc + r.costDict.cr, 0);
    const net = trades.reduce((acc, r) => acc + r[`netR${scenKey}`], 0);
    const comm = trades.reduce((acc, r) => acc + r.costDict.commR, 0);
    const sprd = trades.reduce((acc, r) => acc + r.costDict.sprdR, 0);
    const slip = trades.reduce((acc, r) => acc + r.costDict.slipR, 0);

    const gw = trades.filter(r => r[`res${scenKey}`].grossR > 0).reduce((acc, r) => acc + r[`res${scenKey}`].grossR, 0);
    const gl = Math.abs(trades.filter(r => r[`res${scenKey}`].grossR < 0).reduce((acc, r) => acc + r[`res${scenKey}`].grossR, 0));
    const pf = gl > 0 ? gw / gl : 999.0;

    let peak = 0, cum = 0, maxDd = 0;
    for (const r of trades) {
      cum += r[`netR${scenKey}`];
      if (cum > peak) peak = cum;
      const dd = peak - cum;
      if (dd > maxDd) maxDd = dd;
    }

    return {
      count: trades.length, tp, sl, be, gross, cost, net, comm, sprd, slip,
      pf, exp: net / trades.length, maxDd
    };
  }

  for (const scen of ['B', 'C']) {
    console.log('\n' + '-'.repeat(80));
    console.log(`METRICS FOR SCENARIO ${scen}`);
    console.log('-'.repeat(80));
    const mAll = calcGroup(filled, scen);
    console.log(`ALL BASKET (${mAll.count} trades):`);
    console.log(`  TP/SL/BE:     ${mAll.tp} / ${mAll.sl} / ${mAll.be} (Win Rate: ${(mAll.tp / mAll.count * 100).toFixed(1)}%)`);
    console.log(`  Gross PnL:    ${mAll.gross.toFixed(2)}R | Net PnL: ${mAll.net.toFixed(2)}R | Costs: ${mAll.cost.toFixed(3)}R`);
    console.log(`  Expectancy:   ${mAll.exp.toFixed(3)}R/trade | Profit Factor: ${mAll.pf.toFixed(2)} | Max DD: ${mAll.maxDd.toFixed(2)}R`);

    console.log('\n  Per Symbol Breakdown:');
    for (const sym of symbols) {
      const symTrades = filled.filter(r => r.symbol === sym);
      const mSym = calcGroup(symTrades, scen);
      if (mSym.count > 0) {
        console.log(`    ${sym.padEnd(8)}: ${String(mSym.count).padStart(2)} trades | ${mSym.tp} TP / ${mSym.sl} SL / ${mSym.be} BE | Net: ${mSym.net >= 0 ? '+' : ''}${mSym.net.toFixed(2)}R | E: ${mSym.exp >= 0 ? '+' : ''}${mSym.exp.toFixed(3)}R | PF: ${mSym.pf.toFixed(2)} | DD: ${mSym.maxDd.toFixed(2)}R`);
      } else {
        console.log(`    ${sym.padEnd(8)}:  0 trades`);
      }
    }
  }
}

runTrueReplay().catch(console.error);
