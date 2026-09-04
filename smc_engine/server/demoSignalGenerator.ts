import * as fs from 'fs';
import * as path from 'path';
import { NotificationCandidate } from './pipeline';
import { StoredCandle } from './candleStore';

export type DemoScenario = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';

export function createDemoCandidate(scenario: DemoScenario, candles: StoredCandle[]): NotificationCandidate {
  if (!candles.length) throw new Error('Demo dataset is empty');
  const bullish = scenario === 'A' || scenario === 'C';
  const poiType = scenario === 'C' || scenario === 'D' ? 'FVG' : 'OB';
  const formedAtIndex = Math.min(40, candles.length - 3);
  const eventIndex = formedAtIndex + 1;
  const center = candles[formedAtIndex].close;
  const high = center + 0.00045;
  const low = center - 0.00045;
  const id = `DEMO-${scenario}-GBPUSD-15M`;
  const grade = scenario === 'A' ? 'A+' : scenario === 'B' ? 'A' : 'B+';
  const status = scenario === 'E' ? 'WAIT' : scenario === 'F' ? 'LOW_CONFIDENCE' : scenario === 'G' ? 'FILTERED' : 'ELIGIBLE';
  const poi: any = poiType === 'OB'
    ? { direction: bullish ? 'bullish' : 'bearish', formedAtIndex, high, low, relatedEvent: { type: scenario === 'B' ? 'CHoCH' : 'BOS', direction: bullish ? 'bullish' : 'bearish', breakCandleIndex: eventIndex, breakTimestamp: candles[eventIndex].timestamp, breakClosePrice: candles[eventIndex].close } }
    : { direction: bullish ? 'bullish' : 'bearish', middleCandleIndex: formedAtIndex, gapHigh: high, gapLow: low, relatedEvent: { type: 'BOS', direction: bullish ? 'bullish' : 'bearish', breakCandleIndex: eventIndex, breakTimestamp: candles[eventIndex].timestamp, breakClosePrice: candles[eventIndex].close } };
  return {
    symbol: 'GBPUSD', tradeDirection: bullish ? 'long' : 'short', poiType, poi,
    gradeResult: { totalScore: grade === 'A+' ? 9 : grade === 'A' ? 7 : 4, grade, entryAllowed: status === 'ELIGIBLE', blockReasons: [], breakdown: { htfBiasPD: 2, displacement: 2, structure: 2, sweep: 2, poiQuality: 1 } },
    uniqueKey: id, signalId: id, currentPrice: candles[candles.length - 1].close,
    poiFormedTimestamp: candles[formedAtIndex].timestamp, bias4H: bullish ? 'bullish' : 'bearish', bias1H: bullish ? 'bullish' : 'bearish', poiTestCount: 0,
    pd4H: bullish ? 'discount' : 'premium', pd1H: bullish ? 'discount' : 'premium', pd15M: bullish ? 'discount' : 'premium',
  } as NotificationCandidate;
}

export function loadDemoCandles(): StoredCandle[] {
  return loadDemoCandlesForTimeframe('15m');
}

export function loadDemoCandlesForTimeframe(timeframe: '4h' | '1h' | '15m'): StoredCandle[] {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', `GBPUSD_${timeframe}.json`), 'utf8')) as StoredCandle[];
}
