import { createSignalContext } from '../src/signalContext';
import { createSignalOutcome, createWaitingEntryOutcome, SIGNAL_OUTCOME_VERSION } from '../src/signalOutcome';

describe('Signal Outcome Foundation', () => {
  const signalContext = createSignalContext({
    signalId: 'EURUSD_15m_OB_1717400000000_1717407600000',
    pair: 'EURUSD',
    direction: 'long',
    timeframe: '15m',
    grade: 'A+',
    executionStatus: 'EXECUTION_READY',
    riskStatus: 'ACCEPTED',
    timestamp: 1717407600000,
    lifecycleStates: ['DETECTED', 'GRADED', 'PLANNED', 'EXECUTION_READY', 'SIMULATED', 'RISK_ACCEPTED'],
  });

  test('creates immutable WAITING_ENTRY outcome linked to one Signal ID', () => {
    const outcome = createWaitingEntryOutcome(signalContext);

    expect(outcome.version).toBe(SIGNAL_OUTCOME_VERSION);
    expect(outcome.signalId).toBe(signalContext.signalId);
    expect(outcome.outcomeType).toBe('WAITING_ENTRY');
    expect(outcome.reason.code).toBe('WAITING_FOR_ENTRY_RETEST');
    expect(outcome.metadata.sourceLifecycleState).toBe('RISK_ACCEPTED');
    expect(outcome.metadata.outcomeLifecycleState).toBe('WAITING_ENTRY');
    expect(outcome.metadata.realExecutionTracked).toBe(false);
    expect(outcome.metadata.brokerStatusTracked).toBe(false);
    expect(Object.isFrozen(outcome)).toBe(true);
    expect(Object.isFrozen(outcome.reason)).toBe(true);
    expect(Object.isFrozen(outcome.metadata)).toBe(true);
  });

  test('supports foundation outcome statuses without broker states', () => {
    const statuses = [
      'WAITING_ENTRY',
      'ENTRY_TRIGGERED',
      'TAKE_PROFIT',
      'STOP_LOSS',
      'EXPIRED',
      'CANCELLED',
      'MANUAL_CANCELLED',
      'UNKNOWN',
    ] as const;

    for (const outcomeType of statuses) {
      const outcome = createSignalOutcome({ signalContext, outcomeType, timestamp: signalContext.timestamp + 1000 });
      expect(outcome.signalId).toBe(signalContext.signalId);
      expect(outcome.outcomeType).toBe(outcomeType);
      expect(outcome.lifecycleDurationMs).toBe(1000);
    }
  });
});

