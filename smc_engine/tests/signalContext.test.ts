import { createSignalContext, createSignalId } from '../src/signalContext';

describe('Signal Context Foundation', () => {
  test('creates deterministic signal ids from detection identity fields', () => {
    const first = createSignalId({
      pair: 'EURUSD',
      timeframe: '15m',
      poiType: 'OB',
      formedTimestamp: 1717400000000,
      eventTimestamp: 1717407600000,
    });
    const second = createSignalId({
      pair: 'EURUSD',
      timeframe: '15m',
      poiType: 'OB',
      formedTimestamp: 1717400000000,
      eventTimestamp: 1717407600000,
    });

    expect(first).toBe('EURUSD_15m_OB_1717400000000_1717407600000');
    expect(second).toBe(first);
  });

  test('creates immutable lifecycle context carried through the pipeline', () => {
    const context = createSignalContext({
      signalId: 'EURUSD_15m_OB_1717400000000_1717407600000',
      pair: 'EURUSD',
      direction: 'long',
      timeframe: '15m',
      grade: 'A+',
      score: 9,
      executionStatus: 'EXECUTION_READY',
      riskStatus: 'ACCEPTED',
      timestamp: 1717407600000,
      lifecycleStates: ['DETECTED', 'GRADED', 'PLANNED', 'EXECUTION_READY', 'SIMULATED', 'RISK_ACCEPTED'],
    });

    expect(context.lifecycle.currentState).toBe('RISK_ACCEPTED');
    expect(context.score).toBe(9);
    expect(context.lifecycle.states).toEqual([
      'DETECTED',
      'GRADED',
      'PLANNED',
      'EXECUTION_READY',
      'SIMULATED',
      'RISK_ACCEPTED',
    ]);
    expect(Object.isFrozen(context)).toBe(true);
    expect(Object.isFrozen(context.lifecycle)).toBe(true);
    expect(Object.isFrozen(context.lifecycle.states)).toBe(true);
  });
});
