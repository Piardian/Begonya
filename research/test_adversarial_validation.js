/**
 * BEGONYA - ADVERSARIAL TOPLU DOĞRULAMA TEST PAKETİ
 * ==================================================
 * Path: research/test_adversarial_validation.js
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('='.repeat(80));
console.log('BEGONYA ADVERSARIAL VALIDATION TEST SUITE');
console.log('='.repeat(80));

const resultsPath = path.resolve(__dirname, 'true_historical_replay_results.json');
assert(fs.existsSync(resultsPath), 'true_historical_replay_results.json must exist');
const records = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));

let passedTests = 0;
let totalTests = 0;

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

// 1. Signal Reconciliation Audit
runTest('Signal Accounting Reconciliation (Exact 94 = 65 Expired + 6 Filtered + 23 Filled)', () => {
  assert.strictEqual(records.length, 94, `Expected 94 signals, found ${records.length}`);
  const expired = records.filter(r => r.status === 'EXPIRED_UNFILLED');
  const filtered = records.filter(r => r.status === 'FILTERED_CR_EXCEEDED');
  const filled = records.filter(r => r.status === 'FILLED');
  assert.strictEqual(expired.length, 65, `Expected 65 expired, found ${expired.length}`);
  assert.strictEqual(filtered.length, 6, `Expected 6 filtered, found ${filtered.length}`);
  assert.strictEqual(filled.length, 23, `Expected 23 filled, found ${filled.length}`);
  assert.strictEqual(expired.length + filtered.length + filled.length, 94, 'All signals must reconcile exactly');
});

// 2. Sample Size Constraint Test
runTest('Sample Size Gate Enforcement (N < 50 must trigger INSUFFICIENT DATA)', () => {
  const filled = records.filter(r => r.status === 'FILLED');
  const MIN_SAMPLE_SIZE = 50;
  assert(filled.length < MIN_SAMPLE_SIZE, `Sample size ${filled.length} is less than ${MIN_SAMPLE_SIZE}`);
  const isSufficient = filled.length >= MIN_SAMPLE_SIZE;
  assert.strictEqual(isSufficient, false, 'Sample size must be declared insufficient');
});

// 3. Stop Placement Directionality Test
runTest('Stop Level Directionality (Long SL < Entry, Short SL > Entry)', () => {
  const filled = records.filter(r => r.status === 'FILLED');
  for (const t of filled) {
    if (t.direction === 'long') {
      assert(t.structSl < t.entryP, `Long trade ${t.signalId} has SL ${t.structSl} >= entry ${t.entryP}`);
    } else {
      assert(t.structSl > t.entryP, `Short trade ${t.signalId} has SL ${t.structSl} <= entry ${t.entryP}`);
    }
  }
});

// 4. Arithmetic Consistency of Net R and Costs
runTest('R Accounting Consistency (Net R == Gross R - C/R)', () => {
  const filled = records.filter(r => r.status === 'FILLED');
  for (const t of filled) {
    const cr = t.costDict.cr;
    const expectedNetB = t.resB.grossR - cr;
    const expectedNetC = t.resC.grossR - cr;
    assert(Math.abs(t.netRB - expectedNetB) < 1e-6, `Net R B mismatch in ${t.signalId}: ${t.netRB} vs ${expectedNetB}`);
    assert(Math.abs(t.netRC - expectedNetC) < 1e-6, `Net R C mismatch in ${t.signalId}: ${t.netRC} vs ${expectedNetC}`);
  }
});

// 5. Conservative Same-Bar SL/TP Collision Logic
runTest('Conservative Conflict Resolution (Same-bar SL+TP must NOT award full TP)', () => {
  const filled = records.filter(r => r.status === 'FILLED');
  for (const t of filled) {
    if (t.resB.reason === 'CONFLICT_SL_FIRST') {
      assert(t.resB.outcome === 'SL' || t.resB.outcome === 'BE', `Conflicted trade must exit as SL or BE, got ${t.resB.outcome}`);
      assert(t.resB.grossR <= 0.0, `Conflicted trade cannot have positive gross R, got ${t.resB.grossR}`);
    }
  }
});

// 6. MFE and MAE Lifetime Bounds
runTest('MFE / MAE Lifetime Non-Negativity Bounds', () => {
  const filled = records.filter(r => r.status === 'FILLED');
  for (const t of filled) {
    assert(t.resB.mfeR >= 0, `Trade ${t.signalId} has negative MFE: ${t.resB.mfeR}`);
    assert(t.resB.maeR >= 0, `Trade ${t.signalId} has negative MAE: ${t.resB.maeR}`);
  }
});

// 7. No Retroactive Macro Leakage
runTest('Macro Gate Independence (Replay strictly decoupled from macro_bias_gate.json)', () => {
  const replayCode = fs.readFileSync(path.resolve(__dirname, 'run_true_historical_replay.js'), 'utf8');
  assert(!replayCode.includes('macro_bias_gate.json'), 'Replay must NOT load static macro_bias_gate.json');
});

// 8. Timestamp Monotonicity and Killzone Validity
runTest('Timestamp Chronology (Entry Time >= Signal Time and Exit Time >= Entry Time)', () => {
  const filled = records.filter(r => r.status === 'FILLED');
  for (const t of filled) {
    assert(t.entryTs >= t.signalTs, `Trade ${t.signalId} entered before signal: ${t.entryTs} < ${t.signalTs}`);
    assert(t.resB.exitTs >= t.entryTs, `Trade ${t.signalId} exited before entry: ${t.resB.exitTs} < ${t.entryTs}`);
  }
});

console.log('='.repeat(80));
console.log(`SUMMARY: ${passedTests} / ${totalTests} Adversarial Tests Passed.`);
console.log('='.repeat(80));

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
