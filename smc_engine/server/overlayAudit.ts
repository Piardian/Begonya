import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import puppeteer = require('puppeteer');
import { detectSwings } from '../src/swingDetector';
import { detectStructure } from '../src/structureDetector';
import { detectAllOrderBlocks } from '../src/obDetector';
import { detectAllFVGs } from '../src/fvgDetector';
import { FVG, OrderBlock } from '../src/types';
import { StoredCandle, Symbol } from './candleStore';
import { NotificationCandidate } from './pipeline';
import { buildOverlayInput } from './overlayMetadata';
import { renderOverlay, ChartMetadata, OverlayAnnotation } from './overlayRenderer';

type AuditPoiType = 'OB' | 'FVG';

interface AuditSetup {
  id: string;
  symbol: Symbol;
  poiType: AuditPoiType;
  candidate: NotificationCandidate;
  focusIndex: number;
}

interface AuditScenario {
  name: string;
  visibleBars: number;
  width: number;
  height: number;
  deviceScaleFactor: number;
}

const SYMBOLS: Symbol[] = ['EURUSD', 'GBPUSD'];
const TARGET_SETUPS_PER_SYMBOL = 10;
const AUDIT_SCENARIOS: AuditScenario[] = [
  { name: '80bars_1280x720_dpr1', visibleBars: 80, width: 1280, height: 720, deviceScaleFactor: 1 },
  { name: '100bars_1280x720_dpr1', visibleBars: 100, width: 1280, height: 720, deviceScaleFactor: 1 },
  { name: '150bars_1280x720_dpr1', visibleBars: 150, width: 1280, height: 720, deviceScaleFactor: 1 },
  { name: '100bars_1920x1080_dpr1', visibleBars: 100, width: 1920, height: 1080, deviceScaleFactor: 1 },
  { name: '100bars_1920x1080_dpr2', visibleBars: 100, width: 1920, height: 1080, deviceScaleFactor: 2 },
];

export async function runOverlayAudit(outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-validation-audit-'))): Promise<string> {
  const template = fs.readFileSync(path.join(process.cwd(), 'server', 'tvChartTemplate.html'), 'utf8');
  const lightweightCharts = fs.readFileSync(
    path.join(process.cwd(), 'node_modules', 'lightweight-charts', 'dist', 'lightweight-charts.standalone.production.js'),
    'utf8'
  );
  const htmlTemplate = template.replace('<script id="tv-lib-script"></script>', `<script>${lightweightCharts}</script>`);
  const setups = SYMBOLS.flatMap(symbol => buildSetups(symbol)).slice(0, SYMBOLS.length * TARGET_SETUPS_PER_SYMBOL);

  fs.mkdirSync(outputDir, { recursive: true });
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const report: unknown[] = [];
  try {
    for (const setup of setups) {
      for (const scenario of AUDIT_SCENARIOS) {
        const result = await renderAuditScenario(browser, htmlTemplate, setup, scenario, outputDir);
        report.push(result);
      }
    }
  } finally {
    await browser.close();
  }

  const reportPath = path.join(outputDir, 'audit-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    setupCount: setups.length,
    scenariosPerSetup: AUDIT_SCENARIOS.length,
    artifacts: report,
  }, null, 2));

  return outputDir;
}

function buildSetups(symbol: Symbol): AuditSetup[] {
  const candles = readCandles(symbol);
  const structureState = detectStructure(candles, detectSwings(candles));
  const orderBlocks = detectAllOrderBlocks(candles, structureState.events).slice(-TARGET_SETUPS_PER_SYMBOL);
  const fvgs = detectAllFVGs(candles, structureState.events, symbol, '15m').slice(-TARGET_SETUPS_PER_SYMBOL);
  const mixed: AuditSetup[] = [];

  for (const ob of orderBlocks) {
    mixed.push({
      id: `${symbol}_OB_${ob.formedAtIndex}_${ob.relatedEvent.breakCandleIndex}`,
      symbol,
      poiType: 'OB',
      candidate: buildObCandidate(symbol, candles, ob),
      focusIndex: ob.formedAtIndex,
    });
  }

  for (const fvg of fvgs) {
    mixed.push({
      id: `${symbol}_FVG_${fvg.middleCandleIndex}_${fvg.relatedEvent.breakCandleIndex}`,
      symbol,
      poiType: 'FVG',
      candidate: buildFvgCandidate(symbol, candles, fvg),
      focusIndex: fvg.middleCandleIndex,
    });
  }

  return mixed
    .sort((a, b) => b.focusIndex - a.focusIndex)
    .slice(0, TARGET_SETUPS_PER_SYMBOL);
}

async function renderAuditScenario(
  browser: Awaited<ReturnType<typeof puppeteer.launch>>,
  htmlTemplate: string,
  setup: AuditSetup,
  scenario: AuditScenario,
  outputDir: string
): Promise<unknown> {
  const candles = readCandles(setup.symbol);
  const visibleRange = visibleRangeAround(setup.focusIndex, scenario.visibleBars, candles.length);
  const chartData = {
    ...setup.candidate,
    candles,
    chartWidth: scenario.width,
    chartHeight: scenario.height,
    timeframe: '15m',
    disableTemplateOverlay: true,
    visibleLogicalRange: visibleRange,
  };
  let html = htmlTemplate.replace('window.chartData = null;', `window.chartData = ${JSON.stringify(chartData)};`);
  html = html.replace('window.ENABLE_TV_PRIMITIVES = window.ENABLE_TV_PRIMITIVES === true;', 'window.ENABLE_TV_PRIMITIVES = false;');

  const page = await browser.newPage();
  await page.setViewport({ width: scenario.width, height: scenario.height, deviceScaleFactor: scenario.deviceScaleFactor });
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForFunction(() => (globalThis as any).TV_CHART_METADATA !== null, { timeout: 10000 });
  const metadata = await page.evaluate(() => (globalThis as any).TV_CHART_METADATA) as ChartMetadata;
  const chart = await page.$('#chart');
  if (!chart) throw new Error('Chart element not found');
  const raw = await chart.screenshot({ type: 'png' }) as Buffer;
  await page.close();

  const overlayInput = buildOverlayInput(candles, setup.candidate, scenario.width, scenario.height, '15m');
  if (!overlayInput) throw new Error(`Overlay input could not be built for ${setup.id}`);
  const annotated = await renderOverlay({
    screenshotPng: raw,
    metadata,
    annotations: overlayInput.annotations,
  });

  const setupDir = path.join(outputDir, setup.id);
  fs.mkdirSync(setupDir, { recursive: true });
  const rawPath = path.join(setupDir, `${scenario.name}.raw.png`);
  const overlayPath = path.join(setupDir, `${scenario.name}.overlay.png`);
  const metadataPath = path.join(setupDir, `${scenario.name}.metadata.json`);
  fs.writeFileSync(rawPath, raw);
  fs.writeFileSync(overlayPath, annotated);
  fs.writeFileSync(metadataPath, JSON.stringify({
    setup: {
      id: setup.id,
      symbol: setup.symbol,
      poiType: setup.poiType,
      focusIndex: setup.focusIndex,
    },
    scenario,
    metadata,
    annotations: overlayInput.annotations,
    manualQa: {
      orderBlockCorrectCandles: 'pending',
      bosArrowCorrectBreak: 'pending',
      fvgCorrectZone: setup.poiType === 'FVG' ? 'pending' : 'not_applicable',
      labelCorrectObject: 'pending',
      systematicXShift: 'pending',
      systematicYShift: 'pending',
    },
  }, null, 2));

  return {
    setupId: setup.id,
    scenario: scenario.name,
    rawPath,
    overlayPath,
    metadataPath,
  };
}

function readCandles(symbol: Symbol): StoredCandle[] {
  const filePath = path.join(process.cwd(), 'data', `${symbol}_15m.json`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as StoredCandle[];
}

function visibleRangeAround(focusIndex: number, visibleBars: number, length: number): { from: number; to: number } {
  const half = Math.floor(visibleBars / 2);
  const from = Math.max(0, Math.min(length - visibleBars, focusIndex - half));
  return { from, to: Math.min(length - 1, from + visibleBars - 1) };
}

function buildObCandidate(symbol: Symbol, candles: StoredCandle[], ob: OrderBlock): NotificationCandidate {
  return {
    symbol,
    tradeDirection: ob.direction === 'bullish' ? 'long' : 'short',
    poiType: 'OB',
    poi: ob,
    gradeResult: dummyGrade(),
    uniqueKey: `${symbol}_audit_ob_${ob.formedAtIndex}`,
    currentPrice: candles[candles.length - 1].close,
    poiFormedTimestamp: candles[ob.formedAtIndex].timestamp,
    bias4H: ob.direction,
    bias1H: ob.direction,
    poiTestCount: 0,
    pd4H: 'discount',
    pd1H: 'discount',
  };
}

function buildFvgCandidate(symbol: Symbol, candles: StoredCandle[], fvg: FVG): NotificationCandidate {
  return {
    symbol,
    tradeDirection: fvg.direction === 'bullish' ? 'long' : 'short',
    poiType: 'FVG',
    poi: fvg,
    gradeResult: dummyGrade(),
    uniqueKey: `${symbol}_audit_fvg_${fvg.middleCandleIndex}`,
    currentPrice: candles[candles.length - 1].close,
    poiFormedTimestamp: candles[fvg.middleCandleIndex].timestamp,
    bias4H: fvg.direction,
    bias1H: fvg.direction,
    poiTestCount: 0,
    pd4H: 'discount',
    pd1H: 'discount',
  };
}

function dummyGrade(): NotificationCandidate['gradeResult'] {
  return {
    totalScore: 9,
    grade: 'A+',
    entryAllowed: true,
    blockReasons: [],
    breakdown: { htfBiasPD: 2, displacement: 2, structure: 2, sweep: 2, poiQuality: 1 },
  };
}

if (require.main === module) {
  runOverlayAudit()
    .then(outputDir => {
      console.log(`Overlay audit artifacts written to ${outputDir}`);
    })
    .catch(error => {
      console.error(error);
      process.exitCode = 1;
    });
}
