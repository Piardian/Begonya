/**
 * BEGONYA - PRODUCTION-PARITY REPLAY ENGINE
 * =========================================
 * Path: research/run_production_parity_replay.js
 * 
 * Amaç:
 * 1. 1 Nisan - 30 Eylül 2026 döneminde ham OHLC mumlarından (replay_1year)
 *    üretim poller.ts mekanizmasını %100 birebir simüle etmek:
 *    - Her 15M mum KAPANISINDA (bar-by-bar, closeTs) calismak.
 *    - Kırılım mumunun kapanmadan analize girmesini engellemek.
 *    - 1H ve 4H mumlarını kesinlikle kapanis zamanina (T_close <= closeTs) gore filtrelemek.
 *    - SetupFamilyGuard (45 dk cooldown + ayni impulse tekillestirme) kurallarini anlik isletmek.
 *    - NotifiedStore (reservePending, markAsNotified, hasImpulseOrNewerBeenNotified) entegrasyonu.
 * 2. Iki farkli Stop Senaryosunu karsilastirmak:
 *    - Senaryo 1 (Uretim 15M POI Stopu): Zone disi + 1 pip invalidation stopu.
 *    - Senaryo 2 (Arastirma 1H Yapisal Stopu): Teyitli 1H fraktal swing pivot stopu.
 * 3. Onceki 23 islemlik hatali replay sonuclariyla islem bazinda karsilastirma (Delta Raporu) cikarmak.
 */

process.env.ENABLE_TELEMETRY = 'false';
process.env.ENABLE_RESEARCH_LEDGER = 'false';
process.env.IS_REPLAY = 'true';

const fs = require('fs');
const path = require('path');

const { ShadowCohortTracker } = require('../../swing-bos-core/dist/server/shadowCohortTracker');
ShadowCohortTracker.getInstance().persist = () => {};

const { runPipeline } = require('../../swing-bos-core/dist/server/pipeline');
const { SetupFamilyGuard } = require('../../swing-bos-core/dist/server/setupFamilyGuard');

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
  constructor() {
    this.keys = new Set();
    this.pending = new Set();
  }
  hasBeenNotified(k) {
    return this.pending.has(k) || this.keys.has(k) || this.keys.has('INVALIDATED:' + k);
  }
  hasDurablyBeenNotified(k) {
    return this.keys.has(k) || this.keys.has('INVALIDATED:' + k);
  }
  markAsNotified(k) {
    this.pending.delete(k);
    this.keys.add(k);
  }
  reservePending(arr) {
    for (const k of arr) {
      if (this.hasBeenNotified(k)) return false;
    }
    for (const k of arr) {
      this.pending.add(k);
    }
    return true;
  }
  hasImpulseOrNewerBeenNotified(sym, breakTs) {
    const prefix = sym + '_15m_';
    const checkKey = (k) => {
      if (!k.startsWith(prefix)) return false;
      const parts = k.split('_');
      if (parts.length === 5) {
        const poiType = parts[2];
        if (poiType !== 'OB' && poiType !== 'FVG') return false;
        const nTs = Number(parts[4]);
        if (Number.isFinite(nTs) && nTs >= breakTs) return true;
      }
      return false;
    };
    for (const k of this.pending) {
      if (checkKey(k)) return true;
    }
    for (const k of this.keys) {
      if (checkKey(k)) return true;
    }
    return false;
  }
}

function getAssetBuffer(symbol) {
  const sym = symbol.toUpperCase();
  if (sym.includes('BTC')) return 10.0;
  if (sym.includes('ETH')) return 1.0;
  if (sym.includes('SOL')) return 0.10;
  if (sym.includes('XAU')) return 0.10;
  if (sym.includes('JPY')) return 0.02;
  return 0.0001;
}

function getPipSize(symbol) {
  const sym = symbol.toUpperCase();
  if (sym.includes('BTC')) return 1.0;
  if (sym.includes('ETH')) return 0.10;
  if (sym.includes('SOL')) return 0.01;
  if (sym.includes('XAU')) return 0.10;
  if (sym.includes('JPY')) return 0.01;
  return 0.0001;
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
    commUsd, sprdUsd, slipUsd, totalCostUsd, cr,
    commR: riskDist > 0 ? commUsd / riskDist : 999.0,
    sprdR: riskDist > 0 ? sprdUsd / riskDist : 999.0,
    slipR: riskDist > 0 ? slipUsd / riskDist : 999.0
  };
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

function simulateTrade(direction, entryP, slP, tpP, candles) {
  const riskDist = Math.abs(entryP - slP);
  let beArmed = false;
  let effectiveSl = slP;
  let mfeP = entryP;
  let maeP = entryP;

  for (let barIdx = 0; barIdx < candles.length; barIdx++) {
    const c = candles[barIdx];
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
          exitBar: barIdx,
          reason: 'CONFLICT_SL_FIRST'
        };
      } else if (hitSl) {
        return {
          outcome: (beArmed && effectiveSl === entryP) ? 'BE' : 'SL',
          grossR: (beArmed && effectiveSl === entryP) ? 0.0 : -1.0,
          mfeR: (mfeP - entryP) / riskDist,
          maeR: (entryP - maeP) / riskDist,
          exitTs: ts,
          exitBar: barIdx,
          reason: 'STOP_LOSS_HIT'
        };
      } else if (hitTp) {
        return {
          outcome: 'TP',
          grossR: 2.0,
          mfeR: (tpP - entryP) / riskDist,
          maeR: (entryP - maeP) / riskDist,
          exitTs: ts,
          exitBar: barIdx,
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
          exitBar: barIdx,
          reason: 'CONFLICT_SL_FIRST'
        };
      } else if (hitSl) {
        return {
          outcome: (beArmed && effectiveSl === entryP) ? 'BE' : 'SL',
          grossR: (beArmed && effectiveSl === entryP) ? 0.0 : -1.0,
          mfeR: (entryP - mfeP) / riskDist,
          maeR: (maeP - entryP) / riskDist,
          exitTs: ts,
          exitBar: barIdx,
          reason: 'STOP_LOSS_HIT'
        };
      } else if (hitTp) {
        return {
          outcome: 'TP',
          grossR: 2.0,
          mfeR: (entryP - tpP) / riskDist,
          maeR: (maeP - entryP) / riskDist,
          exitTs: ts,
          exitBar: barIdx,
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
    exitBar: candles.length - 1,
    reason: 'END_OF_DATA'
  };
}

async function runProductionParityReplay() {
  const symbols = ['BTCUSD', 'ETHUSD', 'SOLUSD', 'EURUSD', 'GBPUSD', 'XAUUSD'];
  const dataDir = path.resolve(__dirname, '../../swing-bos-core/data/replay_1year');

  const t0 = new Date('2026-04-01T00:00:00Z').getTime();
  const t1 = new Date('2026-09-30T23:59:59Z').getTime();

  console.log('='.repeat(100));
  console.log('BEGONYA - PRODUCTION-PARITY REPLAY ENGINE (1 APRIL - 30 SEPTEMBER 2026)');
  console.log('Bar-by-Bar 15M Close Evaluation | SetupFamilyGuard Integration | Double Scenario (15M vs 1H Stop)');
  console.log('='.repeat(100));

  const allDetectedSignals = [];
  const candles15mMap = {};
  const candles1hMap = {};
  const candles4hMap = {};

  // Pre-load all candles
  for (const sym of symbols) {
    candles15mMap[sym] = JSON.parse(fs.readFileSync(path.join(dataDir, `${sym}_15m.json`), 'utf8'));
    candles1hMap[sym] = JSON.parse(fs.readFileSync(path.join(dataDir, `${sym}_1h.json`), 'utf8'));
    candles4hMap[sym] = JSON.parse(fs.readFileSync(path.join(dataDir, `${sym}_4h.json`), 'utf8'));
  }

  // Run bar-by-bar evaluation per symbol
  for (const sym of symbols) {
    const all15m = candles15mMap[sym];
    const all1h = candles1hMap[sym];
    const all4h = candles4hMap[sym];

    const store = new FastCandleStore();
    const notified = new FastNotifiedStore();
    const guard = new SetupFamilyGuard();

    let symSignals = 0;
    let idx1h = 0;
    let idx4h = 0;

    const startSymTime = Date.now();
    process.stdout.write(`[*] Evaluating ${sym.padEnd(8)} bar-by-bar across 6 months... `);

    for (let i = 150; i < all15m.length; i++) {
      const closeTs = all15m[i].timestamp + 15 * 60 * 1000;
      if (closeTs < t0 || closeTs > t1) continue;

      while (idx1h < all1h.length && (all1h[idx1h].timestamp + 60 * 60 * 1000) <= closeTs) idx1h++;
      while (idx4h < all4h.length && (all4h[idx4h].timestamp + 4 * 60 * 60 * 1000) <= closeTs) idx4h++;

      const c15 = all15m.slice(Math.max(0, i - 150), i + 1);
      const c1h = all1h.slice(Math.max(0, idx1h - 100), idx1h);
      const c4h = all4h.slice(Math.max(0, idx4h - 60), idx4h);

      if (c1h.length < 15 || c4h.length < 15) continue;

      store.set(c15, c1h, c4h);
      const candidates = runPipeline(sym, store, notified, closeTs);

      for (const cand of candidates) {
        const pendingKeys = cand.dedupeKey ? [cand.uniqueKey, cand.dedupeKey] : [cand.uniqueKey];
        if (!notified.reservePending(pendingKeys)) continue;

        const check = guard.shouldAllow(cand, closeTs);
        if (!check.allowed) continue;

        guard.recordNotification(cand, closeTs);
        notified.markAsNotified(cand.uniqueKey);
        if (cand.dedupeKey) notified.markAsNotified(cand.dedupeKey);

        symSignals++;
        const poi = cand.poi;
        const zl = cand.poiType === 'OB' ? poi.low : poi.gapLow;
        const zh = cand.poiType === 'OB' ? poi.high : poi.gapHigh;

        allDetectedSignals.push({
          signalId: cand.uniqueKey,
          symbol: sym,
          direction: cand.tradeDirection,
          poiType: cand.poiType,
          signalTs: closeTs,
          signalDt: new Date(closeTs).toISOString().replace('T', ' ').slice(0, 16),
          zoneLow: zl,
          zoneHigh: zh,
          grade: cand.gradeResult.grade,
          score: cand.gradeResult.totalScore,
          barIndex: i
        });
      }
    }
    const symElapsed = ((Date.now() - startSymTime) / 1000).toFixed(1);
    console.log(`Detected: ${String(symSignals).padStart(3)} signals (${symElapsed}s)`);
  }

  console.log(`\nTotal Detected Production-Parity Signals: ${allDetectedSignals.length}`);

  // Sort chronologically
  allDetectedSignals.sort((a, b) => a.signalTs - b.signalTs);

  // Now simulate trade execution for both Stop Scenarios
  const tradeRecords = [];

  for (const sig of allDetectedSignals) {
    const sym = sig.symbol;
    const direction = sig.direction;
    const pt = sig.poiType;
    const zl = sig.zoneLow;
    const zh = sig.zoneHigh;
    const sigTs = sig.signalTs;
    const pip = getPipSize(sym);
    const buf = getAssetBuffer(sym);

    // Standard Entry: FVG proximal edge, OB 50% CE
    const entryP = pt === 'FVG' ? (direction === 'long' ? zh : zl) : (zl + zh) / 2.0;

    // --- SCENARIO 1: PRODUCTION 15M POI ZONE STOP ---
    const prodSl = direction === 'long' ? (zl - pip) : (zh + pip);
    const prodRisk = Math.abs(entryP - prodSl);
    const prodTp = direction === 'long' ? entryP + (2.0 * prodRisk) : entryP - (2.0 * prodRisk);
    const prodCostDict = getAssetCost(sym, entryP, prodRisk);

    // --- SCENARIO 2: RESEARCH 1H STRUCTURAL SWING STOP ---
    const swings = getConfirmed1hSwings(candles1hMap[sym], sigTs);
    let structSl, structRisk;
    if (direction === 'short') {
      const validSw = swings.filter(s => s.type === 'HIGH' && s.price > entryP);
      const selSw = validSw.length > 0 ? validSw[validSw.length - 1] : null;
      structSl = selSw ? selSw.price + buf : entryP + (prodRisk * 3.0);
      structRisk = Math.abs(structSl - entryP);
    } else {
      const validSw = swings.filter(s => s.type === 'LOW' && s.price < entryP);
      const selSw = validSw.length > 0 ? validSw[validSw.length - 1] : null;
      structSl = selSw ? selSw.price - buf : entryP - (prodRisk * 3.0);
      structRisk = Math.abs(entryP - structSl);
    }
    const structTp = direction === 'long' ? entryP + (2.0 * structRisk) : entryP - (2.0 * structRisk);
    const structCostDict = getAssetCost(sym, entryP, structRisk);

    // Forward candles: start strictly from candle AFTER signalTs (no same-bar fill)
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
        entryP, prodSl, prodRisk, structSl, structRisk,
        prodCostDict, structCostDict
      });
      continue;
    }

    // Trade execution simulation
    const tradeCandles = fwdCandles.slice(entryBarIdx);

    // Run Scenario 1 (Production 15M Stop)
    const resProd = simulateTrade(direction, entryP, prodSl, prodTp, tradeCandles);
    const netRProd = resProd.grossR - prodCostDict.cr;

    // Run Scenario 2 (Research 1H Structural Stop)
    const resStruct = simulateTrade(direction, entryP, structSl, structTp, tradeCandles);
    const netRStruct = resStruct.grossR - structCostDict.cr;

    tradeRecords.push({
      signalId: sig.signalId, symbol: sym, direction, poiType: pt,
      signalTs: sigTs, signalDt: sig.signalDt,
      entryTs, entryDt: new Date(entryTs).toISOString().replace('T', ' ').slice(0, 16),
      status: 'FILLED',
      entryP,
      // Scenario 1: Production 15M
      prodSl, prodRisk, prodCostDict, resProd, netRProd,
      // Scenario 2: Research 1H Structural
      structSl, structRisk, structCostDict, resStruct, netRStruct
    });
  }

  // Save full results
  const outJson = path.resolve(__dirname, 'production_parity_replay_results.json');
  fs.writeFileSync(outJson, JSON.stringify(tradeRecords, null, 2), 'utf8');
  console.log(`\nSaved ${tradeRecords.length} production-parity records to ${outJson}`);

  // Summary Metrics Calculation
  const filled = tradeRecords.filter(r => r.status === 'FILLED');
  const expired = tradeRecords.filter(r => r.status === 'EXPIRED_UNFILLED');

  console.log('\n' + '='.repeat(100));
  console.log('PRODUCTION-PARITY REPLAY SUMMARY');
  console.log('='.repeat(100));
  console.log(`Total Detected Signals:       ${tradeRecords.length}`);
  console.log(`Expired Unfilled (16 bars):   ${expired.length}`);
  console.log(`Valid Filled Trades:          ${filled.length}`);

  function calcStats(trades, type) {
    if (!trades || trades.length === 0) return null;
    const isProd = type === 'PROD';
    const resKey = isProd ? 'resProd' : 'resStruct';
    const netKey = isProd ? 'netRProd' : 'netRStruct';
    const costKey = isProd ? 'prodCostDict' : 'structCostDict';

    const count = trades.length;
    const tp = trades.filter(r => r[resKey].outcome === 'TP').length;
    const sl = trades.filter(r => r[resKey].outcome === 'SL').length;
    const be = trades.filter(r => r[resKey].outcome === 'BE').length;
    const openTimeout = trades.filter(r => r[resKey].outcome === 'OPEN_TIMEOUT').length;

    const gross = trades.reduce((acc, r) => acc + r[resKey].grossR, 0);
    const cost = trades.reduce((acc, r) => acc + r[costKey].cr, 0);
    const net = trades.reduce((acc, r) => acc + r[netKey], 0);

    const wins = trades.filter(r => r[resKey].grossR > 0).reduce((acc, r) => acc + r[resKey].grossR, 0);
    const losses = Math.abs(trades.filter(r => r[resKey].grossR < 0).reduce((acc, r) => acc + r[resKey].grossR, 0));
    const pf = losses > 0 ? wins / losses : 999.0;

    let peak = 0, cum = 0, maxDd = 0;
    for (const r of trades) {
      cum += r[netKey];
      if (cum > peak) peak = cum;
      const dd = peak - cum;
      if (dd > maxDd) maxDd = dd;
    }

    return {
      count, tp, sl, be, openTimeout,
      winRate: (tp / count) * 100,
      gross, cost, net,
      exp: net / count,
      pf, maxDd
    };
  }

  console.log('\n' + '-'.repeat(100));
  console.log('SCENARIO 1: PRODUCTION 15M POI INVALIDATION STOP (15M Stop + 2.0R TP + 1.0R BE)');
  console.log('-'.repeat(100));
  const sProdAll = calcStats(filled, 'PROD');
  console.log(`ALL BASKET (${sProdAll.count} trades):`);
  console.log(`  TP/SL/BE/Open: ${sProdAll.tp} / ${sProdAll.sl} / ${sProdAll.be} / ${sProdAll.openTimeout} (Win Rate: ${sProdAll.winRate.toFixed(1)}%)`);
  console.log(`  Gross PnL:     ${sProdAll.gross.toFixed(2)}R | Net PnL: ${sProdAll.net.toFixed(2)}R | Total Costs: ${sProdAll.cost.toFixed(2)}R`);
  console.log(`  Expectancy:    ${sProdAll.exp.toFixed(3)}R/trade | Profit Factor: ${sProdAll.pf.toFixed(2)} | Max Drawdown: ${sProdAll.maxDd.toFixed(2)}R`);

  console.log('\n  Per Symbol Breakdown (Production 15M Stop):');
  for (const sym of symbols) {
    const symTrades = filled.filter(r => r.symbol === sym);
    const st = calcStats(symTrades, 'PROD');
    if (st) {
      console.log(`    ${sym.padEnd(8)}: ${String(st.count).padStart(2)} trades | ${st.tp} TP / ${st.sl} SL / ${st.be} BE | Gross: ${st.gross >= 0 ? '+' : ''}${st.gross.toFixed(2)}R | Net: ${st.net >= 0 ? '+' : ''}${st.net.toFixed(2)}R | Cost: ${st.cost.toFixed(2)}R | PF: ${st.pf.toFixed(2)} | DD: ${st.maxDd.toFixed(2)}R`);
    } else {
      console.log(`    ${sym.padEnd(8)}:  0 trades`);
    }
  }

  console.log('\n' + '-'.repeat(100));
  console.log('SCENARIO 2: RESEARCH 1H STRUCTURAL SWING STOP (1H Structural Stop + 2.0R TP + 1.0R BE)');
  console.log('-'.repeat(100));
  const sStructAll = calcStats(filled, 'STRUCT');
  console.log(`ALL BASKET (${sStructAll.count} trades):`);
  console.log(`  TP/SL/BE/Open: ${sStructAll.tp} / ${sStructAll.sl} / ${sStructAll.be} / ${sStructAll.openTimeout} (Win Rate: ${sStructAll.winRate.toFixed(1)}%)`);
  console.log(`  Gross PnL:     ${sStructAll.gross.toFixed(2)}R | Net PnL: ${sStructAll.net.toFixed(2)}R | Total Costs: ${sStructAll.cost.toFixed(2)}R`);
  console.log(`  Expectancy:    ${sStructAll.exp.toFixed(3)}R/trade | Profit Factor: ${sStructAll.pf.toFixed(2)} | Max Drawdown: ${sStructAll.maxDd.toFixed(2)}R`);

  console.log('\n  Per Symbol Breakdown (Research 1H Structural Stop):');
  for (const sym of symbols) {
    const symTrades = filled.filter(r => r.symbol === sym);
    const st = calcStats(symTrades, 'STRUCT');
    if (st) {
      console.log(`    ${sym.padEnd(8)}: ${String(st.count).padStart(2)} trades | ${st.tp} TP / ${st.sl} SL / ${st.be} BE | Gross: ${st.gross >= 0 ? '+' : ''}${st.gross.toFixed(2)}R | Net: ${st.net >= 0 ? '+' : ''}${st.net.toFixed(2)}R | Cost: ${st.cost.toFixed(2)}R | PF: ${st.pf.toFixed(2)} | DD: ${st.maxDd.toFixed(2)}R`);
    } else {
      console.log(`    ${sym.padEnd(8)}:  0 trades`);
    }
  }

  // --- DELTA ANALYSIS AGAINST PREVIOUS 23 TRADES ---
  console.log('\n' + '='.repeat(100));
  console.log('TRADE-BY-TRADE DELTA COMPARISON: NEW PRODUCTION-PARITY vs PREVIOUS 23 TRADES');
  console.log('='.repeat(100));

  const oldJsonPath = path.resolve(__dirname, 'true_historical_replay_results.json');
  if (fs.existsSync(oldJsonPath)) {
    const oldRecords = JSON.parse(fs.readFileSync(oldJsonPath, 'utf8'));
    const oldFilled = oldRecords.filter(r => r.status === 'FILLED');

    console.log(`Previous Replay Filled Trades: ${oldFilled.length}`);
    console.log(`New Production-Parity Filled Trades: ${filled.length}`);

    // Map new trades by (symbol, day, direction)
    const deltaSummary = [];
    let matchedCount = 0;
    let timingShiftedCount = 0;
    let newSignalsCount = 0;

    for (let i = 0; i < oldFilled.length; i++) {
      const ot = oldFilled[i];
      const otDay = ot.signalDt.slice(0, 10);
      
      // Look for match in new filled trades
      const matches = filled.filter(nt => nt.symbol === ot.symbol && nt.direction === ot.direction);
      const exactTimeMatch = matches.find(nt => Math.abs(nt.signalTs - ot.signalTs) <= 15 * 60 * 1000);
      const sameDayMatch = matches.find(nt => nt.signalDt.slice(0, 10) === otDay);

      if (exactTimeMatch) {
        matchedCount++;
        deltaSummary.push({
          oldIndex: i + 1,
          symbol: ot.symbol,
          direction: ot.direction,
          oldDt: ot.signalDt,
          newDt: exactTimeMatch.signalDt,
          status: 'MATCHED_TIME_PARITY',
          oldNetB: ot.netRB,
          newNetStruct: exactTimeMatch.netRStruct,
          newNetProd: exactTimeMatch.netRProd
        });
      } else if (sameDayMatch) {
        timingShiftedCount++;
        deltaSummary.push({
          oldIndex: i + 1,
          symbol: ot.symbol,
          direction: ot.direction,
          oldDt: ot.signalDt,
          newDt: sameDayMatch.signalDt,
          status: 'TIMING_SHIFTED_BAR_CLOSE',
          oldNetB: ot.netRB,
          newNetStruct: sameDayMatch.netRStruct,
          newNetProd: sameDayMatch.netRProd
        });
      } else {
        deltaSummary.push({
          oldIndex: i + 1,
          symbol: ot.symbol,
          direction: ot.direction,
          oldDt: ot.signalDt,
          newDt: 'NONE',
          status: 'ELIMINATED_BY_DEDUP_OR_CLOSE_TIMING',
          oldNetB: ot.netRB,
          newNetStruct: null,
          newNetProd: null
        });
      }
    }

    console.log(`\nOld Trade Audit Delta:`);
    console.log(`  Exact / Near-Time Matches:          ${matchedCount} / ${oldFilled.length}`);
    console.log(`  Timing-Shifted (Bar Close Parity):  ${timingShiftedCount} / ${oldFilled.length}`);
    console.log(`  Eliminated (Due to Proper Timing):  ${oldFilled.length - matchedCount - timingShiftedCount} / ${oldFilled.length}`);

    // Check newly discovered trades that old replay missed
    const oldKeys = new Set(oldFilled.map(o => `${o.symbol}_${o.signalDt.slice(0, 10)}_${o.direction}`));
    const trulyNewTrades = filled.filter(nt => !oldKeys.has(`${nt.symbol}_${nt.signalDt.slice(0, 10)}_${nt.direction}`));
    console.log(`  Newly Discovered Trades (Missed by Old Replay breakIndices Loop): ${trulyNewTrades.length}`);

    const deltaReportPath = path.resolve(__dirname, 'production_parity_delta_report.json');
    fs.writeFileSync(deltaReportPath, JSON.stringify({
      oldTradeCount: oldFilled.length,
      newTradeCount: filled.length,
      matchedCount,
      timingShiftedCount,
      eliminatedCount: oldFilled.length - matchedCount - timingShiftedCount,
      newlyDiscoveredCount: trulyNewTrades.length,
      oldTradesDelta: deltaSummary,
      trulyNewTrades: trulyNewTrades.map(t => ({
        symbol: t.symbol,
        direction: t.direction,
        poiType: t.poiType,
        signalDt: t.signalDt,
        entryDt: t.entryDt,
        netRProd: t.netRProd,
        netRStruct: t.netRStruct
      }))
    }, null, 2), 'utf8');
    console.log(`Saved Delta Report to ${deltaReportPath}`);
  }
}

runProductionParityReplay().catch(console.error);
