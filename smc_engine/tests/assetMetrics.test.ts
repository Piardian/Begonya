import { detectAssetClass, getPipSize, getDecimalPrecision, formatPrice, calculateDistance } from '../src/assetMetrics';

describe('Asset Metrics & Calibrator', () => {
  describe('Asset Class Detection', () => {
    it('detects Forex majors and crosses', () => {
      expect(detectAssetClass('EURUSD')).toBe('FOREX');
      expect(detectAssetClass('GBPUSD')).toBe('FOREX');
      expect(detectAssetClass('AUDCAD')).toBe('FOREX');
    });

    it('detects JPY pairs', () => {
      expect(detectAssetClass('USDJPY')).toBe('FOREX_JPY');
      expect(detectAssetClass('GBPJPY')).toBe('FOREX_JPY');
      expect(detectAssetClass('CHFJPY')).toBe('FOREX_JPY');
    });

    it('detects Crypto pairs', () => {
      expect(detectAssetClass('BTCUSD')).toBe('CRYPTO');
      expect(detectAssetClass('ETHUSD')).toBe('CRYPTO');
      expect(detectAssetClass('SOLUSD')).toBe('CRYPTO');
      expect(detectAssetClass('LTCUSD')).toBe('CRYPTO');
    });

    it('detects Commodities', () => {
      expect(detectAssetClass('XAUUSD')).toBe('COMMODITY');
      expect(detectAssetClass('XAGUSD')).toBe('COMMODITY');
    });

    it('detects Indices', () => {
      expect(detectAssetClass('NAS100')).toBe('INDEX');
      expect(detectAssetClass('SPX500')).toBe('INDEX');
    });
  });

  describe('Pip Size and Decimal Precision', () => {
    it('provides correct pip sizes', () => {
      expect(getPipSize('EURUSD')).toBe(0.0001);
      expect(getPipSize('USDJPY')).toBe(0.01);
      expect(getPipSize('BTCUSD')).toBe(1.0);
      expect(getPipSize('XAUUSD')).toBe(0.1);
      expect(getPipSize('NAS100')).toBe(1.0);
    });

    it('provides correct price formatting precision', () => {
      expect(formatPrice(1.054321, 'EURUSD')).toBe('1.05432');
      expect(formatPrice(155.6789, 'USDJPY')).toBe('155.679');
      expect(formatPrice(79080.8234, 'BTCUSD')).toBe('79080.82');
      expect(formatPrice(2350.556, 'XAUUSD')).toBe('2350.56');
    });
  });

  describe('Distance Calculations and Display Text', () => {
    it('formats BTCUSD distance in USD and percentage cleanly without pip distortion', () => {
      const distance = calculateDistance('BTCUSD', 79080.82, 64488.63, 64505.81);
      expect(distance.isInZone).toBe(false);
      expect(distance.unitName).toBe('USD');
      expect(distance.relation).toBe('above');
      expect(distance.distanceRaw).toBeCloseTo(14575.01, 1);
      expect(distance.displayText).toContain('14575.0 USD');
      expect(distance.displayText).toContain('%');
      expect(distance.displayText).toContain('giriş bölgesinin üstünde');
    });

    it('formats EURUSD distance in pips cleanly', () => {
      const distance = calculateDistance('EURUSD', 1.05850, 1.05300, 1.05500);
      expect(distance.isInZone).toBe(false);
      expect(distance.unitName).toBe('pip');
      expect(distance.distanceUnits).toBeCloseTo(35.0, 1);
      expect(distance.displayText).toBe('35.0 pip giriş bölgesinin üstünde');
    });

    it('handles in-zone status correctly', () => {
      const distance = calculateDistance('BTCUSD', 64500.00, 64488.63, 64505.81);
      expect(distance.isInZone).toBe(true);
      expect(distance.distanceRaw).toBe(0);
      expect(distance.displayText).toContain('giriş bölgesinde');
    });
  });
});
