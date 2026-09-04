import { StructureState, StructureEvent, RegimeTransition } from '../src/types';
import { SweepEvent } from '../src/sweepDetector';
import { determineModel } from '../src/modelDeterminer';

describe('Model Determiner (Model 1 & 2)', () => {
  const dummyBOS = (idx: number, direction: 'bullish' | 'bearish'): StructureEvent => ({
    type: 'BOS',
    direction,
    brokenSwing: { type: 'high', price: 1.0500, formedAtIndex: 0, confirmedAtIndex: 2, timestamp: 0 },
    breakCandleIndex: idx,
    breakTimestamp: 1000 * idx,
    breakClosePrice: 1.0510,
  });

  const dummySweep = (idx: number): SweepEvent => ({
    type: 'sweep_low',
    sweptLevel: 1.0450,
    wickPrice: 1.0440,
    penetrationDistance: 1,
    candleIndex: idx,
    timestamp: 1000 * idx,
  });

  test('Model 1 (Reversal): should return model1_reversal when regime is range and a sweep occurred within window', () => {
    const transitions: RegimeTransition[] = [
      { atIndex: 2, newTrend: 'range' },
    ];
    const structureState: StructureState = {
      currentTrend: 'range',
      events: [],
      lastEvent: null,
      regimeTransitions: transitions,
    };

    const sweeps: SweepEvent[] = [
      dummySweep(4),
    ];

    const result = determineModel(structureState, sweeps, 5);
    expect(result.model).toBe('model1_reversal');
    expect(result.regime).toBe('range');
    expect(result.triggeringSweep).toMatchObject(sweeps[0]);
    expect(result.triggeringBOS).toBeNull();
  });

  test('Model 1: should return none if regime is range but no sweep occurred within window', () => {
    const transitions: RegimeTransition[] = [
      { atIndex: 2, newTrend: 'range' },
    ];
    const structureState: StructureState = {
      currentTrend: 'range',
      events: [],
      lastEvent: null,
      regimeTransitions: transitions,
    };

    const result = determineModel(structureState, [], 5);
    expect(result.model).toBe('none');
    expect(result.regime).toBe('range');
    expect(result.triggeringSweep).toBeNull();
  });

  test('Model 2 (Continuation): should return model2_continuation when regime is bullish/bearish and a matching direction BOS occurred within window', () => {
    const transitions: RegimeTransition[] = [
      { atIndex: 2, newTrend: 'bullish' },
    ];
    const structureState: StructureState = {
      currentTrend: 'bullish',
      events: [dummyBOS(4, 'bullish')],
      lastEvent: null,
      regimeTransitions: transitions,
    };

    const result = determineModel(structureState, [], 5);
    expect(result.model).toBe('model2_continuation');
    expect(result.regime).toBe('bullish');
    expect(result.triggeringBOS).toMatchObject(structureState.events[0]);
    expect(result.triggeringSweep).toBeNull();
  });

  test('Model 2: should return none if regime is bullish but no BOS has occurred within window', () => {
    const transitions: RegimeTransition[] = [
      { atIndex: 2, newTrend: 'bullish' },
    ];
    const structureState: StructureState = {
      currentTrend: 'bullish',
      events: [],
      lastEvent: null,
      regimeTransitions: transitions,
    };

    const result = determineModel(structureState, [], 5);
    expect(result.model).toBe('none');
    expect(result.regime).toBe('bullish');
    expect(result.triggeringBOS).toBeNull();
  });

  test('Pencereleme (Regime Window Filtering): should ignore sweeps/BOS from older regimes', () => {
    // Transition history:
    // t=2: range
    // t=5: bullish
    // t=8: range
    const transitions: RegimeTransition[] = [
      { atIndex: 2, newTrend: 'range' },
      { atIndex: 5, newTrend: 'bullish' },
      { atIndex: 8, newTrend: 'range' },
    ];

    // Old sweep at index 3 (during the first range regime)
    const sweeps: SweepEvent[] = [
      dummySweep(3),
    ];

    const structureState: StructureState = {
      currentTrend: 'range',
      events: [dummyBOS(6, 'bullish')], // BOS during bullish regime
      lastEvent: null,
      regimeTransitions: transitions,
    };

    // Evaluate at currentIndex = 9 (active trend = range established at t=8)
    const result = determineModel(structureState, sweeps, 9);
    // Since the active range started at index 8, the old sweep at index 3 is out of window!
    expect(result.model).toBe('none');
    expect(result.regime).toBe('range');
    expect(result.triggeringSweep).toBeNull();
  });

  test('lookahead bias simulation for model determiner', () => {
    const transitions: RegimeTransition[] = [
      { atIndex: 2, newTrend: 'range' },
      { atIndex: 5, newTrend: 'bullish' },
      { atIndex: 8, newTrend: 'range' },
    ];
    const events = [
      dummyBOS(6, 'bullish'),
    ];
    const sweeps = [
      dummySweep(3),
      dummySweep(9),
    ];

    const structureState: StructureState = {
      currentTrend: 'range',
      events,
      lastEvent: null,
      regimeTransitions: transitions,
    };

    // Batch results
    const batchResults: any[] = [];
    for (let idx = 0; idx < 15; idx++) {
      batchResults.push(determineModel(structureState, sweeps, idx));
    }

    // Simulation run (step-by-step)
    const simulatedResults: any[] = [];
    for (let t = 1; t <= 15; t++) {
      const currentIndex = t - 1;

      // Slice sweep events
      const sliceSweeps = sweeps.filter(s => s.candleIndex <= currentIndex);

      // Slice structureState events and transitions
      const sliceTransitions = transitions.filter(tr => tr.atIndex <= currentIndex);
      const sliceEvents = events.filter(ev => ev.breakCandleIndex <= currentIndex);

      const sliceState: StructureState = {
        currentTrend: sliceTransitions.length > 0 ? sliceTransitions[sliceTransitions.length - 1].newTrend : 'undefined',
        events: sliceEvents,
        lastEvent: sliceEvents.length > 0 ? sliceEvents[sliceEvents.length - 1] : null,
        regimeTransitions: sliceTransitions,
      };

      const res = determineModel(sliceState, sliceSweeps, currentIndex);
      simulatedResults.push(res);
    }

    expect(simulatedResults).toHaveLength(batchResults.length);
    for (let i = 0; i < batchResults.length; i++) {
      expect(simulatedResults[i]).toMatchObject(batchResults[i]);
    }
  });
});
