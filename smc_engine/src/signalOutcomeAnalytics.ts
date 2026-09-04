import { TrackedSignalOutcome, TrackedSignalOutcomeStatus } from './signalOutcomeTracking';

export const SIGNAL_OUTCOME_ANALYTICS_VERSION = 1 as const;

type Distribution = Readonly<Record<string, number>>;

export interface SignalOutcomeAnalyticsReport {
  readonly version: typeof SIGNAL_OUTCOME_ANALYTICS_VERSION;
  readonly totals: {
    readonly totalSignals: number;
    readonly totalEligible: number;
    readonly totalWait: number;
    readonly totalFiltered: number;
    readonly triggeredCount: number;
    readonly executedCount: number;
    readonly takeProfit: number;
    readonly stopLoss: number;
    readonly breakEven: number;
    readonly expired: number;
    readonly invalidated: number;
    readonly cancelled: number;
  };
  readonly reports: {
    readonly winRate: number;
    readonly averageHoldingTimeMs: number;
    readonly averageMfePips: number;
    readonly averageMaePips: number;
    readonly outcomeDistribution: Distribution;
    readonly gradeDistribution: Distribution;
    readonly decisionDistribution: Distribution;
    readonly riskDistribution: Distribution;
  };
  readonly breakdowns: {
    readonly byGrade: Distribution;
    readonly byPair: Distribution;
    readonly byPoi: Distribution;
    readonly bySession: Distribution;
    readonly byHtfBias: Distribution;
    readonly byPremiumDiscount: Distribution;
  };
}

export function calculateSignalOutcomeAnalytics(
  outcomes: readonly TrackedSignalOutcome[]
): SignalOutcomeAnalyticsReport {
  const closedOutcomes = outcomes.filter(outcome => outcome.closedAt !== null);
  const wins = outcomes.filter(outcome => outcome.outcome === 'TAKE_PROFIT').length;
  const losses = outcomes.filter(outcome => outcome.outcome === 'STOP_LOSS').length;
  const winRateBase = wins + losses;

  return Object.freeze({
    version: SIGNAL_OUTCOME_ANALYTICS_VERSION,
    totals: Object.freeze({
      totalSignals: outcomes.length,
      totalEligible: outcomes.filter(outcome => outcome.decision === 'ELIGIBLE').length,
      totalWait: outcomes.filter(outcome => outcome.decision === 'WAIT').length,
      totalFiltered: outcomes.filter(outcome => outcome.decision === 'FILTERED').length,
      triggeredCount: outcomes.filter(outcome => outcome.triggered).length,
      executedCount: outcomes.filter(outcome => outcome.lifecycle.states.includes('OPEN')).length,
      takeProfit: wins,
      stopLoss: losses,
      breakEven: outcomes.filter(outcome => outcome.outcome === 'BREAK_EVEN').length,
      expired: outcomes.filter(outcome => outcome.outcome === 'EXPIRED').length,
      invalidated: outcomes.filter(outcome => outcome.outcome === 'INVALIDATED').length,
      cancelled: outcomes.filter(outcome => outcome.outcome === 'CANCELLED').length,
    }),
    reports: Object.freeze({
      winRate: winRateBase === 0 ? 0 : roundRate(wins / winRateBase),
      averageHoldingTimeMs: average(closedOutcomes.map(outcome => outcome.holdingTimeMs ?? 0)),
      averageMfePips: average(outcomes.map(outcome => outcome.maximumFavorableExcursionPips)),
      averageMaePips: average(outcomes.map(outcome => outcome.maximumAdverseExcursionPips)),
      outcomeDistribution: distribution(outcomes.map(outcome => outcome.outcome)),
      gradeDistribution: distribution(outcomes.map(outcome => outcome.grade)),
      decisionDistribution: distribution(outcomes.map(outcome => outcome.decision)),
      riskDistribution: distribution(outcomes.map(outcome => outcome.riskResult)),
    }),
    breakdowns: Object.freeze({
      byGrade: distribution(outcomes.map(outcome => outcome.grade)),
      byPair: distribution(outcomes.map(outcome => outcome.pair)),
      byPoi: distribution(outcomes.map(outcome => outcome.poiType)),
      bySession: distribution(outcomes.map(outcome => outcome.session)),
      byHtfBias: distribution(outcomes.map(outcome => outcome.htfBias)),
      byPremiumDiscount: distribution(outcomes.map(outcome => outcome.premiumDiscount)),
    }),
  });
}

function distribution(values: readonly string[]): Distribution {
  const result: Record<string, number> = {};
  for (const value of values) {
    result[value] = (result[value] ?? 0) + 1;
  }
  return Object.freeze(result);
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

function roundRate(value: number): number {
  return Math.round(value * 10000) / 10000;
}
