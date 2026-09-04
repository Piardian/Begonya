import {
  evaluateSignalQuality,
  SIGNAL_QUALITY_REASON_SOURCE,
  SIGNAL_QUALITY_RESULT_VERSION,
  SignalQualityInput,
} from '../src/signalQualityEngine';
import { OrderBlock, StructureEvent } from '../src/types';

describe('SignalQualityEngine', () => {
  test('returns deterministic output for the same input', () => {
    const input = buildInput();

    const first = evaluateSignalQuality(input);
    const second = evaluateSignalQuality(input);

    expect(second).toEqual(first);
  });

  test('includes versioned result and sourced structured reasons', () => {
    const result = evaluateSignalQuality(buildInput());

    expect(result.version).toBe(SIGNAL_QUALITY_RESULT_VERSION);
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.reasons.every(reason => reason.source === SIGNAL_QUALITY_REASON_SOURCE)).toBe(true);
    expect(result.warnings.every(reason => reason.source === SIGNAL_QUALITY_REASON_SOURCE)).toBe(true);
  });

  test('separates score and confidence', () => {
    const result = evaluateSignalQuality({
      ...buildInput(),
      currentIndex: 20,
      poiTestCount: 3,
    });

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(100);
    expect(result.status).toBe('invalid');
  });

  test('reports market context from the input timestamp, not wall-clock time', () => {
    const result = evaluateSignalQuality(buildInput({
      // 2024-06-03 10:15 Europe/Istanbul, Monday, inside first killzone.
      currentTimestamp: Date.UTC(2024, 5, 3, 7, 15, 0),
    }));

    expect(result.marketContext).toEqual({
      session: 'london',
      killzone: true,
      dayOfWeek: 1,
      hourTR: 10,
    });
  });

  test('calculates POI distance and relation for OB zones', () => {
    const result = evaluateSignalQuality(buildInput({
      currentPrice: 1.1025,
    }));

    expect(result.metrics.poiRelation).toBe('above');
    expect(result.metrics.distanceToPoiPips).toBe(15);
  });
});

function buildInput(overrides: Partial<SignalQualityInput> = {}): SignalQualityInput {
  const relatedEvent: StructureEvent = {
    type: 'BOS',
    direction: 'bullish',
    brokenSwing: {
      type: 'high',
      price: 1.101,
      formedAtIndex: 85,
      confirmedAtIndex: 90,
      timestamp: Date.UTC(2024, 5, 3, 6, 0, 0),
    },
    breakCandleIndex: 100,
    breakTimestamp: Date.UTC(2024, 5, 3, 7, 0, 0),
    breakClosePrice: 1.102,
  };

  const poi: OrderBlock = {
    direction: 'bullish',
    candleIndex: 98,
    high: 1.101,
    low: 1.099,
    formedAtIndex: 98,
    relatedEvent,
  };

  return {
    poiType: 'OB',
    poi,
    currentIndex: 110,
    currentPrice: 1.1005,
    currentTimestamp: Date.UTC(2024, 5, 3, 7, 15, 0),
    poiTestCount: 0,
    ...overrides,
  };
}
