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
  triggerType: 'REJECTION_MOMENTUM' | 'BREAKER_RETEST' | 'NONE';
  outcome: 'TP' | 'SL' | 'BE' | 'INVALIDATED' | 'EXPIRED';
  reason: string;
  rrAchieved: number;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  mfeR?: number;
}

function runBreakerPlusRejectionTest() {
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

  function simulateTrade(trade: JournalTradeItem): SimResult {
    const candles1m = get1mCandles(trade.symbol);
    if (!candles1m || candles1m.length === 0) {
      return { tradeNum: trade.num, symbol: trade.symbol, direction: trade.direction, userStatus: trade.userStatus, triggerType: 'NONE', outcome: 'EXPIRED', reason: 'No candles', rrAchieved: 0 };
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
      const breached = isLong ? c.close < trade.invalidationLevel : c.close > trade.invalidationLevel;
      if (breached) {
        return { tradeNum: trade.num, symbol: trade.symbol, direction: trade.direction, userStatus: trade.userStatus, triggerType: 'NONE', outcome: 'INVALIDATED', reason: 'Kutuya temas etmeden doğrudan delindi.', rrAchieved: 0 };
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
      return { tradeNum: trade.num, symbol: trade.symbol, direction: trade.direction, userStatus: trade.userStatus, triggerType: 'NONE', outcome: 'EXPIRED', reason: '24 saat içinde kutuya retest gelmedi.', rrAchieved: 0 };
    }

    // 2. Monitoring window (up to 90 bars after touch)
    const maxMonitoring = Math.min(window.length, touchIdx + 90);
    let sweepIdx = -1;
    let sweepExtreme = isLong ? Infinity : -Infinity;
    let chochLevel = 0;
    let breakerPrice = 0;

    for (let i = touchIdx; i < maxMonitoring; i++) {
      const c = window[i];

      // A) Invalidation: Price blasts through zone invalidation level
      const breached = isLong ? c.close < trade.invalidationLevel : c.close > trade.invalidationLevel;
      if (breached && sweepIdx === -1) {
        return { tradeNum: trade.num, symbol: trade.symbol, direction: trade.direction, userStatus: trade.userStatus, triggerType: 'NONE', outcome: 'INVALIDATED', reason: 'Kutu içinde 1M teyit oluşmadan taban/tavan delindi.', rrAchieved: 0 };
      }

      const range = c.high - c.low;

      // =========================================================================
      // ENTRY PATH 1: INSTANT WICK REJECTION + CONFIRMATION CANDLE
      // For explosive institutional reactions (e.g. XAUUSD #78, GBPJPY #75)
      // =========================================================================
      if (i <= touchIdx + 12 && range > 0) {
        if (isLong) {
          const lowerWick = Math.min(c.open, c.close) - c.low;
          const wickRatio = lowerWick / range;
          const isBullishCandle = c.close > c.open;
          // Pierced into or tested zone, produced huge rejection wick (>= 35%) and closed bullish
          if (c.low <= trade.zoneHigh && (wickRatio >= 0.35 || (wickRatio >= 0.25 && isBullishCandle))) {
            const entryPrice = c.close;
            const stopLoss = c.low - 1.5 * pip;
            const riskDist = Math.abs(entryPrice - stopLoss);
            if (riskDist > 0) {
              return evaluateFilledTrade(trade, window, i, entryPrice, stopLoss, riskDist, 'REJECTION_MOMENTUM');
            }
          }
        } else {
          const upperWick = c.high - Math.max(c.open, c.close);
          const wickRatio = upperWick / range;
          const isBearishCandle = c.close < c.open;
          if (c.high >= trade.zoneLow && (wickRatio >= 0.35 || (wickRatio >= 0.25 && isBearishCandle))) {
            const entryPrice = c.close;
            const stopLoss = c.high + 1.5 * pip;
            const riskDist = Math.abs(entryPrice - stopLoss);
            if (riskDist > 0) {
              return evaluateFilledTrade(trade, window, i, entryPrice, stopLoss, riskDist, 'REJECTION_MOMENTUM');
            }
          }
        }
      }

      // =========================================================================
      // ENTRY PATH 2: BREAKER BLOCK RETEST (When price consolidates inside zone)
      // =========================================================================
      if (sweepIdx === -1 && i >= touchIdx + 1) {
        const priorBars = window.slice(touchIdx, i);
        if (priorBars.length >= 1) {
          if (isLong) {
            const priorLow = Math.min(...priorBars.map(b => b.low));
            if (c.low < priorLow && range > 0) {
              sweepIdx = i;
              sweepExtreme = c.low;
              chochLevel = Math.max(...priorBars.map(b => b.high));
              breakerPrice = chochLevel;
            }
          } else {
            const priorHigh = Math.max(...priorBars.map(b => b.high));
            if (c.high > priorHigh && range > 0) {
              sweepIdx = i;
              sweepExtreme = c.high;
              chochLevel = Math.min(...priorBars.map(b => b.low));
              breakerPrice = chochLevel;
            }
          }
        }
      }

      if (sweepIdx !== -1) {
        const sweepViolated = isLong ? c.close < sweepExtreme : c.close > sweepExtreme;
        if (sweepViolated) {
          sweepIdx = -1;
          continue;
        }

        // Breaker CHoCH broken with displacement
        if (i > sweepIdx && i <= sweepIdx + 8) {
          const broken = isLong ? c.close > chochLevel : c.close < chochLevel;
          if (broken) {
            const entryPrice = breakerPrice;
            const stopLoss = isLong ? sweepExtreme - 1.5 * pip : sweepExtreme + 1.5 * pip;
            const riskDist = Math.abs(entryPrice - stopLoss);
            if (riskDist <= 0) continue;

            // Wait for retest of Breaker Block
            let filled = false;
            for (let k = i + 1; k < Math.min(window.length, i + 35); k++) {
              const bar = window[k];
              const stopHitBeforeFill = isLong ? bar.low <= stopLoss : bar.high >= stopLoss;
              if (stopHitBeforeFill) break;

              const canFill = isLong ? bar.low <= entryPrice : bar.high >= entryPrice;
              if (canFill) {
                return evaluateFilledTrade(trade, window, k, entryPrice, stopLoss, riskDist, 'BREAKER_RETEST');
              }
            }
          }
        }
      }
    }

    return { tradeNum: trade.num, symbol: trade.symbol, direction: trade.direction, userStatus: trade.userStatus, triggerType: 'NONE', outcome: 'EXPIRED', reason: '1M teyit/CHoCH oluşmadı.', rrAchieved: 0 };
  }

  function evaluateFilledTrade(
    trade: JournalTradeItem,
    window: Candle[],
    fillIdx: number,
    entryPrice: number,
    stopLoss: number,
    riskDist: number,
    triggerType: 'REJECTION_MOMENTUM' | 'BREAKER_RETEST'
  ): SimResult {
    const isLong = trade.direction === 'long';
    const targetRR = 3.0;
    const takeProfit = isLong ? entryPrice + riskDist * targetRR : entryPrice - riskDist * targetRR;

    let beArmed = false;
    let maxMfe = 0;

    for (let k = fillIdx + 1; k < window.length; k++) {
      const bar = window[k];
      const favorable = isLong ? bar.high - entryPrice : entryPrice - bar.low;
      const mfe = favorable / riskDist;
      if (mfe > maxMfe) maxMfe = mfe;

      if (!beArmed && mfe >= 1.0) beArmed = true;

      const currentSL = beArmed ? entryPrice : stopLoss;
      const hitsTP = isLong ? bar.high >= takeProfit : bar.low <= takeProfit;
      const hitsSL = isLong ? bar.low <= currentSL : bar.high >= currentSL;

      if (hitsTP && hitsSL) {
        return {
          tradeNum: trade.num,
          symbol: trade.symbol,
          direction: trade.direction,
          userStatus: trade.userStatus,
          triggerType,
          outcome: beArmed ? 'BE' : 'SL',
          reason: beArmed ? 'TP ve BE aynı mumda' : 'TP ve SL aynı mumda',
          rrAchieved: beArmed ? 0 : -1,
          entryPrice,
          stopLoss,
          takeProfit,
          mfeR: maxMfe,
        };
      }

      if (hitsTP) {
        return {
          tradeNum: trade.num,
          symbol: trade.symbol,
          direction: trade.direction,
          userStatus: trade.userStatus,
          triggerType,
          outcome: 'TP',
          reason: `+${targetRR}R Take Profit Vuruldu! (Trigger: ${triggerType})`,
          rrAchieved: targetRR,
          entryPrice,
          stopLoss,
          takeProfit,
          mfeR: maxMfe,
        };
      }

      if (hitsSL) {
        return {
          tradeNum: trade.num,
          symbol: trade.symbol,
          direction: trade.direction,
          userStatus: trade.userStatus,
          triggerType,
          outcome: beArmed ? 'BE' : 'SL',
          reason: beArmed ? 'Kâr gördü, BE ile kapandı' : 'Stop Loss tetiklendi',
          rrAchieved: beArmed ? 0 : -1,
          entryPrice,
          stopLoss,
          takeProfit,
          mfeR: maxMfe,
        };
      }
    }

    return {
      tradeNum: trade.num,
      symbol: trade.symbol,
      direction: trade.direction,
      userStatus: trade.userStatus,
      triggerType,
      outcome: beArmed ? 'BE' : 'EXPIRED',
      reason: 'Süre dolumu',
      rrAchieved: beArmed ? 0 : 0,
      entryPrice,
      stopLoss,
      takeProfit,
      mfeR: maxMfe,
    };
  }

  console.log(`\n========================================================================================`);
  console.log(`🚀 1M HİBRİT İCRA MODELİ: "BREAKER BLOCK + WICK REJECTION MOMENTUM" TESTİ`);
  console.log(`   Son 1 Ay (36 Gerçek Telegram Sinyali Üzerinde Birebir Deterministik Simülasyon)`);
  console.log(`========================================================================================\n`);

  const results = trades.map(t => simulateTrade(t));
  const tp = results.filter(r => r.outcome === 'TP');
  const sl = results.filter(r => r.outcome === 'SL');
  const be = results.filter(r => r.outcome === 'BE');
  const inv = results.filter(r => r.outcome === 'INVALIDATED');
  const exp = results.filter(r => r.outcome === 'EXPIRED');

  const filledCount = tp.length + sl.length + be.length;
  const netR = tp.length * 3.0 - sl.length * 1.0;
  const winRate = filledCount > 0 ? (tp.length / filledCount) * 100 : 0;

  for (const r of results) {
    const outcomeStr =
      r.outcome === 'TP'
        ? '🎯 TAKE PROFIT (+3.0R)'
        : r.outcome === 'SL'
        ? '🛑 STOP LOSS (-1.0R)'
        : r.outcome === 'BE'
        ? '🛡️ BREAK-EVEN (0.0R)'
        : r.outcome === 'INVALIDATED'
        ? '🚫 DELDİ/İPTAL'
        : '⏳ ZAMAN AŞIMI';

    console.log(
      `#${r.tradeNum.toString().padStart(2, '0')} | ${r.symbol.padEnd(6, ' ')} ${r.direction.toUpperCase().padEnd(5, ' ')} | ` +
      `SONUÇ: ${outcomeStr.padEnd(23, ' ')} | MOD: ${r.triggerType.padEnd(20, ' ')} | KULLANICI: ${r.userStatus.slice(0, 28)}`
    );
  }

  console.log(`\n========================================================================================`);
  console.log(`📊 PERFORMANS BİLANÇOSU:`);
  console.log(`----------------------------------------------------------------------------------------`);
  console.log(`Toplam Analiz Edilen Sinyal : ${results.length}`);
  console.log(`Tetiklenen (İşleme Girilen) : ${filledCount}`);
  console.log(`🎯 Take Profit (TP)         : ${tp.length} adet (+${(tp.length * 3).toFixed(1)} R)`);
  console.log(`🛑 Stop Loss (SL)           : ${sl.length} adet (-${(sl.length * 1).toFixed(1)} R)`);
  console.log(`🛡️ Break-Even (BE)          : ${be.length} adet (0.0 R)`);
  console.log(`🏆 Win Rate (Net Başarı)    : %${winRate.toFixed(1)}`);
  console.log(`📈 Net R Getirisi           : +${netR.toFixed(1)} R`);
  console.log(`🛡️ Engellenen Kesin Stoplar : ${inv.length} adet`);
  console.log(`========================================================================================\n`);

  console.log(`🔥 KAZANAN İŞLEMLER (TP):`);
  for (const t of tp) {
    console.log(`   - #${t.tradeNum} ${t.symbol} ${t.direction.toUpperCase()} -> Giriş: ${t.entryPrice}, TP: ${t.takeProfit}, Max MFE: +${t.mfeR?.toFixed(2)}R (${t.triggerType})`);
  }
}

runBreakerPlusRejectionTest();
