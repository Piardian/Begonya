/**
 * BEGONYA - FORENSIC AUDIT OF INTRA-BAR PRICE LEAKAGE ON ENTRY CANDLE (BAR 0)
 * ===========================================================================
 * Path: research/audit_entry_bar_leakage.js
 */

const fs = require('fs');
const path = require('path');

const dataDir = path.resolve(__dirname, '../../swing-bos-core/data/replay_1year');
const parityJson = path.resolve(__dirname, 'production_parity_replay_results.json');
const beAuditJson = path.resolve(__dirname, 'phase4a_be_audit_results.json');

const records = JSON.parse(fs.readFileSync(parityJson, 'utf8'));
const filled = records.filter(r => r.status === 'FILLED');
const beRecords = fs.existsSync(beAuditJson) ? JSON.parse(fs.readFileSync(beAuditJson, 'utf8')) : [];

const symbols = ['BTCUSD', 'ETHUSD', 'SOLUSD', 'EURUSD', 'GBPUSD', 'XAUUSD'];
const candlesMap = {};
for (const s of symbols) {
  candlesMap[s] = JSON.parse(fs.readFileSync(path.join(dataDir, `${s}_15m.json`), 'utf8'));
}

console.log('='.repeat(90));
console.log(`FORENSIC AUDIT: 38 FILLED TRADES - ENTRY CANDLE (BAR 0) ANATOMY`);
console.log('='.repeat(90));

let bar0ExitsA = 0; // Scenario A (1.0R BE)
let bar0ExitsB = 0; // Scenario B (No-BE)
let bar0ExitsC = 0; // Scenario C (1.5R BE)

let falseTpCountB = 0;
let falseBeCountA = 0;

const analysis = [];

filled.forEach((t, i) => {
  const cList = candlesMap[t.symbol];
  const c = cList.find(x => x.timestamp === t.entryTs);
  const dir = t.direction;
  const pTp = dir === 'long' ? t.entryP + 2 * t.prodRisk : t.entryP - 2 * t.prodRisk;
  const pSl = t.prodSl;
  const be10Level = dir === 'long' ? t.entryP + t.prodRisk : t.entryP - t.prodRisk;
  const be15Level = dir === 'long' ? t.entryP + 1.5 * t.prodRisk : t.entryP - 1.5 * t.prodRisk;

  // BE record for this trade
  const beRow = beRecords.find(b => b.tradeIndex === i + 1);
  const outcomeA = beRow ? beRow.scen15m_A.outcome : t.resProd.outcome;
  const exitBarA = beRow ? beRow.scen15m_A.exitBar : t.resProd.exitBar;

  const outcomeB = beRow ? beRow.scen15m_B.outcome : null;
  const exitBarB = beRow ? beRow.scen15m_B.exitBar : null;

  const outcomeC = beRow ? beRow.scen15m_C.outcome : null;
  const exitBarC = beRow ? beRow.scen15m_C.exitBar : null;

  if (exitBarA === 0) bar0ExitsA++;
  if (exitBarB === 0) bar0ExitsB++;
  if (exitBarC === 0) bar0ExitsC++;

  // Intra-bar sequence analysis on entry candle:
  // For Long: Limit entry fills at entryP.
  // Did candle open ABOVE entryP? If c.open > entryP, then candle started above entry,
  // potentially printed c.high BEFORE dropping to fill entryP.
  let preEntryHigh = false;
  let preEntryLow = false;
  let isFalseTp = false;
  let isFalseBe = false;

  if (dir === 'long') {
    if (c.open > t.entryP) {
      preEntryHigh = true;
      if (c.high >= pTp) {
        // High reached TP, but was that high before entry fill?
        // If c.open >= pTp, definitely before entry.
        // Even if c.open < pTp, if candle opened at 67359, dropped to 66854,
        // and closed at 66860, the high 67359 happened at open before entry fill!
        if (c.close < pTp) {
          isFalseTp = true;
        }
      }
      if (c.high >= be10Level && c.close < be10Level) {
        isFalseBe = true;
      }
    }
  } else { // short
    if (c.open < t.entryP) {
      preEntryLow = true;
      if (c.low <= pTp) {
        if (c.close > pTp) {
          isFalseTp = true;
        }
      }
      if (c.low <= be10Level && c.close > be10Level) {
        isFalseBe = true;
      }
    }
  }

  if (exitBarB === 0 && outcomeB === 'TP' && isFalseTp) {
    falseTpCountB++;
  }
  if (exitBarA === 0 && outcomeA === 'BE' && isFalseBe) {
    falseBeCountA++;
  }

  analysis.push({
    tradeIndex: i + 1,
    symbol: t.symbol,
    direction: dir,
    signalId: t.signalId,
    entryTs: t.entryTs,
    entryDt: t.entryDt,
    entryP: t.entryP,
    prodSl: t.prodSl,
    prodRisk: t.prodRisk,
    prodTp: pTp,
    candle: {
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close
    },
    exitBarA, outcomeA,
    exitBarB, outcomeB,
    exitBarC, outcomeC,
    preEntryHigh, preEntryLow,
    isFalseTp, isFalseBe
  });
});

console.log(`Scenario A (1.0R BE):  Bar 0 Exits = ${bar0ExitsA} / ${filled.length} (${(bar0ExitsA/filled.length*100).toFixed(1)}%)`);
console.log(`Scenario B (No-BE):    Bar 0 Exits = ${bar0ExitsB} / ${filled.length} (${(bar0ExitsB/filled.length*100).toFixed(1)}%)`);
console.log(`Scenario C (1.5R BE):  Bar 0 Exits = ${bar0ExitsC} / ${filled.length} (${(bar0ExitsC/filled.length*100).toFixed(1)}%)`);
console.log(`Potential False TPs on Bar 0 in Scenario B: ${falseTpCountB}`);
console.log(`Potential False BEs on Bar 0 in Scenario A: ${falseBeCountA}`);

// Print all Bar 0 exits in Scenario B
console.log('\n--- SCENARIO B (No-BE) BAR 0 TPs ---');
analysis.filter(a => a.exitBarB === 0 && a.outcomeB === 'TP').forEach(a => {
  console.log(`Trade #${a.tradeIndex} ${a.symbol} ${a.direction}: Entry=${a.entryP.toFixed(2)}, TP=${a.prodTp.toFixed(2)}, O=${a.candle.open}, H=${a.candle.high}, L=${a.candle.low}, C=${a.candle.close}, FalseTP=${a.isFalseTp}`);
});

fs.writeFileSync(path.resolve(__dirname, 'bar0_leakage_forensics.json'), JSON.stringify(analysis, null, 2), 'utf8');
