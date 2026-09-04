import { StoredCandle, Timeframe } from './candleStore';
import { NotificationCandidate } from './pipeline';
import { FVG, OrderBlock } from '../src/types';
import { PresentationAssessment } from '../src/presentationAssessment';

export const SMART_SCREENSHOT_ENGINE_VERSION = 'SmartScreenshotEngine.v1' as const;

export interface SmartScreenshotPlan {
  readonly version: typeof SMART_SCREENSHOT_ENGINE_VERSION;
  readonly timeframe: Timeframe;
  readonly focusIndex: number;
  readonly anchorIndices: readonly number[];
  readonly visibleBars: number;
  readonly visibleRange: {
    readonly from: number;
    readonly to: number;
  };
  readonly padding: {
    readonly leftBars: number;
    readonly rightBars: number;
  };
  readonly reasons: readonly string[];
  readonly warnings: readonly string[];
}

const MIN_VISIBLE_BARS = 48;
const MAX_VISIBLE_BARS = 140;
const TARGET_VISIBLE_BARS_BY_TIMEFRAME: Partial<Record<Timeframe, number>> = {
  '1m': 130,
  '15m': 96,
  '1h': 84,
  '4h': 72,
};

export function createSmartScreenshotPlan(
  candles: readonly StoredCandle[],
  candidate: NotificationCandidate,
  timeframe: Timeframe,
  requestedVisibleBars = 100,
  assessment?: PresentationAssessment
): SmartScreenshotPlan {
  if (!candles.length) {
    return {
      version: SMART_SCREENSHOT_ENGINE_VERSION,
      timeframe,
      focusIndex: 0,
      anchorIndices: [],
      visibleBars: 0,
      visibleRange: { from: 0, to: 0 },
      padding: { leftBars: 0, rightBars: 0 },
      reasons: ['No candles available; screenshot plan is empty.'],
      warnings: ['NO_CANDLES'],
    };
  }

  const anchors = resolveAnchorIndices(candidate, candles.length);
  const focusIndex = weightedFocusIndex(anchors, candles.length);
  const baseTarget = TARGET_VISIBLE_BARS_BY_TIMEFRAME[timeframe] ?? requestedVisibleBars;
  const visibleBars = clampVisibleBars(adaptVisibleBars(baseTarget, requestedVisibleBars, assessment), candles.length);
  const padding = resolveDynamicPadding(visibleBars, focusIndex, candles.length);
  const visibleRange = visibleRangeAroundFocus(focusIndex, visibleBars, candles.length, padding.leftBars, padding.rightBars);
  const warnings = validatePlanVisibility(anchors, visibleRange);

  return {
    version: SMART_SCREENSHOT_ENGINE_VERSION,
    timeframe,
    focusIndex,
    anchorIndices: anchors,
    visibleBars,
    visibleRange,
    padding,
    reasons: [
      'Centered screenshot around setup anchors.',
      `Targeted ${visibleBars} visible candles for ${timeframe}.`,
      assessment ? 'PresentationAssessment feedback was applied.' : 'Initial smart framing was applied.',
    ],
    warnings,
  };
}

export function refineSmartScreenshotPlan(
  plan: SmartScreenshotPlan,
  candlesLength: number,
  assessment: PresentationAssessment
): SmartScreenshotPlan {
  if (candlesLength <= 0) return plan;

  const nextVisibleBars = clampVisibleBars(adaptVisibleBars(plan.visibleBars, plan.visibleBars, assessment), candlesLength);
  const padding = resolveDynamicPadding(nextVisibleBars, plan.focusIndex, candlesLength);
  const visibleRange = visibleRangeAroundFocus(plan.focusIndex, nextVisibleBars, candlesLength, padding.leftBars, padding.rightBars);
  const warnings = validatePlanVisibility(plan.anchorIndices, visibleRange);

  return {
    ...plan,
    visibleBars: nextVisibleBars,
    visibleRange,
    padding,
    reasons: [...plan.reasons, 'Refined screenshot range from PresentationAssessment warnings.'],
    warnings,
  };
}

function resolveAnchorIndices(candidate: NotificationCandidate, candlesLength: number): number[] {
  const poi = candidate.poi as any;
  const anchors = new Set<number>();

  if (candidate.poiType === 'OB') {
    const ob = candidate.poi as OrderBlock;
    anchors.add(ob.formedAtIndex);
    anchors.add(ob.candleIndex);
    anchors.add(ob.relatedEvent.breakCandleIndex);
    anchors.add(Math.max(0, ob.formedAtIndex - 6));
  } else {
    const fvg = candidate.poi as FVG;
    anchors.add(Math.max(0, fvg.middleCandleIndex - 1));
    anchors.add(fvg.middleCandleIndex);
    anchors.add(Math.min(candlesLength - 1, fvg.middleCandleIndex + 1));
    anchors.add(fvg.relatedEvent.breakCandleIndex);
    anchors.add(Math.max(0, fvg.middleCandleIndex - 6));
  }

  if (typeof poi?.relatedEvent?.breakCandleIndex === 'number') anchors.add(poi.relatedEvent.breakCandleIndex);
  anchors.add(candlesLength - 1);

  return [...anchors]
    .filter(index => Number.isFinite(index))
    .map(index => Math.max(0, Math.min(candlesLength - 1, Math.round(index))))
    .sort((a, b) => a - b);
}

function weightedFocusIndex(anchors: readonly number[], candlesLength: number): number {
  if (!anchors.length) return candlesLength - 1;
  const latestAnchor = anchors[anchors.length - 1];
  const averageAnchor = anchors.reduce((sum, index) => sum + index, 0) / anchors.length;
  return Math.round((averageAnchor * 0.35) + (latestAnchor * 0.65));
}

function adaptVisibleBars(
  baseTarget: number,
  requestedVisibleBars: number,
  assessment?: PresentationAssessment
): number {
  let visibleBars = Math.round((baseTarget + requestedVisibleBars) / 2);
  if (!assessment) return visibleBars;

  if (assessment.warnings.some(warning => warning.includes('Too few visible candles'))) visibleBars += 18;
  if (assessment.warnings.some(warning => warning.includes('Too many visible candles'))) visibleBars -= 16;
  if (assessment.visibility === 'Weak' || assessment.composition === 'Weak') visibleBars += 12;
  if (assessment.readability === 'Weak') visibleBars -= 8;

  return visibleBars;
}

function clampVisibleBars(visibleBars: number, candlesLength: number): number {
  return Math.max(1, Math.min(candlesLength, Math.max(MIN_VISIBLE_BARS, Math.min(MAX_VISIBLE_BARS, visibleBars))));
}

function resolveDynamicPadding(visibleBars: number, focusIndex: number, candlesLength: number): { leftBars: number; rightBars: number } {
  const rightBias = focusIndex > candlesLength * 0.72 ? 0.24 : 0.16;
  const rightBars = Math.max(10, Math.round(visibleBars * rightBias));
  const leftBars = Math.max(18, visibleBars - rightBars - 1);
  return { leftBars, rightBars };
}

function visibleRangeAroundFocus(
  focusIndex: number,
  visibleBars: number,
  length: number,
  leftBars: number,
  rightBars: number
): { from: number; to: number } {
  const rawFrom = focusIndex - leftBars;
  const rawTo = focusIndex + rightBars;
  let from = Math.max(0, rawFrom);
  let to = Math.min(length - 1, rawTo);

  const missingLeft = Math.max(0, 0 - rawFrom);
  const missingRight = Math.max(0, rawTo - (length - 1));
  from = Math.max(0, from - missingRight);
  to = Math.min(length - 1, to + missingLeft);

  const currentCount = to - from + 1;
  if (currentCount < visibleBars) {
    to = Math.min(length - 1, from + visibleBars - 1);
    from = Math.max(0, to - visibleBars + 1);
  }

  return { from, to };
}

function validatePlanVisibility(anchorIndices: readonly number[], visibleRange: { from: number; to: number }): string[] {
  const warnings: string[] = [];
  const hiddenAnchors = anchorIndices.filter(index => index < visibleRange.from || index > visibleRange.to);
  if (hiddenAnchors.length) warnings.push(`ANCHORS_OUTSIDE_VIEW:${hiddenAnchors.join(',')}`);
  return warnings;
}
