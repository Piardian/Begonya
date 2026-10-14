import * as fs from 'fs';
import * as path from 'path';
import { detectSwings } from '../src/swingDetector';
import { detectStructure } from '../src/structureDetector';
import { calculatePremiumDiscount } from '../src/premiumDiscountCalculator';
import { detectAllOrderBlocks } from '../src/obDetector';
import { detectAllFVGs } from '../src/fvgDetector';
import { calculateGrade } from '../src/gradeCalculator';
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
  session: string;
  outcome: 'TP' | 'BE' | 'SL' | 'VETO_VELOCITY' | 'VETO_15M_CLOSE' | 'EXPIRED';
  reason: string;
  rrAchieved: number;
  entryPrice?: number;
  stopLoss?: number;
  tpPrice?: number;
  mfeR?: number;
}

function getIstanbulTimeParts(ts: number) {
  const d = new Date(ts);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Istanbul',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });
  const parts = formatter.formatToParts(d);
  let weekday = '';
  let hour = 0;
  let minute = 0;
  for (const part of parts) {
    if (part.type === 'weekday') weekday = part.value;
    if (part.type === 'hour') hour = parseInt(part.value, 10);
    if (part.type === 'minute') minute = parseInt(part.value, 10);
  }
  if (hour === 24) hour = 0;
  return { weekday, hour, minute, currentMinutes: hour * 60 + minute };
}

function isSessionAllowed(symbol: string, ts: number): { allowed: boolean; sessionName: string } {
  const isCrypto = symbol === 'BTCUSD' || symbol === 'ETHUSD' || symbol === 'SOLUSD';
  const { weekday, currentMinutes } = getIstanbulTimeParts(ts);

  // Kripto için hafta sonu testeresi engellenebilir veya 24/7 izin verilebilir
  // Forex için hafta sonu kapalı
  if (weekday === 'Sat' || weekday === 'Sun') {
    if (isCrypto) {
      // Kriptoda hafta sonu hacimsiz testere tuzağı -> Veto!
      return { allowed: false, sessionName: 'WEEKEND_CHOP' };
    }
    return { allowed: false, sessionName: 'WEEKEND' };
  }

  // Londra Killzone: 10:00 - 13:00 TSİ (07:00 - 10:00 UTC)
  if (currentMinutes >= 10 * 60 && currentMinutes < 13 * 60) {
    return { allowed: true, sessionName: 'LONDON_KZ' };
  }

  // New York Killzone: 15:30 - 19:00 TSİ (12:30 - 16:00 UTC)
  if (currentMinutes >= 15 * 60 + 30 && currentMinutes < 19 * 60) {
    return { allowed: true, sessionName: 'NY_KZ' };
  }

  // Londra Kapanış / Erken Asya vs. Seans Dışı
  return { allowed: false, sessionName: 'OFF_HOURS' };
}

export function runExperimentAB() {
  const dataDir = path.join(__dirname, '..', 'data', '1m_backtest');
  const multiTfPath = path.join(__dirname, '..', 'data', 'backtest_candles_1mo.json');

  const multiTfData: Record<string, { '15m': Candle[]; '1h': Candle[]; '4h': Candle[] }> =
    JSON.parse(fs.readFileSync(multiTfPath, 'utf8'));

  // Seçenek A Portföy İzolasyonu:
  // Kriptoda yalnızca BTC, ETH, SOL (LTC Çıkarıldı!)
  // Forexte toksik GBPCHF çıkarıldı, yüksek hacimli majörler & JPY çaprazları korundu
  const filteredSymbols = [
    'EURUSD', 'GBPUSD', 'AUDUSD', 'USDCAD', 'USDJPY', 'NZDUSD', 'USDCHF', 'AUDCAD',
    'EURJPY', 'GBPJPY', 'CADJPY', 'AUDJPY', 'EURAUD', 'EURCHF', 'CADCHF',
    'NZDCHF', 'CHFJPY', 'XAUUSD', 'NAS100', 'BTCUSD', 'ETHUSD', 'SOLUSD'
  ];

  console.log(`\n========================================================================================`);
  console.log(`🚀 BİRLEŞİK DENEY: SEÇENEK A (SEANS & KRİPTO İZOLASYONU) + SEÇENEK B (STOP TAMPONU)`);
  console.log(`   • Kripto Havuzu  : SADECE BTC, ETH, SOL (LTC Tamamen Çıkarıldı)`);
  console.log(`   • Seans Filtresi : YALNIZCA London & NY Killzone (Hafta sonu & gece sığlığı elendi)`);
  console.log(`   • Stop Modeli    : Seçenek B (Likidite Süpürmelerine Karşı Dinamik 0.25x ATR / Kutu Tabanı)`);
  console.log(`========================================================================================\n`);

  const candidatePois: CandidatePoi[] = [];

  for (const sym of filteredSymbols) {
    const symData = multiTfData[sym];
    if (!symData || !symData['15m'] || !symData['1h'] || !symData['4h']) continue;

    const c15 = symData['15m'];
    const c1 = symData['1h'];
    const c4 = symData['4h'];

    const st15 = detectStructure(c15, detectSwings(c15));
    const obs = detectAllOrderBlocks(c15, st15.events);
    const fvgs = detectAllFVGs(c15, st15.events, sym as any, '15m');

    const rawList = [
      ...obs.map(o => ({ type: 'OB' as const, low: o.low, high: o.high, direction: o.direction, breakTimestamp: o.relatedEvent.breakTimestamp })),
      ...fvgs.map(f => ({ type: 'FVG' as const, low: f.gapLow, high: f.gapHigh, direction: f.direction, breakTimestamp: f.relatedEvent.breakTimestamp }))
    ];

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

  const cache1m: Map<string, Candle[]> = new Map();
  function get1mCandles(sym: string): Candle[] {
    if (cache1m.has(sym)) return cache1m.get(sym)!;
    const p = path.join(dataDir, `${sym}_1m_30d.json`);
    if (!fs.existsSync(p)) return [];
    const raw: any[] = JSON.parse(fs.readFileSync(p, 'utf8'));
    cache1m.set(sym, raw);
    return raw;
  }

  function simulateSniperEngine(poi: CandidatePoi, useOptionBStop: boolean, useSessionFilter: boolean): SniperTradeResult {
    const assetClass = detectAssetClass(poi.symbol);
    const dateStr = new Date(poi.breakTimestamp).toISOString().slice(0, 16).replace('T', ' ');
    const candles1m = get1mCandles(poi.symbol);

    if (!candles1m || candles1m.length === 0) {
      return { symbol: poi.symbol, assetClass, direction: poi.direction, poiType: poi.poiType, zoneLow: poi.zoneLow, zoneHigh: poi.zoneHigh, timestamp: poi.breakTimestamp, dateStr, session: 'NONE', outcome: 'EXPIRED', reason: 'No 1m data', rrAchieved: 0 };
    }

    const startIdx = candles1m.findIndex(c => c.timestamp >= poi.breakTimestamp);
    if (startIdx === -1) {
      return { symbol: poi.symbol, assetClass, direction: poi.direction, poiType: poi.poiType, zoneLow: poi.zoneLow, zoneHigh: poi.zoneHigh, timestamp: poi.breakTimestamp, dateStr, session: 'NONE', outcome: 'EXPIRED', reason: 'Out of range', rrAchieved: 0 };
    }

    const isLong = poi.direction === 'long';
    const pip = poi.pipSize;

    // 15M İvme Kontrolü
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
          return { symbol: poi.symbol, assetClass, direction: poi.direction, poiType: poi.poiType, zoneLow: poi.zoneLow, zoneHigh: poi.zoneHigh, timestamp: poi.breakTimestamp, dateStr, session: 'NONE', outcome: 'VETO_VELOCITY', reason: 'Aşırı hızlı ivme (Veto)', rrAchieved: 0 };
        }
      }
    }

    const window = candles1m.slice(startIdx, startIdx + 1440);
    let touchIdx = -1;
    for (let i = 0; i < window.length; i++) {
      const c = window[i];
      const touched = isLong ? c.low <= poi.zoneHigh && c.high >= poi.zoneLow : c.high >= poi.zoneLow && c.low <= poi.zoneHigh;
      if (touched) {
        touchIdx = i;
        break;
      }
    }

    if (touchIdx === -1) {
      return { symbol: poi.symbol, assetClass, direction: poi.direction, poiType: poi.poiType, zoneLow: poi.zoneLow, zoneHigh: poi.zoneHigh, timestamp: poi.breakTimestamp, dateStr, session: 'NONE', outcome: 'EXPIRED', reason: 'Kutuya temas yok', rrAchieved: 0 };
    }

    // Seans Kontrolü (Giriş temasının gerçekleştiği seans penceresi)
    const touchTime = window[touchIdx].timestamp;
    const sessionCheck = isSessionAllowed(poi.symbol, touchTime);
    if (useSessionFilter && !sessionCheck.allowed) {
      return { symbol: poi.symbol, assetClass, direction: poi.direction, poiType: poi.poiType, zoneLow: poi.zoneLow, zoneHigh: poi.zoneHigh, timestamp: poi.breakTimestamp, dateStr, session: sessionCheck.sessionName, outcome: 'EXPIRED', reason: `Seans dışı (${sessionCheck.sessionName}) veto edildi`, rrAchieved: 0 };
    }

    const maxReactionWindow = Math.min(window.length, touchIdx + 60);
    let idmLevel: number | null = null;
    let bosLevel: number | null = null;
    let chochIdx = -1;

    for (let i = touchIdx + 1; i < maxReactionWindow; i++) {
      const c = window[i];
      const prevC = window[i - 1];

      // 15M delinme kontrolü
      if (i >= touchIdx + 15) {
        const last15Bars = window.slice(i - 15, i);
        const allBreached = isLong ? last15Bars.every(b => b.close < poi.zoneLow) : last15Bars.every(b => b.close > poi.zoneHigh);
        if (allBreached) {
          return { symbol: poi.symbol, assetClass, direction: poi.direction, poiType: poi.poiType, zoneLow: poi.zoneLow, zoneHigh: poi.zoneHigh, timestamp: poi.breakTimestamp, dateStr, session: sessionCheck.sessionName, outcome: 'VETO_15M_CLOSE', reason: '15M mumu delip kapattı', rrAchieved: 0 };
        }
      }

      if (isLong) {
        if (c.low < prevC.low && c.close > prevC.high) {
          idmLevel = c.low;
          bosLevel = c.high;
        }
        if (bosLevel !== null && c.close > bosLevel) {
          const range = c.high - c.low;
          const body = Math.abs(c.close - c.open);
          if (range > 0 && body / range >= 0.45) {
            chochIdx = i;
            break;
          }
        }
      } else {
        if (c.high > prevC.high && c.close < prevC.low) {
          idmLevel = c.high;
          bosLevel = c.low;
        }
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
      return { symbol: poi.symbol, assetClass, direction: poi.direction, poiType: poi.poiType, zoneLow: poi.zoneLow, zoneHigh: poi.zoneHigh, timestamp: poi.breakTimestamp, dateStr, session: sessionCheck.sessionName, outcome: 'EXPIRED', reason: '1M CHoCH onayı yok', rrAchieved: 0 };
    }

    // 0.5 Fib Retest
    let anchorHigh = isLong ? window[chochIdx].high : idmLevel;
    let anchorLow = isLong ? idmLevel : window[chochIdx].low;

    let filledIdx = -1;
    let entryPrice = 0;
    let stopLoss = 0;
    let riskDist = 0;

    for (let k = chochIdx + 1; k < Math.min(window.length, chochIdx + 60); k++) {
      const bar = window[k];
      if (isLong) {
        if (bar.high > anchorHigh) anchorHigh = bar.high;
        const fib05 = anchorLow + (anchorHigh - anchorLow) * 0.5;
        if (bar.low <= fib05) {
          filledIdx = k;
          entryPrice = fib05;

          // SEÇENEK B STOP KALİBRASYONU:
          // Klasik stop: anchorLow - 1.5 pip
          // Seçenek B: Kutu tabanı (zoneLow) veya 1M sweep dibinin altına 3-5 pip tampon payı koyarak
          // mikro avlanmaları engelle!
          if (useOptionBStop) {
            const safeBase = Math.min(anchorLow, poi.zoneLow);
            const buffer = (assetClass === 'CRYPTO' ? 10 : assetClass === 'FOREX_JPY' ? 3 : 2) * pip;
            stopLoss = safeBase - buffer;
          } else {
            stopLoss = anchorLow - 1.5 * pip;
          }

          riskDist = Math.abs(entryPrice - stopLoss);
          break;
        }
      } else {
        if (bar.low < anchorLow) anchorLow = bar.low;
        const fib05 = anchorLow + (anchorHigh - anchorLow) * 0.5;
        if (bar.high >= fib05) {
          filledIdx = k;
          entryPrice = fib05;

          if (useOptionBStop) {
            const safeBase = Math.max(anchorHigh, poi.zoneHigh);
            const buffer = (assetClass === 'CRYPTO' ? 10 : assetClass === 'FOREX_JPY' ? 3 : 2) * pip;
            stopLoss = safeBase + buffer;
          } else {
            stopLoss = anchorHigh + 1.5 * pip;
          }

          riskDist = Math.abs(entryPrice - stopLoss);
          break;
        }
      }
    }

    if (filledIdx === -1 || riskDist <= 0) {
      return { symbol: poi.symbol, assetClass, direction: poi.direction, poiType: poi.poiType, zoneLow: poi.zoneLow, zoneHigh: poi.zoneHigh, timestamp: poi.breakTimestamp, dateStr, session: sessionCheck.sessionName, outcome: 'EXPIRED', reason: '0.5 Fib retest yok', rrAchieved: 0 };
    }

    // TP1 (+1R %50 + BE), TP2 (+2R %50)
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
          return { symbol: poi.symbol, assetClass, direction: poi.direction, poiType: poi.poiType, zoneLow: poi.zoneLow, zoneHigh: poi.zoneHigh, timestamp: poi.breakTimestamp, dateStr, session: sessionCheck.sessionName, outcome: 'SL', reason: 'SL vuruldu', rrAchieved: -1.0, entryPrice, stopLoss, tpPrice: tp2Price, mfeR: maxMfe };
        }
        if (tp1Reached) {
          tp1Hit = true;
        }
      } else {
        const beHit = isLong ? b.low <= entryPrice : b.high >= entryPrice;
        const tp2Reached = isLong ? b.high >= tp2Price : b.low <= tp2Price;
        if (tp2Reached) {
          return { symbol: poi.symbol, assetClass, direction: poi.direction, poiType: poi.poiType, zoneLow: poi.zoneLow, zoneHigh: poi.zoneHigh, timestamp: poi.breakTimestamp, dateStr, session: sessionCheck.sessionName, outcome: 'TP', reason: '🎯 Tam TP (+1.5R)', rrAchieved: 1.5, entryPrice, stopLoss, tpPrice: tp2Price, mfeR: maxMfe };
        }
        if (beHit) {
          return { symbol: poi.symbol, assetClass, direction: poi.direction, poiType: poi.poiType, zoneLow: poi.zoneLow, zoneHigh: poi.zoneHigh, timestamp: poi.breakTimestamp, dateStr, session: sessionCheck.sessionName, outcome: 'BE', reason: '🛡️ TP1+BE (+0.5R)', rrAchieved: 0.5, entryPrice, stopLoss, tpPrice: tp2Price, mfeR: maxMfe };
        }
      }
    }

    return { symbol: poi.symbol, assetClass, direction: poi.direction, poiType: poi.poiType, zoneLow: poi.zoneLow, zoneHigh: poi.zoneHigh, timestamp: poi.breakTimestamp, dateStr, session: sessionCheck.sessionName, outcome: tp1Hit ? 'BE' : 'EXPIRED', reason: 'Zaman aşımı', rrAchieved: tp1Hit ? 0.5 : 0, entryPrice, stopLoss, tpPrice: tp2Price, mfeR: maxMfe };
  }

  // TEST KOŞUMLARI
  console.log(`--- [TEST 1]: SADECE SEÇENEK A (LTC & GBPCHF Çıkarıldı + Killzone Filtresi) ---`);
  const resA = candidatePois.map(p => simulateSniperEngine(p, false, true));
  printSummary(resA, 'SEÇENEK A (Seans & Seçilmiş Pariteler)');

  console.log(`\n--- [TEST 2]: SEÇENEK A + SEÇENEK B (Killzone + Gelişmiş Stop Tamponu) ---`);
  const resAB = candidatePois.map(p => simulateSniperEngine(p, true, true));
  printSummary(resAB, 'SEÇENEK A + B (Killzone + Stop Tamponu)');
}

function printSummary(results: SniperTradeResult[], title: string) {
  const tp = results.filter(r => r.outcome === 'TP');
  const be = results.filter(r => r.outcome === 'BE');
  const sl = results.filter(r => r.outcome === 'SL');
  const filled = [...tp, ...be, ...sl];
  const netR = filled.reduce((a, c) => a + c.rrAchieved, 0);
  const wr = filled.length > 0 ? ((tp.length + be.length) / filled.length) * 100 : 0;
  const fullTpRate = filled.length > 0 ? (tp.length / filled.length) * 100 : 0;

  console.log(`📊 ${title} SONUÇLARI:`);
  console.log(`Toplam Giriş: ${filled.length} İşlem | 🎯 TP: ${tp.length} | 🛡️ BE: ${be.length} | 🛑 SL: ${sl.length}`);
  console.log(`🏆 Win Rate (Pozitif): %${wr.toFixed(1)} | 🎯 Full TP: %${fullTpRate.toFixed(1)} | 📈 Net R: ${netR >= 0 ? '+' : ''}${netR.toFixed(1)} R`);

  const assetGroups: Record<string, SniperTradeResult[]> = {};
  for (const r of filled) {
    assetGroups[r.assetClass] = assetGroups[r.assetClass] || [];
    assetGroups[r.assetClass].push(r);
  }
  for (const [cls, trades] of Object.entries(assetGroups)) {
    const clsTp = trades.filter(t => t.outcome === 'TP').length;
    const clsBe = trades.filter(t => t.outcome === 'BE').length;
    const clsSl = trades.filter(t => t.outcome === 'SL').length;
    const clsR = trades.reduce((a, c) => a + c.rrAchieved, 0);
    const clsWr = ((clsTp + clsBe) / trades.length) * 100;
    console.log(`   • ${cls.padEnd(10, ' ')} : ${trades.length} İşlem | %${clsWr.toFixed(1)} WR (TP:${clsTp}, BE:${clsBe}, SL:${clsSl}) | Net: ${clsR >= 0 ? '+' : ''}${clsR.toFixed(1)} R`);
  }
}

runExperimentAB();
