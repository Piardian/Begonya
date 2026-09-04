import { buildOverlayInput } from '../server/overlayMetadata';
import { NotificationCandidate } from '../server/pipeline';

describe('Overlay Metadata', () => {
  const candles = Array.from({ length: 120 }, (_, index) => ({
    timestamp: 1717290000000 + index * 15 * 60 * 1000,
    open: 1.05 + index * 0.0001,
    high: 1.052 + index * 0.0001,
    low: 1.048 + index * 0.0001,
    close: 1.051 + index * 0.0001,
  }));

  const candidate: NotificationCandidate = {
    symbol: 'EURUSD',
    tradeDirection: 'long',
    poiType: 'OB',
    poi: {
      direction: 'bullish',
      candleIndex: 80,
      high: candles[80].high,
      low: candles[80].low,
      formedAtIndex: 80,
      relatedEvent: {
        type: 'BOS',
        direction: 'bullish',
        brokenSwing: {} as any,
        breakCandleIndex: 92,
        breakTimestamp: candles[92].timestamp,
        breakClosePrice: candles[92].close,
      },
    },
    gradeResult: {
      totalScore: 9,
      grade: 'A+',
      entryAllowed: true,
      blockReasons: [],
      breakdown: { htfBiasPD: 2, displacement: 2, structure: 2, sweep: 2, poiQuality: 1 },
    },
    uniqueKey: 'test',
    currentPrice: candles[119].close,
    poiFormedTimestamp: candles[80].timestamp,
    bias4H: 'bullish',
    bias1H: 'bullish',
    poiTestCount: 0,
    pd4H: 'discount',
    pd1H: 'discount',
  };

  test('builds chart metadata and initial OB/BOS/label annotations', () => {
    const result = buildOverlayInput(candles, candidate, 1000, 600, '15m');

    expect(result).not.toBeNull();
    expect(result?.metadata.imageWidth).toBe(1000);
    expect(result?.metadata.imageHeight).toBe(600);
    expect(result?.metadata.firstVisibleLogical).toBe(20);
    expect(result?.metadata.lastVisibleLogical).toBe(119);
    expect(result?.metadata.visiblePriceRange.min).toBeLessThan(candles[20].low);
    expect(result?.metadata.visiblePriceRange.max).toBeGreaterThan(candles[119].high);
    expect(result?.metadata.devicePixelRatio).toBe(1);
    expect(result?.metadata.plotLeft).toBe(0);
    expect(result?.metadata.rightPriceScaleWidth).toBe(80);
    expect(result?.metadata.plotWidth).toBe(920);
    expect(result?.metadata.barSpacing).toBeCloseTo(920 / 99);
    expect(result?.metadata.timeScaleWidth).toBe(920);
    expect(result?.annotations.map(a => a.type)).toEqual(['priceLine', 'priceLine', 'priceLine', 'premiumDiscount', 'orderBlock', 'bosArrow', 'label']);
  });

  test('builds FVG annotations for validation audits', () => {
    const fvgCandidate = {
      ...candidate,
      poiType: 'FVG',
      poi: {
        direction: 'bullish',
        gapHigh: 1.06,
        gapLow: 1.05,
        gapSizePips: 10,
        ratioToDisplacementCandle: 0.5,
        middleCandleIndex: 80,
        relatedEvent: (candidate.poi as any).relatedEvent,
      },
    } as NotificationCandidate;

    const result = buildOverlayInput(candles, fvgCandidate, 1000, 600, '15m');

    expect(result).not.toBeNull();
    expect(result?.annotations.map(a => a.type)).toEqual(['priceLine', 'priceLine', 'priceLine', 'premiumDiscount', 'fvg', 'bosArrow', 'label']);
  });
});
