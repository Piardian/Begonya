import * as fs from 'fs';
import * as path from 'path';
import { calculatePremiumDiscount } from '../src/premiumDiscountCalculator';
import { detectSwings } from '../src/swingDetector';
import { Candle } from '../src/types';

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
  gateDecision: 'PASS' | 'FAIL_4H_PD' | 'CRYPTO_CHOP_BLOCKED';
  gateReason?: string;
  outcome: 'TP' | 'SL' | 'BE' | 'GATE_BLOCKED' | 'INVALIDATED' | 'EXPIRED';
  reason: string;
  rrAchieved: number;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  mfeR?: number;
}

function runCalibratedArchitectureBacktest() {
  const dataDir = path.join(__dirname, '..', 'data', '1m_backtest');
  const journalJsonPath = path.join(dataDir, 'journal_trades_parsed.json');
  const multiTfPath = path.join(__dirname, '..', 'data', 'backtest_candles_1mo.json');

  const trades: JournalTradeItem[] = JSON.parse(fs.readFileSync(journalJsonPath, 'utf8'));
  const multiTfData: Record<string, { '15m': Candle[]; '1h': Candle[]; '4h': Candle[] }> = fs.existsSync(multiTfPath)
    ? JSON.parse(fs.readFileSync(multiTfPath, 'utf8'))
    : {};

  const cache1m: Map<string, Candle[]> = new Map();
  function get1mCandles(sym: string): Candle[] {
    if (cache1m.has(sym)) return cache1m.get(sym)!;
    const p = path.join(dataDir, `${sym}_1m_30d.json`);
    if (!fs.existsSync(p)) return [];
    const raw: any[] = JSON.parse(fs.readFileSync(p, 'utf8'));
    cache1m.set(sym, raw);
    return raw;
  }

  const cryptoSymbols = new Set(['BTCUSD', 'ETHUSD', 'SOLUSD', 'LTCUSD']);

  function evaluateTrade(trade: JournalTradeItem): SimResult {
    const candles1m = get1mCandles(trade.symbol);
    if (!candles1m || candles1m.length === 0) {
      return { tradeNum: trade.num, symbol: trade.symbol, direction: trade.direction, userStatus: trade.userStatus, gateDecision: 'PASS', outcome: 'EXPIRED', reason: 'No candles', rrAchieved: 0 };
    }

    let startIdx = 0;
    if (trade.timestamp) {
      const idx = candles1m.findIndex(c => c.timestamp >= trade.timestamp!);
      startIdx = idx >= 0 ? idx : 0;
    }

    const sigTime = trade.timestamp ?? candles1m[startIdx].timestamp;
    const isLong = trade.direction === 'long';
    const pip = trade.pipSize;
    const isCrypto = cryptoSymbols.has(trade.symbol);

    // =========================================================================
    // KURAL 1: 4H PREMIUM/DISCOUNT SERT KALKANI (Asla Taviz Yok)
    // =========================================================================
    let is1HOpposite = false;
    const symMulti = multiTfData[trade.symbol];
    if (symMulti && symMulti['4h'] && symMulti['1h']) {
      const candles4hPrior = symMulti['4h'].filter(c => c.timestamp <= sigTime);
      const candles1hPrior = symMulti['1h'].filter(c => c.timestamp <= sigTime);

      if (candles4hPrior.length >= 20) {
        const swings4h = detectSwings(candles4hPrior);
        const lastIdx4h = candles4hPrior.length - 1;
        const pd4h = calculatePremiumDiscount(candles4hPrior, swings4h, lastIdx4h);

        if (pd4h.status !== 'undefined') {
          if (isLong && pd4h.status === 'premium') {
            return { tradeNum: trade.num, symbol: trade.symbol, direction: trade.direction, userStatus: trade.userStatus, gateDecision: 'FAIL_4H_PD', outcome: 'GATE_BLOCKED', reason: '4H Pahalı (Premium) bölgede AL engellendi.', rrAchieved: 0 };
          }
          if (!isLong && pd4h.status === 'discount') {
            return { tradeNum: trade.num, symbol: trade.symbol, direction: trade.direction, userStatus: trade.userStatus, gateDecision: 'FAIL_4H_PD', outcome: 'GATE_BLOCKED', reason: '4H Ucuz (Discount) bölgede SAT engellendi.', rrAchieved: 0 };
          }
        }
      }

      if (candles1hPrior.length >= 20) {
        const swings1h = detectSwings(candles1hPrior);
        const lastIdx1h = candles1hPrior.length - 1;
        const pd1h = calculatePremiumDiscount(candles1hPrior, swings1h, lastIdx1h);
        if (pd1h.status !== 'undefined') {
          is1HOpposite = (isLong && pd1h.status === 'premium') || (!isLong && pd1h.status === 'discount');
        }
      }
    }

    // =========================================================================
    // KURAL 2: KRİPTO TESTERE/HAFTA SONU KORUMASI
    // Hafta sonu veya 1H P/D zıtlığında kriptoda işlem alma
    // =========================================================================
    const sigDate = new Date(sigTime);
    const dayOfWeek = sigDate.getUTCDay(); // 0 = Sunday, 6 = Saturday
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    if (isCrypto && (isWeekend || is1HOpposite)) {
      return { tradeNum: trade.num, symbol: trade.symbol, direction: trade.direction, userStatus: trade.userStatus, gateDecision: 'CRYPTO_CHOP_BLOCKED', outcome: 'GATE_BLOCKED', reason: 'Kripto hafta sonu yataylığı veya 1H uyumsuzluğu nedeniyle filtrelendi.', rrAchieved: 0 };
    }

    // =========================================================================
    // KURAL 3: 1M SNIPER İCRA VE REAKSİYON KALKANI
    // 1H zıt ise daha sıkı teyit (rejection wick >= %35), 1H uyumlu ise esnek teyit
    // =========================================================================
    const window = candles1m.slice(startIdx, startIdx + 1440);

    let touchIdx = -1;
    for (let i = 0; i < window.length; i++) {
      const c = window[i];
      const breached = isLong ? c.close < trade.zoneLow : c.close > trade.zoneHigh;
      if (breached) {
        return { tradeNum: trade.num, symbol: trade.symbol, direction: trade.direction, userStatus: trade.userStatus, gateDecision: 'PASS', outcome: 'INVALIDATED', reason: 'Kutuya temas etmeden doğrudan delindi.', rrAchieved: 0 };
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
      return { tradeNum: trade.num, symbol: trade.symbol, direction: trade.direction, userStatus: trade.userStatus, gateDecision: 'PASS', outcome: 'EXPIRED', reason: '24 saat içinde kutuya retest gelmedi.', rrAchieved: 0 };
    }

    const minWickRatio = is1HOpposite ? 0.35 : 0.25;
    const maxReactionWindow = Math.min(window.length, touchIdx + 30);

    for (let i = touchIdx; i < maxReactionWindow; i++) {
      const c = window[i];

      // Kalkan: Fiyat kutu tabanını kırdıysa işlem ALINMAZ!
      const zoneBreached = isLong ? c.close < trade.zoneLow : c.close > trade.zoneHigh;
      if (zoneBreached) {
        return { tradeNum: trade.num, symbol: trade.symbol, direction: trade.direction, userStatus: trade.userStatus, gateDecision: 'PASS', outcome: 'INVALIDATED', reason: 'Kutu tabanı kırıldı (Deldi Geçti) -> 1M kalkanı korudu, girilmedi.', rrAchieved: 0 };
      }

      const range = c.high - c.low;
      if (range <= 0) continue;

      if (isLong) {
        const lowerWick = Math.min(c.open, c.close) - c.low;
        const wickRatio = lowerWick / range;
        const prevC = i > 0 ? window[i - 1] : c;
        const strongBullishEngulf = c.close > c.open && c.close >= prevC.high;

        if (wickRatio >= minWickRatio || strongBullishEngulf) {
          const entryPrice = c.close;
          const stopLoss = Math.min(c.low, trade.zoneLow) - 1.5 * pip;
          const riskDist = Math.abs(entryPrice - stopLoss);
          if (riskDist <= 0) continue;

          return evaluatePosition(trade, window, i, entryPrice, stopLoss, riskDist);
        }
      } else {
        const upperWick = c.high - Math.max(c.open, c.close);
        const wickRatio = upperWick / range;
        const prevC = i > 0 ? window[i - 1] : c;
        const strongBearishEngulf = c.close < c.open && c.close <= prevC.low;

        if (wickRatio >= minWickRatio || strongBearishEngulf) {
          const entryPrice = c.close;
          const stopLoss = Math.max(c.high, trade.zoneHigh) + 1.5 * pip;
          const riskDist = Math.abs(entryPrice - stopLoss);
          if (riskDist <= 0) continue;

          return evaluatePosition(trade, window, i, entryPrice, stopLoss, riskDist);
        }
      }
    }

    return { tradeNum: trade.num, symbol: trade.symbol, direction: trade.direction, userStatus: trade.userStatus, gateDecision: 'PASS', outcome: 'EXPIRED', reason: 'Kutu içinde teyitli tepki oluşmadı.', rrAchieved: 0 };
  }

  function evaluatePosition(
    trade: JournalTradeItem,
    window: Candle[],
    fillIdx: number,
    entryPrice: number,
    stopLoss: number,
    riskDist: number
  ): SimResult {
    const isLong = trade.direction === 'long';
    const targetRR = 2.0;
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
          gateDecision: 'PASS',
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
          gateDecision: 'PASS',
          outcome: 'TP',
          reason: `+${targetRR.toFixed(1)}R Take Profit Vuruldu! (Max MFE: +${maxMfe.toFixed(2)}R)`,
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
          gateDecision: 'PASS',
          outcome: beArmed ? 'BE' : 'SL',
          reason: beArmed ? 'Kâr gördükten sonra BE koruması tetiklendi (0.0R)' : 'Stop Loss seviyesi tetiklendi (-1.0R)',
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
      gateDecision: 'PASS',
      outcome: beArmed ? 'BE' : 'EXPIRED',
      reason: '24 saatlik süre dolumu',
      rrAchieved: beArmed ? 0 : 0,
      entryPrice,
      stopLoss,
      takeProfit,
      mfeR: maxMfe,
    };
  }

  console.log(`\n========================================================================================`);
  console.log(`🎯 KALİBRE EDİLMİŞ NİHAİ MİMARİ TESTİ: 4H HARD GATE + 1H ŞARTLI 1M KALKANI + KRİPTO FİLTRESİ`);
  console.log(`   Son 1 Ay (36 Gerçek Telegram Sinyali Üzerinde Çoklu Zaman Dilimli Test)`);
  console.log(`========================================================================================\n`);

  const results = trades.map(t => evaluateTrade(t));
  const gateBlocked = results.filter(r => r.outcome === 'GATE_BLOCKED');
  const tp = results.filter(r => r.outcome === 'TP');
  const sl = results.filter(r => r.outcome === 'SL');
  const be = results.filter(r => r.outcome === 'BE');
  const inv = results.filter(r => r.outcome === 'INVALIDATED');
  const exp = results.filter(r => r.outcome === 'EXPIRED');

  const filledCount = tp.length + sl.length + be.length;
  const netR = tp.length * 2.0 - sl.length * 1.0;
  const winRate = filledCount > 0 ? (tp.length / filledCount) * 100 : 0;

  for (const r of results) {
    const outcomeStr =
      r.outcome === 'TP'
        ? `🎯 TP (+2.0R / MFE: +${r.mfeR?.toFixed(1)}R)`
        : r.outcome === 'SL'
        ? '🛑 STOP LOSS (-1.0R)'
        : r.outcome === 'BE'
        ? `🛡️ BE (0.0R / MFE: +${r.mfeR?.toFixed(1)}R)`
        : r.outcome === 'GATE_BLOCKED'
        ? `⛔ FİLTRE ENGELLEDİ (${r.gateDecision})`
        : r.outcome === 'INVALIDATED'
        ? '🚫 DELDİ/İPTAL (1M KORUNDU)'
        : '⏳ ZAMAN AŞIMI (PAS)';

    console.log(
      `#${r.tradeNum.toString().padStart(2, '0')} | ${r.symbol.padEnd(6, ' ')} ${r.direction.toUpperCase().padEnd(5, ' ')} | ` +
      `SONUÇ: ${outcomeStr.padEnd(36, ' ')} | KULLANICI: ${r.userStatus.slice(0, 32)}`
    );
  }

  console.log(`\n========================================================================================`);
  console.log(`📊 KALİBRE EDİLMİŞ PERFORMANS BİLANÇOSU:`);
  console.log(`----------------------------------------------------------------------------------------`);
  console.log(`Toplam Analiz Edilen Sinyal      : ${results.length}`);
  console.log(`⛔ Filtrelerle Elenenler         : ${gateBlocked.length} adet (4H P/D ve Kripto Testere kalkanı)`);
  console.log(`🚫 1M Kalkanı ile Korunanlar     : ${inv.length} adet (Kutuyu delip geçenler)`);
  console.log(`⏳ Retest Gelmeyen / Pas         : ${exp.length} adet`);
  console.log(`----------------------------------------------------------------------------------------`);
  console.log(`🔥 Canlıda Gerçekten Tetiklenen  : ${filledCount} adet`);
  console.log(`   🎯 Take Profit (TP)           : ${tp.length} adet (+${(tp.length * 2.0).toFixed(1)} R)`);
  console.log(`   🛑 Stop Loss (SL)             : ${sl.length} adet (-${(sl.length * 1.0).toFixed(1)} R)`);
  console.log(`   🛡️ Break-Even (BE)            : ${be.length} adet (0.0 R)`);
  console.log(`----------------------------------------------------------------------------------------`);
  console.log(`🏆 Win Rate (Net Başarı Oranı)   : %${winRate.toFixed(1)}`);
  console.log(`📈 NET R GETİRİSİ                : ${netR >= 0 ? '+' : ''}${netR.toFixed(1)} R`);
  console.log(`========================================================================================\n`);

  console.log(`🔥 KAZANAN İŞLEMLER (TP):`);
  for (const t of tp) {
    console.log(`   - #${t.tradeNum} ${t.symbol} ${t.direction.toUpperCase()} -> Giriş: ${t.entryPrice}, TP: ${t.takeProfit}, Max MFE: +${t.mfeR?.toFixed(2)}R`);
  }
}

runCalibratedArchitectureBacktest();
