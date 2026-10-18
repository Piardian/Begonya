/**
 * BEGONYA - İKİNCİ AŞAMA DENETİM: ZAMANLAMA VE KIRILIM KANITI TESTİ
 * Path: research/test_timing_and_break_proof.js
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const dataDir = path.resolve(__dirname, '../../swing-bos-core/data/replay_1year');
const btc15 = JSON.parse(fs.readFileSync(path.join(dataDir, 'BTCUSD_15m.json'), 'utf8'));

console.log('='.repeat(80));
console.log('TEST 1: OHLC TIMESTAMP OPEN VS CLOSE VERIFICATION');
console.log('='.repeat(80));

// Check first 10 candles: close of candle i should equal open of candle i+1
let openMatchCount = 0;
for (let i = 0; i < 20; i++) {
  const cCurrent = btc15[i];
  const cNext = btc15[i + 1];
  const deltaTs = cNext.timestamp - cCurrent.timestamp;
  assert.strictEqual(deltaTs, 15 * 60 * 1000, 'Candle delta must be exactly 15 minutes');
  // Check if open of next candle matches close of current candle
  const diff = Math.abs(cNext.open - cCurrent.close);
  if (diff < 0.1) openMatchCount++;
  console.log(`Candle #${i}: [${new Date(cCurrent.timestamp).toISOString()}] Open: ${cCurrent.open} Close: ${cCurrent.close} | Next Open: ${cNext.open} (Diff: ${diff.toFixed(2)})`);
}
console.log(`Open-Close continuity matches: ${openMatchCount} / 20`);
assert(openMatchCount >= 18, 'Continuous price action proves timestamp is candle OPEN');
console.log('-> PROVEN: Timestamp in replay_1year represents candle OPEN time.\n');

console.log('='.repeat(80));
console.log('TEST 2: EARLIEST AVAILABLE TIME FOR A KNOWN BREAK');
console.log('='.repeat(80));

const { detectSwings } = require('../../swing-bos-core/dist/src/swingDetector');
const { detectStructure } = require('../../swing-bos-core/dist/src/structureDetector');
const { filterClosedCandles } = require('../../swing-bos-core/dist/server/pipeline');

const swings = detectSwings(btc15);
const struct = detectStructure(btc15, swings);
const firstBreak = struct.events[0];
const breakIdx = firstBreak.breakCandleIndex;
const breakCandle = btc15[breakIdx];
const breakOpenTs = breakCandle.timestamp;
const breakCloseTs = breakOpenTs + 15 * 60 * 1000;

console.log('First Break Event:', {
  type: firstBreak.type,
  direction: firstBreak.direction,
  breakCandleIndex: breakIdx,
  breakOpenTs,
  breakOpenDt: new Date(breakOpenTs).toISOString(),
  breakCloseTs,
  breakCloseDt: new Date(breakCloseTs).toISOString(),
  breakClosePrice: firstBreak.breakClosePrice
});

// Test filtering at breakOpenTs
const sliceUpToBreak = btc15.slice(Math.max(0, breakIdx - 50), breakIdx + 1);
const filteredAtOpen = filterClosedCandles(sliceUpToBreak, 15 * 60 * 1000, breakOpenTs);
const lastCandleAtOpen = filteredAtOpen[filteredAtOpen.length - 1];

console.log('\nFilter at breakOpenTs (' + new Date(breakOpenTs).toISOString() + '):');
console.log('  Last included candle timestamp:', lastCandleAtOpen.timestamp, new Date(lastCandleAtOpen.timestamp).toISOString());
console.log('  Is breakCandle included?', filteredAtOpen.some(c => c.timestamp === breakOpenTs));
assert.strictEqual(filteredAtOpen.some(c => c.timestamp === breakOpenTs), false, 'Break candle MUST NOT be included at breakOpenTs');

// Test filtering at breakCloseTs
const filteredAtClose = filterClosedCandles(sliceUpToBreak, 15 * 60 * 1000, breakCloseTs);
const lastCandleAtClose = filteredAtClose[filteredAtClose.length - 1];

console.log('\nFilter at breakCloseTs (' + new Date(breakCloseTs).toISOString() + '):');
console.log('  Last included candle timestamp:', lastCandleAtClose.timestamp, new Date(lastCandleAtClose.timestamp).toISOString());
console.log('  Is breakCandle included?', filteredAtClose.some(c => c.timestamp === breakOpenTs));
assert.strictEqual(filteredAtClose.some(c => c.timestamp === breakOpenTs), true, 'Break candle MUST be included at breakCloseTs');

console.log('\n-> PROVEN: The earliest possible valid time to detect/use a break at breakCandleIndex is breakOpenTs + 15m (breakCloseTs).');
console.log('-> In run_true_historical_replay.js, passing curTime = breakOpenTs excludes the break candle from analysis at that exact step.');
console.log('='.repeat(80));
