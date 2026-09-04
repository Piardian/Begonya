import { simplifyOverlayAnnotations } from '../server/overlaySimplifier';
import { OverlayAnnotation } from '../server/overlayRenderer';

describe('OverlaySimplifier V1', () => {
  test('deduplicates repeated entry labels while preserving priority overlays', () => {
    const annotations: OverlayAnnotation[] = [
      { type: 'priceLine', price: 1.2, color: '#42a5f5', label: 'ENTRY' },
      { type: 'priceLine', price: 1.199, color: '#42a5f5', label: 'ENTRY' },
      { type: 'priceLine', price: 1.198, color: '#d1d4dc', label: 'PRICE', dashed: true },
      { type: 'premiumDiscount', min: 1.1, max: 1.3, equilibrium: 1.2 },
      { type: 'orderBlock', startIndex: 10, endIndex: 20, high: 1.21, low: 1.19, direction: 'bearish', label: 'Order Block' },
      { type: 'bosArrow', index: 21, price: 1.19, direction: 'bearish', label: 'BOS' },
      { type: 'label', index: 10, price: 1.21, text: 'EURUSD A' },
    ];

    const result = simplifyOverlayAnnotations(annotations, { maxAnnotations: 6, maxLabels: 3 });

    expect(result.originalAnnotationCount).toBe(7);
    expect(result.annotations.length).toBeLessThanOrEqual(6);
    expect(result.decisionLog.some(entry => entry.action === 'deduplicated')).toBe(true);
    expect(result.metrics.hiddenLabels).toBeGreaterThanOrEqual(1);
    expect(result.annotations.filter(annotation => annotation.type === 'priceLine' && annotation.label === 'ENTRY')).toHaveLength(1);
  });

  test('keeps high priority structural annotations when budget is tight', () => {
    const annotations: OverlayAnnotation[] = [
      { type: 'orderBlock', startIndex: 10, endIndex: 20, high: 1.21, low: 1.19, direction: 'bearish', label: 'Order Block' },
      { type: 'fvg', startIndex: 11, endIndex: 13, high: 1.205, low: 1.2, direction: 'bearish', label: 'FVG' },
      { type: 'bosArrow', index: 21, price: 1.19, direction: 'bearish', label: 'BOS' },
      { type: 'premiumDiscount', min: 1.1, max: 1.3, equilibrium: 1.2 },
      { type: 'label', index: 10, price: 1.21, text: 'EURUSD A' },
    ];

    const result = simplifyOverlayAnnotations(annotations, { maxAnnotations: 3, maxLabels: 1, maxBoxes: 1, maxStructureMarkers: 1, maxLiquidityObjects: 1 });

    expect(result.annotations.some(annotation => annotation.type === 'orderBlock' || annotation.type === 'fvg')).toBe(true);
    expect(result.annotations.some(annotation => annotation.type === 'bosArrow')).toBe(true);
    expect(result.decisionLog.some(entry => entry.reason.includes('Priority budget exceeded'))).toBe(true);
  });
});
