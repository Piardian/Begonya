import { FVG, OrderBlock } from './types';

export const SIGNAL_QUALITY_RESULT_VERSION = 1 as const;
export const SIGNAL_QUALITY_REASON_SOURCE = 'SignalQualityEngine' as const;

export type SignalQualityStatus = 'excellent' | 'good' | 'risky' | 'invalid';
export type SignalQualitySeverity = 'info' | 'warning' | 'critical';
export type SignalQualitySession = 'asian' | 'london' | 'new_york' | 'overlap' | 'off_session';
export type PoiRelation = 'inside' | 'above' | 'below';
export type InvalidationRisk = 'low' | 'medium' | 'high';

export interface SignalQualityReason {
  code: string;
  severity: SignalQualitySeverity;
  source: typeof SIGNAL_QUALITY_REASON_SOURCE;
  message: string;
  value?: number | string | boolean;
}

export interface SignalQualityResult {
  version: typeof SIGNAL_QUALITY_RESULT_VERSION;
  score: number;
  confidence: number;
  status: SignalQualityStatus;
  metrics: {
    barsSinceFormation: number;
    barsSinceBreak: number;
    distanceToPoiPips: number;
    poiRelation: PoiRelation;
    poiTestCount: number;
    isFresh: boolean;
    isNearPoi: boolean;
    invalidationRisk: InvalidationRisk;
  };
  marketContext: {
    session: SignalQualitySession;
    killzone: boolean;
    dayOfWeek: number;
    hourTR: number;
  };
  reasons: SignalQualityReason[];
  warnings: SignalQualityReason[];
}

export interface SignalQualityInput {
  poiType: 'OB' | 'FVG';
  poi: OrderBlock | FVG;
  currentIndex: number;
  currentPrice: number;
  currentTimestamp: number;
  poiTestCount: number;
}

const PIP_SIZE = 0.0001;
const FRESH_BARS_LIMIT = 24;
const STALE_BARS_LIMIT = 72;
const NEAR_POI_PIPS = 15;
const FAR_POI_PIPS = 50;

export function evaluateSignalQuality(input: SignalQualityInput): SignalQualityResult {
  const zone = resolvePoiZone(input.poiType, input.poi);
  const barsSinceFormation = Math.max(0, input.currentIndex - zone.formedAtIndex);
  const barsSinceBreak = Math.max(0, input.currentIndex - zone.breakCandleIndex);
  const distanceToPoiPips = roundToOneDecimal(calculateDistanceToZonePips(input.currentPrice, zone.high, zone.low));
  const poiRelation = resolvePoiRelation(input.currentPrice, zone.high, zone.low);
  const isFresh = barsSinceFormation <= FRESH_BARS_LIMIT;
  const isNearPoi = distanceToPoiPips <= NEAR_POI_PIPS;
  const invalidationRisk = resolveInvalidationRisk(input.poiTestCount, barsSinceFormation, distanceToPoiPips);
  const marketContext = resolveMarketContext(input.currentTimestamp);

  const reasons: SignalQualityReason[] = [];
  const warnings: SignalQualityReason[] = [];

  if (isFresh) {
    reasons.push(reason('FRESH_POI', 'info', 'POI is fresh.', barsSinceFormation));
  } else if (barsSinceFormation > STALE_BARS_LIMIT) {
    warnings.push(reason('STALE_POI', 'warning', 'POI is old and should be monitored carefully.', barsSinceFormation));
  }

  if (poiRelation === 'inside') {
    reasons.push(reason('PRICE_INSIDE_POI', 'info', 'Current price is inside the POI zone.', true));
  } else if (isNearPoi) {
    reasons.push(reason('PRICE_NEAR_POI', 'info', 'Current price is near the POI zone.', distanceToPoiPips));
  } else if (distanceToPoiPips >= FAR_POI_PIPS) {
    warnings.push(reason('PRICE_FAR_FROM_POI', 'warning', 'Current price is far from the POI zone.', distanceToPoiPips));
  }

  if (input.poiTestCount === 0) {
    reasons.push(reason('UNTESTED_POI', 'info', 'POI has not been retested yet.', 0));
  } else if (input.poiTestCount >= 3) {
    warnings.push(reason('OVERTESTED_POI', 'critical', 'POI has been tested three or more times.', input.poiTestCount));
  } else {
    warnings.push(reason('RETESTED_POI', 'warning', 'POI has already been retested.', input.poiTestCount));
  }

  if (marketContext.killzone) {
    reasons.push(reason('KILLZONE_ACTIVE', 'info', 'Signal is inside a configured trading killzone.', marketContext.session));
  } else {
    warnings.push(reason('OUTSIDE_KILLZONE', 'warning', 'Signal is outside configured trading killzones.', marketContext.session));
  }

  const score = clampScore(
    50 +
      (isFresh ? 15 : barsSinceFormation > STALE_BARS_LIMIT ? -20 : 0) +
      (isNearPoi ? 10 : distanceToPoiPips >= FAR_POI_PIPS ? -10 : 0) +
      (input.poiTestCount === 0 ? 10 : input.poiTestCount === 1 ? 0 : input.poiTestCount === 2 ? -10 : -25) +
      (marketContext.killzone ? 10 : -5)
  );
  const confidence = clampScore(
    60 +
      (input.currentIndex >= 100 ? 10 : input.currentIndex >= 30 ? 5 : -10) +
      (barsSinceBreak >= 0 ? 5 : -10) +
      (marketContext.session === 'off_session' ? -10 : 5) -
      warnings.filter(w => w.severity === 'critical').length * 20
  );
  const status = resolveStatus(score, warnings);

  return {
    version: SIGNAL_QUALITY_RESULT_VERSION,
    score,
    confidence,
    status,
    metrics: {
      barsSinceFormation,
      barsSinceBreak,
      distanceToPoiPips,
      poiRelation,
      poiTestCount: input.poiTestCount,
      isFresh,
      isNearPoi,
      invalidationRisk,
    },
    marketContext,
    reasons,
    warnings,
  };
}

function resolvePoiZone(poiType: 'OB' | 'FVG', poi: OrderBlock | FVG): {
  high: number;
  low: number;
  formedAtIndex: number;
  breakCandleIndex: number;
} {
  if (poiType === 'OB') {
    const ob = poi as OrderBlock;
    return {
      high: ob.high,
      low: ob.low,
      formedAtIndex: ob.formedAtIndex,
      breakCandleIndex: ob.relatedEvent.breakCandleIndex,
    };
  }

  const fvg = poi as FVG;
  return {
    high: fvg.gapHigh,
    low: fvg.gapLow,
    formedAtIndex: fvg.middleCandleIndex,
    breakCandleIndex: fvg.relatedEvent.breakCandleIndex,
  };
}

function calculateDistanceToZonePips(price: number, zoneHigh: number, zoneLow: number): number {
  if (price >= zoneLow && price <= zoneHigh) return 0;
  if (price > zoneHigh) return (price - zoneHigh) / PIP_SIZE;
  return (zoneLow - price) / PIP_SIZE;
}

function resolvePoiRelation(price: number, zoneHigh: number, zoneLow: number): PoiRelation {
  if (price >= zoneLow && price <= zoneHigh) return 'inside';
  return price > zoneHigh ? 'above' : 'below';
}

function resolveInvalidationRisk(
  poiTestCount: number,
  barsSinceFormation: number,
  distanceToPoiPips: number
): InvalidationRisk {
  if (poiTestCount >= 3 || barsSinceFormation > STALE_BARS_LIMIT) return 'high';
  if (poiTestCount === 2 || distanceToPoiPips >= FAR_POI_PIPS || barsSinceFormation > FRESH_BARS_LIMIT) return 'medium';
  return 'low';
}

function resolveMarketContext(timestamp: number): SignalQualityResult['marketContext'] {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Istanbul',
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(new Date(timestamp));

  const weekday = parts.find(p => p.type === 'weekday')?.value ?? 'Sun';
  let hourTR = Number(parts.find(p => p.type === 'hour')?.value ?? 0);
  if (hourTR === 24) hourTR = 0;

  const dayOfWeek = weekdayToNumber(weekday);
  const session = resolveSession(hourTR);
  const killzone = dayOfWeek >= 1 && dayOfWeek <= 5 && ((hourTR >= 10 && hourTR < 13) || (hourTR >= 15 && hourTR < 19));

  return {
    session,
    killzone,
    dayOfWeek,
    hourTR,
  };
}

function resolveSession(hourTR: number): SignalQualitySession {
  if (hourTR >= 10 && hourTR < 13) return 'london';
  if (hourTR >= 15 && hourTR < 19) return 'new_york';
  if (hourTR >= 13 && hourTR < 15) return 'overlap';
  if (hourTR >= 3 && hourTR < 10) return 'asian';
  return 'off_session';
}

function weekdayToNumber(weekday: string): number {
  const map: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 0,
  };
  return map[weekday] ?? 0;
}

function resolveStatus(score: number, warnings: SignalQualityReason[]): SignalQualityStatus {
  if (warnings.some(w => w.severity === 'critical')) return 'invalid';
  if (score >= 80) return 'excellent';
  if (score >= 60) return 'good';
  return 'risky';
}

function reason(
  code: string,
  severity: SignalQualitySeverity,
  message: string,
  value?: number | string | boolean
): SignalQualityReason {
  return {
    code,
    severity,
    source: SIGNAL_QUALITY_REASON_SOURCE,
    message,
    value,
  };
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}
