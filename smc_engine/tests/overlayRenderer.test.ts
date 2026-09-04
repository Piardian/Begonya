import { createCanvas } from 'canvas';
import { mapBarIndexToX, mapBarLeftToX, mapBarRightToX, mapPriceToY, renderOverlay, ChartMetadata } from '../server/overlayRenderer';

describe('Overlay Renderer', () => {
  const metadata: ChartMetadata = {
    imageWidth: 1000,
    imageHeight: 600,
    timeframe: '15m',
    firstVisibleLogical: 10,
    lastVisibleLogical: 110,
    visiblePriceRange: { min: 1.0, max: 1.2 },
    plotLeft: 100,
    plotTop: 50,
    plotWidth: 800,
    plotHeight: 500,
    devicePixelRatio: 1,
    rightPriceScaleWidth: 80,
    barSpacing: 8,
    timeScaleWidth: 800,
  };

  test('maps bar index to x coordinate deterministically', () => {
    expect(mapBarLeftToX(10, metadata)).toBe(100);
    expect(mapBarIndexToX(60, metadata)).toBe(500);
    expect(mapBarRightToX(110, metadata)).toBe(900);
  });

  test('maps price to y coordinate deterministically', () => {
    expect(mapPriceToY(1.2, metadata)).toBeCloseTo(50);
    expect(mapPriceToY(1.1, metadata)).toBeCloseTo(300);
    expect(mapPriceToY(1.0, metadata)).toBeCloseTo(550);
  });

  test('renders annotated PNG without mutating the input buffer', async () => {
    const canvas = createCanvas(1000, 600);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#131722';
    ctx.fillRect(0, 0, 1000, 600);
    const screenshot = canvas.toBuffer('image/png');
    const originalLength = screenshot.length;

    const annotated = await renderOverlay({
      screenshotPng: screenshot,
      metadata,
      annotations: [
        {
          type: 'orderBlock',
          startIndex: 40,
          endIndex: 55,
          high: 1.16,
          low: 1.12,
          direction: 'bullish',
          label: 'Order Block',
        },
        {
          type: 'bosArrow',
          index: 70,
          price: 1.17,
          direction: 'bullish',
          label: 'BOS',
        },
        {
          type: 'label',
          index: 42,
          price: 1.18,
          text: 'EURUSD A+',
        },
      ],
    });

    expect(Buffer.isBuffer(annotated)).toBe(true);
    expect(annotated[0]).toBe(0x89);
    expect(annotated[1]).toBe(0x50);
    expect(screenshot.length).toBe(originalLength);
    expect(annotated.equals(screenshot)).toBe(false);
  });
});
