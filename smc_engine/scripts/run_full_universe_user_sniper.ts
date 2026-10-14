import * as fs from 'fs';
import * as path from 'path';
import { detectSwings } from '../src/swingDetector';
import { detectStructure } from '../src/structureDetector';
import { calculatePremiumDiscount } from '../src/premiumDiscountCalculator';
import { detectAllOrderBlocks } from '../src/obDetector';
import { detectAllFVGs } from '../src/fvgDetector';
import { calculateGrade, GradeInput } from '../src/gradeCalculator';
import { getPipSize, detectAssetClass } from '../src/assetMetrics';
import { Candle } from '../src/types';

interface CandidatePoi {
  id: string;
  symbol: string;
  direction: 'long' | 'short';
  poiType: 'OB' | 'FVG';
  zoneLow: number;
  zoneHigh: number;
  breakTimestamp: number;
  pipSize: number;
}

interface SniperTradeResult {
  symbol: string;
  assetClass: string;
  direction: 'long' | 'short';
  poiType: 'OB' | 'FVG';
  zoneLow: number;
  zoneHigh: number;
  timestamp: number;
  dateStr: string;
  outcome: 'TP' | 'BE' | 'SL' | 'VETO_VELOCITY' | 'VETO_15M_CLOSE' | 'EXPIRED';
  reason: string;
  rrAchieved: number;
  entryPrice?: number;
  stopLoss?: number;
  tpPrice?: number;
  mfeR?: number;
}

function runFullUniverseUserSniperTest() {
  const dataDir = path.join(__dirname, '..', 'data', '1m_backtest');
  const multiTfPath = path.join(__dirname, '..', 'data', 'backtest_candles_1mo.json');

  if (!fs.existsSync(multiTfPath)) {
    console.error('Multi-TF backtest file not found:', multiTfPath);
    return;
  }

  const multiTfData: Record<string, { '15m': Candle[]; '1h': Candle[]; '4h': Candle[] }> =
    JSON.parse(fs.readFileSync(multiTfPath, 'utf8'));

  const universeSymbols = [
    'EURUSD', 'GBPUSD', 'AUDUSD', 'USDCAD', 'USDJPY', 'NZDUSD', 'USDCHF', 'AUDCAD',
    'EURJPY', 'GBPJPY', 'CADJPY', 'AUDJPY', 'EURAUD', 'EURCHF', 'GBPCHF', 'CADCHF',
    'NZDCHF', 'CHFJPY', 'XAUUSD', 'NAS100', 'BTCUSD', 'ETHUSD', 'SOLUSD', 'LTCUSD'
  ];

  console.log(`\n========================================================================================`);
  console.log(`👑 TÜM PARİTELERDE KULLANICININ 1M SNIPER İCRA FORMÜLÜ BÜYÜK BACKTESTİ`);
  console.log(`   Evren: 24 Parite (Forex, Metaller, Endeks, Kripto) | Veri: 30 Günlük Gerçek 1M Barları`);
  console.log(`========================================================================================\n`);

  // 1. ADIM: 15M POI'leri HTF Onayından (4H & 1H PD & Bias) Geçirerek Üret
  console.log(`⏳ 1. Aşama: 24 parite taranıyor, 4H & 1H kurumsal onayından geçen 15M POI'leri toplanıyor...`);
  const candidatePois: CandidatePoi[] = [];

  for (const sym of universeSymbols) {
    const symData = multiTfData[sym];
    if (!symData || !symData['15m'] || !symData['1h'] || !symData['4h']) continue;

    const c15 = symData['15m'];
    const c1 = symData['1h'];
    const c4 = symData['4h'];

    const st15 = detectStructure(c15, detectSwings(c15));
    const obs = detectAllOrderBlocks(c15, st15.events);
    const fvgs = detectAllFVGs(c15, st15.events, sym as any, '15m');

    const rawList: { type: 'OB' | 'FVG'; low: number; high: number; direction: 'bullish' | 'bearish'; breakTimestamp: number }[] = [
      ...obs.map(o => ({ type: 'OB' as const, low: o.low, high: o.high, direction: o.direction, breakTimestamp: o.relatedEvent.breakTimestamp })),
      ...fvgs.map(f => ({ type: 'FVG' as const, low: f.gapLow, high: f.gapHigh, direction: f.direction, breakTimestamp: f.relatedEvent.breakTimestamp }))
    ];

    // Konsolidasyon ve duplikasyon temizliği
    const seenPois = new Set<string>();

    for (const raw of rawList) {
      const breakT = raw.breakTimestamp;
      const c4Prior = c4.filter(c => c.timestamp <= breakT);
      const c1Prior = c1.filter(c => c.timestamp <= breakT);
      if (c4Prior.length < 20 || c1Prior.length < 20) continue;

      const st4 = detectStructure(c4Prior, detectSwings(c4Prior));
      const st1 = detectStructure(c1Prior, detectSwings(c1Prior));
      const pd4 = calculatePremiumDiscount(c4Prior, detectSwings(c4Prior), c4Prior.length - 1);
      const pd1 = calculatePremiumDiscount(c1Prior, detectSwings(c1Prior), c1Prior.length - 1);

      const tradeDir = raw.direction === 'bullish' ? 'long' : 'short';

      // 4H Bias & HTF Consistency
      const gi: any = {
        tradeDirection: tradeDir,
        bias4H: st4.currentTrend,
        pd4H: pd4,
        bias1H: st1.currentTrend,
        has15mEvent: true,
        displacementQuality15m: { gradePoints: 2, quality: 'güçlü' },
        modelState: { model: 'model2_continuation', triggeringSweep: null, regime: 'trend', triggeringBOS: null },
        poiTestResultForSweep: null,
        poiTimeframe: '15m',
        poiTestCount: 0,
        pd1H: pd1,
        pd15M: { status: tradeDir === 'long' ? 'discount' : 'premium', fibValue: 0.3, rangeHigh: 1, rangeLow: 0 },
        liquidityMagnet: null,
        opposingObstacle: null,
        allowTrendContinuationPD: false,
      };

      const gr = calculateGrade(gi);
      if (!gr.entryAllowed) continue;

      const pip = getPipSize(sym);
      const lowPips = Math.round(raw.low / pip);
      const highPips = Math.round(raw.high / pip);
      const dedupeKey = `${sym}:${tradeDir}:${lowPips}-${highPips}`;

      if (seenPois.has(dedupeKey)) continue;
      seenPois.add(dedupeKey);

      candidatePois.push({
        id: `${sym}_${raw.type}_${breakT}`,
        symbol: sym,
        direction: tradeDir,
        poiType: raw.type,
        zoneLow: raw.low,
        zoneHigh: raw.high,
        breakTimestamp: breakT,
        pipSize: pip,
      });
    }
  }

  console.log(`✅ Toplam kurumsal onaylı 15M POI adedi: ${candidatePois.length}`);
  console.log(`⏳ 2. Aşama: 1 dakikalık gerçek mumlar üzerinde Kullanıcı Sniper Formülü simüle ediliyor...\n`);

  // 1M veri önbelleği
  const cache1m: Map<string, Candle[]> = new Map();
  function get1mCandles(sym: string): Candle[] {
    if (cache1m.has(sym)) return cache1m.get(sym)!;
    const p = path.join(dataDir, `${sym}_1m_30d.json`);
    if (!fs.existsSync(p)) return [];
    const raw: any[] = JSON.parse(fs.readFileSync(p, 'utf8'));
    cache1m.set(sym, raw);
    return raw;
  }

  // KULLANICININ BİREBİR FORMÜLÜ
  function simulateSniper(poi: CandidatePoi): SniperTradeResult {
    const assetClass = detectAssetClass(poi.symbol);
    const dateStr = new Date(poi.breakTimestamp).toISOString().slice(0, 16).replace('T', ' ');
    const candles1m = get1mCandles(poi.symbol);

    if (!candles1m || candles1m.length === 0) {
      return {
        symbol: poi.symbol, assetClass, direction: poi.direction, poiType: poi.poiType,
        zoneLow: poi.zoneLow, zoneHigh: poi.zoneHigh, timestamp: poi.breakTimestamp, dateStr,
        outcome: 'EXPIRED', reason: '1m veri dosyası bulunamadı', rrAchieved: 0
      };
    }

    const startIdx = candles1m.findIndex(c => c.timestamp >= poi.breakTimestamp);
    if (startIdx === -1) {
      return {
        symbol: poi.symbol, assetClass, direction: poi.direction, poiType: poi.poiType,
        zoneLow: poi.zoneLow, zoneHigh: poi.zoneHigh, timestamp: poi.breakTimestamp, dateStr,
        outcome: 'EXPIRED', reason: '1m başlangıç barı aralık dışında', rrAchieved: 0
      };
    }

    const isLong = poi.direction === 'long';
    const pip = poi.pipSize;

    // 1. KURAL: 15M Kutuya Yavaşça Giriş (Aşırı ivme / şelale kontrolü)
    const symMulti = multiTfData[poi.symbol];
    if (symMulti && symMulti['15m']) {
      const candles15mPrior = symMulti['15m'].filter(c => c.timestamp <= poi.breakTimestamp);
      if (candles15mPrior.length >= 3) {
        const last15m = candles15mPrior[candles15mPrior.length - 1];
        const prev15m = candles15mPrior[candles15mPrior.length - 2];
        const range1 = Math.abs(last15m.high - last15m.low);
        const range2 = Math.abs(prev15m.high - prev15m.low);
        const zoneWidth = Math.abs(poi.zoneHigh - poi.zoneLow);

        if (range1 > zoneWidth * 2.5 || range2 > zoneWidth * 2.5) {
          return {
            symbol: poi.symbol, assetClass, direction: poi.direction, poiType: poi.poiType,
            zoneLow: poi.zoneLow, zoneHigh: poi.zoneHigh, timestamp: poi.breakTimestamp, dateStr,
            outcome: 'VETO_VELOCITY', reason: 'Kutuya aşırı hızlı/şelale ivmeyle yaklaştı (Veto).', rrAchieved: 0
          };
        }
      }
    }

    // Maksimum 24 saat (1440 1M mum) retest penceresi
    const window = candles1m.slice(startIdx, startIdx + 1440);

    // Kutuya temas tespiti
    let touchIdx = -1;
    for (let i = 0; i < window.length; i++) {
      const c = window[i];
      const touched = isLong
        ? c.low <= poi.zoneHigh && c.high >= poi.zoneLow
        : c.high >= poi.zoneLow && c.low <= poi.zoneHigh;
      if (touched) {
        touchIdx = i;
        break;
      }
    }

    if (touchIdx === -1) {
      return {
        symbol: poi.symbol, assetClass, direction: poi.direction, poiType: poi.poiType,
        zoneLow: poi.zoneLow, zoneHigh: poi.zoneHigh, timestamp: poi.breakTimestamp, dateStr,
        outcome: 'EXPIRED', reason: 'Kutuya temas gelmedi (Retest yok).', rrAchieved: 0
      };
    }

    // 2. KURAL: 1M IDM & BOS LEVEL + 15M DELİNME KONTROLÜ
    // Kullanıcı kuralı: 15M mumu kutu dışında kapatırsa veto. 1M delebilir.
    const maxReactionWindow = Math.min(window.length, touchIdx + 60);
    let idmLevel: number | null = null;
    let bosLevel: number | null = null;
    let chochIdx = -1;

    for (let i = touchIdx + 1; i < maxReactionWindow; i++) {
      const c = window[i];
      const prevC = window[i - 1];

      // 15M Kapanışı ile Delinme Kontrolü (15 ardışık 1M mumunun tamamı kutu dışında kapanmışsa 15M mumu kutuyu delip kapatmıştır)
      if (i >= touchIdx + 15) {
        const last15Bars = window.slice(i - 15, i);
        const allBreached = isLong
          ? last15Bars.every(b => b.close < poi.zoneLow)
          : last15Bars.every(b => b.close > poi.zoneHigh);
        if (allBreached) {
          return {
            symbol: poi.symbol, assetClass, direction: poi.direction, poiType: poi.poiType,
            zoneLow: poi.zoneLow, zoneHigh: poi.zoneHigh, timestamp: poi.breakTimestamp, dateStr,
            outcome: 'VETO_15M_CLOSE', reason: '15M mumu kutuyu delip kapattı (15M Breached).', rrAchieved: 0
          };
        }
      }

      // Kullanıcının IDM & BOS Tarifi:
      // "Bir önceki mumun dibini almış ve bir önceki mumun üzerinde kapatmış mı?
      //  Dibini IDM level, üzerindeki kapatmış mumu da BOS level olarak kaydediyorum."
      if (isLong) {
        if (c.low < prevC.low && c.close > prevC.high) {
          idmLevel = c.low;
          bosLevel = c.high;
        }

        // CHoCH: BOS level üzerinde gövdeyle kapanış (body ratio >= 0.45)
        if (bosLevel !== null && c.close > bosLevel) {
          const range = c.high - c.low;
          const body = Math.abs(c.close - c.open);
          if (range > 0 && body / range >= 0.45) {
            chochIdx = i;
            break;
          }
        }
      } else {
        // Short: Önceki mumun tepesini süpürüp altında kapatmış mı
        if (c.high > prevC.high && c.close < prevC.low) {
          idmLevel = c.high;
          bosLevel = c.low;
        }

        // CHoCH: BOS level altında gövdeyle kapanış
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
      return {
        symbol: poi.symbol, assetClass, direction: poi.direction, poiType: poi.poiType,
        zoneLow: poi.zoneLow, zoneHigh: poi.zoneHigh, timestamp: poi.breakTimestamp, dateStr,
        outcome: 'EXPIRED', reason: '1M IDM/BOS veya CHoCH onayı gelmedi.', rrAchieved: 0
      };
    }

    // 3. KURAL: EN SON TEPE VE DİP'E DİNAMİK FİB (0.5 RETEST EMRİ)
    let anchorHigh = isLong ? window[chochIdx].high : idmLevel;
    let anchorLow = isLong ? idmLevel : window[chochIdx].low;

    let filledIdx = -1;
    let entryPrice = 0;
    let stopLoss = 0;
    let riskDist = 0;

    for (let k = chochIdx + 1; k < Math.min(window.length, chochIdx + 60); k++) {
      const bar = window[k];

      if (isLong) {
        if (bar.high > anchorHigh) anchorHigh = bar.high; // Fib genişler
        const fib05 = anchorLow + (anchorHigh - anchorLow) * 0.5;

        if (bar.low <= fib05) {
          filledIdx = k;
          entryPrice = fib05;
          stopLoss = anchorLow - 1.5 * pip;
          riskDist = Math.abs(entryPrice - stopLoss);
          break;
        }
      } else {
        if (bar.low < anchorLow) anchorLow = bar.low; // Fib genişler
        const fib05 = anchorLow + (anchorHigh - anchorLow) * 0.5;

        if (bar.high >= fib05) {
          filledIdx = k;
          entryPrice = fib05;
          stopLoss = anchorHigh + 1.5 * pip;
          riskDist = Math.abs(entryPrice - stopLoss);
          break;
        }
      }
    }

    if (filledIdx === -1 || riskDist <= 0) {
      return {
        symbol: poi.symbol, assetClass, direction: poi.direction, poiType: poi.poiType,
        zoneLow: poi.zoneLow, zoneHigh: poi.zoneHigh, timestamp: poi.breakTimestamp, dateStr,
        outcome: 'EXPIRED', reason: '0.5 Fib seviyesine geri çekilme gelmedi.', rrAchieved: 0
      };
    }

    // 4. KURAL: KADEMELİ TP (1R'de %50 TP1 + BE, Kalan %50 2R'de TP2)
    const tp1Price = isLong ? entryPrice + riskDist * 1.0 : entryPrice - riskDist * 1.0;
    const tp2Price = isLong ? entryPrice + riskDist * 2.0 : entryPrice - riskDist * 2.0;

    let tp1Hit = false;
    let maxMfe = 0;

    for (let m = filledIdx + 1; m < window.length; m++) {
      const b = window[m];
      const favorable = isLong ? b.high - entryPrice : entryPrice - b.low;
      const mfe = favorable / riskDist;
      if (mfe > maxMfe) maxMfe = mfe;

      if (!tp1Hit) {
        const slHit = isLong ? b.low <= stopLoss : b.high >= stopLoss;
        const tp1Reached = isLong ? b.high >= tp1Price : b.low <= tp1Price;

        if (slHit) {
          return {
            symbol: poi.symbol, assetClass, direction: poi.direction, poiType: poi.poiType,
            zoneLow: poi.zoneLow, zoneHigh: poi.zoneHigh, timestamp: poi.breakTimestamp, dateStr,
            outcome: 'SL', reason: 'TP1 öncesi Stop Loss vuruldu (-1.0R).', rrAchieved: -1.0,
            entryPrice, stopLoss, tpPrice: tp2Price, mfeR: maxMfe
          };
        }

        if (tp1Reached) {
          tp1Hit = true;
        }
      } else {
        // Stop artık Break-Even (entryPrice)
        const beHit = isLong ? b.low <= entryPrice : b.high >= entryPrice;
        const tp2Reached = isLong ? b.high >= tp2Price : b.low <= tp2Price;

        if (tp2Reached) {
          return {
            symbol: poi.symbol, assetClass, direction: poi.direction, poiType: poi.poiType,
            zoneLow: poi.zoneLow, zoneHigh: poi.zoneHigh, timestamp: poi.breakTimestamp, dateStr,
            outcome: 'TP', reason: '🎯 TP1 (+1R %50) ve TP2 (+2R %50) eksiksiz vuruldu (+1.5R Net)!', rrAchieved: 1.5,
            entryPrice, stopLoss, tpPrice: tp2Price, mfeR: maxMfe
          };
        }

        if (beHit) {
          return {
            symbol: poi.symbol, assetClass, direction: poi.direction, poiType: poi.poiType,
            zoneLow: poi.zoneLow, zoneHigh: poi.zoneHigh, timestamp: poi.breakTimestamp, dateStr,
            outcome: 'BE', reason: '🛡️ TP1 alındıktan sonra kalan %50 BE seviyesinde kapandı (+0.5R Net)!', rrAchieved: 0.5,
            entryPrice, stopLoss, tpPrice: tp2Price, mfeR: maxMfe
          };
        }
      }
    }

    return {
      symbol: poi.symbol, assetClass, direction: poi.direction, poiType: poi.poiType,
      zoneLow: poi.zoneLow, zoneHigh: poi.zoneHigh, timestamp: poi.breakTimestamp, dateStr,
      outcome: tp1Hit ? 'BE' : 'EXPIRED', reason: tp1Hit ? 'BE (Süre dolumu)' : 'Süre dolumu (Dolu işlem)',
      rrAchieved: tp1Hit ? 0.5 : 0, entryPrice, stopLoss, tpPrice: tp2Price, mfeR: maxMfe
    };
  }

  // Simülasyonu çalıştır
  const results = candidatePois.map(p => simulateSniper(p));

  const tp = results.filter(r => r.outcome === 'TP');
  const be = results.filter(r => r.outcome === 'BE');
  const sl = results.filter(r => r.outcome === 'SL');
  const vetoVel = results.filter(r => r.outcome === 'VETO_VELOCITY');
  const vetoClose = results.filter(r => r.outcome === 'VETO_15M_CLOSE');
  const expired = results.filter(r => r.outcome === 'EXPIRED');

  const filled = [...tp, ...be, ...sl];
  const totalNetR = filled.reduce((acc, cur) => acc + cur.rrAchieved, 0);
  const winRate = filled.length > 0 ? (((tp.length + be.length) / filled.length) * 100) : 0;
  const fullTpRate = filled.length > 0 ? ((tp.length / filled.length) * 100) : 0;

  console.log(`========================================================================================`);
  console.log(`🎯 TÜM EVREN GENELİ PERFORMANS ÖZETİ (1 AY, 24 PARİTE):`);
  console.log(`----------------------------------------------------------------------------------------`);
  console.log(`Toplam Analiz Edilen 15M POI Kurulumu   : ${results.length} adet`);
  console.log(`⚡ Aşırı İvme/Şelale ile Veto Edilen     : ${vetoVel.length} adet`);
  console.log(`🚫 15M Kapanışıyla Delinip Veto Edilen   : ${vetoClose.length} adet`);
  console.log(`⏳ 1M CHoCH Onayı Gelmeyen / Retestsiz   : ${expired.length} adet`);
  console.log(`----------------------------------------------------------------------------------------`);
  console.log(`🔥 1M Giriş Şartı Tamamlanıp Doldurulan  : ${filled.length} adet`);
  console.log(`   🎯 Tam Hedef Vuran (TP1 + TP2)        : ${tp.length} adet (+1.5R her biri)`);
  console.log(`   🛡️ Kısmi Kâr Kilitlenen (TP1 + BE)    : ${be.length} adet (+0.5R her biri)`);
  console.log(`   🛑 Stop Loss (SL) Vuran               : ${sl.length} adet (-1.0R her biri)`);
  console.log(`----------------------------------------------------------------------------------------`);
  console.log(`🏆 Toplam Pozitif Kapanış Oranı (WinRate) : %${winRate.toFixed(1)}`);
  console.log(`🎯 Tam TP Oranı (Full TP Rate)            : %${fullTpRate.toFixed(1)}`);
  console.log(`📈 NET PORTFÖY GETİRİSİ (Total Net R)     : ${totalNetR >= 0 ? '+' : ''}${totalNetR.toFixed(1)} R`);
  console.log(`========================================================================================\n`);

  // Varlık Grubu Bazlı Kırılım
  const assetGroups: Record<string, SniperTradeResult[]> = {};
  for (const r of filled) {
    assetGroups[r.assetClass] = assetGroups[r.assetClass] || [];
    assetGroups[r.assetClass].push(r);
  }

  console.log(`📊 VARLIK SINIFLARINA GÖRE DAĞILIM:`);
  console.log(`----------------------------------------------------------------------------------------`);
  for (const [cls, trades] of Object.entries(assetGroups)) {
    const clsTp = trades.filter(t => t.outcome === 'TP').length;
    const clsBe = trades.filter(t => t.outcome === 'BE').length;
    const clsSl = trades.filter(t => t.outcome === 'SL').length;
    const clsR = trades.reduce((a, c) => a + c.rrAchieved, 0);
    const clsWr = ((clsTp + clsBe) / trades.length) * 100;
    console.log(`• ${cls.padEnd(12, ' ')} : ${trades.length} İşlem | %${clsWr.toFixed(1)} WinRate (TP:${clsTp}, BE:${clsBe}, SL:${clsSl}) | Net: ${clsR >= 0 ? '+' : ''}${clsR.toFixed(1)} R`);
  }
  console.log(`----------------------------------------------------------------------------------------\n`);

  // Doldurulan Tüm İşlemlerin Dökümü
  console.log(`📋 İCRAYA GİREN TÜM İŞLEMLER DETAYI:`);
  console.log(`----------------------------------------------------------------------------------------`);
  for (const t of filled) {
    const outcomeStr = t.outcome === 'TP'
      ? `🎯 TAM TP (+1.5R / MFE: +${t.mfeR?.toFixed(1)}R)`
      : t.outcome === 'BE'
      ? `🛡️ TP1+BE (+0.5R / MFE: +${t.mfeR?.toFixed(1)}R)`
      : `🛑 STOP   (-1.0R / MFE: +${t.mfeR?.toFixed(1)}R)`;

    console.log(
      `${t.dateStr} | ${t.symbol.padEnd(6, ' ')} ${t.direction.toUpperCase().padEnd(5, ' ')} ${t.poiType.padEnd(3, ' ')} | ` +
      `Giriş: ${t.entryPrice?.toFixed(5)} | SL: ${t.stopLoss?.toFixed(5)} | TP: ${t.tpPrice?.toFixed(5)} | ` +
      `Sonuç: ${outcomeStr}`
    );
  }
  console.log(`----------------------------------------------------------------------------------------\n`);
}

runFullUniverseUserSniperTest();
