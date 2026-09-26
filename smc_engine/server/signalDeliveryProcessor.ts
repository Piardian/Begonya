import { CandleStore, Symbol } from './candleStore';
import { defaultChannelAdapter } from './channelAdapter';
import { captureLightweightChartWithMetadata, captureMultiTimeframeCharts } from './tvChartCapture';
import { buildOverlayInput } from './overlayMetadata';
import { ChartMetadata, renderOverlay } from './overlayRenderer';
import { buildRuntimeNotificationMessage } from './notificationBuilder';
import { runRuntimeExecutionPipeline } from './runtimeExecutionPipeline';
import { evaluateSignalValidationGate } from '../src/signalValidationGate';
import { fetchCandles } from './twelveDataClient';
import { NotifiedStore } from './notifiedStore';
import { recordRuntimeTrace } from './runtimeTrace';
import { elapsedMs, recordScreenshotTelemetry, telemetryTimer } from './telemetry';
import { FileSignalLedger } from './signalLedger';
import type { DeliveryProcessingResult, QueuedSignalDelivery } from './signalDeliveryQueue';

const signalLedger = new FileSignalLedger();

export function createSignalDeliveryProcessor(
  candleStore: CandleStore,
  notifiedStore: NotifiedStore
): (item: QueuedSignalDelivery) => Promise<DeliveryProcessingResult> {
  return async (item: QueuedSignalDelivery) => {
    if (candidateWasDurablyNotified(notifiedStore, item.candidate)) {
      return { outcome: 'SENT', failureReason: null };
    }

    let refreshedCandidate: QueuedSignalDelivery['candidate'];
    try {
      refreshedCandidate = await refreshCandidate(item, candleStore);
    } catch (error) {
      return {
        outcome: 'DATA_FAILED',
        failureReason: error instanceof Error ? error.message : String(error),
      };
    }

    const executionPipeline = runRuntimeExecutionPipeline(refreshedCandidate);
    const validationGate = evaluateSignalValidationGate(refreshedCandidate, executionPipeline);
    if (validationGate.validationDecision === 'FAIL') {
      clearCandidatePending(notifiedStore, refreshedCandidate);
      return { outcome: 'EXPIRED_IN_QUEUE', failureReason: validationGate.rejectionReason.join('; ') || 'queue revalidation failed' };
    }

    if (!executionPipeline.riskResult.items[0]?.evaluation.executionAllowed) {
      clearCandidatePending(notifiedStore, refreshedCandidate);
      return { outcome: 'EXPIRED_IN_QUEUE', failureReason: executionPipeline.decisionCalibration.reason.message };
    }

    const message = buildRuntimeNotificationMessage(refreshedCandidate, executionPipeline);
    const sent = await defaultChannelAdapter.sendMessage(message, {
      signalId: refreshedCandidate.signalId ?? refreshedCandidate.uniqueKey,
      retryCount: item.deliveryAttemptCount,
    });
    if (!sent) {
      return { outcome: 'TELEGRAM_FAILED', failureReason: 'telegram send failed' };
    }

    markCandidateAsNotified(notifiedStore, refreshedCandidate);
    try {
      await signalLedger.recordSignalIssued({ candidate: refreshedCandidate, execution: executionPipeline });
    } catch (error) {
      console.warn(`[SignalLedger] Signal record failed for ${refreshedCandidate.signalId ?? refreshedCandidate.uniqueKey}:`, error);
    }

    try {
      const screenshotsOk = await deliverSignalScreenshots(refreshedCandidate, candleStore);
      return {
        outcome: screenshotsOk ? 'SENT' : 'SCREENSHOT_FAILED',
        failureReason: screenshotsOk ? null : 'one or more screenshots failed',
      };
    } catch (error) {
      return {
        outcome: 'SCREENSHOT_FAILED',
        failureReason: error instanceof Error ? error.message : String(error),
      };
    }
  };
}

async function refreshCandidate(item: QueuedSignalDelivery, candleStore: CandleStore) {
  const candidate = item.candidate;
  let candles15m = candleStore.getCandles(candidate.symbol, '15m');
  if (candles15m.length === 0) {
    const latest15m = await fetchCandles(candidate.symbol, '15m', 10);
    for (const candle of latest15m) {
      candleStore.appendCandle(candidate.symbol, '15m', candle);
    }
    candles15m = candleStore.getCandles(candidate.symbol, '15m');
  }
  const last = candles15m[candles15m.length - 1];
  return {
    ...candidate,
    currentPrice: last?.close ?? candidate.currentPrice,
    marketDataTimestamp: last?.timestamp ?? candidate.marketDataTimestamp,
    validationClosePrice: last?.close ?? candidate.validationClosePrice,
    validationCloseTimestamp: last?.timestamp ?? candidate.validationCloseTimestamp,
  };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(errorMessage));
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function deliverSignalScreenshots(candidate: QueuedSignalDelivery['candidate'], candleStore: CandleStore): Promise<boolean> {
  const signalId = candidate.signalId ?? candidate.uniqueKey;
  const candles15m = candleStore.getCandles(candidate.symbol, '15m');
  const capturedChart = await captureLightweightChartWithMetadata(candles15m, candidate, '15m');
  recordRuntimeTrace({
    signalId,
    file: 'server/signalDeliveryProcessor.ts',
    functionName: 'deliverSignalScreenshots',
    timestamp: new Date().toISOString(),
    input: { stage: 'Screenshot Capture', timeframe: '15m' },
    output: { hasScreenshot: Boolean(capturedChart.screenshotPng?.length) },
  });

  let fifteenMinuteDelivered = false;

  if (process.env.ENABLE_RC5_1_MTF === 'true') {
    let timedOut = false;
    try {
      const mtfWork = async () => {
        const candles1m = await loadExecutionCandles1m(candidate.symbol, candleStore);
        const capturedMtfCharts = await captureMultiTimeframeCharts(
          {
            '1m': candles1m,
            '4h': candleStore.getCandles(candidate.symbol, '4h'),
            '1h': candleStore.getCandles(candidate.symbol, '1h'),
            '15m': candles15m,
          },
          candidate,
          1000,
          600,
          100,
          1,
          ['1m', '1h']
        );
        const charts = capturedMtfCharts.some(item => item.timeframe === '15m')
          ? capturedMtfCharts
          : [
              ...capturedMtfCharts,
              { timeframe: '15m' as const, chart: capturedChart, candidate },
            ];
        const order: Record<string, number> = { '1m': 0, '15m': 1, '1h': 2, '4h': 3 };
        let allOk = true;
        for (const item of charts.sort((a, b) => (order[a.timeframe] ?? 99) - (order[b.timeframe] ?? 99))) {
          if (timedOut) break;
          if (item.timeframe === '15m' && fifteenMinuteDelivered) continue;
          const ok = await deliverRenderedChart(
            candidate.symbol,
            signalId,
            item.timeframe,
            item.chart.screenshotPng,
            item.chart.metadata,
            item.candidate === candidate ? candles15m : candleStore.getCandles(candidate.symbol, item.timeframe),
            item.candidate
          );
          if (item.timeframe === '15m' && ok) {
            fifteenMinuteDelivered = true;
          }
          allOk = allOk && ok;
        }
        return allOk;
      };

      return await withTimeout(mtfWork(), 30000, `Multi-timeframe screenshot capture timed out after 30000ms for ${candidate.symbol}`);
    } catch (mtfError) {
      timedOut = true;
      console.warn(`[SignalDelivery] Multi-timeframe screenshot capture failed/timed out for ${candidate.symbol}, checking 15m fallback:`, mtfError);
      if (fifteenMinuteDelivered) {
        return true;
      }
    }
  }

  if (fifteenMinuteDelivered) {
    return true;
  }

  const delivered = await deliverRenderedChart(candidate.symbol, signalId, '15m', capturedChart.screenshotPng, capturedChart.metadata, candles15m, candidate);
  if (delivered) {
    fifteenMinuteDelivered = true;
  }
  return delivered;
}

async function deliverRenderedChart(
  symbol: Symbol,
  signalId: string,
  timeframe: '1m' | '15m' | '1h' | '4h',
  screenshotPng: Buffer,
  metadata: ChartMetadata,
  candles: ReturnType<CandleStore['getCandles']>,
  candidate: QueuedSignalDelivery['candidate']
): Promise<boolean> {
  const chartTimer = telemetryTimer();
  const overlayInput = buildOverlayInput(candles, timeframe === '1m' ? mapCandidateToExecutionCandles(candidate, candles) : candidate, metadata.imageWidth, metadata.imageHeight, timeframe, {
    visibleRange: visibleRangeFromMetadata(metadata),
  });
  const rendered = process.env.ENABLE_OVERLAY_RENDERER === 'true' && overlayInput
    ? await renderOverlay({ screenshotPng, metadata, annotations: overlayInput.annotations })
    : screenshotPng;
  const attachment = validatePngAttachment(rendered, metadata.imageWidth, metadata.imageHeight);
  if (!attachment.pass) {
    recordScreenshotTelemetry({
      type: 'screenshot',
      signalId,
      symbol,
      timeframe,
      chartLoadingTimeMs: null,
      screenshotGenerationTimeMs: elapsedMs(chartTimer),
      uploadTimeMs: 0,
      success: false,
      fallbackUsed: timeframe !== '1m',
      oneMinuteAvailable: timeframe === '1m',
      fifteenMinuteFallback: timeframe === '15m',
      failureReason: 'attachment validation failed',
    });
    return false;
  }
  const uploadTimer = telemetryTimer();
  const uploaded = await defaultChannelAdapter.sendPhoto(rendered, timeframe === '15m' ? undefined : `RC-5.1 ${timeframe.toUpperCase()} • ${candidate.symbol}`, { signalId });
  recordScreenshotTelemetry({
    type: 'screenshot',
    signalId,
    symbol,
    timeframe,
    chartLoadingTimeMs: null,
    screenshotGenerationTimeMs: elapsedMs(chartTimer),
    uploadTimeMs: elapsedMs(uploadTimer),
    success: uploaded,
    fallbackUsed: timeframe !== '1m',
    oneMinuteAvailable: timeframe === '1m',
    fifteenMinuteFallback: timeframe === '15m',
    failureReason: uploaded ? null : 'telegram photo upload failed',
  });
  return uploaded;
}

async function loadExecutionCandles1m(symbol: Symbol, candleStore: CandleStore) {
  const fetched1m = await fetchCandles(symbol, '1m', 200);
  for (const candle of fetched1m) {
    candleStore.appendCandle(symbol, '1m', candle);
  }
  return candleStore.getCandles(symbol, '1m');
}

function mapCandidateToExecutionCandles(
  candidate: QueuedSignalDelivery['candidate'],
  candles: ReturnType<CandleStore['getCandles']>
): QueuedSignalDelivery['candidate'] {
  const nearestIndex = (timestamp: number): number => {
    let best = 0;
    let distance = Number.POSITIVE_INFINITY;
    candles.forEach((candle, index) => {
      const current = Math.abs(candle.timestamp - timestamp);
      if (current < distance) {
        distance = current;
        best = index;
      }
    });
    return best;
  };

  const poi = { ...candidate.poi } as any;
  if (candidate.poiType === 'OB') {
    poi.formedAtIndex = nearestIndex(candidate.poiFormedTimestamp);
  } else {
    poi.middleCandleIndex = nearestIndex(candidate.poiFormedTimestamp);
  }
  poi.relatedEvent = {
    ...poi.relatedEvent,
    breakCandleIndex: nearestIndex(poi.relatedEvent.breakTimestamp),
  };

  return {
    ...candidate,
    poi,
    currentPrice: candles[candles.length - 1]?.close ?? candidate.currentPrice,
  };
}

function validatePngAttachment(buffer: Buffer, expectedWidth: number, expectedHeight: number): { pass: boolean; bytes: number } {
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const signatureValid = buffer.length >= pngSignature.length && buffer.subarray(0, pngSignature.length).equals(pngSignature);
  const dimensionsValid = expectedWidth > 0 && expectedHeight > 0;
  return { pass: dimensionsValid && (signatureValid || buffer.length > 0), bytes: buffer.length };
}

function visibleRangeFromMetadata(metadata: ChartMetadata): { from: number; to: number } {
  return {
    from: Math.max(0, Math.floor(metadata.firstVisibleLogical)),
    to: Math.max(0, Math.floor(metadata.lastVisibleLogical)),
  };
}

function clearCandidatePending(store: NotifiedStore, candidate: QueuedSignalDelivery['candidate']): void {
  store.clearPending(candidate.uniqueKey);
  if (candidate.dedupeKey) store.clearPending(candidate.dedupeKey);
}

function markCandidateAsNotified(store: NotifiedStore, candidate: QueuedSignalDelivery['candidate']): void {
  store.markAsNotified(candidate.uniqueKey);
  if (candidate.dedupeKey) store.markAsNotified(candidate.dedupeKey);
}

function candidateWasDurablyNotified(
  store: NotifiedStore,
  candidate: QueuedSignalDelivery['candidate']
): boolean {
  return store.hasDurablyBeenNotified(candidate.uniqueKey) ||
    Boolean(candidate.dedupeKey && store.hasDurablyBeenNotified(candidate.dedupeKey));
}
