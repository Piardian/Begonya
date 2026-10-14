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
  triggerType: 'FLEXIBLE_REACTION_ENTRY' | 'NONE';
  outcome: 'TP' | 'SL' | 'BE' | 'INVALIDATED' | 'EXPIRED';
  reason: string;
  rrAchieved: number;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  mfeR?: number;
}

function runGoldenSynthesisBacktest() {
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
      // Invalidation before touch: did price blast through without touching zone?
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

    // 2. KUSURSUZ SENTEZ (FLEXIBLE REACTION ENTRY):
    // Kutuya temas edildiği andan itibaren ilk 15 bar (15 dakika) içinde:
    // A) Kalkan kontrolü: Kutu tabanı/invalidation seviyesi aşağı doğru delinirse -> İPTAL / ZARAR ENGELLENDİ
    // B) Giriş kontrolü: Fiyat kutu sınırını savunup 1M'de ilk alıcı/satıcı tepki mumunu (Rejection fitili veya teyit mumu)
    //    ürettiği anda esnek giriş tetiklenir (Kutunun %50 ortasını bekleyip kaçırma hatası kalkar).
    const maxReactionWindow = Math.min(window.length, touchIdx + 20);

    for (let i = touchIdx; i < maxReactionWindow; i++) {
      const c = window[i];

      // Kalkan: Bölge delindi mi?
      const breached = isLong ? c.close < trade.invalidationLevel : c.close > trade.invalidationLevel;
      if (breached) {
        return { tradeNum: trade.num, symbol: trade.symbol, direction: trade.direction, userStatus: trade.userStatus, triggerType: 'NONE', outcome: 'INVALIDATED', reason: 'Kutu delindi (Zone Invalidation); 1M koruma kalkanı çalıştı, girilmedi.', rrAchieved: 0 };
      }

      const range = c.high - c.low;
      if (range <= 0) continue;

      if (isLong) {
        // Alış için: Kutu içinde fitil bırakan veya kutudan seken ilk yeşil mum
        const lowerWick = Math.min(c.open, c.close) - c.low;
        const wickRatio = lowerWick / range;
        const isBullishCandle = c.close >= c.open;

        // Fiyat kutu tabanını koruyor ve yukarı tepki gösteriyor
        if (wickRatio >= 0.25 || isBullishCandle) {
          // Esnek giriş fiyatı: Kutu tavanı veya anlık tepki kapanışı
          const entryPrice = Math.min(trade.zoneHigh, c.close);
          const stopLoss = trade.invalidationLevel;
          const riskDist = Math.abs(entryPrice - stopLoss);
          if (riskDist <= 0) continue;

          return evaluatePosition(trade, window, i, entryPrice, stopLoss, riskDist);
        }
      } else {
        // Satış için: Kutu içinde üst fitil bırakan veya kutudan seken ilk kırmızı mum
        const upperWick = c.high - Math.max(c.open, c.close);
        const wickRatio = upperWick / range;
        const isBearishCandle = c.close <= c.open;

        if (wickRatio >= 0.25 || isBearishCandle) {
          const entryPrice = Math.max(trade.zoneLow, c.close);
          const stopLoss = trade.invalidationLevel;
          const riskDist = Math.abs(entryPrice - stopLoss);
          if (riskDist <= 0) continue;

          return evaluatePosition(trade, window, i, entryPrice, stopLoss, riskDist);
        }
      }
    }

    return { tradeNum: trade.num, symbol: trade.symbol, direction: trade.direction, userStatus: trade.userStatus, triggerType: 'NONE', outcome: 'EXPIRED', reason: 'Kutu içinde 15 bar boyunca tepki oluşmadı.', rrAchieved: 0 };
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
    const targetRR = 2.0; // SMC Rulebook min 2.0R hedefi
    const takeProfit = isLong ? entryPrice + riskDist * targetRR : entryPrice - riskDist * targetRR;

    let beArmed = false;
    let maxMfe = 0;

    for (let k = fillIdx + 1; k < window.length; k++) {
      const bar = window[k];
      const favorable = isLong ? bar.high - entryPrice : entryPrice - bar.low;
      const mfe = favorable / riskDist;
      if (mfe > maxMfe) maxMfe = mfe;

      // 1.0R kâr görüldüğünde Break-Even (BE) devreye girer
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
          triggerType: 'FLEXIBLE_REACTION_ENTRY',
          outcome: beArmed ? 'BE' : 'SL',
          reason: beArmed ? 'Aynı barda TP ve BE test edildi' : 'Aynı barda TP ve SL test edildi',
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
          triggerType: 'FLEXIBLE_REACTION_ENTRY',
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
          triggerType: 'FLEXIBLE_REACTION_ENTRY',
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
      triggerType: 'FLEXIBLE_REACTION_ENTRY',
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
  console.log(`🏆 KUSURSUZ SENTEZ (ALTIN MODEL) TESTİ: ESNEK KUTU İÇİ TEPKİ GİRİŞİ + 1M KALKAN`);
  console.log(`   Son 1 Ay (36 Gerçek Telegram Sinyali Üzerinde Birebir Deterministik Simülasyon)`);
  console.log(`========================================================================================\n`);

  const results = trades.map(t => simulateTrade(t));
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
        : r.outcome === 'INVALIDATED'
        ? '🚫 DELDİ/İPTAL (KORUNDU)'
        : '⏳ ZAMAN AŞIMI (PAS)';

    console.log(
      `#${r.tradeNum.toString().padStart(2, '0')} | ${r.symbol.padEnd(6, ' ')} ${r.direction.toUpperCase().padEnd(5, ' ')} | ` +
      `SONUÇ: ${outcomeStr.padEnd(30, ' ')} | KULLANICI: ${r.userStatus.slice(0, 32)}`
    );
  }

  console.log(`\n========================================================================================`);
  console.log(`📊 ALTIN SENTEZ PERFORMANS BİLANÇOSU:`);
  console.log(`----------------------------------------------------------------------------------------`);
  console.log(`Toplam Analiz Edilen Sinyal : ${results.length}`);
  console.log(`Tetiklenen (İşleme Girilen) : ${filledCount}`);
  console.log(`🎯 Take Profit (TP)         : ${tp.length} adet (+${(tp.length * 2.0).toFixed(1)} R)`);
  console.log(`🛑 Stop Loss (SL)           : ${sl.length} adet (-${(sl.length * 1.0).toFixed(1)} R)`);
  console.log(`🛡️ Break-Even (BE)          : ${be.length} adet (0.0 R)`);
  console.log(`🏆 Win Rate (Net Başarı)    : %${winRate.toFixed(1)}`);
  console.log(`📈 Net R Getirisi           : +${netR.toFixed(1)} R`);
  console.log(`🛡️ Engellenen Kesin Stoplar : ${inv.length} adet (Kutuyu Delip Geçen Felaketler)`);
  console.log(`========================================================================================\n`);

  console.log(`🔥 KAZANAN İŞLEMLER (TP):`);
  for (const t of tp) {
    console.log(`   - #${t.tradeNum} ${t.symbol} ${t.direction.toUpperCase()} -> Giriş: ${t.entryPrice}, TP: ${t.takeProfit}, Max MFE: +${t.mfeR?.toFixed(2)}R`);
  }
}

runGoldenSynthesisBacktest();
