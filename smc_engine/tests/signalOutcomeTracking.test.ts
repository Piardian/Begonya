import { validateSignalLifecycleTransition } from '../src/signalLifecycleStateMachine';
import { createTrackedSignalOutcome } from '../src/signalOutcomeTracking';
import { calculateSignalOutcomeAnalytics } from '../src/signalOutcomeAnalytics';

describe('RC-4 Signal Outcome Tracking', () => {
  test('validates lifecycle transitions and rejects impossible jumps', () => {
    expect(validateSignalLifecycleTransition('DETECTED', 'GRADED').valid).toBe(true);
    expect(validateSignalLifecycleTransition('DETECTED', 'STOP_LOSS').valid).toBe(false);
    expect(validateSignalLifecycleTransition('OPEN', 'TAKE_PROFIT').valid).toBe(true);
  });

  test('creates immutable tracked TP outcome for one Signal ID', () => {
    const outcome = createTrackedSignalOutcome(buildOutcome({ outcome: 'TAKE_PROFIT' }));

    expect(outcome.signalId).toBe('signal-1');
    expect(outcome.outcome).toBe('TAKE_PROFIT');
    expect(outcome.triggered).toBe(true);
    expect(outcome.holdingTimeMs).toBe(900000);
    expect(outcome.lifecycle.valid).toBe(true);
    expect(Object.isFrozen(outcome)).toBe(true);
    expect(Object.isFrozen(outcome.lifecycle)).toBe(true);
    expect(Object.isFrozen(outcome.lifecycle.states)).toBe(true);
  });

  test('rejects TP without OPEN lifecycle state', () => {
    expect(() => createTrackedSignalOutcome(buildOutcome({
      outcome: 'TAKE_PROFIT',
      lifecycleStates: ['DETECTED', 'GRADED', 'ELIGIBLE', 'WAITING_RETEST', 'TRIGGERED', 'TAKE_PROFIT'],
    }))).toThrow('TAKE_PROFIT requires OPEN lifecycle state.');
  });

  test('rejects invalid lifecycle path', () => {
    expect(() => createTrackedSignalOutcome(buildOutcome({
      outcome: 'STOP_LOSS',
      lifecycleStates: ['DETECTED', 'STOP_LOSS'],
    }))).toThrow('STOP_LOSS requires OPEN lifecycle state.');
  });

  test('calculates outcome analytics and required breakdowns', () => {
    const outcomes = [
      createTrackedSignalOutcome(buildOutcome({ signalId: 'signal-1', outcome: 'TAKE_PROFIT', grade: 'A+', decision: 'ELIGIBLE', pair: 'EURUSD', poiType: 'FVG', session: 'London' })),
      createTrackedSignalOutcome(buildOutcome({ signalId: 'signal-2', outcome: 'STOP_LOSS', grade: 'A', decision: 'ELIGIBLE', pair: 'GBPUSD', poiType: 'OB', session: 'New York' })),
      createTrackedSignalOutcome(buildOutcome({
        signalId: 'signal-3',
        outcome: 'EXPIRED',
        grade: 'B+',
        decision: 'WAIT',
        riskResult: 'NO_RISK',
        triggered: false,
        triggeredTime: null,
        entryPrice: null,
        exitPrice: null,
        holdingTimeMs: null,
        closedAt: 1717400000000,
        lifecycleStates: ['DETECTED', 'GRADED', 'WAIT', 'EXPIRED'],
      })),
      createTrackedSignalOutcome(buildOutcome({
        signalId: 'signal-4',
        outcome: 'INVALIDATED',
        grade: 'A',
        decision: 'FILTERED',
        riskResult: 'NO_RISK',
        triggered: false,
        triggeredTime: null,
        entryPrice: null,
        exitPrice: null,
        holdingTimeMs: null,
        closedAt: 1717400000000,
        lifecycleStates: ['DETECTED', 'GRADED', 'ELIGIBLE', 'WAITING_RETEST', 'INVALIDATED'],
      })),
    ];

    const report = calculateSignalOutcomeAnalytics(outcomes);

    expect(report.totals.totalSignals).toBe(4);
    expect(report.totals.totalEligible).toBe(2);
    expect(report.totals.totalWait).toBe(1);
    expect(report.totals.totalFiltered).toBe(1);
    expect(report.totals.triggeredCount).toBe(2);
    expect(report.totals.executedCount).toBe(2);
    expect(report.totals.takeProfit).toBe(1);
    expect(report.totals.stopLoss).toBe(1);
    expect(report.totals.expired).toBe(1);
    expect(report.totals.invalidated).toBe(1);
    expect(report.reports.winRate).toBe(0.5);
    expect(report.reports.gradeDistribution).toEqual({ 'A+': 1, A: 2, 'B+': 1 });
    expect(report.reports.decisionDistribution).toEqual({ ELIGIBLE: 2, WAIT: 1, FILTERED: 1 });
    expect(report.breakdowns.byPair).toEqual({ EURUSD: 3, GBPUSD: 1 });
    expect(report.breakdowns.byPoi).toEqual({ FVG: 3, OB: 1 });
    expect(report.breakdowns.bySession).toEqual({ London: 3, 'New York': 1 });
    expect(Object.isFrozen(report)).toBe(true);
  });
});

function buildOutcome(overrides: Partial<Parameters<typeof createTrackedSignalOutcome>[0]> = {}): Parameters<typeof createTrackedSignalOutcome>[0] {
  return {
    signalId: 'signal-1',
    pair: 'EURUSD',
    direction: 'long',
    poiType: 'FVG',
    grade: 'A+',
    score: 9,
    decision: 'ELIGIBLE',
    riskResult: 'ACCEPTED',
    triggered: true,
    triggeredTime: 1717400900000,
    entryPrice: 1.1432,
    exitPrice: 1.1452,
    outcome: 'TAKE_PROFIT',
    holdingTimeMs: 900000,
    maximumFavorableExcursionPips: 22,
    maximumAdverseExcursionPips: 4,
    session: 'London',
    htfBias: 'bullish',
    premiumDiscount: 'discount',
    createdAt: 1717400000000,
    closedAt: 1717401800000,
    lifecycleStates: ['DETECTED', 'GRADED', 'ELIGIBLE', 'WAITING_RETEST', 'TRIGGERED', 'OPEN', 'CLOSED', 'TAKE_PROFIT'],
    ...overrides,
  };
}
