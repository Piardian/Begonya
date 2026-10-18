/**
 * BEGONYA - PHASE 4A: BREAK-EVEN HİPOTEZİ ADVERSARIAL TEST MOTORU
 * ==============================================================
 * Path: research/simulate_be_hypothesis.js
 * 
 * Karşılaştırılan 3 Sabit Senaryo (38 İşlemlik Kohort):
 * Scenario A: Mevcut +1.0R BE kuralı
 * Scenario B: BE tetiklenmiyor (No-BE; başlangıç stopu ve 2R hedef aynen korunur)
 * Scenario C: +1.5R BE kuralı (Yalnızca +1.5R seviyesinde başabaşa çekilir)
 */

const fs = require('fs');
const path = require('path');

const dataDir = path.resolve(__dirname, '../../swing-bos-core/data/replay_1year');
const parityJson = path.resolve(__dirname, 'production_parity_replay_results.json');

const records = JSON.parse(fs.readFileSync(parityJson, 'utf8'));
const filledTrades = records.filter(r => r.status === 'FILLED');

console.log('='.repeat(100));
console.log(`Loaded ${filledTrades.length} filled trades from production-parity replay results.`);
console.log('='.repeat(100));

// Pre-load candles
const symbols = ['BTCUSD', 'ETHUSD', 'SOLUSD', 'EURUSD', 'GBPUSD', 'XAUUSD'];
const candlesMap = {};
for (const s of symbols) {
  candlesMap[s] = JSON.parse(fs.readFileSync(path.join(dataDir, `${s}_15m.json`), 'utf8'));
}

/**
 * Simulates a single trade with a parameterized BE trigger threshold.
 * @param {string} direction 'long' | 'short'
 * @param {number} entryP Entry price
 * @param {number} slP Initial stop loss price
 * @param {number} tpP Target price
 * @param {Array} candles 15m candles from entryBar onwards
 * @param {number|null} beThresholdR Multiple of R to arm BE (e.g., 1.0, 1.5, or null for No-BE)
 */
function simulateTradeVariant(direction, entryP, slP, tpP, candles, beThresholdR) {
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

const detailedAuditResults = [];

for (let i = 0; i < filledTrades.length; i++) {
  const t = filledTrades[i];
  const sym = t.symbol;
  const dir = t.direction;
  const entryP = t.entryP;
  const entryTs = t.entryTs;
  const allCandles = candlesMap[sym];
  const entryBarIdx = allCandles.findIndex(c => c.timestamp === entryTs);
  if (entryBarIdx === -1) {
    console.error(`Candle not found for ${t.signalId} at ${entryTs}`);
    continue;
  }

  const tradeCandles = allCandles.slice(entryBarIdx);

  // --- 15M INVALIDATION STOP SCENARIOS ---
  const sl15m = t.prodSl;
  const risk15m = t.prodRisk;
  const tp15m = dir === 'long' ? entryP + (2.0 * risk15m) : entryP - (2.0 * risk15m);
  const cost15m = t.prodCostDict.cr;

  // Scenario A: 1.0R BE
  const res15m_A = simulateTradeVariant(dir, entryP, sl15m, tp15m, tradeCandles, 1.0);
  const net15m_A = res15m_A.grossR - cost15m;

  // Scenario B: No-BE
  const res15m_B = simulateTradeVariant(dir, entryP, sl15m, tp15m, tradeCandles, null);
  const net15m_B = res15m_B.grossR - cost15m;

  // Scenario C: 1.5R BE
  const res15m_C = simulateTradeVariant(dir, entryP, sl15m, tp15m, tradeCandles, 1.5);
  const net15m_C = res15m_C.grossR - cost15m;

  // --- 1H STRUCTURAL STOP SCENARIOS ---
  const sl1h = t.structSl;
  const risk1h = t.structRisk;
  const tp1h = dir === 'long' ? entryP + (2.0 * risk1h) : entryP - (2.0 * risk1h);
  const cost1h = t.structCostDict.cr;

  // Scenario A: 1.0R BE
  const res1h_A = simulateTradeVariant(dir, entryP, sl1h, tp1h, tradeCandles, 1.0);
  const net1h_A = res1h_A.grossR - cost1h;

  // Scenario B: No-BE
  const res1h_B = simulateTradeVariant(dir, entryP, sl1h, tp1h, tradeCandles, null);
  const net1h_B = res1h_B.grossR - cost1h;

  // Scenario C: 1.5R BE
  const res1h_C = simulateTradeVariant(dir, entryP, sl1h, tp1h, tradeCandles, 1.5);
  const net1h_C = res1h_C.grossR - cost1h;

  detailedAuditResults.push({
    tradeIndex: i + 1,
    signalId: t.signalId,
    symbol: sym,
    direction: dir,
    poiType: t.poiType,
    signalTs: t.signalTs,
    signalDt: t.signalDt,
    entryTs: t.entryTs,
    entryDt: t.entryDt,
    entryP,
    // 15m stop
    sl15m, risk15m, tp15m, cost15m,
    scen15m_A: { outcome: res15m_A.outcome, grossR: res15m_A.grossR, netR: net15m_A, exitBar: res15m_A.exitBar, exitTs: res15m_A.exitTs, mfeR: res15m_A.mfeR, maeR: res15m_A.maeR },
    scen15m_B: { outcome: res15m_B.outcome, grossR: res15m_B.grossR, netR: net15m_B, exitBar: res15m_B.exitBar, exitTs: res15m_B.exitTs, mfeR: res15m_B.mfeR, maeR: res15m_B.maeR },
    scen15m_C: { outcome: res15m_C.outcome, grossR: res15m_C.grossR, netR: net15m_C, exitBar: res15m_C.exitBar, exitTs: res15m_C.exitTs, mfeR: res15m_C.mfeR, maeR: res15m_C.maeR },
    // 1h stop
    sl1h, risk1h, tp1h, cost1h,
    scen1h_A: { outcome: res1h_A.outcome, grossR: res1h_A.grossR, netR: net1h_A, exitBar: res1h_A.exitBar, exitTs: res1h_A.exitTs, mfeR: res1h_A.mfeR, maeR: res1h_A.maeR },
    scen1h_B: { outcome: res1h_B.outcome, grossR: res1h_B.grossR, netR: net1h_B, exitBar: res1h_B.exitBar, exitTs: res1h_B.exitTs, mfeR: res1h_B.mfeR, maeR: res1h_B.maeR },
    scen1h_C: { outcome: res1h_C.outcome, grossR: res1h_C.grossR, netR: net1h_C, exitBar: res1h_C.exitBar, exitTs: res1h_C.exitTs, mfeR: res1h_C.mfeR, maeR: res1h_C.maeR }
  });
}

const outPath = path.resolve(__dirname, 'phase4a_be_audit_results.json');
fs.writeFileSync(outPath, JSON.stringify(detailedAuditResults, null, 2), 'utf8');
console.log(`Saved detailed Phase 4A audit results to ${outPath}\n`);

// Helper to calculate aggregate stats
function calcAgg(trades, scenKey, costKey) {
  let count = trades.length;
  let tp = 0, sl = 0, be = 0, open = 0;
  let gross = 0, totalCost = 0, net = 0;
  let wins = 0, losses = 0;
  let peak = 0, cum = 0, maxDd = 0;

  for (const t of trades) {
    const sc = t[scenKey];
    const cost = t[costKey];
    if (sc.outcome === 'TP') { tp++; wins += sc.grossR; }
    else if (sc.outcome === 'SL') { sl++; losses += Math.abs(sc.grossR); }
    else if (sc.outcome === 'BE') { be++; }
    else { open++; }

    gross += sc.grossR;
    totalCost += cost;
    net += sc.netR;

    cum += sc.netR;
    if (cum > peak) peak = cum;
    const curDd = peak - cum;
    if (curDd > maxDd) maxDd = curDd;
  }

  const pf = losses > 0 ? wins / losses : (wins > 0 ? Infinity : 0);
  const exp = count > 0 ? net / count : 0;
  const wr = count > 0 ? (tp / count) * 100 : 0;

  return { count, tp, sl, be, open, wr, gross, totalCost, net, exp, pf, maxDd };
}

console.log('='.repeat(100));
console.log('AGGREGATE COMPARISON FOR PRODUCTION 15M STOP:');
console.log('='.repeat(100));
const pA = calcAgg(detailedAuditResults, 'scen15m_A', 'cost15m');
const pB = calcAgg(detailedAuditResults, 'scen15m_B', 'cost15m');
const pC = calcAgg(detailedAuditResults, 'scen15m_C', 'cost15m');

console.log('Scenario A (1.0R BE):', {
  TP: pA.tp, SL: pA.sl, BE: pA.be, Open: pA.open,
  Gross: pA.gross.toFixed(2) + 'R', Cost: pA.totalCost.toFixed(2) + 'R', Net: pA.net.toFixed(2) + 'R',
  Exp: pA.exp.toFixed(3) + 'R', PF: pA.pf.toFixed(2), MaxDD: pA.maxDd.toFixed(2) + 'R'
});
console.log('Scenario B (No-BE):', {
  TP: pB.tp, SL: pB.sl, BE: pB.be, Open: pB.open,
  Gross: pB.gross.toFixed(2) + 'R', Cost: pB.totalCost.toFixed(2) + 'R', Net: pB.net.toFixed(2) + 'R',
  Exp: pB.exp.toFixed(3) + 'R', PF: pB.pf.toFixed(2), MaxDD: pB.maxDd.toFixed(2) + 'R'
});
console.log('Scenario C (1.5R BE):', {
  TP: pC.tp, SL: pC.sl, BE: pC.be, Open: pC.open,
  Gross: pC.gross.toFixed(2) + 'R', Cost: pC.totalCost.toFixed(2) + 'R', Net: pC.net.toFixed(2) + 'R',
  Exp: pC.exp.toFixed(3) + 'R', PF: pC.pf.toFixed(2), MaxDD: pC.maxDd.toFixed(2) + 'R'
});

console.log('\n' + '='.repeat(100));
console.log('AGGREGATE COMPARISON FOR RESEARCH 1H STRUCTURAL STOP:');
console.log('='.repeat(100));
const sA = calcAgg(detailedAuditResults, 'scen1h_A', 'cost1h');
const sB = calcAgg(detailedAuditResults, 'scen1h_B', 'cost1h');
const sC = calcAgg(detailedAuditResults, 'scen1h_C', 'cost1h');

console.log('Scenario A (1.0R BE):', {
  TP: sA.tp, SL: sA.sl, BE: sA.be, Open: sA.open,
  Gross: sA.gross.toFixed(2) + 'R', Cost: sA.totalCost.toFixed(2) + 'R', Net: sA.net.toFixed(2) + 'R',
  Exp: sA.exp.toFixed(3) + 'R', PF: sA.pf.toFixed(2), MaxDD: sA.maxDd.toFixed(2) + 'R'
});
console.log('Scenario B (No-BE):', {
  TP: sB.tp, SL: sB.sl, BE: sB.be, Open: sB.open,
  Gross: sB.gross.toFixed(2) + 'R', Cost: sB.totalCost.toFixed(2) + 'R', Net: sB.net.toFixed(2) + 'R',
  Exp: sB.exp.toFixed(3) + 'R', PF: sB.pf.toFixed(2), MaxDD: sB.maxDd.toFixed(2) + 'R'
});
console.log('Scenario C (1.5R BE):', {
  TP: sC.tp, SL: sC.sl, BE: sC.be, Open: sC.open,
  Gross: sC.gross.toFixed(2) + 'R', Cost: sC.totalCost.toFixed(2) + 'R', Net: sC.net.toFixed(2) + 'R',
  Exp: sC.exp.toFixed(3) + 'R', PF: sC.pf.toFixed(2), MaxDD: sC.maxDd.toFixed(2) + 'R'
});
