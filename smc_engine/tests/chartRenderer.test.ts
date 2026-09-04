import { renderCandidateChart } from '../server/chartRenderer';
import { NotificationCandidate } from '../server/pipeline';

describe('Chart Renderer', () => {
  const dummyCandidate: NotificationCandidate = {
    symbol: 'EURUSD',
    tradeDirection: 'long',
    poiType: 'OB',
    poi: {
      direction: 'bullish',
      candleIndex: 10,
      high: 1.055,
      low: 1.053,
      formedAtIndex: 10,
      relatedEvent: {
        type: 'BOS',
        direction: 'bullish',
        brokenSwing: {} as any,
        breakCandleIndex: 12,
        breakTimestamp: 1717300000000,
        breakClosePrice: 1.056,
      },
    },
    gradeResult: {
      totalScore: 9,
      grade: 'A+',
      entryAllowed: true,
      blockReasons: [],
      breakdown: { htfBiasPD: 2, displacement: 2, structure: 2, sweep: 2, poiQuality: 1 },
    },
    uniqueKey: 'test_key',
    currentPrice: 1.0585,
    poiFormedTimestamp: 1717290000000,
    bias4H: 'bullish',
    bias1H: 'bullish',
    poiTestCount: 0,
    pd4H: 'premium',
    pd1H: 'discount',
  };

  test('should return a valid Buffer starting with PNG magic bytes on success', () => {
    const candles = [
      { timestamp: 1717290000000, open: 1.050, high: 1.052, low: 1.049, close: 1.051 },
      { timestamp: 1717295000000, open: 1.051, high: 1.056, low: 1.050, close: 1.054 },
    ];

    const buffer = renderCandidateChart(candles, dummyCandidate);
    expect(Buffer.isBuffer(buffer)).toBe(true);

    // PNG signature check: 89 50 4E 47 0D 0A 1A 0A
    expect(buffer[0]).toBe(0x89);
    expect(buffer[1]).toBe(0x50);
    expect(buffer[2]).toBe(0x4e);
    expect(buffer[3]).toBe(0x47);
  });

  test('should handle empty or null candle lists safely without throwing exceptions', () => {
    expect(() => renderCandidateChart([], dummyCandidate)).not.toThrow();
    const buffer = renderCandidateChart([], dummyCandidate);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer[0]).toBe(0x89);
  });

  test('should handle candles without candidate timestamps safely', () => {
    const candles = [
      { timestamp: 999999, open: 1.050, high: 1.052, low: 1.049, close: 1.051 },
    ];
    expect(() => renderCandidateChart(candles, dummyCandidate)).not.toThrow();
    const buffer = renderCandidateChart(candles, dummyCandidate);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer[0]).toBe(0x89);
  });

  test('should render properly with different poiTestCount configurations (0 and greater than 0)', () => {
    const candles = [
      { timestamp: 1717290000000, open: 1.050, high: 1.052, low: 1.049, close: 1.051 }, // formedIndex = 0
      { timestamp: 1717291000000, open: 1.051, high: 1.056, low: 1.050, close: 1.054 }, // touches OB high/low (1.055 - 1.053)
    ];

    const c1 = { ...dummyCandidate, poiTestCount: 0 };
    expect(() => renderCandidateChart(candles, c1)).not.toThrow();

    const c2 = { ...dummyCandidate, poiTestCount: 1 };
    expect(() => renderCandidateChart(candles, c2)).not.toThrow();
  });
});
