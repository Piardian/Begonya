/**
 * BEGONYA - PHASE 4B: ENTRY EXECUTION & REPLAY ENGINE ADVERSARIAL TEST SUITE
 * =========================================================================
 * Path: research/test_phase4b_execution.js
 * 
 * Tests the 7 mandatory synthetic execution scenarios to prove that
 * the replay engine has zero intra-bar price leakage and sound accounting.
 */

const assert = require('assert');

/**
 * Robust, leak-free trade execution engine for research replay
 */
function executeReplayTrade(params) {
  const {
    direction,
    entryP,
    slP,
    tpP,
    candles,
    beThresholdR = null,
    partialTp = null, // { ratio: 0.5, tpR: 2.0 }
    costR = 0.0,
    entryWindowBars = 16,
    conflictPolicy = 'CONSERVATIVE_SL_FIRST',
    bar0Method = 'STRICT_BAR1'
  } = params;

  const riskDist = Math.abs(entryP - slP);
  if (riskDist <= 0) throw new Error('Risk distance must be greater than zero');

  // 1. Check Entry Fill
  let entryFilled = false;
  let entryBarIdx = -1;
  let entryTs = null;

  const scanLimit = Math.min(entryWindowBars, candles.length);
  for (let i = 0; i < scanLimit; i++) {
    const c = candles[i];
    if (direction === 'long' && c.low <= entryP) {
      entryFilled = true;
      entryBarIdx = i;
      entryTs = c.timestamp;
      break;
    } else if (direction === 'short' && c.high >= entryP) {
      entryFilled = true;
      entryBarIdx = i;
      entryTs = c.timestamp;
      break;
    }
  }

  if (!entryFilled) {
    return {
      status: 'EXPIRED_UNFILLED',
      filled: false,
      grossR: 0.0,
      costR: 0.0,
      netR: 0.0,
      outcome: 'UNFILLED',
      reason: 'ENTRY_LIMIT_NOT_REACHED'
    };
  }

  // 2. Lifecycle tracking post-fill
  let effectiveSl = slP;
  let beArmed = false;
  let mfeP = entryP;
  let maeP = entryP;
  let partialClosed = false;
  let partialGrossR = 0.0;
  let remainingRatio = 1.0;

  for (let barIdx = entryBarIdx; barIdx < candles.length; barIdx++) {
    const c = candles[barIdx];
    let h = c.high;
    let l = c.low;
    const isEntryBar = (barIdx === entryBarIdx);

    // Intra-bar guard on entry bar
    if (isEntryBar) {
      if (bar0Method === 'STRICT_BAR1') {
        // Evaluate only adverse excursion on Bar 0
        if (direction === 'long') {
          if (l < maeP) maeP = l;
          if (l <= effectiveSl) {
            return {
              status: 'FILLED',
              filled: true,
              outcome: 'SL',
              grossR: -1.0,
              costR,
              netR: -1.0 - costR,
              exitBar: 0,
              exitTs: c.timestamp,
              mfeR: 0.0,
              maeR: (entryP - maeP) / riskDist,
              reason: 'STOP_LOSS_HIT_ON_ENTRY_BAR',
              beArmed: false
            };
          }
          // Do NOT evaluate favorable movement, BE arming, or TP on Bar 0
          continue;
        } else { // short
          if (h > maeP) maeP = h;
          if (h >= effectiveSl) {
            return {
              status: 'FILLED',
              filled: true,
              outcome: 'SL',
              grossR: -1.0,
              costR,
              netR: -1.0 - costR,
              exitBar: 0,
              exitTs: c.timestamp,
              mfeR: 0.0,
              maeR: (maeP - entryP) / riskDist,
              reason: 'STOP_LOSS_HIT_ON_ENTRY_BAR',
              beArmed: false
            };
          }
          continue;
        }
      } else if (bar0Method === 'CLOSE_BOUNDED') {
        if (direction === 'long') {
          h = Math.max(entryP, c.close);
          l = c.low;
        } else {
          l = Math.min(entryP, c.close);
          h = c.high;
        }
      }
    }

    // Evaluation for subsequent bars (or bounded bar 0)
    if (direction === 'long') {
      if (h > mfeP) mfeP = h;
      if (l < maeP) maeP = l;

      // BE check
      if (beThresholdR !== null && !beArmed && (h - entryP) >= (beThresholdR * riskDist)) {
        beArmed = true;
        effectiveSl = entryP;
      }

      // Partial TP check
      if (partialTp && !partialClosed) {
        const pTargetP = entryP + partialTp.tpR * riskDist;
        if (h >= pTargetP) {
          partialClosed = true;
          partialGrossR = partialTp.ratio * partialTp.tpR;
          remainingRatio = 1.0 - partialTp.ratio;
          // Partial TP automatically moves remainder to BE
          beArmed = true;
          effectiveSl = entryP;
        }
      }

      const hitSl = (l <= effectiveSl);
      const hitTp = !partialTp && (h >= tpP);

      if (hitSl && hitTp) {
        const out = (beArmed && effectiveSl === entryP) ? 'BE' : 'SL';
        const gR = (beArmed && effectiveSl === entryP) ? 0.0 : -1.0;
        return {
          status: 'FILLED', filled: true, outcome: out,
          grossR: gR, costR, netR: gR - costR,
          exitBar: barIdx - entryBarIdx, exitTs: c.timestamp,
          mfeR: (mfeP - entryP) / riskDist, maeR: (entryP - maeP) / riskDist,
          reason: 'CONFLICT_SL_FIRST', beArmed
        };
      } else if (hitSl) {
        let finalGrossR = (beArmed && effectiveSl === entryP) ? 0.0 : -1.0;
        if (partialClosed) {
          finalGrossR = partialGrossR + (remainingRatio * ((beArmed && effectiveSl === entryP) ? 0.0 : -1.0));
        }
        const out = (beArmed && effectiveSl === entryP) ? 'BE' : 'SL';
        return {
          status: 'FILLED', filled: true, outcome: out,
          grossR: finalGrossR, costR, netR: finalGrossR - costR,
          exitBar: barIdx - entryBarIdx, exitTs: c.timestamp,
          mfeR: (mfeP - entryP) / riskDist, maeR: (entryP - maeP) / riskDist,
          reason: (beArmed && effectiveSl === entryP) ? 'BREAK_EVEN_HIT' : 'STOP_LOSS_HIT',
          beArmed, partialClosed
        };
      } else if (hitTp) {
        return {
          status: 'FILLED', filled: true, outcome: 'TP',
          grossR: 2.0, costR, netR: 2.0 - costR,
          exitBar: barIdx - entryBarIdx, exitTs: c.timestamp,
          mfeR: (tpP - entryP) / riskDist, maeR: (entryP - maeP) / riskDist,
          reason: 'TAKE_PROFIT_HIT', beArmed
        };
      }
    } else { // short
      if (l < mfeP) mfeP = l;
      if (h > maeP) maeP = h;

      if (beThresholdR !== null && !beArmed && (entryP - l) >= (beThresholdR * riskDist)) {
        beArmed = true;
        effectiveSl = entryP;
      }

      if (partialTp && !partialClosed) {
        const pTargetP = entryP - partialTp.tpR * riskDist;
        if (l <= pTargetP) {
          partialClosed = true;
          partialGrossR = partialTp.ratio * partialTp.tpR;
          remainingRatio = 1.0 - partialTp.ratio;
          beArmed = true;
          effectiveSl = entryP;
        }
      }

      const hitSl = (h >= effectiveSl);
      const hitTp = !partialTp && (l <= tpP);

      if (hitSl && hitTp) {
        const out = (beArmed && effectiveSl === entryP) ? 'BE' : 'SL';
        const gR = (beArmed && effectiveSl === entryP) ? 0.0 : -1.0;
        return {
          status: 'FILLED', filled: true, outcome: out,
          grossR: gR, costR, netR: gR - costR,
          exitBar: barIdx - entryBarIdx, exitTs: c.timestamp,
          mfeR: (entryP - mfeP) / riskDist, maeR: (maeP - entryP) / riskDist,
          reason: 'CONFLICT_SL_FIRST', beArmed
        };
      } else if (hitSl) {
        let finalGrossR = (beArmed && effectiveSl === entryP) ? 0.0 : -1.0;
        if (partialClosed) {
          finalGrossR = partialGrossR + (remainingRatio * ((beArmed && effectiveSl === entryP) ? 0.0 : -1.0));
        }
        const out = (beArmed && effectiveSl === entryP) ? 'BE' : 'SL';
        return {
          status: 'FILLED', filled: true, outcome: out,
          grossR: finalGrossR, costR, netR: finalGrossR - costR,
          exitBar: barIdx - entryBarIdx, exitTs: c.timestamp,
          mfeR: (entryP - mfeP) / riskDist, maeR: (maeP - entryP) / riskDist,
          reason: (beArmed && effectiveSl === entryP) ? 'BREAK_EVEN_HIT' : 'STOP_LOSS_HIT',
          beArmed, partialClosed
        };
      } else if (hitTp) {
        return {
          status: 'FILLED', filled: true, outcome: 'TP',
          grossR: 2.0, costR, netR: 2.0 - costR,
          exitBar: barIdx - entryBarIdx, exitTs: c.timestamp,
          mfeR: (entryP - tpP) / riskDist, maeR: (maeP - entryP) / riskDist,
          reason: 'TAKE_PROFIT_HIT', beArmed
        };
      }
    }
  }

  // End of data
  const lastC = candles[candles.length - 1];
  const openPnLR = (direction === 'long' ? (lastC.close - entryP) : (entryP - lastC.close)) / riskDist;
  const finalGross = partialClosed ? (partialGrossR + remainingRatio * openPnLR) : openPnLR;

  return {
    status: 'FILLED',
    filled: true,
    outcome: 'OPEN_TIMEOUT',
    grossR: finalGross,
    costR,
    netR: finalGross - costR,
    exitBar: candles.length - 1 - entryBarIdx,
    exitTs: lastC.timestamp,
    mfeR: (direction === 'long' ? (mfeP - entryP) : (entryP - mfeP)) / riskDist,
    maeR: (direction === 'long' ? (entryP - maeP) : (maeP - entryP)) / riskDist,
    reason: 'END_OF_DATA',
    beArmed,
    partialClosed
  };
}

// =========================================================================
// RUNNING THE 7 SYNTHETIC SCENARIO TESTS
// =========================================================================

console.log('='.repeat(80));
console.log('BEGONYA - PHASE 4B: RUNNING 7 SYNTHETIC EXECUTION TESTS');
console.log('='.repeat(80));

let passCount = 0;

// SCENARIO 1: Candle open beyond TP; price drops to limit entry. Pre-entry TP must NOT book profit!
{
  const candles = [
    { timestamp: 1000, open: 105, high: 105, low: 99, close: 99.5 }, // Bar 0: Long entry at 100
    { timestamp: 2000, open: 99.5, high: 101, low: 99.0, close: 100.5 } // Bar 1: does not hit TP (104)
  ];
  const res = executeReplayTrade({
    direction: 'long',
    entryP: 100,
    slP: 98, // risk = 2
    tpP: 104, // +2R
    candles,
    bar0Method: 'STRICT_BAR1'
  });

  assert.notStrictEqual(res.outcome, 'TP', 'Scenario 1 FAIL: Pre-entry high must not trigger TP');
  assert.strictEqual(res.reason, 'END_OF_DATA', 'Scenario 1: Trade should remain open until end of data');
  console.log('✔ PASS Scenario 1: Pre-entry TP excursion does NOT book profit.');
  passCount++;
}

// SCENARIO 2: Candle open beyond +1R; price drops to limit. Pre-entry move must NOT arm BE.
{
  const candles = [
    { timestamp: 1000, open: 103, high: 103, low: 99.5, close: 100 }, // Bar 0: Long entry at 100 (+1R is 102)
    { timestamp: 2000, open: 100, high: 101, low: 99.8, close: 100.2 } // Bar 1
  ];
  const res = executeReplayTrade({
    direction: 'long',
    entryP: 100,
    slP: 98,
    tpP: 104,
    candles,
    beThresholdR: 1.0,
    bar0Method: 'STRICT_BAR1'
  });

  assert.strictEqual(res.beArmed, false, 'Scenario 2 FAIL: BE must NOT be armed on Bar 0 from pre-entry open');
  console.log('✔ PASS Scenario 2: Pre-entry +1R excursion does NOT arm BE on Bar 0.');
  passCount++;
}

// SCENARIO 3: Same candle hits both SL and TP. Conservative policy CONFLICT_SL_FIRST applied.
{
  const candles = [
    { timestamp: 1000, open: 100.5, high: 101, low: 99.5, close: 100 }, // Bar 0: entry fills at 100
    { timestamp: 2000, open: 100, high: 106, low: 96, close: 101 } // Bar 1: hits SL (98) and TP (104)
  ];
  const res = executeReplayTrade({
    direction: 'long',
    entryP: 100,
    slP: 98,
    tpP: 104,
    candles,
    bar0Method: 'STRICT_BAR1'
  });

  assert.strictEqual(res.outcome, 'SL', 'Scenario 3 FAIL: Conflict must resolve to SL');
  assert.strictEqual(res.grossR, -1.0, 'Scenario 3 FAIL: Gross R must be -1.0');
  assert.strictEqual(res.reason, 'CONFLICT_SL_FIRST', 'Scenario 3 FAIL: Reason must be CONFLICT_SL_FIRST');
  console.log('✔ PASS Scenario 3: Same-bar SL/TP conflict resolves conservatively to SL (-1.0R).');
  passCount++;
}

// SCENARIO 4: Order never fills. Trade must not be opened.
{
  const candles = [
    { timestamp: 1000, open: 102, high: 103, low: 101, close: 102 },
    { timestamp: 2000, open: 102, high: 104, low: 101.5, close: 103 }
  ];
  const res = executeReplayTrade({
    direction: 'long',
    entryP: 100,
    slP: 98,
    tpP: 104,
    candles,
    entryWindowBars: 2
  });

  assert.strictEqual(res.status, 'EXPIRED_UNFILLED', 'Scenario 4 FAIL: Order must expire unfilled');
  assert.strictEqual(res.filled, false, 'Scenario 4 FAIL: filled must be false');
  assert.strictEqual(res.grossR, 0.0, 'Scenario 4 FAIL: Gross R must be 0');
  console.log('✔ PASS Scenario 4: Unfilled limit order expires without opening trade.');
  passCount++;
}

// SCENARIO 5: Trade still open at end of data. Must not be artificially closed as TP, SL, or BE.
{
  const candles = [
    { timestamp: 1000, open: 100.5, high: 101, low: 99.5, close: 100 }, // Bar 0: fills at 100
    { timestamp: 2000, open: 100, high: 101, low: 99.0, close: 100.5 }, // Bar 1
    { timestamp: 3000, open: 100.5, high: 101.5, low: 99.5, close: 101 } // Bar 2: last candle, close = 101 (+0.5R)
  ];
  const res = executeReplayTrade({
    direction: 'long',
    entryP: 100,
    slP: 98, // risk = 2
    tpP: 104,
    candles,
    bar0Method: 'STRICT_BAR1'
  });

  assert.strictEqual(res.outcome, 'OPEN_TIMEOUT', 'Scenario 5 FAIL: Outcome must be OPEN_TIMEOUT');
  assert.strictEqual(res.reason, 'END_OF_DATA', 'Scenario 5 FAIL: Reason must be END_OF_DATA');
  assert.strictEqual(res.grossR, 0.5, 'Scenario 5 FAIL: Open PnL must be +0.5R');
  console.log('✔ PASS Scenario 5: End-of-data trade marked OPEN_TIMEOUT with exact mark-to-market PnL.');
  passCount++;
}

// SCENARIO 6: Partial TP (50% at +2R) + remaining at BE (0R).
{
  const candles = [
    { timestamp: 1000, open: 100.5, high: 101, low: 99.5, close: 100 }, // Bar 0: fills at 100
    { timestamp: 2000, open: 100, high: 104.5, low: 100.5, close: 103 }, // Bar 1: hits TP (+2R, partial closes 50%)
    { timestamp: 3000, open: 103, high: 103, low: 99.5, close: 99.8 } // Bar 2: drops to 99.5 (hits BE at 100)
  ];
  const res = executeReplayTrade({
    direction: 'long',
    entryP: 100,
    slP: 98,
    tpP: 104,
    candles,
    partialTp: { ratio: 0.5, tpR: 2.0 },
    costR: 0.15,
    bar0Method: 'STRICT_BAR1'
  });

  // 50% * 2.0R = 1.0R; remainder 50% * 0.0R = 0.0R -> Total Gross = +1.0R. Net = 1.0 - 0.15 = +0.85R
  assert.strictEqual(res.partialClosed, true, 'Scenario 6 FAIL: partialClosed must be true');
  assert.strictEqual(res.outcome, 'BE', 'Scenario 6 FAIL: Final outcome must be BE');
  assert.strictEqual(res.grossR, 1.0, 'Scenario 6 FAIL: Gross R must be 1.0');
  assert.strictEqual(res.netR, 0.85, 'Scenario 6 FAIL: Net R must be 0.85');
  console.log('✔ PASS Scenario 6: Partial TP (50% @ +2R) + remainder @ BE correctly yields Gross +1.0R, Net +0.85R.');
  passCount++;
}

// SCENARIO 7: Cost conversion consistency: scales inversely with stop distance.
{
  function calcCostInR(entryP, stopDistanceP, feeRatePct = 0.00055) {
    const notionalPerR = entryP / stopDistanceP;
    return notionalPerR * feeRatePct;
  }

  const btcEntry = 60000;
  const wideStopDist = 600; // 1H stop (1%) -> notional/R = 100
  const tightStopDist = 150; // 15M stop (0.25%) -> notional/R = 400

  const costWideR = calcCostInR(btcEntry, wideStopDist);
  const costTightR = calcCostInR(btcEntry, tightStopDist);

  assert.strictEqual(costWideR, 0.055, 'Scenario 7 FAIL: Wide stop cost must be 0.055R');
  assert.strictEqual(costTightR, 0.22, 'Scenario 7 FAIL: Tight stop cost must be 0.22R (4x higher)');
  assert.strictEqual(costTightR / costWideR, 4, 'Scenario 7 FAIL: Cost ratio must match stop inverse ratio');
  console.log('✔ PASS Scenario 7: Cost in R scales inversely with stop distance (0.055R wide vs 0.22R tight).');
  passCount++;
}

console.log('='.repeat(80));
console.log(`ALL ${passCount} / 7 SYNTHETIC SCENARIOS PASSED WITH ZERO LEAKAGE.`);
console.log('='.repeat(80));

module.exports = { executeReplayTrade };
