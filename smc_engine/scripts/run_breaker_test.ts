import * as fs from 'fs';
import * as path from 'path';

interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface JournalTradeItem {
  id: string;
  num: number;
  symbol: string;
  direction: 'long' | 'short';
  zoneLow: number;
  zoneHigh: number;
  invalidationLevel: number;
  pipSize: number;
  timestamp: number | null;
  header: string;
  userStatus: string;
}

interface SimResult {
  tradeNum: number;
  symbol: string;
  direction: 'long' | 'short';
  userStatus: string;
  mode: string;
  outcome: 'TP' | 'SL' | 'BE' | 'INVALIDATED' | 'EXPIRED';
  reason: string;
  rrAchieved: number;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
}

function runBreakerVsFvgComparison() {
  const dataDir = path.join(__dirname, '..', 'data', '1m_backtest');
  const journalJsonPath = path.join(dataDir, 'journal_trades_parsed.json');
  const trades: JournalTradeItem[] = JSON.parse(fs.readFileSync(journalJsonPath, 'utf8'));

  const cache1m: Map<string, Candle[]> = new Map();
  function get1mCandles(sym: string): Candle[] {
    if (cache1m.has(sym)) return cache1m.get(sym)!;
    const p = path.join(dataDir, `${sym}_1m_30d.json`);
    if (!fs.existsSync(p)) return [];
    const raw: any[] = JSON.parse(fs.readFileSync(p, 'utf8'));
    cache1m.set(sym, raw);
    return raw;
  }

  function simulateTrade(trade: JournalTradeItem, entryModel: 'FVG_ONLY' | 'BREAKER_ONLY' | 'BREAKER_OR_FVG'): SimResult {
    const candles1m = get1mCandles(trade.symbol);
    if (!candles1m || candles1m.length === 0) {
      return { tradeNum: trade.num, symbol: trade.symbol, direction: trade.direction, userStatus: trade.userStatus, mode: entryModel, outcome: 'EXPIRED', reason: 'No candles', rrAchieved: 0 };
    }

    let startIdx = 0;
    if (trade.timestamp) {
      const idx = candles1m.findIndex(c => c.timestamp >= trade.timestamp!);
      startIdx = idx >= 0 ? idx : 0;
    }

    const window = candles1m.slice(startIdx, startIdx + 1440);
    const isLong = trade.direction === 'long';
    const pip = trade.pipSize;

    // 1. Find POI touch
    let touchIdx = -1;
    for (let i = 0; i < window.length; i++) {
      const c = window[i];
      // Invalidation before touch: did it blast through without touching?
      const breached = isLong ? c.close < trade.invalidationLevel : c.close > trade.invalidationLevel;
      if (breached) {
        return { tradeNum: trade.num, symbol: trade.symbol, direction: trade.direction, userStatus: trade.userStatus, mode: entryModel, outcome: 'INVALIDATED', reason: 'Kutuya temas etmeden doğrudan delindi.', rrAchieved: 0 };
      }

      const touched = isLong
        ? c.low <= trade.zoneHigh && c.high >= trade.zoneLow
        : c.high >= trade.zoneLow && c.low <= trade.zoneHigh;

      if (touched) {
        touchIdx = i;
        break;
      }
    }

    if (touchIdx === -1) {
      return { tradeNum: trade.num, symbol: trade.symbol, direction: trade.direction, userStatus: trade.userStatus, mode: entryModel, outcome: 'EXPIRED', reason: '24 saat içinde kutuya retest gelmedi.', rrAchieved: 0 };
    }

    // 2. Monitor up to 60 bars after touch for:
    // A) Invalidation (blast through)
    // B) Sweep + CHoCH
    // C) Breaker Block formation (the last candle before the sweep) OR FVG formation
    let sweepIdx = -1;
    let sweepExtreme = isLong ? Infinity : -Infinity;
    let chochLevel = 0;
    let breakerHigh = 0;
    let breakerLow = 0;
    let breakerMid = 0;

    const maxMonitoring = Math.min(window.length, touchIdx + 90);

    for (let i = touchIdx; i < maxMonitoring; i++) {
      const c = window[i];
      // Zone invalidation
      const breached = isLong ? c.close < trade.invalidationLevel : c.close > trade.invalidationLevel;
      if (breached && sweepIdx === -1) {
        return { tradeNum: trade.num, symbol: trade.symbol, direction: trade.direction, userStatus: trade.userStatus, mode: entryModel, outcome: 'INVALIDATED', reason: 'Kutu içinde 1M teyit oluşmadan taban/tavan delindi.', rrAchieved: 0 };
      }

      // Detect Sweep
      if (sweepIdx === -1 && i >= touchIdx + 1) {
        const priorBars = window.slice(touchIdx, i);
        if (priorBars.length >= 1) {
          if (isLong) {
            const priorLow = Math.min(...priorBars.map(b => b.low));
            const range = c.high - c.low;
            if (c.low < priorLow && range > 0) {
              const lowerWick = Math.min(c.open, c.close) - c.low;
              if (lowerWick / range >= 0.25 || c.close >= priorLow) {
                sweepIdx = i;
                sweepExtreme = c.low;
                // Swing High prior to sweep is CHoCH and Breaker candidate
                chochLevel = Math.max(...priorBars.map(b => b.high));
                // Find candle that made chochLevel
                const bbCandle = priorBars.find(b => b.high === chochLevel) || c;
                breakerHigh = bbCandle.high;
                breakerLow = bbCandle.low;
                breakerMid = (breakerHigh + breakerLow) * 0.5;
              }
            }
          } else {
            const priorHigh = Math.max(...priorBars.map(b => b.high));
            const range = c.high - c.low;
            if (c.high > priorHigh && range > 0) {
              const upperWick = c.high - Math.max(c.open, c.close);
              if (upperWick / range >= 0.25 || c.close <= priorHigh) {
                sweepIdx = i;
                sweepExtreme = c.high;
                chochLevel = Math.min(...priorBars.map(b => b.low));
                const bbCandle = priorBars.find(b => b.low === chochLevel) || c;
                breakerHigh = bbCandle.high;
                breakerLow = bbCandle.low;
                breakerMid = (breakerHigh + breakerLow) * 0.5;
              }
            }
          }
        }
      }

      // Check if sweep failed
      if (sweepIdx !== -1) {
        const sweepViolated = isLong ? c.close < sweepExtreme : c.close > sweepExtreme;
        if (sweepViolated) {
          sweepIdx = -1; // Reset
          continue;
        }

        // Look for Displacement / CHoCH Break within 6 bars after sweep
        if (i > sweepIdx && i <= sweepIdx + 8) {
          const broken = isLong ? c.close > chochLevel : c.close < chochLevel;
          if (broken) {
            // MSS Confirmed!
            // Define Entry & SL
            let entryPrice = 0;
            const stopLoss = isLong ? sweepExtreme - 1.5 * pip : sweepExtreme + 1.5 * pip;

            if (entryModel === 'BREAKER_ONLY') {
              // Breaker Block entry: Retest to Breaker High/Low or Midpoint
              entryPrice = isLong ? breakerHigh : breakerLow;
            } else if (entryModel === 'FVG_ONLY') {
              // FVG Midpoint
              const cPrev = window[i - 2];
              const fvgMid = isLong ? (cPrev.high + c.low) * 0.5 : (cPrev.low + c.high) * 0.5;
              entryPrice = fvgMid;
            } else {
              // BREAKER_OR_FVG: whichever is closer to current price to ensure fill on retest
              const cPrev = window[i - 2];
              const fvgMid = isLong ? (cPrev.high + c.low) * 0.5 : (cPrev.low + c.high) * 0.5;
              const bbEntry = isLong ? breakerHigh : breakerLow;
              entryPrice = isLong ? Math.max(bbEntry, fvgMid) : Math.min(bbEntry, fvgMid);
            }

            const riskDist = Math.abs(entryPrice - stopLoss);
            if (riskDist <= 0) continue;

            const targetRR = 3.0;
            const takeProfit = isLong ? entryPrice + riskDist * targetRR : entryPrice - riskDist * targetRR;

            // Now evaluate retest and position outcome in subsequent bars
            let filled = false;
            let beArmed = false;

            for (let k = i + 1; k < window.length; k++) {
              const bar = window[k];

              if (!filled) {
                // Invalidation before fill
                const stopHitBeforeFill = isLong ? bar.low <= stopLoss : bar.high >= stopLoss;
                if (stopHitBeforeFill) {
                  return { tradeNum: trade.num, symbol: trade.symbol, direction: trade.direction, userStatus: trade.userStatus, mode: entryModel, outcome: 'INVALIDATED', reason: 'Emir dolmadan önce sweep stop kırıldı.', rrAchieved: 0 };
                }

                const canFill = isLong ? bar.low <= entryPrice : bar.high >= entryPrice;
                if (canFill) {
                  filled = true;
                } else if (k > i + 30) {
                  // Expired waiting for retest
                  return { tradeNum: trade.num, symbol: trade.symbol, direction: trade.direction, userStatus: trade.userStatus, mode: entryModel, outcome: 'EXPIRED', reason: 'Teyit sonrası 30 bar içinde giriş retesti gelmedi.', rrAchieved: 0 };
                }
              }

              if (filled) {
                const favorable = isLong ? bar.high - entryPrice : entryPrice - bar.low;
                const mfe = favorable / riskDist;
                if (!beArmed && mfe >= 1.0) beArmed = true;

                const currentSL = beArmed ? entryPrice : stopLoss;
                const hitsTP = isLong ? bar.high >= takeProfit : bar.low <= takeProfit;
                const hitsSL = isLong ? bar.low <= currentSL : bar.high >= currentSL;

                if (hitsTP && hitsSL) {
                  return { tradeNum: trade.num, symbol: trade.symbol, direction: trade.direction, userStatus: trade.userStatus, mode: entryModel, outcome: beArmed ? 'BE' : 'SL', reason: beArmed ? 'TP ve BE aynı mumda' : 'TP ve SL aynı mumda', rrAchieved: beArmed ? 0 : -1, entryPrice, stopLoss, takeProfit };
                }
                if (hitsTP) {
                  return { tradeNum: trade.num, symbol: trade.symbol, direction: trade.direction, userStatus: trade.userStatus, mode: entryModel, outcome: 'TP', reason: `+${targetRR}R Take Profit Vuruldu!`, rrAchieved: targetRR, entryPrice, stopLoss, takeProfit };
                }
                if (hitsSL) {
                  return { tradeNum: trade.num, symbol: trade.symbol, direction: trade.direction, userStatus: trade.userStatus, mode: entryModel, outcome: beArmed ? 'BE' : 'SL', reason: beArmed ? 'BE ile kapandı' : 'Stop Loss tetiklendi', rrAchieved: beArmed ? 0 : -1, entryPrice, stopLoss, takeProfit };
                }
              }
            }
          }
        }
      }
    }

    return { tradeNum: trade.num, symbol: trade.symbol, direction: trade.direction, userStatus: trade.userStatus, mode: entryModel, outcome: 'EXPIRED', reason: '1M teyit/CHoCH oluşmadı.', rrAchieved: 0 };
  }

  console.log(`\n========================================================================================`);
  console.log(`🔬 ICT/SMC 1M GİRİŞ MEKANİZMASI KARŞILAŞTIRMASI: FVG vs. BREAKER BLOCK (BB)`);
  console.log(`   Son 1 Ay (36 Gerçek Telegram Sinyali Üzerinde Birebir Deterministik Karşılaştırma)`);
  console.log(`========================================================================================\n`);

  const modes: ('FVG_ONLY' | 'BREAKER_ONLY' | 'BREAKER_OR_FVG')[] = ['FVG_ONLY', 'BREAKER_ONLY', 'BREAKER_OR_FVG'];
  const summaryByMode: Record<string, any> = {};

  for (const mode of modes) {
    const results = trades.map(t => simulateTrade(t, mode));
    const tp = results.filter(r => r.outcome === 'TP');
    const sl = results.filter(r => r.outcome === 'SL');
    const be = results.filter(r => r.outcome === 'BE');
    const inv = results.filter(r => r.outcome === 'INVALIDATED');
    const exp = results.filter(r => r.outcome === 'EXPIRED');

    const filledCount = tp.length + sl.length + be.length;
    const netR = tp.length * 3.0 - sl.length * 1.0;
    const winRate = filledCount > 0 ? (tp.length / filledCount) * 100 : 0;

    summaryByMode[mode] = {
      total: results.length,
      tpCount: tp.length,
      slCount: sl.length,
      beCount: be.length,
      invalidatedCount: inv.length,
      expiredCount: exp.length,
      filledCount,
      winRatePct: winRate.toFixed(1),
      netR: netR.toFixed(1),
      tpTrades: tp.map(t => `#${t.tradeNum} ${t.symbol}`),
      slTrades: sl.map(t => `#${t.tradeNum} ${t.symbol}`),
    };
  }

  console.log(`📊 KARŞILAŞTIRMALI SONUÇ TABLOSU:`);
  console.log(`----------------------------------------------------------------------------------------`);
  console.log(`Giriş Modeli        | Tetiklenen | TP (3R) | SL (-1R) | BE (0R) | Win Rate | Net R   | Engellenen Stop`);
  console.log(`----------------------------------------------------------------------------------------`);
  for (const mode of modes) {
    const s = summaryByMode[mode];
    const modeName = mode === 'FVG_ONLY' ? '1. Sadece FVG' : mode === 'BREAKER_ONLY' ? '2. Sadece BREAKER BLOCK' : '3. HİBRİT (Breaker/FVG)';
    console.log(
      `${modeName.padEnd(20, ' ')} | ` +
      `${s.filledCount.toString().padStart(10, ' ')} | ` +
      `${s.tpCount.toString().padStart(7, ' ')} | ` +
      `${s.slCount.toString().padStart(8, ' ')} | ` +
      `${s.beCount.toString().padStart(7, ' ')} | ` +
      `%${s.winRatePct.padStart(7, ' ')} | ` +
      `${(s.netR >= 0 ? '+' : '') + s.netR.padStart(6, ' ')}R | ` +
      `${s.invalidatedCount.toString().padStart(15, ' ')}`
    );
  }
  console.log(`----------------------------------------------------------------------------------------\n`);

  console.log(`🔍 DETAYLI ANALİZ:`);
  for (const mode of modes) {
    const s = summaryByMode[mode];
    console.log(`🔹 [${mode}]:`);
    console.log(`   - TP Olanlar : ${s.tpTrades.length > 0 ? s.tpTrades.join(', ') : 'YOK'}`);
    console.log(`   - SL Olanlar : ${s.slTrades.length > 0 ? s.slTrades.join(', ') : 'YOK'}`);
    console.log(`   - Korunan/Delinen Kutu (Engellenen Stop) : ${s.invalidatedCount} adet\n`);
  }
}

runBreakerVsFvgComparison();
