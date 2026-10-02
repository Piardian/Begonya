import { evaluateApproachVelocity } from '../src/approachVelocity';
import { isSymbolBlacklisted } from '../server/universe';
import { isBoxTooNarrow, getEstimatedSpreadPips } from '../src/assetMetrics';
import { Candle } from '../src/types';

describe('Institutional SMC Hardening: Blacklist, Spread Friction & Approach Kinetic Energy (Begonya)', () => {
  describe('Blacklist Filter', () => {
    it('flags GBPCHF as blacklisted', () => {
      expect(isSymbolBlacklisted('GBPCHF')).toBe(true);
      expect(isSymbolBlacklisted('gbpchf')).toBe(true);
      expect(isSymbolBlacklisted('EURUSD')).toBe(false);
      expect(isSymbolBlacklisted('BTCUSD')).toBe(false);
    });
  });

  describe('Spread-to-Box Friction Filter', () => {
    it('rejects cross pair boxes where spread exceeds 20% of box width', () => {
      // CADCHF spread is ~1.8 pips. If box is 6.0 pips: 1.8 / 6.0 = 0.30 (30% > 20%) -> Rejected!
      // 0.65400 to 0.65460 is 6.0 pips
      expect(isBoxTooNarrow('CADCHF', 0.65400, 0.65460)).toBe(true);

      // If CADCHF box is 12.0 pips: 1.8 / 12.0 = 0.15 (15% <= 20%) -> Passes!
      expect(isBoxTooNarrow('CADCHF', 0.65400, 0.65520)).toBe(false);
    });

    it('estimates realistic institutional spreads across asset classes', () => {
      expect(getEstimatedSpreadPips('EURUSD')).toBe(0.8);
      expect(getEstimatedSpreadPips('GBPCHF')).toBe(1.5);
      expect(getEstimatedSpreadPips('BTCUSD')).toBe(1.0);
      expect(getEstimatedSpreadPips('SOLUSD')).toBe(0.2);
    });
  });

  describe('Approach Kinetic Energy Evaluator', () => {
    const atrPips = 10.0; // 10 pips ATR

    it('detects high kinetic energy when price surges > 2.0x ATR into resistance zone for short trade', () => {
      // Zone is 1.1000 - 1.1020
      // In 3 bars, price surges from 1.0965 to 1.1005 (40 pips = 4.0x ATR)
      const candles: Candle[] = [
        { open: 1.0960, high: 1.0970, low: 1.0955, close: 1.0965, timestamp: 1000 },
        { open: 1.0965, high: 1.0985, low: 1.0960, close: 1.0980, timestamp: 2000 },
        { open: 1.0980, high: 1.1000, low: 1.0975, close: 1.0995, timestamp: 3000 },
        { open: 1.0995, high: 1.1010, low: 1.0990, close: 1.1005, timestamp: 4000 },
      ];

      const result = evaluateApproachVelocity(
        candles,
        3,
        'short',
        1.1000,
        1.1020,
        'EURUSD',
        atrPips
      );

      expect(result.isHighKineticEnergy).toBe(true);
      expect(result.atrMultiple).toBeGreaterThanOrEqual(2.0);
      expect(result.warningText).toContain('YÜKSEK KİNETİK ENERJİ');
    });

    it('identifies calm pullback as normal kinetic energy (safe approach)', () => {
      // In 3 bars, price gently retraces from 1.0990 to 1.1002 (12 pips = 1.2x ATR < 2.0x ATR)
      const candles: Candle[] = [
        { open: 1.0985, high: 1.0995, low: 1.0980, close: 1.0990, timestamp: 1000 },
        { open: 1.0990, high: 1.0998, low: 1.0985, close: 1.0995, timestamp: 2000 },
        { open: 1.0995, high: 1.1000, low: 1.0992, close: 1.0998, timestamp: 3000 },
        { open: 1.0998, high: 1.1005, low: 1.0995, close: 1.1002, timestamp: 4000 },
      ];

      const result = evaluateApproachVelocity(
        candles,
        3,
        'short',
        1.1000,
        1.1020,
        'EURUSD',
        atrPips
      );

      expect(result.isHighKineticEnergy).toBe(false);
      expect(result.warningText).toBeUndefined();
    });
  });
});
