import { AUDUSD_REGISTRY, NAS100_REGISTRY, USDCAD_REGISTRY } from '../server/symbolRegistry';

test('NAS100 registry is verified and enabled for detection', () => {
  expect(NAS100_REGISTRY.chartSymbol).toBe('PEPPERSTONE:NAS100');
  expect(NAS100_REGISTRY.marketDataSymbol).toBe('QQQ');
  expect(NAS100_REGISTRY.enabledForDetection).toBe(true);
  expect(NAS100_REGISTRY.dataStatus).toBe('VERIFIED');
});

test('AUDUSD registry is verified and production-enabled', () => {
  expect(AUDUSD_REGISTRY.marketDataSymbol).toBe('AUD/USD');
  expect(AUDUSD_REGISTRY.dataStatus).toBe('VERIFIED');
  expect(AUDUSD_REGISTRY.enabledForDetection).toBe(true);
});

test('USDCAD registry is verified and production-enabled', () => {
  expect(USDCAD_REGISTRY.marketDataSymbol).toBe('USD/CAD');
  expect(USDCAD_REGISTRY.chartSymbol).toBe('PEPPERSTONE:USDCAD');
  expect(USDCAD_REGISTRY.dataStatus).toBe('VERIFIED');
  expect(USDCAD_REGISTRY.enabledForDetection).toBe(true);
});
