import { NotificationCandidate } from '../server/pipeline';
import { RuntimeExecutionPipelineResult } from '../server/runtimeExecutionPipeline';
import { getPipSize } from './assetMetrics';

export const SIGNAL_VALIDATION_GATE_VERSION = 2 as const;

export type SignalValidationStatus = 'PASS' | 'FAIL';

export interface SignalValidationGateDecision {
  readonly version: typeof SIGNAL_VALIDATION_GATE_VERSION;
  readonly entryValidation: SignalValidationStatus;
  readonly confirmationValidation: SignalValidationStatus;
  readonly htfConsistency: SignalValidationStatus;
  readonly validationDecision: SignalValidationStatus;
  readonly rejectionReason: readonly string[];
  readonly waitReason: string | null;
}

const ENTRY_MAX_DISTANCE_PIPS = 25;
const CONFIRMATION_MAX_DISTANCE_PIPS = 15;
const ZONE_INVALIDATION_TOLERANCE_PIPS = 1;
const DEFAULT_MAX_MARKET_DATA_AGE_MS = 30 * 60 * 1000;
const MAX_FUTURE_MARKET_DATA_SKEW_MS = 16 * 60 * 1000;
const MAX_POI_AGE_MS: Readonly<Record<'15m' | '1h' | '4h', number>> = Object.freeze({
  '15m': 3 * 24 * 60 * 60 * 1000,
  '1h': 14 * 24 * 60 * 60 * 1000,
  '4h': 30 * 24 * 60 * 60 * 1000,
});

export function evaluateSignalValidationGate(
  candidate: NotificationCandidate,
  execution: RuntimeExecutionPipelineResult
): SignalValidationGateDecision {
  const rejectionReason: string[] = [];

  const entryValidation = evaluateEntryValidation(candidate, rejectionReason);
  const confirmationValidation = evaluateConfirmationValidation(candidate, rejectionReason);
  const htfConsistency = evaluateHtfConsistency(candidate, rejectionReason);

  const validationDecision: SignalValidationStatus =
    entryValidation === 'PASS' && confirmationValidation === 'PASS' && htfConsistency === 'PASS'
      ? 'PASS'
      : 'FAIL';

  const waitReason = validationDecision === 'PASS'
    ? null
    : buildWaitReason(candidate, execution, entryValidation, confirmationValidation, htfConsistency);

  return Object.freeze({
    version: SIGNAL_VALIDATION_GATE_VERSION,
    entryValidation,
    confirmationValidation,
    htfConsistency,
    validationDecision,
    rejectionReason: Object.freeze([...new Set(rejectionReason)]),
    waitReason,
  });
}

function evaluateEntryValidation(candidate: NotificationCandidate, rejectionReason: string[]): SignalValidationStatus {
  const zone = resolveZone(candidate);
  const currentPrice = candidate.currentPrice;
  const quality = candidate.signalQualityResult;

  if (candidate.marketDataTimestamp !== undefined) {
    const dataAgeMs = Date.now() - candidate.marketDataTimestamp;
    if (dataAgeMs < -MAX_FUTURE_MARKET_DATA_SKEW_MS || dataAgeMs > configuredMaxMarketDataAgeMs()) {
      rejectionReason.push('market data is stale or timestamp is invalid');
      return 'FAIL';
    }
  }

  if (!directionMatchesTrade(candidate.tradeDirection, candidate.poi.direction)) {
    rejectionReason.push('POI direction conflicts with trade direction');
    return 'FAIL';
  }

  if (!directionMatchesTrade(candidate.tradeDirection, candidate.poi.relatedEvent.direction)) {
    rejectionReason.push('structure direction conflicts with trade direction');
    return 'FAIL';
  }

  const invalidationTolerance = ZONE_INVALIDATION_TOLERANCE_PIPS * pipSize(candidate.symbol);
  // A wick/sweep may run beyond the zone. Invalidate only after the analysis
  // timeframe's completed candle closes beyond the zone by more than one pip.
  const validationClose = candidate.validationClosePrice ?? currentPrice;
  const crossedInvalidationSide =
    (candidate.tradeDirection === 'long' && validationClose < zone.low - invalidationTolerance) ||
    (candidate.tradeDirection === 'short' && validationClose > zone.high + invalidationTolerance);
  if (crossedInvalidationSide) {
    rejectionReason.push('completed candle close crossed the invalidation side of the entry zone');
    return 'FAIL';
  }

  if (quality?.status === 'invalid') {
    rejectionReason.push('setup invalidated by signal quality analysis');
    return 'FAIL';
  }

  if (quality?.metrics.invalidationRisk === 'high') {
    rejectionReason.push('setup invalidation risk is high');
  }

  if ((quality?.metrics.poiTestCount ?? candidate.poiTestCount) >= 3) {
    rejectionReason.push('entry zone over-tested');
    return 'FAIL';
  }

  if (!candidate.gradeResult.entryAllowed) {
    rejectionReason.push('grade engine did not permit entry');
    return 'FAIL';
  }

  return 'PASS';
}

function evaluateConfirmationValidation(candidate: NotificationCandidate, rejectionReason: string[]): SignalValidationStatus {
  const quality = candidate.signalQualityResult;

  if (quality?.status === 'invalid') {
    rejectionReason.push('manual confirmation window is no longer valid');
    return 'FAIL';
  }

  return 'PASS';
}

function evaluateHtfConsistency(candidate: NotificationCandidate, rejectionReason: string[]): SignalValidationStatus {
  const direction = candidate.tradeDirection;
  const bias4H = candidate.bias4H;
  const bias1H = candidate.bias1H;

  const directionMatches4H =
    (direction === 'long' && bias4H === 'bullish') ||
    (direction === 'short' && bias4H === 'bearish');

  const htf1HConflict =
    (direction === 'long' && bias1H === 'bearish') ||
    (direction === 'short' && bias1H === 'bullish');

  if (!directionMatches4H) {
    rejectionReason.push('HTF bias does not match trade direction');
    return 'FAIL';
  }

  if (htf1HConflict && candidate.gradeResult.blockReasons.some(r => r.includes('1H bias is not aligned'))) {
    rejectionReason.push('1H trend conflicts with HTF direction for continuation model');
    return 'FAIL';
  }

  const direct4HPdConflict =
    (direction === 'long' && candidate.pd4H === 'premium') ||
    (direction === 'short' && candidate.pd4H === 'discount');
  if (direct4HPdConflict) {
    rejectionReason.push('4H premium/discount context conflicts with the trade');
    return 'FAIL';
  }

  return 'PASS';
}

function buildWaitReason(
  candidate: NotificationCandidate,
  execution: RuntimeExecutionPipelineResult,
  entryValidation: SignalValidationStatus,
  confirmationValidation: SignalValidationStatus,
  htfConsistency: SignalValidationStatus
): string {
  if (entryValidation === 'FAIL') {
    return 'WAIT removed: entry is no longer actionable.';
  }
  if (confirmationValidation === 'FAIL') {
    return 'WAIT removed: manual confirmation is no longer reachable.';
  }
  if (htfConsistency === 'FAIL') {
    return 'WAIT removed: HTF context no longer matches the setup.';
  }
  if (execution.decisionCalibration.status !== 'ELIGIBLE') {
    return 'WAIT removed: runtime decision calibration is not eligible.';
  }
  return `WAIT confirmed for ${candidate.tradeDirection.toUpperCase()} setup.`;
}

function resolveZone(candidate: NotificationCandidate): { low: number; high: number } {
  if (candidate.poiType === 'OB') {
    const ob = candidate.poi as { low: number; high: number };
    return { low: ob.low, high: ob.high };
  }
  const fvg = candidate.poi as { gapLow: number; gapHigh: number };
  return { low: fvg.gapLow, high: fvg.gapHigh };
}

function distanceToZonePips(candidate: NotificationCandidate, low: number, high: number): number {
  const size = pipSize(candidate.symbol);
  if (candidate.currentPrice >= low && candidate.currentPrice <= high) return 0;
  if (candidate.currentPrice > high) return (candidate.currentPrice - high) / size;
  return (low - candidate.currentPrice) / size;
}

function pipSize(symbol: string): number {
  return getPipSize(symbol);
}

function directionMatchesTrade(tradeDirection: 'long' | 'short', direction: 'bullish' | 'bearish'): boolean {
  return (tradeDirection === 'long' && direction === 'bullish') ||
    (tradeDirection === 'short' && direction === 'bearish');
}

function configuredMaxMarketDataAgeMs(): number {
  const configuredMinutes = Number(process.env.MAX_SIGNAL_DATA_AGE_MINUTES ?? 30);
  if (!Number.isFinite(configuredMinutes) || configuredMinutes <= 0) {
    return DEFAULT_MAX_MARKET_DATA_AGE_MS;
  }
  return configuredMinutes * 60 * 1000;
}
