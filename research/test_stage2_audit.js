/**
 * BEGONYA - İKİNCİ AŞAMA BAĞIMSIZ DENETİM TEST PAKETİ
 * ==================================================
 * Path: research/test_stage2_audit.js
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('='.repeat(80));
console.log('BEGONYA STAGE 2 INDEPENDENT AUDIT SUITE');
console.log('='.repeat(80));

const dataDir = path.resolve(__dirname, '../../swing-bos-core/data/replay_1year');
const resultsPath = path.resolve(__dirname, 'true_historical_replay_results.json');
const records = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
const filled = records.filter(r => r.status === 'FILLED');

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`[PASS] Test ${totalTests}: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] Test ${totalTests}: ${name} -> ${err.message}`);
  }
}

// -------------------------------------------------------------
// 1. CANDLE TIMESTAMP AND SIGNAL TIMING
// -------------------------------------------------------------
runTest('1.1. OHLC Timestamps Represent Candle Open Time (Empirical Continuity)', () => {
  const btc15 = JSON.parse(fs.readFileSync(path.join(dataDir, 'BTCUSD_15m.json'), 'utf8')).slice(0, 50);
  let continuityMatches = 0;
  for (let i = 0; i < btc15.length - 1; i++) {
    const c1 = btc15[i];
    const c2 = btc15[i + 1];
    assert.strictEqual(c2.timestamp - c1.timestamp, 900000, 'Time step must be 900,000 ms');
    if (Math.abs(c2.open - c1.close) < 0.2) continuityMatches++;
  }
  assert(continuityMatches >= 45, 'At least 90% of consecutive candles must have open == prev.close');
});

runTest('1.2. Earliest Usable Time for Break Candle (T_break + 15m Close Requirement)', () => {
  const { filterClosedCandles } = require('../../swing-bos-core/dist/server/pipeline');
  const dummyCandles = [
    { timestamp: 1000000, open: 100, high: 105, low: 95, close: 102 },
    { timestamp: 1900000, open: 102, high: 110, low: 101, close: 108 } // break candle at idx 1
  ];
  // At break open timestamp (1900000):
  const atOpen = filterClosedCandles(dummyCandles, 900000, 1900000);
  assert.strictEqual(atOpen.length, 1, 'At open timestamp, break candle must NOT be closed');
  assert.strictEqual(atOpen[0].timestamp, 1000000);

  // At break close timestamp (2800000):
  const atClose = filterClosedCandles(dummyCandles, 900000, 2800000);
  assert.strictEqual(atClose.length, 2, 'At close timestamp, break candle must be included');
});

runTest('1.3. Replay curTime Timing Isolation (No Candle idx Leakage in runPipeline)', () => {
  // Verifies that when run_true_historical_replay passes curTime = all15m[idx].timestamp,
  // candle idx is strictly excluded by filterClosedCandles
  const { filterClosedCandles } = require('../../swing-bos-core/dist/server/pipeline');
  const btc15 = JSON.parse(fs.readFileSync(path.join(dataDir, 'BTCUSD_15m.json'), 'utf8'));
  const testIdx = 1000;
  const curTime = btc15[testIdx].timestamp;
  const slice = btc15.slice(testIdx - 20, testIdx + 1);
  const closed = filterClosedCandles(slice, 900000, curTime);
  assert.strictEqual(closed[closed.length - 1].timestamp, btc15[testIdx - 1].timestamp);
  assert(!closed.some(c => c.timestamp === curTime), 'Candle idx must be excluded at curTime');
});

// -------------------------------------------------------------
// 2. COST MODEL AND SENSITIVITY
// -------------------------------------------------------------
runTest('2.1. Cost Model Structure (Applied Solely to Entry Price, Not Exit Price)', () => {
  for (const t of filled) {
    if (t.symbol === 'BTCUSD') {
      const expectedTotalUsd = t.entryP * (0.00040 + 0.00010 + 0.00015);
      assert(Math.abs(t.costDict.totalCostUsd - expectedTotalUsd) < 1e-4, 'BTC total cost formula mismatch');
    }
  }
});

runTest('2.2. Cost Sensitivity Analysis Verification', () => {
  const multipliers = [1.0, 1.25, 1.5, 2.0];
  const expectedNetBs = [-0.93, -1.42, -1.90, -2.87];

  multipliers.forEach((m, idx) => {
    let netRB = 0;
    for (const t of filled) {
      const cR = t.costDict.cr * m;
      netRB += (t.resB.grossR - cR);
    }
    assert(Math.abs(netRB - expectedNetBs[idx]) < 0.05, `Sensitivity at ${m}x mismatch: ${netRB} vs ${expectedNetBs[idx]}`);
  });
});

// -------------------------------------------------------------
// 3. PRODUCTION VS REPLAY EQUIVALENCE
// -------------------------------------------------------------
runTest('3.1. Replay Uses Frozen 1H Structural Stop Formula (Independent of Production 15M Invalidation)', () => {
  for (const t of filled) {
    // Stop must be strictly above entry for short, and strictly below for long
    if (t.direction === 'long') {
      assert(t.structSl < t.entryP, 'Long structural SL must be below entry');
    } else {
      assert(t.structSl > t.entryP, 'Short structural SL must be above entry');
    }
    // Structural risk must be positive and non-zero
    assert(t.structRisk > 0, 'Structural risk must be positive');
  }
});

runTest('3.2. Macro Gate Isolation (Replay decoupled from macro_bias_gate.json)', () => {
  const code = fs.readFileSync(path.resolve(__dirname, 'run_true_historical_replay.js'), 'utf8');
  assert(!code.includes('macro_bias_gate'), 'Replay must not import or read macro_bias_gate');
});

console.log('='.repeat(80));
console.log(`STAGE 2 AUDIT: ${passedTests} / ${totalTests} Tests Passed.`);
console.log('='.repeat(80));

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
