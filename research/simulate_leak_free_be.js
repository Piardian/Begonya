/**
 * BEGONYA - LEAK-FREE POST-ENTRY SIMULATION
 * =========================================
 * Path: research/simulate_leak_free_be.js
 * 
 * Re-simulates the 38 filled trades across Scenarios A, B, and C
 * eliminating pre-entry intra-bar price leakage on Bar 0.
 */

const fs = require('fs');
const path = require('path');

const dataDir = path.resolve(__dirname, '../../swing-bos-core/data/replay_1year');
const parityJson = path.resolve(__dirname, 'production_parity_replay_results.json');

const records = JSON.parse(fs.readFileSync(parityJson, 'utf8'));
const filledTrades = records.filter(r => r.status === 'FILLED');

const symbols = ['BTCUSD', 'ETHUSD', 'SOLUSD', 'EURUSD', 'GBPUSD', 'XAUUSD'];
const candlesMap = {};
for (const s of symbols) {
  candlesMap[s] = JSON.parse(fs.readFileSync(path.join(dataDir, `${s}_15m.json`), 'utf8'));
}

/**
 * Leak-free trade simulation
 * @param {string} bar0Method 'STRICT_BAR1' | 'CLOSE_BOUNDED'
 */
function simulateTradeLeakFree(direction, entryP, slP, tpP, candles, beThresholdR, bar0Method = 'STRICT_BAR1') {
  const riskDist = Math.abs(entryP - slP);
  let beArmed = false;
  let effectiveSl = slP;
  let mfeP = entryP;
  let maeP = entryP;

  for (let barIdx = 0; barIdx < candles.length; barIdx++) {
    const c = candles[barIdx];
    let h = c.high;
    let l = c.low;
    const ts = c.timestamp;

    // Handle Bar 0 intra-bar leakage
    if (barIdx === 0) {
      if (bar0Method === 'STRICT_BAR1') {
        // On Bar 0, only adverse excursion (SL check) is evaluated.
        // Favorable progress (BE arming, TP) is evaluated starting on Bar 1.
        if (direction === 'long') {
          if (l < maeP) maeP = l;
          if (l <= effectiveSl) {
            return {
              outcome: 'SL',
              grossR: -1.0,
              mfeR: 0.0,
              maeR: (entryP - maeP) / riskDist,
              exitTs: ts,
              exitBar: 0,
              reason: 'STOP_LOSS_HIT_ON_ENTRY_BAR',
              beArmed: false
            };
          }
          // No favorable evaluation on Bar 0
          continue;
        } else { // short
          if (h > maeP) maeP = h;
          if (h >= effectiveSl) {
            return {
              outcome: 'SL',
              grossR: -1.0,
              mfeR: 0.0,
              maeR: (maeP - entryP) / riskDist,
              exitTs: ts,
              exitBar: 0,
              reason: 'STOP_LOSS_HIT_ON_ENTRY_BAR',
              beArmed: false
            };
          }
          // No favorable evaluation on Bar 0
          continue;
        }
      } else if (bar0Method === 'CLOSE_BOUNDED') {
        // On Bar 0, favorable progress cannot exceed candle CLOSE
        if (direction === 'long') {
          h = Math.max(entryP, c.close); // favorable movement capped at close
          l = c.low; // adverse movement full low
        } else {
          l = Math.min(entryP, c.close); // favorable movement capped at close
          h = c.high; // adverse movement full high
        }
      }
    }

    if (direction === 'long') {
      if (h > mfeP) mfeP = h;
      if (l < maeP) maeP = l;

      // BE check
      if (beThresholdR !== null && !beArmed && (h - entryP) >= (beThresholdR * riskDist)) {
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
          reason: 'CONFLICT_SL_FIRST',
          beArmed
        };
      } else if (hitSl) {
        return {
          outcome: (beArmed && effectiveSl === entryP) ? 'BE' : 'SL',
          grossR: (beArmed && effectiveSl === entryP) ? 0.0 : -1.0,
          mfeR: (mfeP - entryP) / riskDist,
          maeR: (entryP - maeP) / riskDist,
          exitTs: ts,
          exitBar: barIdx,
          reason: (beArmed && effectiveSl === entryP) ? 'BREAK_EVEN_HIT' : 'STOP_LOSS_HIT',
          beArmed
        };
      } else if (hitTp) {
        return {
          outcome: 'TP',
          grossR: 2.0,
          mfeR: (tpP - entryP) / riskDist,
          maeR: (entryP - maeP) / riskDist,
          exitTs: ts,
          exitBar: barIdx,
          reason: 'TAKE_PROFIT_HIT',
          beArmed
        };
      }
    } else { // short
      if (l < mfeP) mfeP = l;
      if (h > maeP) maeP = h;

      // BE check
      if (beThresholdR !== null && !beArmed && (entryP - l) >= (beThresholdR * riskDist)) {
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
          reason: 'CONFLICT_SL_FIRST',
          beArmed
        };
      } else if (hitSl) {
        return {
          outcome: (beArmed && effectiveSl === entryP) ? 'BE' : 'SL',
          grossR: (beArmed && effectiveSl === entryP) ? 0.0 : -1.0,
          mfeR: (entryP - mfeP) / riskDist,
          maeR: (maeP - entryP) / riskDist,
          exitTs: ts,
          exitBar: barIdx,
          reason: (beArmed && effectiveSl === entryP) ? 'BREAK_EVEN_HIT' : 'STOP_LOSS_HIT',
          beArmed
        };
      } else if (hitTp) {
        return {
          outcome: 'TP',
          grossR: 2.0,
          mfeR: (entryP - tpP) / riskDist,
          maeR: (maeP - entryP) / riskDist,
          exitTs: ts,
          exitBar: barIdx,
          reason: 'TAKE_PROFIT_HIT',
          beArmed
        };
      }
    }
  }

  // End of data
  const lastC = candles[candles.length - 1];
  const openR = (direction === 'long' ? (lastC.close - entryP) : (entryP - lastC.close)) / riskDist;
  return {
    outcome: 'OPEN_TIMEOUT',
    grossR: openR,
    mfeR: (direction === 'long' ? (mfeP - entryP) : (entryP - mfeP)) / riskDist,
    maeR: (direction === 'long' ? (entryP - maeP) : (maeP - entryP)) / riskDist,
    exitTs: lastC.timestamp,
    exitBar: candles.length - 1,
    reason: 'END_OF_DATA',
    beArmed
  };
}

function runAuditForMethod(methodName) {
  console.log('\n' + '='.repeat(100));
  console.log(`RUNNING LEAK-FREE SIMULATION [METHOD: ${methodName}]`);
  console.log('='.repeat(100));

  const results = {
    '15M': { A: [], B: [], C: [] },
    '1H': { A: [], B: [], C: [] }
  };

  for (let i = 0; i < filledTrades.length; i++) {
    const t = filledTrades[i];
    const sym = t.symbol;
    const dir = t.direction;
    const entryP = t.entryP;
    const allCandles = candlesMap[sym];
    const entryBarIdx = allCandles.findIndex(c => c.timestamp === t.entryTs);
    const tradeCandles = allCandles.slice(entryBarIdx);

    // 15M Stop
    const sl15 = t.prodSl;
    const tp15 = dir === 'long' ? entryP + 2 * t.prodRisk : entryP - 2 * t.prodRisk;
    const c15 = t.prodCostDict.cr;

    const a15 = simulateTradeLeakFree(dir, entryP, sl15, tp15, tradeCandles, 1.0, methodName);
    const b15 = simulateTradeLeakFree(dir, entryP, sl15, tp15, tradeCandles, null, methodName);
    const c15Res = simulateTradeLeakFree(dir, entryP, sl15, tp15, tradeCandles, 1.5, methodName);

    results['15M'].A.push({ res: a15, netR: a15.grossR - c15, cost: c15 });
    results['15M'].B.push({ res: b15, netR: b15.grossR - c15, cost: c15 });
    results['15M'].C.push({ res: c15Res, netR: c15Res.grossR - c15, cost: c15 });

    // 1H Stop
    const sl1h = t.structSl;
    const tp1h = dir === 'long' ? entryP + 2 * t.structRisk : entryP - 2 * t.structRisk;
    const c1h = t.structCostDict.cr;

    const a1h = simulateTradeLeakFree(dir, entryP, sl1h, tp1h, tradeCandles, 1.0, methodName);
    const b1h = simulateTradeLeakFree(dir, entryP, sl1h, tp1h, tradeCandles, null, methodName);
    const c1hRes = simulateTradeLeakFree(dir, entryP, sl1h, tp1h, tradeCandles, 1.5, methodName);

    results['1H'].A.push({ res: a1h, netR: a1h.grossR - c1h, cost: c1h });
    results['1H'].B.push({ res: b1h, netR: b1h.grossR - c1h, cost: c1h });
    results['1H'].C.push({ res: c1hRes, netR: c1hRes.grossR - c1h, cost: c1h });
  }

  function printSummary(label, arr) {
    const n = arr.length;
    const tp = arr.filter(x => x.res.outcome === 'TP').length;
    const sl = arr.filter(x => x.res.outcome === 'SL').length;
    const be = arr.filter(x => x.res.outcome === 'BE').length;
    const gross = arr.reduce((acc, x) => acc + x.res.grossR, 0);
    const cost = arr.reduce((acc, x) => acc + x.cost, 0);
    const net = arr.reduce((acc, x) => acc + x.netR, 0);
    const exp = net / n;

    const bar0Exits = arr.filter(x => x.res.exitBar === 0).length;

    let peak = 0, cum = 0, maxDd = 0;
    for (const x of arr) {
      cum += x.netR;
      if (cum > peak) peak = cum;
      const dd = peak - cum;
      if (dd > maxDd) maxDd = dd;
    }

    console.log(`${label.padEnd(30)} | TP:${String(tp).padStart(2)} SL:${String(sl).padStart(2)} BE:${String(be).padStart(2)} | Gross:${gross.toFixed(2).padStart(7)}R | Cost:${cost.toFixed(2).padStart(6)}R | Net:${net.toFixed(2).padStart(7)}R | Exp:${exp.toFixed(3).padStart(7)}R | MaxDD:${maxDd.toFixed(2).padStart(6)}R | Bar0Exits:${bar0Exits}`);
  }

  console.log('\n--- 15M INVALIDATION STOP (PRODUCTION) ---');
  printSummary('Scenario A: 1.0R BE (Production)', results['15M'].A);
  printSummary('Scenario B: No-BE', results['15M'].B);
  printSummary('Scenario C: 1.5R BE', results['15M'].C);

  console.log('\n--- 1H STRUCTURAL STOP (RESEARCH) ---');
  printSummary('Scenario A: 1.0R BE', results['1H'].A);
  printSummary('Scenario B: No-BE', results['1H'].B);
  printSummary('Scenario C: 1.5R BE', results['1H'].C);
}

runAuditForMethod('STRICT_BAR1');
runAuditForMethod('CLOSE_BOUNDED');
