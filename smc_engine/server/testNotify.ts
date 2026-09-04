import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { buildRuntimeNotificationMessage } from './notificationBuilder';
import { sendTelegramMessage, sendTelegramPhoto } from './telegramSender';
import { captureMultiTimeframeCharts } from './tvChartCapture';
import { buildOverlayInput } from './overlayMetadata';
import { renderOverlay } from './overlayRenderer';
import { NotificationCandidate } from './pipeline';
import { StoredCandle } from './candleStore';
import { Timeframe } from './candleStore';

function createMockCandles(): StoredCandle[] {
  const candles: StoredCandle[] = [];
  let basePrice = 1.0500;
  const timeStart = Date.now() - 320 * 15 * 60 * 1000;
  for (let i = 0; i < 320; i++) {
    const open = basePrice;
    const close = basePrice + (Math.random() - 0.48) * 0.0010;
    const high = Math.max(open, close) + Math.random() * 0.0003;
    const low = Math.min(open, close) - Math.random() * 0.0003;
    candles.push({
      timestamp: timeStart + i * 15 * 60 * 1000,
      open,
      high,
      low,
      close,
      volume: 1000 + Math.round(Math.random() * 100),
    } as StoredCandle);
    basePrice = close;
  }

  candles[29] = {
    timestamp: timeStart + 29 * 15 * 60 * 1000,
    open: 1.0500,
    close: 1.0502,
    high: 1.0504,
    low: 1.0498,
    volume: 1100,
  } as StoredCandle;
  candles[30] = {
    timestamp: timeStart + 30 * 15 * 60 * 1000,
    open: 1.0502,
    close: 1.0520,
    high: 1.0522,
    low: 1.0502,
    volume: 1400,
  } as StoredCandle;
  candles[31] = {
    timestamp: timeStart + 31 * 15 * 60 * 1000,
    open: 1.0520,
    close: 1.0522,
    high: 1.0524,
    low: 1.0514,
    volume: 1150,
  } as StoredCandle;

  return candles;
}

function aggregateCandles(candles: StoredCandle[], chunkSize: number): StoredCandle[] {
  const output: StoredCandle[] = [];
  for (let i = 0; i < candles.length; i += chunkSize) {
    const chunk = candles.slice(i, i + chunkSize);
    if (!chunk.length) continue;
    output.push({
      timestamp: chunk[0].timestamp,
      open: chunk[0].open,
      high: Math.max(...chunk.map(c => c.high)),
      low: Math.min(...chunk.map(c => c.low)),
      close: chunk[chunk.length - 1].close,
    } as StoredCandle);
  }
  return output;
}

function upsampleToOneMinute(teenCandles: StoredCandle[]): StoredCandle[] {
  const output: StoredCandle[] = [];
  for (const candle of teenCandles) {
    const span = 15 * 60 * 1000;
    const minuteSpan = 60 * 1000;
    for (let i = 0; i < 15; i++) {
      const progress = i / 14;
      const open = i === 0 ? candle.open : output[output.length - 1].close;
      const close = candle.open + (candle.close - candle.open) * progress;
      const wiggle = Math.abs(candle.high - candle.low) * 0.15;
      const high = Math.max(open, close) + wiggle;
      const low = Math.min(open, close) - wiggle;
      output.push({
        timestamp: candle.timestamp + i * minuteSpan,
        open,
        high,
        low,
        close,
    } as StoredCandle);
    }
  }
  return output;
}

function buildCandidate(candles15m: StoredCandle[]): NotificationCandidate {
  const poiFormedIndex = 30;
  const breakIndex = 33;
  return {
    symbol: 'EURUSD',
    tradeDirection: 'long',
    poiType: 'FVG',
    poi: {
      direction: 'bullish',
      gapHigh: 1.0514,
      gapLow: 1.0504,
      gapSizePips: 10,
      ratioToDisplacementCandle: 0.55,
      middleCandleIndex: poiFormedIndex,
      relatedEvent: {
        type: 'BOS',
        direction: 'bullish',
        brokenSwing: {
          type: 'high',
          price: candles15m[25].high,
          formedAtIndex: 25,
          confirmedAtIndex: 27,
          timestamp: candles15m[25].timestamp,
        },
        breakCandleIndex: breakIndex,
        breakTimestamp: candles15m[breakIndex].timestamp,
        breakClosePrice: candles15m[breakIndex].close,
      },
    },
    gradeResult: {
      totalScore: 9,
      grade: 'A+',
      entryAllowed: true,
      blockReasons: [],
      breakdown: {
        htfBiasPD: 2,
        displacement: 2,
        structure: 2,
        sweep: 2,
        poiQuality: 1,
      },
    },
    uniqueKey: 'test_key_123',
    currentPrice: candles15m[candles15m.length - 1].close,
    poiFormedTimestamp: candles15m[poiFormedIndex].timestamp,
    bias4H: 'bullish',
    bias1H: 'bullish',
    poiTestCount: 0,
    pd4H: 'discount',
    pd1H: 'discount',
    admissionProfile: 'PRODUCTION',
  };
}

const mockCandles15m = createMockCandles();
const dummyCandidate = buildCandidate(mockCandles15m);

const dummyExecutionPipeline = {
  signalContext: {
    timestamp: dummyCandidate.poiFormedTimestamp,
    lifecycle: {
      states: ['DETECTED', 'GRADED', 'PLANNED', 'EXECUTION_READY'] as const,
    },
  },
  decisionReport: {
    decisions: [
      {
        status: 'ELIGIBLE',
        reason: {
          code: 'OK',
          message: 'Execution eligibility and policy-level risk gates passed. Manual execution confirmation is still required.',
        },
      },
    ],
  },
  riskResult: {
    items: [
      {
        riskStatus: 'ACCEPTED',
        evaluation: {
          executionAllowed: true,
          reason: {
            message: 'Risk accepted for test notification.',
          },
        },
      },
    ],
  },
  engineResult: {
    audit: {
      readyCommands: 1,
    },
  },
  signalOutcome: {
    outcomeType: 'WAITING_ENTRY',
  },
  decisionCalibration: {
    status: 'ELIGIBLE',
    reason: {
      code: 'OK',
      message: 'Execution eligibility and policy-level risk gates passed. Manual execution confirmation is still required.',
    },
    checks: [
      { code: 'HTF_BIAS_PD_SCORE', status: 'PASS' },
      { code: 'HTF_TREND_ALIGNMENT', status: 'PASS' },
      { code: 'STRUCTURE_STRENGTH', status: 'PASS' },
      { code: 'SWEEP_QUALITY', status: 'PASS' },
      { code: '4H_PD_ALIGNMENT', status: 'PASS' },
      { code: '1H_PD_ALIGNMENT', status: 'PASS' },
    ],
  },
} as const;

function resampleForTimeframe(candles15m: StoredCandle[], timeframe: Timeframe): StoredCandle[] {
  if (timeframe === '1m') {
    return upsampleToOneMinute(candles15m);
  }
  if (timeframe === '1h') {
    return aggregateCandles(candles15m, 4);
  }
  if (timeframe === '4h') {
    return aggregateCandles(candles15m, 16);
  }
  return candles15m;
}

async function run() {
  console.log('Formatting runtime message...');
  const formatted = buildRuntimeNotificationMessage(dummyCandidate, dummyExecutionPipeline as any);
  console.log('Formatted Message:\n', formatted);

  const candlesByTimeframe = {
    '1m': resampleForTimeframe(mockCandles15m, '1m'),
    '15m': mockCandles15m,
    '1h': resampleForTimeframe(mockCandles15m, '1h'),
  } satisfies Partial<Record<Timeframe, StoredCandle[]>>;

  console.log('Capturing multi-timeframe charts...');
  const selectedTimeframes = ['1m', '15m', '1h'] as const;
  const charts = await captureMultiTimeframeCharts(candlesByTimeframe, dummyCandidate, 1000, 600, 100, 1, selectedTimeframes);
  const outputDir = path.join(__dirname, '../test-output');
  fs.mkdirSync(outputDir, { recursive: true });

  for (const item of charts) {
    const timeframeCandles = candlesByTimeframe[item.timeframe as keyof typeof candlesByTimeframe] ?? mockCandles15m;
    const input = buildOverlayInput(
      timeframeCandles,
      item.candidate,
      item.chart.metadata.imageWidth,
      item.chart.metadata.imageHeight,
      item.timeframe,
      { visibleRange: item.chart.smartScreenshotPlan?.visibleRange }
    );
    const rendered = input
      ? await renderOverlay({
          screenshotPng: item.chart.screenshotPng,
          metadata: item.chart.metadata,
          annotations: input.annotations,
        })
      : item.chart.screenshotPng;
    const chartPath = path.join(outputDir, `${item.timeframe}.png`);
    fs.writeFileSync(chartPath, rendered);
    console.log(`Chart saved locally to: ${chartPath}`);
  }

  console.log('Sending message and chart set to Telegram...');
  const msgSuccess = await sendTelegramMessage(formatted);
  for (const timeframe of selectedTimeframes) {
    const chartPath = path.join(outputDir, `${timeframe}.png`);
    if (!fs.existsSync(chartPath)) continue;
    const photoSuccess = await sendTelegramPhoto(fs.readFileSync(chartPath), `${timeframe.toUpperCase()} preview — ${dummyCandidate.symbol}`);
    console.log(`Telegram ${timeframe.toUpperCase()} Photo Result:`, photoSuccess ? 'SUCCESS ✅' : 'FAILED ❌');
  }
  console.log('Telegram Message Result:', msgSuccess ? 'SUCCESS ✅' : 'FAILED ❌');
}

run().catch(console.error);
