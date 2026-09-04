import 'dotenv/config';
import { captureTradingViewChart } from './tvScreenshot';
import { sendTelegramPhoto } from './telegramSender';

export type Nas100VisualizationStatus = 'SUCCESS' | 'FAILED' | 'DISABLED';

export interface Nas100VisualizationResult {
  asset: 'NAS100';
  mode: 'VISUALIZATION_ONLY';
  timeframes: string[];
  chartGeneration: Nas100VisualizationStatus;
  overlay: Nas100VisualizationStatus;
  telegramAttachment: Nas100VisualizationStatus;
  chartCount: number;
}

function enabled(): boolean {
  return process.env.ENABLE_NAS100_VISUALIZATION === 'true';
}

/**
 * Captures Pepperstone TradingView charts without touching TwelveData,
 * CandleStore, or any detection/execution stage. It is intentionally a
 * separate orchestration entry point and never creates a production signal.
 */
export async function runNas100Visualization(): Promise<Nas100VisualizationResult> {
  const base = {
    asset: 'NAS100' as const,
    mode: 'VISUALIZATION_ONLY' as const,
    timeframes: ['15M', '1H'],
    chartGeneration: 'FAILED' as Nas100VisualizationStatus,
    overlay: 'FAILED' as Nas100VisualizationStatus,
    telegramAttachment: 'FAILED' as Nas100VisualizationStatus,
    chartCount: 0,
  };

  if (!enabled()) {
    console.log('[NAS100] Asset: NAS100 | Mode: VISUALIZATION_ONLY | Disabled by feature flag');
    return { ...base, chartGeneration: 'DISABLED', overlay: 'DISABLED', telegramAttachment: 'DISABLED' };
  }

  const captures: Array<{ timeframe: string; image: Buffer }> = [];
  try {
    for (const timeframe of ['15m', '1h']) {
      const image = await captureTradingViewChart('NAS100', timeframe, 'PEPPERSTONE');
      if (!image.length) throw new Error(`${timeframe} capture returned an empty PNG`);
      captures.push({ timeframe, image });
    }
    base.chartGeneration = 'SUCCESS';
    base.chartCount = captures.length;
    console.log('[NAS100] Asset: NAS100 | Mode: VISUALIZATION_ONLY | Timeframes: 15M,1H | Chart Generation: SUCCESS');
  } catch (error) {
    console.error('[NAS100] Asset: NAS100 | Mode: VISUALIZATION_ONLY | Chart Generation: FAILED', error);
    return base;
  }

  // No SignalContext exists in visualization-only mode; applying the
  // production overlay would require fabricated detection data. Report this
  // explicitly instead of claiming a misleading overlay success.
  console.warn('[NAS100] Asset: NAS100 | Mode: VISUALIZATION_ONLY | Overlay: FAILED (no signal context; production renderer not invoked)');

  let allUploaded = true;
  for (const capture of captures) {
    const uploaded = await sendTelegramPhoto(capture.image, `NAS100 VISUALIZATION_ONLY — ${capture.timeframe.toUpperCase()}`);
    console.log(`[NAS100] Telegram Attachment (${capture.timeframe.toUpperCase()}): ${uploaded ? 'SUCCESS' : 'FAILED'}`);
    allUploaded = allUploaded && uploaded;
  }
  base.telegramAttachment = allUploaded ? 'SUCCESS' : 'FAILED';
  return base;
}

if (require.main === module) {
  runNas100Visualization().then(result => {
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.chartGeneration === 'FAILED' || result.telegramAttachment === 'FAILED' ? 1 : 0;
  });
}
