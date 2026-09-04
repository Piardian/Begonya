import { SignalIntelligenceSnapshot } from './signalIntelligenceSnapshot';
import { Candle } from './types';
import {
  OUTCOME_RESULT_VERSION,
  OutcomeLabelingConfig,
  OutcomeReason,
  OutcomeResult,
  OutcomeStatus,
} from './outcomeResult';

export interface OutcomeLabelInput {
  snapshot: SignalIntelligenceSnapshot;
  futureCandles: Candle[];
  config: OutcomeLabelingConfig;
}

const PIP_SIZE = 0.0001;

export function labelOutcome(input: OutcomeLabelInput): OutcomeResult {
  const { snapshot, futureCandles, config } = input;
  const evaluationWindow = futureCandles.slice(0, Math.max(0, config.expiryBars));
  const entryPrice = snapshot.candidate.currentPrice;
  const direction = snapshot.candidate.tradeDirection;
  const levels = resolveLevels(entryPrice, direction, config);

  let maxFavorableExcursionPips = 0;
  let maxAdverseExcursionPips = 0;

  for (let index = 0; index < evaluationWindow.length; index++) {
    const candle = evaluationWindow[index];
    const excursion = calculateExcursion(candle, entryPrice, direction);
    maxFavorableExcursionPips = Math.max(maxFavorableExcursionPips, excursion.favorable);
    maxAdverseExcursionPips = Math.max(maxAdverseExcursionPips, excursion.adverse);

    const hitState = evaluateCandleHits(candle, levels, direction, config.breakEvenPips !== undefined);
    const status = resolveHitStatus(hitState, config.sameCandleCollisionPolicy);

    if (status !== null) {
      return buildOutcome({
        snapshot,
        config,
        status,
        evaluatedCandles: index + 1,
        startTimestamp: getStartTimestamp(snapshot, evaluationWindow),
        endTimestamp: candle.timestamp,
        resolvedAtTimestamp: candle.timestamp,
        resolvedAtIndex: index,
        maxFavorableExcursionPips,
        maxAdverseExcursionPips,
        evaluationCompleted: true,
      });
    }
  }

  if (futureCandles.length < config.expiryBars) {
    return buildOutcome({
      snapshot,
      config,
      status: 'UNKNOWN',
      evaluatedCandles: evaluationWindow.length,
      startTimestamp: getStartTimestamp(snapshot, evaluationWindow),
      endTimestamp: evaluationWindow.length > 0 ? evaluationWindow[evaluationWindow.length - 1].timestamp : null,
      resolvedAtTimestamp: null,
      resolvedAtIndex: null,
      maxFavorableExcursionPips,
      maxAdverseExcursionPips,
      evaluationCompleted: false,
    });
  }

  return buildOutcome({
    snapshot,
    config,
    status: 'EXPIRED',
    evaluatedCandles: evaluationWindow.length,
    startTimestamp: getStartTimestamp(snapshot, evaluationWindow),
    endTimestamp: evaluationWindow.length > 0 ? evaluationWindow[evaluationWindow.length - 1].timestamp : null,
    resolvedAtTimestamp: null,
    resolvedAtIndex: null,
    maxFavorableExcursionPips,
    maxAdverseExcursionPips,
    evaluationCompleted: true,
  });
}

function resolveLevels(
  entryPrice: number,
  direction: 'long' | 'short',
  config: OutcomeLabelingConfig
): { takeProfit: number; stopLoss: number; breakEven: number | null } {
  const tpDistance = config.takeProfitPips * PIP_SIZE;
  const slDistance = config.stopLossPips * PIP_SIZE;
  const beDistance = config.breakEvenPips !== undefined ? config.breakEvenPips * PIP_SIZE : null;

  if (direction === 'long') {
    return {
      takeProfit: entryPrice + tpDistance,
      stopLoss: entryPrice - slDistance,
      breakEven: beDistance === null ? null : entryPrice + beDistance,
    };
  }

  return {
    takeProfit: entryPrice - tpDistance,
    stopLoss: entryPrice + slDistance,
    breakEven: beDistance === null ? null : entryPrice - beDistance,
  };
}

function calculateExcursion(
  candle: Candle,
  entryPrice: number,
  direction: 'long' | 'short'
): { favorable: number; adverse: number } {
  if (direction === 'long') {
    return {
      favorable: roundPips((candle.high - entryPrice) / PIP_SIZE),
      adverse: roundPips((entryPrice - candle.low) / PIP_SIZE),
    };
  }

  return {
    favorable: roundPips((entryPrice - candle.low) / PIP_SIZE),
    adverse: roundPips((candle.high - entryPrice) / PIP_SIZE),
  };
}

function evaluateCandleHits(
  candle: Candle,
  levels: { takeProfit: number; stopLoss: number; breakEven: number | null },
  direction: 'long' | 'short',
  breakEvenEnabled: boolean
): { tp: boolean; sl: boolean; be: boolean } {
  if (direction === 'long') {
    return {
      tp: candle.high >= levels.takeProfit,
      sl: candle.low <= levels.stopLoss,
      be: breakEvenEnabled && levels.breakEven !== null && candle.high >= levels.breakEven,
    };
  }

  return {
    tp: candle.low <= levels.takeProfit,
    sl: candle.high >= levels.stopLoss,
    be: breakEvenEnabled && levels.breakEven !== null && candle.low <= levels.breakEven,
  };
}

function resolveHitStatus(
  hitState: { tp: boolean; sl: boolean; be: boolean },
  policy: OutcomeLabelingConfig['sameCandleCollisionPolicy']
): OutcomeStatus | null {
  if (hitState.tp && hitState.sl) {
    if (policy === 'TP_FIRST') return 'TP';
    if (policy === 'UNKNOWN') return 'UNKNOWN';
    return 'SL';
  }

  if (hitState.sl) return 'SL';
  if (hitState.tp) return 'TP';
  if (hitState.be) return 'BE';
  return null;
}

function buildOutcome(input: {
  snapshot: SignalIntelligenceSnapshot;
  config: OutcomeLabelingConfig;
  status: OutcomeStatus;
  evaluatedCandles: number;
  startTimestamp: number;
  endTimestamp: number | null;
  resolvedAtTimestamp: number | null;
  resolvedAtIndex: number | null;
  maxFavorableExcursionPips: number;
  maxAdverseExcursionPips: number;
  evaluationCompleted: boolean;
}): OutcomeResult {
  const reason = resolveReason(input.status);
  const labeledAtSource = input.resolvedAtTimestamp ?? input.endTimestamp ?? input.startTimestamp;

  return {
    outcomeVersion: OUTCOME_RESULT_VERSION,
    candidateId: input.snapshot.candidateId,
    labeledAt: new Date(labeledAtSource).toISOString(),
    outcomeStatus: input.status,
    completionReason: reason.completionReason,
    reason: reason.reason,
    metadata: {
      labelingConfigVersion: input.config.version,
      evaluatedCandles: input.evaluatedCandles,
      startTimestamp: input.startTimestamp,
      endTimestamp: input.endTimestamp,
      resolvedAtTimestamp: input.resolvedAtTimestamp,
      resolvedAtIndex: input.resolvedAtIndex,
      maxFavorableExcursionPips: roundPips(input.maxFavorableExcursionPips),
      maxAdverseExcursionPips: roundPips(input.maxAdverseExcursionPips),
      evaluationDurationBars: input.evaluatedCandles,
      evaluationCompleted: input.evaluationCompleted,
    },
  };
}

function resolveReason(status: OutcomeStatus): {
  completionReason: OutcomeResult['completionReason'];
  reason: OutcomeReason;
} {
  if (status === 'TP') {
    return {
      completionReason: 'take_profit_hit',
      reason: {
        reasonCode: 'TAKE_PROFIT_LEVEL_REACHED',
        reasonMessage: 'Take profit level was reached within the evaluation window.',
      },
    };
  }

  if (status === 'SL') {
    return {
      completionReason: 'stop_loss_hit',
      reason: {
        reasonCode: 'STOP_LOSS_LEVEL_REACHED',
        reasonMessage: 'Stop loss level was reached within the evaluation window.',
      },
    };
  }

  if (status === 'BE') {
    return {
      completionReason: 'break_even_reached',
      reason: {
        reasonCode: 'BREAK_EVEN_LEVEL_REACHED',
        reasonMessage: 'Break-even level was reached within the evaluation window.',
      },
    };
  }

  if (status === 'UNKNOWN') {
    return {
      completionReason: 'insufficient_future_data',
      reason: {
        reasonCode: 'INSUFFICIENT_FUTURE_DATA',
        reasonMessage: 'There is not enough future candle data to complete the evaluation window.',
      },
    };
  }

  return {
    completionReason: 'expired_without_resolution',
    reason: {
      reasonCode: 'EXPIRED_WITHOUT_RESOLUTION',
      reasonMessage: 'Evaluation window completed without TP, SL, or BE resolution.',
    },
  };
}

function getStartTimestamp(snapshot: SignalIntelligenceSnapshot, candles: readonly Candle[]): number {
  return candles.length > 0 ? candles[0].timestamp : Date.parse(snapshot.timestamp);
}

function roundPips(value: number): number {
  return Math.round(Math.max(0, value) * 10) / 10;
}
