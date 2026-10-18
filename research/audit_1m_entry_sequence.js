const fs = require('fs');
const path = require('path');

const btc1m = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../swing-bos-core/data/BTCUSD_1m.json'), 'utf8'));

// Trade #2: Entry was at 2026-04-02 02:00 UTC (timestamp: 1775095200000)
const tStart = new Date('2026-04-02T02:00:00Z').getTime();
const tEnd = new Date('2026-04-02T02:30:00Z').getTime();

const bars = btc1m.filter(c => c.timestamp >= tStart && c.timestamp <= tEnd);
console.log('1M bars from 02:00 to 02:30 on 2026-04-02 (Trade #2):');
console.log('Target levels: Entry = 66878.43, SL = 66702.30, TP = 67230.69, +1R = 67054.56\n');

let entryHit = false;
bars.forEach((b, i) => {
  const dt = new Date(b.timestamp).toISOString().slice(11, 16);
  if (!entryHit && b.low <= 66878.43) {
    entryHit = true;
    console.log('[*] [' + dt + '] ENTRY FILLED! Low: ' + b.low + ' (Bar High: ' + b.high + ')');
  } else if (!entryHit) {
    console.log('    [' + dt + '] BEFORE ENTRY: O:' + b.open + ' H:' + b.high + ' L:' + b.low + ' C:' + b.close);
  } else {
    console.log('    [' + dt + '] AFTER ENTRY:  O:' + b.open + ' H:' + b.high + ' L:' + b.low + ' C:' + b.close);
  }
});
