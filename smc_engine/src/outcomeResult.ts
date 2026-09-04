export const OUTCOME_RESULT_VERSION = 1 as const;
export const OUTCOME_LABELING_CONFIG_VERSION = 1 as const;

export type OutcomeStatus = 'TP' | 'SL' | 'BE' | 'EXPIRED' | 'UNKNOWN';

export type OutcomeCompletionReason =
  | 'take_profit_hit'
  | 'stop_loss_hit'
  | 'break_even_reached'
  | 'expired_without_resolution'
  | 'insufficient_future_data'
  | 'same_candle_collision_unknown';

export type OutcomeReasonCode =
  | 'TAKE_PROFIT_LEVEL_REACHED'
  | 'STOP_LOSS_LEVEL_REACHED'
  | 'BREAK_EVEN_LEVEL_REACHED'
  | 'EXPIRED_WITHOUT_RESOLUTION'
  | 'INSUFFICIENT_FUTURE_DATA'
  | 'SAME_CANDLE_COLLISION_UNKNOWN';

export type SameCandleCollisionPolicy = 'SL_FIRST' | 'TP_FIRST' | 'UNKNOWN';

export interface OutcomeReason {
  reasonCode: OutcomeReasonCode;
  reasonMessage: string;
}

export interface OutcomeLabelingConfig {
  version: typeof OUTCOME_LABELING_CONFIG_VERSION;
  takeProfitPips: number;
  stopLossPips: number;
  breakEvenPips?: number;
  expiryBars: number;
  sameCandleCollisionPolicy: SameCandleCollisionPolicy;
}

export interface OutcomeEvaluationMetadata {
  labelingConfigVersion: typeof OUTCOME_LABELING_CONFIG_VERSION;
  evaluatedCandles: number;
  startTimestamp: number;
  endTimestamp: number | null;
  resolvedAtTimestamp: number | null;
  resolvedAtIndex: number | null;
  maxFavorableExcursionPips: number;
  maxAdverseExcursionPips: number;
  evaluationDurationBars: number;
  evaluationCompleted: boolean;
}

export interface OutcomeResult {
  outcomeVersion: typeof OUTCOME_RESULT_VERSION;
  candidateId: string;
  labeledAt: string;
  outcomeStatus: OutcomeStatus;
  completionReason: OutcomeCompletionReason;
  reason: OutcomeReason;
  metadata: OutcomeEvaluationMetadata;
}
