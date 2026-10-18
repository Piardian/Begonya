/**
 * BEGONYA - PHASE 4B: GENERATE 38-TRADE EXECUTION AUDIT DATASET
 * =============================================================
 * Path: research/generate_phase4b_audit.js
 */

const fs = require('fs');
const path = require('path');
const { executeReplayTrade } = require('./test_phase4b_execution');

const dataDir = path.resolve(__dirname, '../../swing-bos-core/data');
const replayDir = path.resolve(__dirname, '../../swing-bos-core/data/replay_1year');
const parityJson = path.resolve(__dirname, 'production_parity_replay_results.json');
const beAuditJson = path.resolve(__dirname, 'phase4a_be_audit_results.json');

const records = JSON.parse(fs.readFileSync(parityJson, 'utf8'));
const filledTrades = records.filter(r => r.status === 'FILLED');
const beRecords = fs.existsSync(beAuditJson) ? JSON.parse(fs.readFileSync(beAuditJson, 'utf8')) : [];

const symbols = ['BTCUSD', 'ETHUSD', 'SOLUSD', 'EURUSD', 'GBPUSD', 'XAUUSD'];
const candles15mMap = {};
for (const s of symbols) {
  candles15mMap[s] = JSON.parse(fs.readFileSync(path.join(replayDir, `${s}_15m.json`), 'utf8'));
}

// 1M metadata
const map1m = {};
['ETHUSD', 'EURUSD', 'SOLUSD', 'XAUUSD', 'BTCUSD', 'GBPUSD'].forEach(s => {
  const p = path.join(dataDir, `${s}_1m.json`);
  if (fs.existsSync(p)) {
    const arr = JSON.parse(fs.readFileSync(p, 'utf8'));
    map1m[s] = {
      count: arr.length,
      startTs: arr[0].timestamp,
      endTs: arr[arr.length - 1].timestamp
    };
  }
});

const auditResults = [];

for (let i = 0; i < filledTrades.length; i++) {
  const t = filledTrades[i];
  const sym = t.symbol;
  const dir = t.direction;
  const entryP = t.entryP;
  const all15m = candles15mMap[sym];
  const beRow = beRecords.find(b => b.tradeIndex === i + 1);

  // Timing
  const sigTs = t.signalTs;
  const sigDt = t.signalDt;
  const orderActiveTs = sigTs; // Order placed at close of signal candle, active at next candle open
  const orderActiveDt = new Date(orderActiveTs).toISOString().replace('T', ' ').slice(0, 16);

  // Candles from order active time
  const fwdCandles = all15m.filter(c => c.timestamp >= orderActiveTs);
  const entryBarIdx = fwdCandles.findIndex(c => c.timestamp === t.entryTs);
  const entryCandle = fwdCandles[entryBarIdx];

  // 15M Invalidation Stop Levels
  const sl15m = t.prodSl;
  const risk15m = t.prodRisk;
  const tp15m = dir === 'long' ? entryP + 2 * risk15m : entryP - 2 * risk15m;
  const be10_15m = dir === 'long' ? entryP + 1.0 * risk15m : entryP - 1.0 * risk15m;
  const be15_15m = dir === 'long' ? entryP + 1.5 * risk15m : entryP - 1.5 * risk15m;
  const cost15m = t.prodCostDict.cr;

  // 1H Structural Stop Levels
  const sl1h = t.structSl;
  const risk1h = t.structRisk;
  const tp1h = dir === 'long' ? entryP + 2 * risk1h : entryP - 2 * risk1h;
  const be10_1h = dir === 'long' ? entryP + 1.0 * risk1h : entryP - 1.0 * risk1h;
  const be15_1h = dir === 'long' ? entryP + 1.5 * risk1h : entryP - 1.5 * risk1h;
  const cost1h = t.structCostDict.cr;

  // Entry Candle Anatomy
  const cO = entryCandle.open;
  const cH = entryCandle.high;
  const cL = entryCandle.low;
  const cC = entryCandle.close;

  // Check positions of entry candle open relative to key levels
  let openBeyondTp15m = false;
  let openBeyondBe10_15m = false;
  let openBeyondBe15_15m = false;
  let openBeyondSl15m = false;

  if (dir === 'long') {
    openBeyondTp15m = (cO >= tp15m);
    openBeyondBe10_15m = (cO >= be10_15m);
    openBeyondBe15_15m = (cO >= be15_15m);
    openBeyondSl15m = (cO <= sl15m);
  } else {
    openBeyondTp15m = (cO <= tp15m);
    openBeyondBe10_15m = (cO <= be10_15m);
    openBeyondBe15_15m = (cO <= be15_15m);
    openBeyondSl15m = (cO >= sl15m);
  }

  // 1M Data Availability
  const m1 = map1m[sym];
  const has1m = m1 && (t.entryTs >= m1.startTs && t.entryTs <= m1.endTs);

  // Naive (flawed) results from Phase 4A
  const naive15m_A = beRow ? beRow.scen15m_A : t.resProd;
  const naive15m_B = beRow ? beRow.scen15m_B : null;
  const naive15m_C = beRow ? beRow.scen15m_C : null;

  // New Leak-Free Engine Results (Strict Bar 1)
  const tradeCandles = fwdCandles.slice(entryBarIdx);

  const leakFree15m_A = executeReplayTrade({
    direction: dir, entryP, slP: sl15m, tpP: tp15m, candles: tradeCandles,
    beThresholdR: 1.0, costR: cost15m, bar0Method: 'STRICT_BAR1'
  });
  const leakFree15m_B = executeReplayTrade({
    direction: dir, entryP, slP: sl15m, tpP: tp15m, candles: tradeCandles,
    beThresholdR: null, costR: cost15m, bar0Method: 'STRICT_BAR1'
  });
  const leakFree15m_C = executeReplayTrade({
    direction: dir, entryP, slP: sl15m, tpP: tp15m, candles: tradeCandles,
    beThresholdR: 1.5, costR: cost15m, bar0Method: 'STRICT_BAR1'
  });

  // New Leak-Free Engine Results (1H Structural Stop)
  const leakFree1h_A = executeReplayTrade({
    direction: dir, entryP, slP: sl1h, tpP: tp1h, candles: tradeCandles,
    beThresholdR: 1.0, costR: cost1h, bar0Method: 'STRICT_BAR1'
  });
  const leakFree1h_B = executeReplayTrade({
    direction: dir, entryP, slP: sl1h, tpP: tp1h, candles: tradeCandles,
    beThresholdR: null, costR: cost1h, bar0Method: 'STRICT_BAR1'
  });
  const leakFree1h_C = executeReplayTrade({
    direction: dir, entryP, slP: sl1h, tpP: tp1h, candles: tradeCandles,
    beThresholdR: 1.5, costR: cost1h, bar0Method: 'STRICT_BAR1'
  });

  // Diagnostic Flags
  const hadPreEntryTpLeakInNaive = (naive15m_B && naive15m_B.outcome === 'TP' && naive15m_B.exitBar === 0 && leakFree15m_B.outcome !== 'TP');
  const hadPreEntryBeLeakInNaive = (naive15m_A && naive15m_A.outcome === 'BE' && naive15m_A.exitBar === 0 && leakFree15m_A.outcome !== 'BE');

  // Parity Status
  let parityStatus = 'PASS';
  let parityReason = 'Clean execution';
  if (!has1m) {
    parityStatus = 'INSUFFICIENT DATA';
    parityReason = '1M intra-bar tick data missing; Bar 0 sequence unresolvable with 15M OHLC alone';
  }
  if (hadPreEntryTpLeakInNaive || hadPreEntryBeLeakInNaive) {
    parityReason += ' (Previous naive simulation had Bar 0 lookahead leakage)';
  }

  auditResults.push({
    tradeIndex: i + 1,
    signalId: t.signalId,
    symbol: sym,
    direction: dir,
    poiType: t.poiType,
    timing: {
      signalTs: sigTs,
      signalDt: sigDt,
      orderActiveTs,
      orderActiveDt,
      entryTs: t.entryTs,
      entryDt: t.entryDt,
      candleTimestampType: 'OPEN_TIME',
      fillCondition: dir === 'long' ? `low (${cL}) <= entryP (${entryP})` : `high (${cH}) >= entryP (${entryP})`
    },
    levels: {
      entryP,
      '15M': { sl: sl15m, risk: risk15m, tp: tp15m, be10: be10_15m, be15: be15_15m, costR: cost15m },
      '1H': { sl: sl1h, risk: risk1h, tp: tp1h, be10: be10_1h, be15: be15_1h, costR: cost1h }
    },
    entryCandleAnatomy: {
      open: cO, high: cH, low: cL, close: cC,
      openBeyondTp15m,
      openBeyondBe10_15m,
      openBeyondBe15_15m,
      openBeyondSl15m
    },
    intrabarData: {
      has1mCoverage: has1m,
      status: has1m ? 'AVAILABLE' : 'INSUFFICIENT DATA'
    },
    naiveVsLeakFree15M: {
      scenarioA_1_0R_BE: {
        naiveOutcome: naive15m_A ? naive15m_A.outcome : null,
        naiveGrossR: naive15m_A ? naive15m_A.grossR : null,
        leakFreeOutcome: leakFree15m_A.outcome,
        leakFreeGrossR: leakFree15m_A.grossR,
        leakFreeNetR: leakFree15m_A.netR,
        exitBar: leakFree15m_A.exitBar
      },
      scenarioB_No_BE: {
        naiveOutcome: naive15m_B ? naive15m_B.outcome : null,
        naiveGrossR: naive15m_B ? naive15m_B.grossR : null,
        leakFreeOutcome: leakFree15m_B.outcome,
        leakFreeGrossR: leakFree15m_B.grossR,
        leakFreeNetR: leakFree15m_B.netR,
        exitBar: leakFree15m_B.exitBar
      },
      scenarioC_1_5R_BE: {
        naiveOutcome: naive15m_C ? naive15m_C.outcome : null,
        naiveGrossR: naive15m_C ? naive15m_C.grossR : null,
        leakFreeOutcome: leakFree15m_C.outcome,
        leakFreeGrossR: leakFree15m_C.grossR,
        leakFreeNetR: leakFree15m_C.netR,
        exitBar: leakFree15m_C.exitBar
      }
    },
    leakFree1H: {
      scenarioA_1_0R_BE: { outcome: leakFree1h_A.outcome, grossR: leakFree1h_A.grossR, netR: leakFree1h_A.netR },
      scenarioB_No_BE: { outcome: leakFree1h_B.outcome, grossR: leakFree1h_B.grossR, netR: leakFree1h_B.netR },
      scenarioC_1_5R_BE: { outcome: leakFree1h_C.outcome, grossR: leakFree1h_C.grossR, netR: leakFree1h_C.netR }
    },
    diagnosticFlags: {
      hadPreEntryTpLeakInNaive,
      hadPreEntryBeLeakInNaive
    },
    parityAudit: {
      status: parityStatus,
      reason: parityReason
    }
  });
}

const outPath = path.resolve(__dirname, 'phase4b_execution_audit.json');
fs.writeFileSync(outPath, JSON.stringify(auditResults, null, 2), 'utf8');
console.log(`Saved phase4b execution audit dataset (${auditResults.length} trades) to ${outPath}`);

// Summary stats
const passCount = auditResults.filter(r => r.parityAudit.status === 'PASS').length;
const insuffCount = auditResults.filter(r => r.parityAudit.status === 'INSUFFICIENT DATA').length;
const falseTpCount = auditResults.filter(r => r.diagnosticFlags.hadPreEntryTpLeakInNaive).length;
const falseBeCount = auditResults.filter(r => r.diagnosticFlags.hadPreEntryBeLeakInNaive).length;

console.log('\n--- AUDIT SUMMARY ---');
console.log(`Total Trades Audited: ${auditResults.length}`);
console.log(`Trades with Verified 1M Data (PASS): ${passCount}`);
console.log(`Trades with Missing 1M Data (INSUFFICIENT DATA): ${insuffCount}`);
console.log(`Trades with Proven False TP in Naive Replay: ${falseTpCount}`);
console.log(`Trades with Proven False BE in Naive Replay: ${falseBeCount}`);
