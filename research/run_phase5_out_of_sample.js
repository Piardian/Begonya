/**
 * BEGONYA - PHASE 5: FROZEN STRATEGY FINAL OUT-OF-SAMPLE EVALUATION ENGINE
 * ========================================================================
 * Path: research/run_phase5_out_of_sample.js
 * 
 * Period: 1 November 2025 - 31 March 2026 (5 Months OOS)
 * Warmup: 10 October 2025 - 31 October 2025
 * Engine: 100% Frozen Production Pipeline + SetupFamilyGuard
 * Execution: Leak-Free Strict Bar-1 Replay Engine
 * Costs: 1.0x, 1.25x, 1.5x, 2.0x Multipliers
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
const { executeReplayTrade } = require('./test_phase4b_execution');

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
      if (parts.length >= 5) {
        const keyBreak = Number(parts[parts.length - 1]);
        if (Number.isFinite(keyBreak) && keyBreak >= breakTs) return true;
      }
      return false;
    };
    for (const k of this.keys) { if (checkKey(k)) return true; }
    for (const k of this.pending) { if (checkKey(k)) return true; }
    return false;
  }
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

function getAssetCost(symbol, entryP, riskDist, multiplier = 1.0) {
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

  const baseComm = commUsd * multiplier;
  const baseSprd = sprdUsd * multiplier;
  const baseSlip = slipUsd * multiplier;
  const totalCostUsd = baseComm + baseSprd + baseSlip;
  const cr = riskDist > 0 ? totalCostUsd / riskDist : 999.0;

  return {
    multiplier,
    commUsd: baseComm,
    sprdUsd: baseSprd,
    slipUsd: baseSlip,
    totalCostUsd,
    cr,
    commR: riskDist > 0 ? baseComm / riskDist : 999.0,
    sprdR: riskDist > 0 ? baseSprd / riskDist : 999.0,
    slipR: riskDist > 0 ? baseSlip / riskDist : 999.0
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

function main() {
  const dataDir = path.resolve(__dirname, '../../swing-bos-core/data/replay_1year');
  const symbols = ['BTCUSD', 'ETHUSD', 'SOLUSD', 'EURUSD', 'GBPUSD', 'XAUUSD'];

  // Out of Sample Dates: 1 Nov 2025 00:00 UTC to 31 Mar 2026 23:59 UTC
  const t0 = new Date('2025-11-01T00:00:00Z').getTime();
  const t1 = new Date('2026-03-31T23:59:59Z').getTime();

  console.log('='.repeat(100));
  console.log('BEGONYA - PHASE 5: FINAL OUT-OF-SAMPLE EVALUATION (1 NOV 2025 - 31 MAR 2026)');
  console.log('Frozen Strategy Rules | SetupFamilyGuard | Leak-Free Strict Bar-1 Execution | Multi-Cost Matrix');
  console.log('='.repeat(100));

  const candles15mMap = {};
  const candles1hMap = {};
  const candles4hMap = {};

  for (const sym of symbols) {
    candles15mMap[sym] = JSON.parse(fs.readFileSync(path.join(dataDir, `${sym}_15m.json`), 'utf8'));
    candles1hMap[sym] = JSON.parse(fs.readFileSync(path.join(dataDir, `${sym}_1h.json`), 'utf8'));
    candles4hMap[sym] = JSON.parse(fs.readFileSync(path.join(dataDir, `${sym}_4h.json`), 'utf8'));
  }

  const allDetectedSignals = [];

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
    process.stdout.write(`[*] Generating OOS signals for ${sym.padEnd(8)}... `);

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

  console.log(`\nTotal Detected OOS Signals: ${allDetectedSignals.length}`);

  // Sort signals chronologically
  allDetectedSignals.sort((a, b) => a.signalTs - b.signalTs);

  // Execution Simulation Phase
  const tradeRecords = [];
  const costMultipliers = [1.0, 1.25, 1.5, 2.0];

  for (const sig of allDetectedSignals) {
    const sym = sig.symbol;
    const direction = sig.direction;
    const sigTs = sig.signalTs;
    const pip = getPipSize(sym);
    const pt = sig.poiType;

    const entryP = direction === 'long'
      ? (pt === 'OB' ? (sig.zoneHigh + sig.zoneLow) / 2 : sig.zoneHigh)
      : (pt === 'OB' ? (sig.zoneHigh + sig.zoneLow) / 2 : sig.zoneLow);

    // Scenario 1: Production 15M Invalidation Stop
    const prodSl = direction === 'long'
      ? (sig.zoneLow - pip)
      : (sig.zoneHigh + pip);
    const prodRisk = Math.abs(entryP - prodSl);
    const prodTp = direction === 'long' ? entryP + (2.0 * prodRisk) : entryP - (2.0 * prodRisk);

    // Scenario 2: Research 1H Structural Stop
    const all1h = candles1hMap[sym];
    const swings1h = getConfirmed1hSwings(all1h, sigTs);
    let structSl = prodSl;
    let structRisk = prodRisk;

    if (direction === 'long') {
      const priorLows = swings1h.filter(s => s.type === 'LOW' && s.price < entryP);
      if (priorLows.length > 0) {
        structSl = priorLows[priorLows.length - 1].price - pip;
        structRisk = Math.abs(entryP - structSl);
      }
    } else {
      const priorHighs = swings1h.filter(s => s.type === 'HIGH' && s.price > entryP);
      if (priorHighs.length > 0) {
        structSl = priorHighs[priorHighs.length - 1].price + pip;
        structRisk = Math.abs(entryP - structSl);
      }
    }
    const structTp = direction === 'long' ? entryP + (2.0 * structRisk) : entryP - (2.0 * structRisk);

    // Multi-cost dictionaries
    const prodCosts = {};
    const structCosts = {};
    for (const m of costMultipliers) {
      prodCosts[m] = getAssetCost(sym, entryP, prodRisk, m);
      structCosts[m] = getAssetCost(sym, entryP, structRisk, m);
    }

    // Forward candles: start strictly from candle opening at sigTs
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
        signalId: sig.signalId,
        symbol: sym,
        direction,
        poiType: pt,
        signalTs: sigTs,
        signalDt: sig.signalDt,
        status: 'EXPIRED_UNFILLED',
        entryP,
        prodSl, prodRisk,
        structSl, structRisk
      });
      continue;
    }

    const tradeCandles = fwdCandles.slice(entryBarIdx);

    // Run leak-free execution for:
    // Production 15M:
    // - Baseline (A): +1.0R BE
    // - Variant (B): No-BE
    // - Variant (C): +1.5R BE
    const resProd_A = executeReplayTrade({
      direction, entryP, slP: prodSl, tpP: prodTp, candles: tradeCandles,
      beThresholdR: 1.0, bar0Method: 'STRICT_BAR1'
    });
    const resProd_B = executeReplayTrade({
      direction, entryP, slP: prodSl, tpP: prodTp, candles: tradeCandles,
      beThresholdR: null, bar0Method: 'STRICT_BAR1'
    });
    const resProd_C = executeReplayTrade({
      direction, entryP, slP: prodSl, tpP: prodTp, candles: tradeCandles,
      beThresholdR: 1.5, bar0Method: 'STRICT_BAR1'
    });

    // Research 1H:
    const resStruct_A = executeReplayTrade({
      direction, entryP, slP: structSl, tpP: structTp, candles: tradeCandles,
      beThresholdR: 1.0, bar0Method: 'STRICT_BAR1'
    });
    const resStruct_B = executeReplayTrade({
      direction, entryP, slP: structSl, tpP: structTp, candles: tradeCandles,
      beThresholdR: null, bar0Method: 'STRICT_BAR1'
    });
    const resStruct_C = executeReplayTrade({
      direction, entryP, slP: structSl, tpP: structTp, candles: tradeCandles,
      beThresholdR: 1.5, bar0Method: 'STRICT_BAR1'
    });

    // Multi-cost net PnL calculations
    const netProd_A = {};
    const netProd_B = {};
    const netProd_C = {};
    const netStruct_A = {};
    const netStruct_B = {};
    const netStruct_C = {};

    for (const m of costMultipliers) {
      netProd_A[m] = resProd_A.grossR - prodCosts[m].cr;
      netProd_B[m] = resProd_B.grossR - prodCosts[m].cr;
      netProd_C[m] = resProd_C.grossR - prodCosts[m].cr;

      netStruct_A[m] = resStruct_A.grossR - structCosts[m].cr;
      netStruct_B[m] = resStruct_B.grossR - structCosts[m].cr;
      netStruct_C[m] = resStruct_C.grossR - structCosts[m].cr;
    }

    tradeRecords.push({
      signalId: sig.signalId,
      symbol: sym,
      direction,
      poiType: pt,
      signalTs: sigTs,
      signalDt: sig.signalDt,
      entryTs,
      entryDt: new Date(entryTs).toISOString().replace('T', ' ').slice(0, 16),
      status: 'FILLED',
      entryP,
      // 15M Stop Results
      prodSl, prodRisk, prodCosts,
      resProd_A, netProd_A,
      resProd_B, netProd_B,
      resProd_C, netProd_C,
      // 1H Stop Results
      structSl, structRisk, structCosts,
      resStruct_A, netStruct_A,
      resStruct_B, netStruct_B,
      resStruct_C, netStruct_C
    });
  }

  // Save Full Results
  const outJson = path.resolve(__dirname, 'phase5_out_of_sample_results.json');
  fs.writeFileSync(outJson, JSON.stringify(tradeRecords, null, 2), 'utf8');
  console.log(`\nSaved ${tradeRecords.length} OOS records to ${outJson}`);

  // Summary Metrics Analysis
  const filled = tradeRecords.filter(r => r.status === 'FILLED');
  const expired = tradeRecords.filter(r => r.status === 'EXPIRED_UNFILLED');

  console.log('\n' + '='.repeat(100));
  console.log('OUT-OF-SAMPLE REPLAY SUMMARY');
  console.log('='.repeat(100));
  console.log(`Total Detected OOS Signals:     ${tradeRecords.length}`);
  console.log(`Expired Unfilled (16 bars):     ${expired.length}`);
  console.log(`Valid Filled Trades:            ${filled.length}`);

  function computeCohortMetrics(trades, stopType, variantKey, mult = 1.0) {
    if (!trades || trades.length === 0) return null;
    const isProd = stopType === 'PROD';
    const resKey = isProd ? `resProd_${variantKey}` : `resStruct_${variantKey}`;
    const netKey = isProd ? `netProd_${variantKey}` : `netStruct_${variantKey}`;
    const costKey = isProd ? 'prodCosts' : 'structCosts';

    const count = trades.length;
    const tp = trades.filter(r => r[resKey].outcome === 'TP').length;
    const sl = trades.filter(r => r[resKey].outcome === 'SL').length;
    const be = trades.filter(r => r[resKey].outcome === 'BE').length;
    const openTimeout = trades.filter(r => r[resKey].outcome === 'OPEN_TIMEOUT').length;
    const conflictSl = trades.filter(r => r[resKey].reason === 'CONFLICT_SL_FIRST').length;

    const gross = trades.reduce((acc, r) => acc + r[resKey].grossR, 0);
    const cost = trades.reduce((acc, r) => acc + r[costKey][mult].cr, 0);
    const net = trades.reduce((acc, r) => acc + r[netKey][mult], 0);
    const exp = count > 0 ? net / count : 0.0;

    const wins = trades.filter(r => r[resKey].grossR > 0).reduce((acc, r) => acc + r[resKey].grossR, 0);
    const losses = Math.abs(trades.filter(r => r[resKey].grossR < 0).reduce((acc, r) => acc + r[resKey].grossR, 0));
    const pf = losses > 0 ? wins / losses : (wins > 0 ? 999.0 : 0.0);
    const winRate = count > 0 ? (tp / count) * 100 : 0.0;

    let peak = 0, cum = 0, maxDd = 0;
    for (const r of trades) {
      cum += r[netKey][mult];
      if (cum > peak) peak = cum;
      const dd = peak - cum;
      if (dd > maxDd) maxDd = dd;
    }

    return {
      count, tp, sl, be, openTimeout, conflictSl,
      gross, cost, net, exp, pf, winRate, maxDd
    };
  }

  function printMetrics(label, m) {
    console.log(`${label.padEnd(35)} | N:${String(m.count).padStart(2)} TP:${String(m.tp).padStart(2)} SL:${String(m.sl).padStart(2)} BE:${String(m.be).padStart(2)} Open:${String(m.openTimeout).padStart(1)} | Win%:${m.winRate.toFixed(1).padStart(4)}% | Gross:${m.gross.toFixed(2).padStart(7)}R | Cost:${m.cost.toFixed(2).padStart(6)}R | Net:${m.net.toFixed(2).padStart(7)}R | Exp:${m.exp.toFixed(3).padStart(7)}R | PF:${m.pf.toFixed(2).padStart(5)} | MaxDD:${m.maxDd.toFixed(2).padStart(6)}R`);
  }

  console.log('\n--- 15M INVALIDATION STOP (PRODUCTION BASELINE & VARIANTS @ 1.0X COST) ---');
  printMetrics('15M Stop - A: 1.0R BE (Baseline)', computeCohortMetrics(filled, 'PROD', 'A', 1.0));
  printMetrics('15M Stop - B: No-BE', computeCohortMetrics(filled, 'PROD', 'B', 1.0));
  printMetrics('15M Stop - C: 1.5R BE', computeCohortMetrics(filled, 'PROD', 'C', 1.0));

  console.log('\n--- 1H STRUCTURAL STOP (RESEARCH VARIANT @ 1.0X COST) ---');
  printMetrics('1H Stop - A: 1.0R BE', computeCohortMetrics(filled, 'STRUCT', 'A', 1.0));
  printMetrics('1H Stop - B: No-BE', computeCohortMetrics(filled, 'STRUCT', 'B', 1.0));
  printMetrics('1H Stop - C: 1.5R BE', computeCohortMetrics(filled, 'STRUCT', 'C', 1.0));

  console.log('\n--- MULTI-COST SENSITIVITY MATRIX (PRODUCTION 15M STOP, 1.0R BE) ---');
  for (const m of costMultipliers) {
    const met = computeCohortMetrics(filled, 'PROD', 'A', m);
    console.log(`Cost Multiplier ${m.toFixed(2)}x: Net PnL = ${met.net.toFixed(2)}R | Exp = ${met.exp.toFixed(3)}R/tr | Cost = ${met.cost.toFixed(2)}R | MaxDD = ${met.maxDd.toFixed(2)}R`);
  }

  console.log('\n--- MULTI-COST SENSITIVITY MATRIX (RESEARCH 1H STRUCTURAL STOP, 1.0R BE) ---');
  for (const m of costMultipliers) {
    const met = computeCohortMetrics(filled, 'STRUCT', 'A', m);
    console.log(`Cost Multiplier ${m.toFixed(2)}x: Net PnL = ${met.net.toFixed(2)}R | Exp = ${met.exp.toFixed(3)}R/tr | Cost = ${met.cost.toFixed(2)}R | MaxDD = ${met.maxDd.toFixed(2)}R`);
  }

  // Symbol Breakdown
  console.log('\n--- SYMBOL BREAKDOWN (PRODUCTION 15M STOP, 1.0R BE @ 1.0X COST) ---');
  for (const s of symbols) {
    const symTrades = filled.filter(r => r.symbol === s);
    const sigCount = allDetectedSignals.filter(r => r.symbol === s).length;
    if (symTrades.length === 0) {
      console.log(`${s.padEnd(8)}: Signals: ${String(sigCount).padStart(2)} | Filled:  0`);
      continue;
    }
    const met = computeCohortMetrics(symTrades, 'PROD', 'A', 1.0);
    console.log(`${s.padEnd(8)}: Signals: ${String(sigCount).padStart(2)} | Filled: ${String(met.count).padStart(2)} | TP:${met.tp} SL:${met.sl} BE:${met.be} | Gross:${met.gross.toFixed(2)}R | Net:${met.net.toFixed(2)}R | Exp:${met.exp.toFixed(3)}R`);
  }
}

main();
