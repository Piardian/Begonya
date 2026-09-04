import * as fs from 'fs';
import * as path from 'path';
import puppeteer = require('puppeteer');
import { StoredCandle, Timeframe } from './candleStore';
import { NotificationCandidate } from './pipeline';
import { ChartMetadata } from './overlayRenderer';
import { buildOverlayInput } from './overlayMetadata';
import { assessPresentationV1 } from '../src/presentationAssessment';
import { createSmartScreenshotPlan, refineSmartScreenshotPlan, SmartScreenshotPlan } from './smartScreenshotEngine';
import { buildPresentationPlan } from './presentationPolicyEngine';
import { recordRuntimeTrace } from './runtimeTrace';

export interface CapturedChart {
  screenshotPng: Buffer;
  metadata: ChartMetadata;
  smartScreenshotPlan?: SmartScreenshotPlan;
}

export type MultiTimeframeCandles = Partial<Record<Timeframe, StoredCandle[]>>;

export async function captureMultiTimeframeCharts(
  candlesByTimeframe: MultiTimeframeCandles,
  candidate: NotificationCandidate,
  width = 1000,
  height = 600,
  visibleBars = 100,
  deviceScaleFactor = 1,
  timeframes: readonly Timeframe[] = ['4h', '1h', '15m']
): Promise<Array<{ timeframe: Timeframe; chart: CapturedChart; candidate: NotificationCandidate }>> {
  const result: Array<{ timeframe: Timeframe; chart: CapturedChart; candidate: NotificationCandidate }> = [];
  for (const timeframe of timeframes) {
    const candles = candlesByTimeframe[timeframe];
    if (!candles?.length) continue;
    const mappedCandidate = mapCandidateToTimeframe(candidate, candles);
    const chart = await captureLightweightChartWithMetadata(
      candles,
      mappedCandidate,
      timeframe,
      width,
      height,
      visibleBars,
      deviceScaleFactor
    );
    recordRuntimeTrace({
      signalId: mappedCandidate.signalId ?? mappedCandidate.uniqueKey,
      file: 'server/tvChartCapture.ts',
      functionName: 'captureMultiTimeframeCharts',
      timestamp: new Date().toISOString(),
      input: {
        timeframe,
        width,
        height,
        visibleBars,
        deviceScaleFactor,
      },
      output: {
        hasScreenshot: true,
        chartTimeframe: chart.metadata.timeframe,
      },
    });
    result.push({ timeframe, chart, candidate: mappedCandidate });
  }
  return result;
}

function mapCandidateToTimeframe(candidate: NotificationCandidate, candles: StoredCandle[]): NotificationCandidate {
  const nearestIndex = (timestamp: number): number => {
    let best = 0;
    let distance = Number.POSITIVE_INFINITY;
    candles.forEach((candle, index) => {
      const current = Math.abs(candle.timestamp - timestamp);
      if (current < distance) { distance = current; best = index; }
    });
    return best;
  };
  const poi = { ...candidate.poi } as any;
  if (candidate.poiType === 'OB') poi.formedAtIndex = nearestIndex(candidate.poiFormedTimestamp);
  else poi.middleCandleIndex = nearestIndex(candidate.poiFormedTimestamp);
  poi.relatedEvent = { ...poi.relatedEvent, breakCandleIndex: nearestIndex(poi.relatedEvent.breakTimestamp) };
  return { ...candidate, poi, currentPrice: candidate.currentPrice ?? candles[candles.length - 1].close } as NotificationCandidate;
}

export async function captureLightweightChartWithMetadata(
  candles: StoredCandle[],
  candidate: NotificationCandidate,
  timeframe: Timeframe,
  width = 1000,
  height = 600,
  visibleBars = 100,
  deviceScaleFactor = 1
): Promise<CapturedChart> {
  const template = fs.readFileSync(path.join(process.cwd(), 'server', 'tvChartTemplate.html'), 'utf8');
  const lightweightCharts = fs.readFileSync(
    path.join(process.cwd(), 'node_modules', 'lightweight-charts', 'dist', 'lightweight-charts.standalone.production.js'),
    'utf8'
  );
  const initialPlan = createSmartScreenshotPlan(candles, candidate, timeframe, visibleBars);
  const overlayPreview = buildOverlayInput(candles, candidate, width, height, timeframe, { visibleRange: initialPlan.visibleRange });
  const presentationAssessment = assessPresentationV1(overlayPreview ? {
    timeframe,
    metadata: overlayPreview.metadata,
    annotations: overlayPreview.annotations,
    overlaySimplification: overlayPreview.simplification,
  } : null);
  const refinedPlan = refineSmartScreenshotPlan(initialPlan, candles.length, presentationAssessment);
  const presentationPlan = buildPresentationPlan({
    assessment: presentationAssessment,
    screenshotPlan: refinedPlan,
    overlaySimplification: overlayPreview?.simplification ?? {
      version: 'OverlaySimplification.v1',
      priorityEngineVersion: 'OverlayPriorityEngine.v1',
      originalAnnotationCount: 0,
      annotations: [],
      decisionLog: [],
      metrics: Object.freeze({
        overlayDensity: 0,
        priorityCoverage: 0,
        hiddenAnnotations: 0,
        hiddenLabels: 0,
        visiblePriorityRatio: 0,
        clutterScore: 0,
        hierarchyScore: 0,
      }),
      warnings: ['OVERLAY_PREVIEW_MISSING'],
    },
    candlesLength: candles.length,
  });
  const smartScreenshotPlan = presentationPlan.screenshotPlan as SmartScreenshotPlan;
  const visibleRange = smartScreenshotPlan.visibleRange;
  recordRuntimeTrace({
    signalId: candidate.signalId ?? candidate.uniqueKey,
    file: 'server/tvChartCapture.ts',
    functionName: 'captureLightweightChartWithMetadata',
    timestamp: new Date().toISOString(),
    input: {
      timeframe,
      candles: candles.length,
      visibleBars,
      width,
      height,
    },
    output: {
      visibleRange,
      presentationMode: presentationPlan.mode,
      overlayAnnotations: overlayPreview?.annotations.length ?? 0,
    },
  });
  const chartData = {
    ...candidate,
    candles,
    chartWidth: width,
    chartHeight: height,
    timeframe,
    disableTemplateOverlay: true,
    visibleLogicalRange: visibleRange,
    smartScreenshotPlan,
  };
  let html = template.replace('<script id="tv-lib-script"></script>', `<script>${lightweightCharts}</script>`);
  html = html.replace('window.chartData = null;', `window.chartData = ${JSON.stringify(chartData)};`);
  html = html.replace('window.ENABLE_TV_PRIMITIVES = window.ENABLE_TV_PRIMITIVES === true;', 'window.ENABLE_TV_PRIMITIVES = false;');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor });
    await page.setContent(html, { waitUntil: 'load' });
    await page.waitForFunction(() => (globalThis as any).TV_CHART_METADATA !== null, { timeout: 10000 });
    const metadata = await page.evaluate(() => (globalThis as any).TV_CHART_METADATA) as ChartMetadata;
    const chart = await page.$('#chart');
    if (!chart) throw new Error('Chart element not found');
    const screenshotPng = await chart.screenshot({ type: 'png' }) as Buffer;
    await page.close();

    return { screenshotPng, metadata, smartScreenshotPlan };
  } finally {
    await browser.close();
  }
}
