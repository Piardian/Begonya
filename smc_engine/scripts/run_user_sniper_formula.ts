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
  outcome: 'TP' | 'SL' | 'BE' | 'VETO_VELOCITY' | 'VETO_15M_CLOSE' | 'EXPIRED';
  reason: string;
  rrAchieved: number;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  mfeR?: number;
}

function runUserSniperFormulaTest() {
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

  function simulateUserStrategy(trade: JournalTradeItem): SimResult {
    const candles1m = get1mCandles(trade.symbol);
    if (!candles1m || candles1m.length === 0) {
      return { tradeNum: trade.num, symbol: trade.symbol, direction: trade.direction, userStatus: trade.userStatus, outcome: 'EXPIRED', reason: 'No 1m candles', rrAchieved: 0 };
    }

    let startIdx = 0;
    if (trade.timestamp) {
      const idx = candles1m.findIndex(c => c.timestamp >= trade.timestamp!);
      startIdx = idx >= 0 ? idx : 0;
    }

    const sigTime = trade.timestamp ?? candles1m[startIdx].timestamp;
    const isLong = trade.direction === 'long';
    const pip = trade.pipSize;

    // =========================================================================
    // 1. KURAL: 15M KUTUYA YAVAŞÇA GİRİŞ & 15M KAPANIŞI İLE DELİNME KONTROLÜ
    // =========================================================================
    const symMulti = multiTfData[trade.symbol];
    if (symMulti && symMulti['15m']) {
      const candles15mPrior = symMulti['15m'].filter(c => c.timestamp <= sigTime);
      if (candles15mPrior.length >= 3) {
        const last15m = candles15mPrior[candles15mPrior.length - 1];
        const prev15m = candles15mPrior[candles15mPrior.length - 2];
        const range1 = Math.abs(last15m.high - last15m.low);
        const range2 = Math.abs(prev15m.high - prev15m.low);

        // Kutu genişliği referansı
        const zoneWidth = Math.abs(trade.zoneHigh - trade.zoneLow);
        // Eğer kutuya yaklaşan mum kutu genişliğinin 2.5 katından büyükse -> Hızla geldi, veto!
        if (range1 > zoneWidth * 2.5 || range2 > zoneWidth * 2.5) {
          return { tradeNum: trade.num, symbol: trade.symbol, direction: trade.direction, userStatus: trade.userStatus, outcome: 'VETO_VELOCITY', reason: 'Kutuya aşırı hızlı/şelale ivmeyle geldi (Veto).', rrAchieved: 0 };
        }
      }
    }

    const window = candles1m.slice(startIdx, startIdx + 1440);

    // 15M POI teması
    let touchIdx = -1;
    for (let i = 0; i < window.length; i++) {
      const c = window[i];
      const touched = isLong
        ? c.low <= trade.zoneHigh && c.high >= trade.zoneLow
        : c.high >= trade.zoneLow && c.low <= trade.zoneHigh;

      if (touched) {
        touchIdx = i;
        break;
      }
    }

    if (touchIdx === -1) {
      return { tradeNum: trade.num, symbol: trade.symbol, direction: trade.direction, userStatus: trade.userStatus, outcome: 'EXPIRED', reason: 'Kutuya temas gelmedi (Retest Yok).', rrAchieved: 0 };
    }

    // 15M kapanışı ile delinme kontrolü (15 bar = 15 dakika)
    // 1M'de delebilir sorun yok, ama 15 dakikalık toplu barda kapanış kutuyu aştıysa veto!
    const maxReactionWindow = Math.min(window.length, touchIdx + 60);

    // =========================================================================
    // 2. KURAL: 1M IDM & BOS LEVEL TESPİTİ + CHOCH (KARAKTER DEĞİŞİMİ)
    // =========================================================================
    let idmLevel: number | null = null;
    let bosLevel: number | null = null;
    let chochIdx = -1;
    let swingExtreme = isLong ? Infinity : -Infinity;
    let hasSweep = false;

    for (let i = touchIdx + 1; i < maxReactionWindow; i++) {
      const c = window[i];
      const prevC = window[i - 1];

      // 15M Delinme Kontrolü: Eğer 15 ardışık 1M mumunun tamamı kutu dışında kapanmışsa 15M mumu delmiştir!
      if (i >= touchIdx + 15) {
        const last15Bars = window.slice(i - 15, i);
        const allBreached = isLong
          ? last15Bars.every(b => b.close < trade.zoneLow)
          : last15Bars.every(b => b.close > trade.zoneHigh);
        if (allBreached) {
          return { tradeNum: trade.num, symbol: trade.symbol, direction: trade.direction, userStatus: trade.userStatus, outcome: 'VETO_15M_CLOSE', reason: '15M mumu kutuyu delip kapattı (15M Zone Breached).', rrAchieved: 0 };
        }
      }

      // KULLANICININ TARİFİ:
      // "Bir önceki mumun dibini almış ve bir önceki mumun üzerinde kapatmış mı?
      //  Dibini IDM level, üzerindeki kapatmış mumu da BOS level olarak kaydediyorum."
      if (isLong) {
        // Long arayışı: Fiyat kutu içinde düşerken dip arıyoruz
        // Önceki mumun dibini süpürmüş (low < prev.low) ve üzerinde kapatmış (close > prev.high)
        if (c.low < prevC.low && c.close > prevC.high) {
          idmLevel = c.low;
          bosLevel = c.high;
          swingExtreme = Math.min(swingExtreme, c.low);
        }

        // Tepe sweep'i kontrolü (Ek confirmasyon)
        if (bosLevel !== null && c.high > bosLevel && c.close < bosLevel) {
          hasSweep = true;
        }

        // CHoCH Kontrolü: "Eğer bu IDM level üstünde/BOS üzerinde kapanış yaparsa karakter değişimi yapmış"
        // Long için: Fiyat tepeyi (BOS level) gövdeyle kırıp kapatacak
        if (bosLevel !== null && c.close > bosLevel) {
          const range = c.high - c.low;
          const body = Math.abs(c.close - c.open);
          // "karakter değişimi de orta halli displacement ile olması yeterli" (body ratio >= %45)
          if (range > 0 && body / range >= 0.45) {
            chochIdx = i;
            break;
          }
        }
      } else {
        // Short arayışı:
        // Önceki mumun tepesini süpürmüş (high > prev.high) ve altında kapatmış (close < prev.low)
        if (c.high > prevC.high && c.close < prevC.low) {
          idmLevel = c.high;
          bosLevel = c.low;
          swingExtreme = Math.max(swingExtreme, c.high);
        }

        // Dip sweep'i kontrolü
        if (bosLevel !== null && c.low < bosLevel && c.close > bosLevel) {
          hasSweep = true;
        }

        // Short için: Fiyat IDM/BOS dibinin altında kapanış yapacak
        if (bosLevel !== null && c.close < bosLevel) {
          const range = c.high - c.low;
          const body = Math.abs(c.close - c.open);
          if (range > 0 && body / range >= 0.45) {
            chochIdx = i;
            break;
          }
        }
      }
    }

    if (chochIdx === -1 || idmLevel === null || bosLevel === null) {
      return { tradeNum: trade.num, symbol: trade.symbol, direction: trade.direction, userStatus: trade.userStatus, outcome: 'EXPIRED', reason: '1M IDM/BOS ve Karakter Değişimi oluşmadı.', rrAchieved: 0 };
    }

    // =========================================================================
    // 3. KURAL: 1M EN SON TEPE VE DİP'E FİB ÇEKME (0.5 FİB EMRİ)
    // "Fiyat düzeltme yapmadan genişlemeye devam ederse fib de genişler.
    //  0.5'e değdiği an işleme girilir."
    // =========================================================================
    let anchorHigh = isLong ? window[chochIdx].high : idmLevel;
    let anchorLow = isLong ? idmLevel : window[chochIdx].low;

    let filledIdx = -1;
    let entryPrice = 0;
    let stopLoss = 0;
    let riskDist = 0;

    for (let k = chochIdx + 1; k < Math.min(window.length, chochIdx + 60); k++) {
      const bar = window[k];

      if (isLong) {
        // Fiyat yukarı genişlemeye devam ederse anchorHigh güncellenir (Fib genişler)
        if (bar.high > anchorHigh) {
          anchorHigh = bar.high;
        }
        // 0.5 Fib seviyesi
        const fib05 = anchorLow + (anchorHigh - anchorLow) * 0.5;

        // Fiyat 0.5 Fib'e geri çekilip değdi mi?
        if (bar.low <= fib05) {
          filledIdx = k;
          entryPrice = fib05;
          stopLoss = anchorLow - 1.5 * pip; // Sweep edilen dip altı
          riskDist = Math.abs(entryPrice - stopLoss);
          break;
        }
      } else {
        // Fiyat aşağı genişlemeye devam ederse anchorLow güncellenir (Fib genişler)
        if (bar.low < anchorLow) {
          anchorLow = bar.low;
        }
        // 0.5 Fib seviyesi
        const fib05 = anchorLow + (anchorHigh - anchorLow) * 0.5;

        // Fiyat 0.5 Fib'e yukarı çekilip değdi mi?
        if (bar.high >= fib05) {
          filledIdx = k;
          entryPrice = fib05;
          stopLoss = anchorHigh + 1.5 * pip; // Sweep edilen tepe üstü
          riskDist = Math.abs(entryPrice - stopLoss);
          break;
        }
      }
    }

    if (filledIdx === -1 || riskDist <= 0) {
      return { tradeNum: trade.num, symbol: trade.symbol, direction: trade.direction, userStatus: trade.userStatus, outcome: 'EXPIRED', reason: '0.5 Fib seviyesine retest gelmedi (Emir dolmadı).', rrAchieved: 0 };
    }

    // =========================================================================
    // 4. KURAL: %50 TP1 (+1.0R'DE), STOP BE'YE ÇEKİLİR, KALAN %50 TP2 (+2.0R MİNİMUM)
    // =========================================================================
    const tp1Price = isLong ? entryPrice + riskDist * 1.0 : entryPrice - riskDist * 1.0;
    const tp2Price = isLong ? entryPrice + riskDist * 2.0 : entryPrice - riskDist * 2.0;

    let tp1Hit = false;
    let maxMfe = 0;

    for (let m = filledIdx + 1; m < window.length; m++) {
      const b = window[m];
      const favorable = isLong ? b.high - entryPrice : entryPrice - b.low;
      const mfe = favorable / riskDist;
      if (mfe > maxMfe) maxMfe = mfe;

      // Henüz TP1 vurulmadıysa stop orijinal SL seviyesinde
      if (!tp1Hit) {
        const slHit = isLong ? b.low <= stopLoss : b.high >= stopLoss;
        const tp1Reached = isLong ? b.high >= tp1Price : b.low <= tp1Price;

        if (slHit) {
          return { tradeNum: trade.num, symbol: trade.symbol, direction: trade.direction, userStatus: trade.userStatus, outcome: 'SL', reason: 'TP1 görülmeden önce 1M stop seviyesi tetiklendi (-1.0R).', rrAchieved: -1.0, entryPrice, stopLoss, takeProfit: tp2Price, mfeR: maxMfe };
        }

        if (tp1Reached) {
          tp1Hit = true; // %50 TP alındı (+0.5R kilitlendi), kalan stop BE'ye çekildi!
        }
      } else {
        // TP1 vurulduktan sonra: Stop artık BAŞABAŞ (entryPrice)
        const beHit = isLong ? b.low <= entryPrice : b.high >= entryPrice;
        const tp2Reached = isLong ? b.high >= tp2Price : b.low <= tp2Price;

        if (tp2Reached) {
          // %50'si 1R'de (+0.5R) + %50'si 2R'de (+1.0R) = Toplam Net +1.5R Realize!
          return { tradeNum: trade.num, symbol: trade.symbol, direction: trade.direction, userStatus: trade.userStatus, outcome: 'TP', reason: '🎯 TP1 (+1R %50) ve TP2 (+2R %50) başarıyla tamamlandı (+1.5R Net)!', rrAchieved: 1.5, entryPrice, stopLoss, takeProfit: tp2Price, mfeR: maxMfe };
        }

        if (beHit) {
          // %50'si 1R'de (+0.5R) + Kalanı BE (0R) = Toplam Net +0.5R KÂR!
          return { tradeNum: trade.num, symbol: trade.symbol, direction: trade.direction, userStatus: trade.userStatus, outcome: 'BE', reason: '🛡️ TP1 alındıktan sonra kalan %50 BE seviyesinde kapandı (+0.5R Net Kâr)!', rrAchieved: 0.5, entryPrice, stopLoss, takeProfit: tp2Price, mfeR: maxMfe };
        }
      }
    }

    return { tradeNum: trade.num, symbol: trade.symbol, direction: trade.direction, userStatus: trade.userStatus, outcome: tp1Hit ? 'BE' : 'EXPIRED', reason: 'Süre dolumu', rrAchieved: tp1Hit ? 0.5 : 0, entryPrice, stopLoss, takeProfit: tp2Price, mfeR: maxMfe };
  }

  console.log(`\n========================================================================================`);
  console.log(`👑 KULLANICININ SNIPER İCRA FORMÜLÜ (1M IDM/BOS + 0.5 FİB + KADEMELİ TP) TESTİ`);
  console.log(`   Son 1 Ay (36 Gerçek Telegram Sinyali Üzerinde Birebir Deterministik Simülasyon)`);
  console.log(`========================================================================================\n`);

  const results = trades.map(t => simulateUserStrategy(t));
  const tp = results.filter(r => r.outcome === 'TP');
  const sl = results.filter(r => r.outcome === 'SL');
  const be = results.filter(r => r.outcome === 'BE');
  const vetoVel = results.filter(r => r.outcome === 'VETO_VELOCITY');
  const vetoClose = results.filter(r => r.outcome === 'VETO_15M_CLOSE');
  const exp = results.filter(r => r.outcome === 'EXPIRED');

  const filledCount = tp.length + sl.length + be.length;
  let totalNetR = 0;
  for (const r of results) {
    totalNetR += r.rrAchieved;
  }
  const winRate = filledCount > 0 ? (tp.length / filledCount) * 100 : 0;

  for (const r of results) {
    const outcomeStr =
      r.outcome === 'TP'
        ? `🎯 TAM TP (+1.5R / MFE: +${r.mfeR?.toFixed(1)}R)`
        : r.outcome === 'SL'
        ? '🛑 STOP LOSS (-1.0R)'
        : r.outcome === 'BE'
        ? `🛡️ TP1 ALINDI + BE (+0.5R / MFE: +${r.mfeR?.toFixed(1)}R)`
        : r.outcome === 'VETO_VELOCITY'
        ? '⚡ VETO (AŞIRI HIZLI İVME)'
        : r.outcome === 'VETO_15M_CLOSE'
        ? '🚫 VETO (15M KAPANIŞI İLE DELİNDİ)'
        : '⏳ ZAMAN AŞIMI (PAS)';

    console.log(
      `#${r.tradeNum.toString().padStart(2, '0')} | ${r.symbol.padEnd(6, ' ')} ${r.direction.toUpperCase().padEnd(5, ' ')} | ` +
      `SONUÇ: ${outcomeStr.padEnd(38, ' ')} | KULLANICI: ${r.userStatus.slice(0, 30)}`
    );
  }

  console.log(`\n========================================================================================`);
  console.log(`📊 KULLANICI FORMÜLÜ PERFORMANS BİLANÇOSU:`);
  console.log(`----------------------------------------------------------------------------------------`);
  console.log(`Toplam Analiz Edilen Sinyal      : ${results.length}`);
  console.log(`⚡ Hızlı İvme ile Elenen (Veto)  : ${vetoVel.length} adet`);
  console.log(`🚫 15M Kapanışı ile Delinen Veto : ${vetoClose.length} adet`);
  console.log(`⏳ Onay Vermeyen / Retest Yok    : ${exp.length} adet`);
  console.log(`----------------------------------------------------------------------------------------`);
  console.log(`🔥 Gerçekten İcraya Girilen      : ${filledCount} adet`);
  console.log(`   🎯 Tam TP Vurulan (TP1 + TP2) : ${tp.length} adet`);
  console.log(`   🛡️ Kısmi Kâr + BE (+0.5R Net) : ${be.length} adet`);
  console.log(`   🛑 Stop Loss (SL)             : ${sl.length} adet`);
  console.log(`----------------------------------------------------------------------------------------`);
  console.log(`🏆 Win Rate (Pozitif Kapanış)    : %${(((tp.length + be.length) / (filledCount || 1)) * 100).toFixed(1)}`);
  console.log(`📈 NET R GETİRİSİ                : ${totalNetR >= 0 ? '+' : ''}${totalNetR.toFixed(1)} R`);
  console.log(`========================================================================================\n`);

  console.log(`🔥 KAZANAN / KÂR BIRAKAN İŞLEMLER:`);
  for (const t of [...tp, ...be]) {
    console.log(`   - #${t.tradeNum} ${t.symbol} ${t.direction.toUpperCase()} -> Sonuç: ${t.outcome} (${t.rrAchieved > 0 ? '+' : ''}${t.rrAchieved}R), MFE: +${t.mfeR?.toFixed(2)}R | ${t.reason}`);
  }
}

runUserSniperFormulaTest();
