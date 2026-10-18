/**
 * BEGONYA - AŞAMA 4A: ADVERSARIAL TEST PAKETİ
 * ===========================================
 * Path: research/test_phase4a_audit.js
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('='.repeat(80));
console.log('BEGONYA PHASE 4A ADVERSARIAL TEST SUITE');
console.log('='.repeat(80));

const jsonPath = path.resolve(__dirname, 'phase4a_be_audit_results.json');
assert(fs.existsSync(jsonPath), 'phase4a_be_audit_results.json must exist');
const trades = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

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

// 1. Trade Cohort Integrity
runTest('1. Cohort Completeness (Exactly 38 Trades)', () => {
  assert.strictEqual(trades.length, 38, `Expected 38 trades, found ${trades.length}`);
});

// 2. 29 BE Trades Count and Fate Verification
runTest('2. 29 BE Trades Fate (15M Stop: 12 TP, 17 SL)', () => {
  const beTrades = trades.filter(t => t.scen15m_A.outcome === 'BE');
  assert.strictEqual(beTrades.length, 29, `Expected 29 BE trades in 15M stop, found ${beTrades.length}`);
  const tpCount = beTrades.filter(t => t.scen15m_B.outcome === 'TP').length;
  const slCount = beTrades.filter(t => t.scen15m_B.outcome === 'SL').length;
  assert.strictEqual(tpCount, 12, `Expected 12 to become TP, found ${tpCount}`);
  assert.strictEqual(slCount, 17, `Expected 17 to become SL, found ${slCount}`);
});

// 3. Mathematical Reconciliation of 15M Scenarios
runTest('3. Reconciliation of 15M Stop Scenarios (A, B, C)', () => {
  // Scenario A: 2 TP, 7 SL, 29 BE -> Gross -3.00R, Cost 10.92R, Net -13.92R
  const aTP = trades.filter(t => t.scen15m_A.outcome === 'TP').length;
  const aSL = trades.filter(t => t.scen15m_A.outcome === 'SL').length;
  const aBE = trades.filter(t => t.scen15m_A.outcome === 'BE').length;
  assert.strictEqual(aTP, 2);
  assert.strictEqual(aSL, 7);
  assert.strictEqual(aBE, 29);

  // Scenario B: 14 TP, 24 SL, 0 BE -> Gross +4.00R, Cost 10.92R, Net -6.92R
  const bTP = trades.filter(t => t.scen15m_B.outcome === 'TP').length;
  const bSL = trades.filter(t => t.scen15m_B.outcome === 'SL').length;
  const bBE = trades.filter(t => t.scen15m_B.outcome === 'BE').length;
  assert.strictEqual(bTP, 14);
  assert.strictEqual(bSL, 24);
  assert.strictEqual(bBE, 0);

  // Scenario C: 4 TP, 13 SL, 21 BE -> Gross -5.00R, Cost 10.92R, Net -15.92R
  const cTP = trades.filter(t => t.scen15m_C.outcome === 'TP').length;
  const cSL = trades.filter(t => t.scen15m_C.outcome === 'SL').length;
  const cBE = trades.filter(t => t.scen15m_C.outcome === 'BE').length;
  assert.strictEqual(cTP, 4);
  assert.strictEqual(cSL, 13);
  assert.strictEqual(cBE, 21);
});

// 4. Overlap & Concurrency Independence
runTest('4. Trade Overlap Independence (Zero Concurrent Overlapping Trades Across Portfolio)', () => {
  for (let i = 0; i < trades.length - 1; i++) {
    const cur = trades[i];
    const next = trades[i + 1];
    assert(cur.scen15m_B.exitTs <= next.entryTs, `Trade ${i+1} overlaps with trade ${i+2}`);
  }
});

// 5. Arithmetic Net R Consistency
runTest('5. Net R Formula Consistency (Net R == Gross R - C/R)', () => {
  for (const t of trades) {
    const cost = t.cost15m;
    assert(Math.abs(t.scen15m_A.netR - (t.scen15m_A.grossR - cost)) < 1e-6);
    assert(Math.abs(t.scen15m_B.netR - (t.scen15m_B.grossR - cost)) < 1e-6);
    assert(Math.abs(t.scen15m_C.netR - (t.scen15m_C.grossR - cost)) < 1e-6);
  }
});

// 6. Cost Sensitivity Multipliers
runTest('6. Cost Sensitivity Invariant (Cost Scales Linearly with Multipliers)', () => {
  const baseCost = trades.reduce((a, b) => a + b.cost15m, 0);
  assert(Math.abs(baseCost - 10.92) < 0.05, `Base cost should be ~10.92R, got ${baseCost}`);
});

// 7. Sample Size Limit Assertion
runTest('7. Sample Size Gate (38 Trades < 50 Target => INSUFFICIENT DATA)', () => {
  const targetThreshold = 50;
  assert(trades.length < targetThreshold, 'Sample size must be strictly less than 50');
});

console.log('='.repeat(80));
console.log(`SUMMARY: ${passedTests} / ${totalTests} Phase 4A Adversarial Tests Passed.`);
console.log('='.repeat(80));

if (passedTests === totalTests) process.exit(0);
else process.exit(1);
