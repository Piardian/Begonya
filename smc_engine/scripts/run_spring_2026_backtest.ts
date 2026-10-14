import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { detectSwings } from '../src/swingDetector';
import { detectStructure } from '../src/structureDetector';
import { calculatePremiumDiscount } from '../src/premiumDiscountCalculator';
import { detectAllOrderBlocks } from '../src/obDetector';
import { detectAllFVGs } from '../src/fvgDetector';
import { calculateGrade } from '../src/gradeCalculator';
import { detectSwingSweeps } from '../src/sweepDetector';
import { getPipSize, detectAssetClass } from '../src/assetMetrics';
import { Candle } from '../src/types';

interface CandidatePoi {
  id: string;
  symbol: string;
  month: string;
  direction: 'long' | 'short';
  poiType: 'OB' | 'FVG';
  zoneLow: number;
  zoneHigh: number;
  breakTimestamp: number;
  pipSize: number;
  hasHtfSweep: boolean;
}

interface SniperTradeResult {
  symbol: string;
  month: string;
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

function fetchBinanceKlines(symbol: string, interval: string, startTime: number, endTime: number): Promise<Candle[]> {
  return new Promise((resolve) => {
    let allCandles: Candle[] = [];
    let currentStart = startTime;

    function getNextBatch() {
      const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&startTime=${currentStart}&endTime=${endTime}&limit=1000`;
      https.get(url, (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          try {
            const data = JSON.parse(raw);
            if (!Array.isArray(data) || data.length === 0) {
              return resolve(allCandles);
            }
            const parsed: Candle[] = data.map(item => ({
              timestamp: item[0],
              open: parseFloat(item[1]),
              high: parseFloat(item[2]),
              low: parseFloat(item[3]),
              close: parseFloat(item[4]),
            }));
            allCandles.push(...parsed);

            if (data.length < 1000) {
              return resolve(allCandles);
            }
            currentStart = data[data.length - 1][0] + 1;
            if (currentStart >= endTime) {
              return resolve(allCandles);
            }
            setTimeout(getNextBatch, 50);
          } catch (e) {
            resolve(allCandles);
          }
        });
      }).on('error', () => resolve(allCandles));
    }

    getNextBatch();
  });
}

function fetch1mWindow(symbol: string, startTime: number, count: number): Promise<Candle[]> {
  return new Promise((resolve) => {
    let all: Candle[] = [];
    let cur = startTime;

    function getChunk() {
      const remaining = count - all.length;
      if (remaining <= 0) return resolve(all);
      const limit = Math.min(1000, remaining);
      const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1m&startTime=${cur}&limit=${limit}`;

      https.get(url, (res) => {
        let raw = '';
        res.on('data', c => raw += c);
        res.on('end', () => {
          try {
            const data = JSON.parse(raw);
            if (!Array.isArray(data) || data.length === 0) return resolve(all);
            const parsed: Candle[] = data.map(item => ({
              timestamp: item[0],
              open: parseFloat(item[1]),
              high: parseFloat(item[2]),
              low: parseFloat(item[3]),
              close: parseFloat(item[4]),
            }));
            all.push(...parsed);
            if (data.length < limit || all.length >= count) return resolve(all);
            cur = data[data.length - 1][0] + 60000;
            setTimeout(getChunk, 40);
          } catch {
            resolve(all);
          }
        });
      }).on('error', () => resolve(all));
    }

    getChunk();
  });
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

// London (10:00-13:00) + NY Killzone (15:30-19:00)
function isKillzoneAllowed(ts: number): { allowed: boolean; sessionName: string } {
  const { weekday, currentMinutes } = getIstanbulTimeParts(ts);
  if (weekday === 'Sat' || weekday === 'Sun') {
    return { allowed: false, sessionName: 'WEEKEND_CHOP' };
  }
  if (currentMinutes >= 10 * 60 && currentMinutes < 13 * 60) {
    return { allowed: true, sessionName: 'LONDON_KZ' };
  }
  if (currentMinutes >= 15 * 60 + 30 && currentMinutes < 19 * 60) {
    return { allowed: true, sessionName: 'NY_KZ' };
  }
  return { allowed: false, sessionName: 'OFF_HOURS' };
}

// 4H veya 1H Likidite Süpürmesi (HTF Sweep) Kontrolü
function checkHtfLiquiditySweep(
  tradeDir: 'long' | 'short',
  candles4h: Candle[],
  candles1h: Candle[],
  breakTs: number,
  symbol: string
): boolean {
  // POI kırılımından önceki 4H swing'leri
  const prior4h = candles4h.filter(c => c.timestamp <= breakTs);
  const prior1h = candles1h.filter(c => c.timestamp <= breakTs);

  if (prior4h.length >= 15) {
    const swings4h = detectSwings(prior4h);
    const sweeps4h = detectSwingSweeps(prior4h, swings4h, symbol as any, '4h');
    // Long için: Bir dip süpürülmüş olmalı (sweep_low)
    // Short için: Bir tepe süpürülmüş olmalı (sweep_high)
    const targetSweepType = tradeDir === 'long' ? 'sweep_low' : 'sweep_high';
    const recentSweep4h = sweeps4h.some(s => s.type === targetSweepType && s.timestamp >= breakTs - 48 * 3600 * 1000);
    if (recentSweep4h) return true;
  }

  if (prior1h.length >= 20) {
    const swings1h = detectSwings(prior1h);
    const sweeps1h = detectSwingSweeps(prior1h, swings1h, symbol as any, '1h');
    const targetSweepType = tradeDir === 'long' ? 'sweep_low' : 'sweep_high';
    const recentSweep1h = sweeps1h.some(s => s.type === targetSweepType && s.timestamp >= breakTs - 24 * 3600 * 1000);
    if (recentSweep1h) return true;
  }

  return false;
}

async function runSpring2026Backtest() {
  console.log(`\n========================================================================================`);
  console.log(`👑 2026 MART - NİSAN - MAYIS (3 AY) HTF LİKİDİTE SÜPÜRMELİ (SWEEP) SNIPER TESTİ`);
  console.log(`   Varlıklar : SADECE BTC, ETH, SOL (Seçenek A Kuralı - LTC & Toksik Pariteler Hariç)`);
  console.log(`   Seanslar  : London (10:00-13:00) & NY Killzone (15:30-19:00 TSİ)`);
  console.log(`   Yeni Kalkan: 4H/1H Kurumsal Likidite Süpürmesi (HTF Sweep) Zorunluluğu!`);
  console.log(`========================================================================================\n`);

  const months = [
    { name: 'Mart 2026 (Mar 2026)', startStr: '2026-03-01T00:00:00Z', endStr: '2026-03-31T23:59:59Z' },
    { name: 'Nisan 2026 (Apr 2026)', startStr: '2026-04-01T00:00:00Z', endStr: '2026-04-30T23:59:59Z' },
    { name: 'Mayıs 2026 (May 2026)', startStr: '2026-05-01T00:00:00Z', endStr: '2026-05-31T23:59:59Z' },
  ];

  const cryptoSymbols = [
    { name: 'BTCUSD', pair: 'BTCUSDT' },
    { name: 'ETHUSD', pair: 'ETHUSDT' },
    { name: 'SOLUSD', pair: 'SOLUSDT' },
  ];

  const allMonthlyResults: Record<string, SniperTradeResult[]> = {
    'Mart 2026 (Mar 2026)': [],
    'Nisan 2026 (Apr 2026)': [],
    'Mayıs 2026 (May 2026)': [],
  };

  for (const m of months) {
    console.log(`\n----------------------------------------------------------------------------------------`);
    console.log(`⏳ [${m.name}] Verileri İndiriliyor ve HTF Sweep + POI Taraması Başlatılıyor...`);
    console.log(`----------------------------------------------------------------------------------------`);

    const startTs = new Date(m.startStr).getTime();
    const endTs = new Date(m.endStr).getTime();
    const warmupStartTs = startTs - 20 * 24 * 60 * 60 * 1000;

    for (const symObj of cryptoSymbols) {
      console.log(`   • ${symObj.name} (${symObj.pair}) barları çekiliyor...`);
      const [c15, c1, c4] = await Promise.all([
        fetchBinanceKlines(symObj.pair, '15m', warmupStartTs, endTs),
        fetchBinanceKlines(symObj.pair, '1h', warmupStartTs, endTs),
        fetchBinanceKlines(symObj.pair, '4h', warmupStartTs, endTs),
      ]);

      console.log(`     Alınan barlar -> 15M: ${c15.length}, 1H: ${c1.length}, 4H: ${c4.length}`);
      if (c15.length < 50 || c1.length < 20 || c4.length < 20) continue;

      const st15 = detectStructure(c15, detectSwings(c15));
      const obs = detectAllOrderBlocks(c15, st15.events);
      const fvgs = detectAllFVGs(c15, st15.events, symObj.name as any, '15m');

      const rawList = [
        ...obs.map(o => ({ type: 'OB' as const, low: o.low, high: o.high, direction: o.direction, breakTimestamp: o.relatedEvent.breakTimestamp })),
        ...fvgs.map(f => ({ type: 'FVG' as const, low: f.gapLow, high: f.gapHigh, direction: f.direction, breakTimestamp: f.relatedEvent.breakTimestamp }))
      ].filter(p => p.breakTimestamp >= startTs && p.breakTimestamp <= endTs);

      const seenPois = new Set<string>();
      const monthCandidates: CandidatePoi[] = [];

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

        // HTF LİKİDİTE SÜPÜRMESİ (SWEEP) FİLTRESİ
        const hasHtfSweep = checkHtfLiquiditySweep(tradeDir, c4, c1, breakT, symObj.name);

        const pip = getPipSize(symObj.name);
        const lowPips = Math.round(raw.low / pip);
        const highPips = Math.round(raw.high / pip);
        const dedupeKey = `${symObj.name}:${tradeDir}:${lowPips}-${highPips}`;

        if (seenPois.has(dedupeKey)) continue;
        seenPois.add(dedupeKey);

        monthCandidates.push({
          id: `${symObj.name}_${raw.type}_${breakT}`,
          symbol: symObj.name,
          month: m.name,
          direction: tradeDir,
          poiType: raw.type,
          zoneLow: raw.low,
          zoneHigh: raw.high,
          breakTimestamp: breakT,
          pipSize: pip,
          hasHtfSweep,
        });
      }

      console.log(`     Kurumsal onaylı 15M POI: ${monthCandidates.length} (HTF Sweep Onaylı: ${monthCandidates.filter(c => c.hasHtfSweep).length})`);

      for (const poi of monthCandidates) {
        // HTF SWEEP FİLTRESİ: Eğer 4H/1H Likidite Süpürmesi yoksa trade veto edilir!
        if (!poi.hasHtfSweep) {
          allMonthlyResults[m.name].push({
            symbol: poi.symbol, month: m.name, direction: poi.direction, poiType: poi.poiType,
            zoneLow: poi.zoneLow, zoneHigh: poi.zoneHigh, timestamp: poi.breakTimestamp,
            dateStr: new Date(poi.breakTimestamp).toISOString().slice(0, 16).replace('T', ' '),
            session: 'NONE', outcome: 'EXPIRED', reason: 'HTF Sweep onayı yok (Veto)', rrAchieved: 0
          });
          continue;
        }

        const isLong = poi.direction === 'long';
        const pip = poi.pipSize;
        const dateStr = new Date(poi.breakTimestamp).toISOString().slice(0, 16).replace('T', ' ');

        // 15M İvme Kontrolü
        const candles15mPrior = c15.filter(c => c.timestamp <= poi.breakTimestamp);
        if (candles15mPrior.length >= 3) {
          const last15m = candles15mPrior[candles15mPrior.length - 1];
          const prev15m = candles15mPrior[candles15mPrior.length - 2];
          const range1 = Math.abs(last15m.high - last15m.low);
          const range2 = Math.abs(prev15m.high - prev15m.low);
          const zoneWidth = Math.abs(poi.zoneHigh - poi.zoneLow);
          if (range1 > zoneWidth * 2.5 || range2 > zoneWidth * 2.5) {
            allMonthlyResults[m.name].push({
              symbol: poi.symbol, month: m.name, direction: poi.direction, poiType: poi.poiType,
              zoneLow: poi.zoneLow, zoneHigh: poi.zoneHigh, timestamp: poi.breakTimestamp, dateStr,
              session: 'NONE', outcome: 'VETO_VELOCITY', reason: 'Aşırı hızlı ivme (Veto)', rrAchieved: 0
            });
            continue;
          }
        }

        const window1m = await fetch1mWindow(symObj.pair, poi.breakTimestamp, 1440);
        if (window1m.length < 10) continue;

        let touchIdx = -1;
        for (let i = 0; i < window1m.length; i++) {
          const c = window1m[i];
          const touched = isLong ? c.low <= poi.zoneHigh && c.high >= poi.zoneLow : c.high >= poi.zoneLow && c.low <= poi.zoneHigh;
          if (touched) {
            touchIdx = i;
            break;
          }
        }

        if (touchIdx === -1) {
          allMonthlyResults[m.name].push({
            symbol: poi.symbol, month: m.name, direction: poi.direction, poiType: poi.poiType,
            zoneLow: poi.zoneLow, zoneHigh: poi.zoneHigh, timestamp: poi.breakTimestamp, dateStr,
            session: 'NONE', outcome: 'EXPIRED', reason: 'Kutuya temas yok', rrAchieved: 0
          });
          continue;
        }

        const touchTime = window1m[touchIdx].timestamp;
        const kzCheck = isKillzoneAllowed(touchTime);
        if (!kzCheck.allowed) {
          allMonthlyResults[m.name].push({
            symbol: poi.symbol, month: m.name, direction: poi.direction, poiType: poi.poiType,
            zoneLow: poi.zoneLow, zoneHigh: poi.zoneHigh, timestamp: poi.breakTimestamp, dateStr,
            session: kzCheck.sessionName, outcome: 'EXPIRED', reason: `Killzone dışı (${kzCheck.sessionName})`, rrAchieved: 0
          });
          continue;
        }

        // 1M IDM / BOS + 15M Delinme Kontrolü
        const maxReaction = Math.min(window1m.length, touchIdx + 60);
        let idmLevel: number | null = null;
        let bosLevel: number | null = null;
        let chochIdx = -1;
        let breached = false;

        for (let i = touchIdx + 1; i < maxReaction; i++) {
          const c = window1m[i];
          const prevC = window1m[i - 1];

          if (i >= touchIdx + 15) {
            const last15 = window1m.slice(i - 15, i);
            const allBreached = isLong ? last15.every(b => b.close < poi.zoneLow) : last15.every(b => b.close > poi.zoneHigh);
            if (allBreached) {
              breached = true;
              break;
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

        if (breached) {
          allMonthlyResults[m.name].push({
            symbol: poi.symbol, month: m.name, direction: poi.direction, poiType: poi.poiType,
            zoneLow: poi.zoneLow, zoneHigh: poi.zoneHigh, timestamp: poi.breakTimestamp, dateStr,
            session: kzCheck.sessionName, outcome: 'VETO_15M_CLOSE', reason: '15M mumu delip kapattı', rrAchieved: 0
          });
          continue;
        }

        if (chochIdx === -1 || idmLevel === null || bosLevel === null) {
          allMonthlyResults[m.name].push({
            symbol: poi.symbol, month: m.name, direction: poi.direction, poiType: poi.poiType,
            zoneLow: poi.zoneLow, zoneHigh: poi.zoneHigh, timestamp: poi.breakTimestamp, dateStr,
            session: kzCheck.sessionName, outcome: 'EXPIRED', reason: '1M CHoCH onayı yok', rrAchieved: 0
          });
          continue;
        }

        // 0.5 Fib Retest
        let anchorHigh = isLong ? window1m[chochIdx].high : idmLevel;
        let anchorLow = isLong ? idmLevel : window1m[chochIdx].low;

        let filledIdx = -1;
        let entryPrice = 0;
        let stopLoss = 0;
        let riskDist = 0;

        for (let k = chochIdx + 1; k < Math.min(window1m.length, chochIdx + 60); k++) {
          const bar = window1m[k];
          if (isLong) {
            if (bar.high > anchorHigh) anchorHigh = bar.high;
            const fib05 = anchorLow + (anchorHigh - anchorLow) * 0.5;
            if (bar.low <= fib05) {
              filledIdx = k;
              entryPrice = fib05;
              stopLoss = anchorLow - 1.5 * pip;
              riskDist = Math.abs(entryPrice - stopLoss);
              break;
            }
          } else {
            if (bar.low < anchorLow) anchorLow = bar.low;
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
          allMonthlyResults[m.name].push({
            symbol: poi.symbol, month: m.name, direction: poi.direction, poiType: poi.poiType,
            zoneLow: poi.zoneLow, zoneHigh: poi.zoneHigh, timestamp: poi.breakTimestamp, dateStr,
            session: kzCheck.sessionName, outcome: 'EXPIRED', reason: '0.5 Fib retest yok', rrAchieved: 0
          });
          continue;
        }

        // Kademeli TP (+1R %50 + BE, +2R %50)
        const tp1Price = isLong ? entryPrice + riskDist * 1.0 : entryPrice - riskDist * 1.0;
        const tp2Price = isLong ? entryPrice + riskDist * 2.0 : entryPrice - riskDist * 2.0;

        let tp1Hit = false;
        let maxMfe = 0;
        let tradeFinished = false;

        for (let mIdx = filledIdx + 1; mIdx < window1m.length; mIdx++) {
          const b = window1m[mIdx];
          const favorable = isLong ? b.high - entryPrice : entryPrice - b.low;
          const mfe = favorable / riskDist;
          if (mfe > maxMfe) maxMfe = mfe;

          if (!tp1Hit) {
            const slHit = isLong ? b.low <= stopLoss : b.high >= stopLoss;
            const tp1Reached = isLong ? b.high >= tp1Price : b.low <= tp1Price;
            if (slHit) {
              allMonthlyResults[m.name].push({
                symbol: poi.symbol, month: m.name, direction: poi.direction, poiType: poi.poiType,
                zoneLow: poi.zoneLow, zoneHigh: poi.zoneHigh, timestamp: poi.breakTimestamp, dateStr,
                session: kzCheck.sessionName, outcome: 'SL', reason: 'SL vuruldu', rrAchieved: -1.0,
                entryPrice, stopLoss, tpPrice: tp2Price, mfeR: maxMfe
              });
              tradeFinished = true;
              break;
            }
            if (tp1Reached) {
              tp1Hit = true;
            }
          } else {
            const beHit = isLong ? b.low <= entryPrice : b.high >= entryPrice;
            const tp2Reached = isLong ? b.high >= tp2Price : b.low <= tp2Price;
            if (tp2Reached) {
              allMonthlyResults[m.name].push({
                symbol: poi.symbol, month: m.name, direction: poi.direction, poiType: poi.poiType,
                zoneLow: poi.zoneLow, zoneHigh: poi.zoneHigh, timestamp: poi.breakTimestamp, dateStr,
                session: kzCheck.sessionName, outcome: 'TP', reason: '🎯 Tam TP (+1.5R)', rrAchieved: 1.5,
                entryPrice, stopLoss, tpPrice: tp2Price, mfeR: maxMfe
              });
              tradeFinished = true;
              break;
            }
            if (beHit) {
              allMonthlyResults[m.name].push({
                symbol: poi.symbol, month: m.name, direction: poi.direction, poiType: poi.poiType,
                zoneLow: poi.zoneLow, zoneHigh: poi.zoneHigh, timestamp: poi.breakTimestamp, dateStr,
                session: kzCheck.sessionName, outcome: 'BE', reason: '🛡️ TP1+BE (+0.5R)', rrAchieved: 0.5,
                entryPrice, stopLoss, tpPrice: tp2Price, mfeR: maxMfe
              });
              tradeFinished = true;
              break;
            }
          }
        }

        if (!tradeFinished) {
          allMonthlyResults[m.name].push({
            symbol: poi.symbol, month: m.name, direction: poi.direction, poiType: poi.poiType,
            zoneLow: poi.zoneLow, zoneHigh: poi.zoneHigh, timestamp: poi.breakTimestamp, dateStr,
            session: kzCheck.sessionName, outcome: tp1Hit ? 'BE' : 'EXPIRED', reason: 'Zaman aşımı',
            rrAchieved: tp1Hit ? 0.5 : 0, entryPrice, stopLoss, tpPrice: tp2Price, mfeR: maxMfe
          });
        }
      }
    }
  }

  // =========================================================================
  // BİLANÇO RAPORU
  // =========================================================================
  console.log(`\n========================================================================================`);
  console.log(`📊 2026 MART - NİSAN - MAYIS AY BAZINDA HTF SWEEP PERFORMANS RAPORU:`);
  console.log(`========================================================================================`);

  let grandTotalR = 0;
  let grandFilled = 0;
  let grandTp = 0;
  let grandBe = 0;
  let grandSl = 0;

  for (const m of months) {
    const list = allMonthlyResults[m.name];
    const tp = list.filter(r => r.outcome === 'TP');
    const be = list.filter(r => r.outcome === 'BE');
    const sl = list.filter(r => r.outcome === 'SL');
    const filled = [...tp, ...be, ...sl];
    const netR = filled.reduce((a, c) => a + c.rrAchieved, 0);
    const wr = filled.length > 0 ? ((tp.length + be.length) / filled.length) * 100 : 0;
    const fullTpRate = filled.length > 0 ? (tp.length / filled.length) * 100 : 0;

    grandTotalR += netR;
    grandFilled += filled.length;
    grandTp += tp.length;
    grandBe += be.length;
    grandSl += sl.length;

    console.log(`\n🗓️  ${m.name.toUpperCase()}:`);
    console.log(`----------------------------------------------------------------------------------------`);
    console.log(`Toplam Giriş: ${filled.length} İşlem | 🎯 TP: ${tp.length} | 🛡️ BE: ${be.length} | 🛑 SL: ${sl.length}`);
    console.log(`🏆 Win Rate (Pozitif): %${wr.toFixed(1)} | 🎯 Full TP: %${fullTpRate.toFixed(1)} | 📈 Net R: ${netR >= 0 ? '+' : ''}${netR.toFixed(1)} R`);

    if (filled.length > 0) {
      console.log(`   İşlem Detayları:`);
      for (const t of filled) {
        console.log(`     • ${t.dateStr} | ${t.symbol} ${t.direction.toUpperCase()} | Sonuç: ${t.outcome} (${t.rrAchieved >= 0 ? '+' : ''}${t.rrAchieved}R, MFE: +${t.mfeR?.toFixed(1)}R) | ${t.session}`);
      }
    }
  }

  const grandWr = grandFilled > 0 ? ((grandTp + grandBe) / grandFilled) * 100 : 0;

  console.log(`\n========================================================================================`);
  console.log(`🏆 3 AYLIK (MART - NİSAN - MAYIS 2026) TOPLAM GENEL BİLANÇO:`);
  console.log(`----------------------------------------------------------------------------------------`);
  console.log(`Toplam İcraya Girilen İşlem : ${grandFilled} adet`);
  console.log(`🎯 Tam TP (TP1 + TP2)       : ${grandTp} adet (+1.5R her biri)`);
  console.log(`🛡️ Kısmi Kâr + BE (+0.5R)   : ${grandBe} adet (+0.5R her biri)`);
  console.log(`🛑 Stop Loss (SL) (-1.0R)   : ${grandSl} adet (-1.0R her biri)`);
  console.log(`----------------------------------------------------------------------------------------`);
  console.log(`🏆 Genel Win Rate (Pozitif) : %${grandWr.toFixed(1)}`);
  console.log(`📈 NET GETİRİ (Toplam R)    : ${grandTotalR >= 0 ? '+' : ''}${grandTotalR.toFixed(1)} R`);
  console.log(`========================================================================================\n`);
}

runSpring2026Backtest();
