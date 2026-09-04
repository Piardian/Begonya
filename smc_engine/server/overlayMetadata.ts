import { StoredCandle, Timeframe } from './candleStore';
import { NotificationCandidate } from './pipeline';
import { FVG, OrderBlock, Candle } from '../src/types';
import { detectSwings } from '../src/swingDetector';
import { calculatePremiumDiscount } from '../src/premiumDiscountCalculator';
import { ChartMetadata, OverlayAnnotation } from './overlayRenderer';
import { OverlayBudget, OverlaySimplificationResult, simplifyOverlayAnnotations } from './overlaySimplifier';
import { recordRuntimeTrace } from './runtimeTrace';

export interface OverlayBuildResult {
  metadata: ChartMetadata;
  annotations: OverlayAnnotation[];
  simplification: OverlaySimplificationResult;
}

const DEFAULT_VISIBLE_CANDLES = 100;

export interface OverlayBuildOptions {
  readonly visibleRange?: {
    readonly from: number;
    readonly to: number;
  };
  readonly overlayBudget?: Partial<OverlayBudget>;
}

export function buildOverlayInput(
  candles: StoredCandle[],
  candidate: NotificationCandidate,
  imageWidth: number,
  imageHeight: number,
  timeframe: Timeframe,
  options: OverlayBuildOptions = {}
): OverlayBuildResult | null {
  if (!candles.length) return null;

  const firstVisibleBar = Math.max(0, Math.min(candles.length - 1, options.visibleRange?.from ?? candles.length - DEFAULT_VISIBLE_CANDLES));
  const lastVisibleBar = Math.max(firstVisibleBar, Math.min(candles.length - 1, options.visibleRange?.to ?? candles.length - 1));
  const visibleCandles = candles.slice(firstVisibleBar, lastVisibleBar + 1);
  const priceRange = visibleCandles.reduce(
    (range, candle) => ({
      min: Math.min(range.min, candle.low),
      max: Math.max(range.max, candle.high),
    }),
    { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY }
  );

  const storyRange = expandToStoryPrices(priceRange, candidate);
  const paddedRange = addPricePadding(storyRange.min, storyRange.max, timeframe);
  const rawAnnotations = buildAnnotations(candles, candidate, paddedRange, timeframe, {
    first: firstVisibleBar,
    last: lastVisibleBar,
  });
  const simplification = simplifyOverlayAnnotations(rawAnnotations, options.overlayBudget);

  recordRuntimeTrace({
    signalId: candidate.signalId ?? candidate.uniqueKey,
    file: 'server/overlayMetadata.ts',
    functionName: 'buildOverlayInput',
    timestamp: new Date().toISOString(),
    input: {
      timeframe,
      candles: candles.length,
      imageWidth,
      imageHeight,
      visibleRange: options.visibleRange ?? null,
    },
    output: {
      annotationCount: simplification.annotations.length,
      hiddenAnnotations: simplification.metrics.hiddenAnnotations,
      hiddenLabels: simplification.metrics.hiddenLabels,
      overlayDensity: simplification.metrics.overlayDensity,
    },
  });

  const rightPriceScaleWidth = Math.round(imageWidth * 0.08);
  const plotWidth = imageWidth - rightPriceScaleWidth;

  return {
    metadata: {
      imageWidth,
      imageHeight,
      firstVisibleLogical: firstVisibleBar,
      lastVisibleLogical: lastVisibleBar,
      plotLeft: 0,
      plotTop: 0,
      plotWidth,
      plotHeight: imageHeight,
      devicePixelRatio: 1,
      rightPriceScaleWidth,
      barSpacing: visibleCandles.length > 1 ? plotWidth / (visibleCandles.length - 1) : plotWidth,
      timeScaleWidth: plotWidth,
      visiblePriceRange: {
        min: paddedRange.min,
        max: paddedRange.max,
      },
      timeframe,
    },
    annotations: simplification.annotations,
    simplification,
  };
}

function buildAnnotations(
  candles: StoredCandle[],
  candidate: NotificationCandidate,
  priceRange: { min: number; max: number },
  timeframe: Timeframe,
  visibleBounds?: { first: number; last: number }
): OverlayAnnotation[] {
  const zoneHigh = candidate.poiType === 'OB'
    ? (candidate.poi as OrderBlock).high
    : (candidate.poi as FVG).gapHigh;
  const zoneLow = candidate.poiType === 'OB'
    ? (candidate.poi as OrderBlock).low
    : (candidate.poi as FVG).gapLow;

  const annotations: OverlayAnnotation[] = [
    {
      type: 'priceLine',
      price: zoneHigh,
      color: '#42a5f5',
      label: timeframe === '1m' ? 'GİRİŞ BÖLGESİ' : 'GİRİŞ ÜST',
      dashed: false,
    },
    {
      type: 'priceLine',
      price: zoneLow,
      color: '#42a5f5',
      label: timeframe === '1m' ? undefined : 'GİRİŞ ALT',
      dashed: false,
    },
    {
      type: 'priceLine',
      price: candidate.currentPrice,
      color: '#d1d4dc',
      label: 'ANLIK FİYAT',
      dashed: true,
    },
  ];

  if (timeframe !== '1m') {
    const swings = detectSwings(candles as unknown as Candle[]);
    const lastBar = visibleBounds ? visibleBounds.last : candles.length - 1;
    const firstBar = visibleBounds ? visibleBounds.first : 0;
    const swingsUpToLast = swings.filter(s => s.confirmedAtIndex <= lastBar);
    const visibleSwings = swingsUpToLast.filter(s => s.formedAtIndex >= firstBar || s.confirmedAtIndex >= firstBar);
    const activeSwings = visibleSwings.length >= 2 ? visibleSwings : swingsUpToLast;

    const pd = calculatePremiumDiscount(candles as unknown as Candle[], activeSwings, lastBar);
    const min = (pd.rangeLow !== null && Number.isFinite(pd.rangeLow)) ? pd.rangeLow : priceRange.min;
    const max = (pd.rangeHigh !== null && Number.isFinite(pd.rangeHigh)) ? pd.rangeHigh : priceRange.max;
    const equilibrium = (min + max) / 2;
    annotations.push({
      type: 'premiumDiscount',
      min,
      max,
      equilibrium,
    });
  }

  if (candidate.poiType === 'OB') {
    const ob = candidate.poi as OrderBlock;
    annotations.push(
      {
        type: 'orderBlock',
        startIndex: ob.formedAtIndex,
        endIndex: resolveOrderBlockEndIndex(candles, ob, candidate.poiTestCount),
        high: ob.high,
        low: ob.low,
        direction: ob.direction,
        label: 'OB',
      },
      {
        type: 'bosArrow',
        index: ob.relatedEvent.breakCandleIndex,
        price: ob.relatedEvent.breakClosePrice,
        direction: ob.relatedEvent.direction,
        label: ob.relatedEvent.type,
      },
      {
        type: 'label',
        index: ob.formedAtIndex,
        price: ob.high,
        text: buildStoryLabel(candidate, timeframe),
      }
    );
    return annotations;
  }

  const fvg = candidate.poi as FVG;
  annotations.push(
    {
      type: 'fvg',
      startIndex: Math.max(0, fvg.middleCandleIndex - 1),
      endIndex: Math.min(candles.length - 1, fvg.middleCandleIndex + 1),
      high: fvg.gapHigh,
      low: fvg.gapLow,
      direction: fvg.direction,
      label: 'FVG',
    },
    {
      type: 'bosArrow',
      index: fvg.relatedEvent.breakCandleIndex,
      price: fvg.relatedEvent.breakClosePrice,
      direction: fvg.relatedEvent.direction,
      label: fvg.relatedEvent.type,
    },
    {
      type: 'label',
      index: fvg.middleCandleIndex,
      price: fvg.gapHigh,
      text: buildStoryLabel(candidate, timeframe),
    }
  );
  return annotations;
}

function buildStoryLabel(candidate: NotificationCandidate, timeframe: Timeframe): string {
  const grade = candidate.gradeResult.grade;
  if (timeframe === '1h') {
    return `1H HTF • ${humanizeBias(candidate.bias1H)} • ${humanizePd(candidate.pd1H)} • ${grade}`;
  }
  if (timeframe === '1m') {
    return `1M GİRİŞ • ${candidate.tradeDirection === 'long' ? 'AL' : 'SAT'} • ${grade}`;
  }
  return `15M KURULUM • ${candidate.poiType} • ${grade}`;
}

function humanizeBias(bias: NotificationCandidate['bias1H']): string {
  if (bias === 'bullish') return 'YUKARI';
  if (bias === 'bearish') return 'AŞAĞI';
  if (bias === 'range') return 'YATAY';
  return 'BEKLEMEDE';
}

function humanizePd(pd: NotificationCandidate['pd1H']): string {
  if (pd === 'premium') return 'PAHALI';
  if (pd === 'discount') return 'UCUZ';
  return 'DENGE';
}

function resolveOrderBlockEndIndex(candles: StoredCandle[], ob: OrderBlock, poiTestCount: number): number {
  if (poiTestCount > 0) {
    for (let i = ob.formedAtIndex + 1; i < candles.length; i++) {
      const candle = candles[i];
      if (candle.low <= ob.high && candle.high >= ob.low) return i;
    }
  }

  return Math.min(candles.length - 1, ob.formedAtIndex + 15);
}

function addPricePadding(minPrice: number, maxPrice: number, timeframe: Timeframe): { min: number; max: number } {
  if (!Number.isFinite(minPrice) || !Number.isFinite(maxPrice)) {
    return { min: 0, max: 1 };
  }

  const range = maxPrice - minPrice;
  if (range <= 0) {
    const padding = Math.max(Math.abs(minPrice) * 0.01, 0.0001);
    return { min: minPrice - padding, max: maxPrice + padding };
  }

  const paddingMultiplier = timeframe === '1m' ? 0.22 : timeframe === '1h' ? 0.10 : 0.08;
  const padding = range * paddingMultiplier;
  return { min: minPrice - padding, max: maxPrice + padding };
}

function expandToStoryPrices(
  priceRange: { min: number; max: number },
  candidate: NotificationCandidate
): { min: number; max: number } {
  const zoneHigh = candidate.poiType === 'OB'
    ? (candidate.poi as OrderBlock).high
    : (candidate.poi as FVG).gapHigh;
  const zoneLow = candidate.poiType === 'OB'
    ? (candidate.poi as OrderBlock).low
    : (candidate.poi as FVG).gapLow;

  return {
    min: Math.min(priceRange.min, zoneLow, candidate.currentPrice),
    max: Math.max(priceRange.max, zoneHigh, candidate.currentPrice),
  };
}
