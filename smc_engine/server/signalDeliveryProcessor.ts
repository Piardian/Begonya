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
import { ActivePoiWatchlist } from './activePoiWatchlist';
import { Candle } from '../src/types';
import { detectSwings } from '../src/swingDetector';
import { resolveDisplayLiquidityMagnet } from '../src/liquidityMagnetDetector';
import { PaperOutcomeTracker } from './paperOutcomeTracker';
import { captureMacroSnapshot } from './macroOutcomeEvidence';

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
      if (isPermanentValidationRejection(validationGate.rejectionReason)) {
        markCandidateAsInvalidated(notifiedStore, refreshedCandidate);
      } else {
        clearCandidatePending(notifiedStore, refreshedCandidate);
      }
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
      const macroSnapshot = captureMacroSnapshot(refreshedCandidate);
      PaperOutcomeTracker.getInstance().registerCandidate(refreshedCandidate, macroSnapshot);
    } catch (error) {
      console.warn(`[PaperOutcomeTracker] Candidate registration failed for ${refreshedCandidate.signalId ?? refreshedCandidate.uniqueKey}:`, error);
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
  const currentPrice = last?.close ?? candidate.currentPrice;

  let refreshedMagnet = candidate.liquidityMagnet;
  if (candles15m.length >= 15 && (!refreshedMagnet || !refreshedMagnet.isActive || currentPrice !== candidate.currentPrice)) {
    const candles15mCast = candles15m as unknown as Candle[];
    const candles1hCast = candleStore.getCandles(candidate.symbol, '1h') as unknown as Candle[];
    const swings15m = detectSwings(candles15mCast);
    const swings1h = candles1hCast.length >= 15 ? detectSwings(candles1hCast) : undefined;
    const resolved = resolveDisplayLiquidityMagnet(
      swings15m,
      currentPrice,
      candidate.tradeDirection,
      candidate.symbol,
      candles15mCast,
      candles15mCast.length - 1,
      swings1h,
      candles1hCast.length >= 15 ? candles1hCast : undefined,
      candles1hCast.length >= 15 ? candles1hCast.length - 1 : undefined
    );
    if (resolved) {
      refreshedMagnet = resolved;
    }
  }

  return {
    ...candidate,
    currentPrice,
    marketDataTimestamp: last?.timestamp ?? candidate.marketDataTimestamp,
    validationClosePrice: last?.close ?? candidate.validationClosePrice,
    validationCloseTimestamp: last?.timestamp ?? candidate.validationCloseTimestamp,
    triggerCandle: last ?? candidate.triggerCandle,
    ...(refreshedMagnet !== undefined ? { liquidityMagnet: refreshedMagnet } : {}),
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

  const deliveredTimeframes = new Set<string>();
  const mtfTimeoutMs = Number(process.env.MTF_SCREENSHOT_TIMEOUT_MS ?? 90000);

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
          if (deliveredTimeframes.has(item.timeframe)) continue;
          const ok = await deliverRenderedChart(
            candidate.symbol,
            signalId,
            item.timeframe,
            item.chart.screenshotPng,
            item.chart.metadata,
            item.candidate === candidate ? candles15m : candleStore.getCandles(candidate.symbol, item.timeframe),
            item.candidate
          );
          if (ok) {
            deliveredTimeframes.add(item.timeframe);
          }
          allOk = allOk && ok;
        }
        return allOk;
      };

      await withTimeout(mtfWork(), mtfTimeoutMs, `Multi-timeframe screenshot capture timed out after ${mtfTimeoutMs}ms for ${candidate.symbol}`);
    } catch (mtfError) {
      timedOut = true;
      console.warn(`[SignalDelivery] Multi-timeframe screenshot capture failed/timed out for ${candidate.symbol}, checking 15m fallback:`, mtfError);
    }
  }

  let fallbackOk = true;
  if (!deliveredTimeframes.has('15m')) {
    fallbackOk = await deliverRenderedChart(candidate.symbol, signalId, '15m', capturedChart.screenshotPng, capturedChart.metadata, candles15m, candidate);
    if (fallbackOk) {
      deliveredTimeframes.add('15m');
    }
  }

  if (process.env.ENABLE_RC5_1_MTF === 'true' && !deliveredTimeframes.has('1h')) {
    const candles1h = candleStore.getCandles(candidate.symbol, '1h');
    if (candles1h.length > 0) {
      try {
        const mapped1hCandidate = mapCandidateToExecutionCandles(candidate, candles1h);
        const captured1h = await captureLightweightChartWithMetadata(candles1h, mapped1hCandidate, '1h');
        const delivered1h = await deliverRenderedChart(candidate.symbol, signalId, '1h', captured1h.screenshotPng, captured1h.metadata, candles1h, mapped1hCandidate);
        if (delivered1h) {
          deliveredTimeframes.add('1h');
        }
      } catch (err1h) {
        console.warn(`[SignalDelivery] Fallback 1h screenshot capture failed for ${candidate.symbol}:`, err1h);
      }
    }
  }

  return fallbackOk && deliveredTimeframes.has('15m');
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
  const fetchTimeoutMs = Number(process.env.MTF_1M_FETCH_TIMEOUT_MS ?? 65000);
  try {
    const fetched1m = await withTimeout(
      fetchCandles(symbol, '1m', 200),
      fetchTimeoutMs,
      `1m candle fetch timed out after ${fetchTimeoutMs}ms for ${symbol}`
    );
    for (const candle of fetched1m) {
      candleStore.appendCandle(symbol, '1m', candle);
    }
  } catch (err) {
    console.warn(`[SignalDelivery] 1m candle fetch failed/timed out for ${symbol}, using cached store candles:`, err);
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

function candidateImpulseKey(candidate: QueuedSignalDelivery['candidate']): string | null {
  const breakTs = candidate.poi?.relatedEvent?.breakTimestamp;
  if (!Number.isFinite(breakTs)) return null;
  return `IMPULSE:${candidate.symbol}:${candidate.tradeDirection}:${breakTs}`;
}

function isPermanentValidationRejection(reasons: readonly string[]): boolean {
  return reasons.some(
    reason =>
      reason === 'completed candle close crossed the invalidation side of the entry zone' ||
      reason === 'entry zone over-tested'
  );
}

function clearCandidatePending(store: NotifiedStore, candidate: QueuedSignalDelivery['candidate']): void {
  store.clearPending(candidate.uniqueKey);
  if (candidate.dedupeKey) store.clearPending(candidate.dedupeKey);
  const impulseKey = candidateImpulseKey(candidate);
  if (impulseKey) store.clearPending(impulseKey);
}

function markCandidateAsInvalidated(store: NotifiedStore, candidate: QueuedSignalDelivery['candidate']): void {
  clearCandidatePending(store, candidate);
  store.markAsInvalidated(candidate.uniqueKey);
  if (candidate.dedupeKey) store.markAsInvalidated(candidate.dedupeKey);
  try {
    ActivePoiWatchlist.getInstance().markPoiInvalidated(candidate.symbol, candidate.dedupeKey ?? candidate.uniqueKey);
  } catch {
    // Non-blocking watchlist update
  }
}

function markCandidateAsNotified(store: NotifiedStore, candidate: QueuedSignalDelivery['candidate']): void {
  store.markAsNotified(candidate.uniqueKey);
  if (candidate.dedupeKey) store.markAsNotified(candidate.dedupeKey);
  const impulseKey = candidateImpulseKey(candidate);
  if (impulseKey) store.markAsNotified(impulseKey);
  try {
    ActivePoiWatchlist.getInstance().markPoiTested(candidate.symbol, candidate.dedupeKey ?? candidate.uniqueKey);
  } catch {
    // Non-blocking watchlist update
  }
}

function candidateWasDurablyNotified(
  store: NotifiedStore,
  candidate: QueuedSignalDelivery['candidate']
): boolean {
  const impulseKey = candidateImpulseKey(candidate);
  return store.hasDurablyBeenNotified(candidate.uniqueKey) ||
    Boolean(candidate.dedupeKey && store.hasDurablyBeenNotified(candidate.dedupeKey)) ||
    Boolean(impulseKey && store.hasDurablyBeenNotified(impulseKey));
}
