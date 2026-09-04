import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { createDemoCandidate, DemoScenario, loadDemoCandles, loadDemoCandlesForTimeframe } from './demoSignalGenerator';
import { captureMultiTimeframeCharts } from './tvChartCapture';
import { buildOverlayInput } from './overlayMetadata';
import { renderOverlay } from './overlayRenderer';
import { formatNotificationMessage } from './telegramFormatter';

async function main(): Promise<void> {
  if (process.env.ENABLE_DEMO_MODE !== 'true') throw new Error('Set ENABLE_DEMO_MODE=true to generate a demo preview.');
  const scenario = (process.argv.find(arg => arg.startsWith('--scenario='))?.split('=')[1] ?? 'A') as DemoScenario;
  const candles = loadDemoCandles();
  const candidate = createDemoCandidate(scenario, candles);
  const outputDir = path.join(process.cwd(), 'demo-output', scenario);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'telegram-preview.md'), formatNotificationMessage(candidate));
  const charts = await captureMultiTimeframeCharts({ '4h': loadDemoCandlesForTimeframe('4h'), '1h': loadDemoCandlesForTimeframe('1h'), '15m': candles }, candidate);
  for (const item of charts) {
    const input = buildOverlayInput(candles, item.candidate, item.chart.metadata.imageWidth, item.chart.metadata.imageHeight, item.timeframe);
    const rendered = input ? await renderOverlay({ screenshotPng: item.chart.screenshotPng, metadata: item.chart.metadata, annotations: input.annotations }) : item.chart.screenshotPng;
    fs.writeFileSync(path.join(outputDir, `${item.timeframe}.overlay.png`), rendered);
  }
  console.log(`Demo preview generated: ${outputDir}`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
