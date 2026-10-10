import { Candle } from '../src/types';
import { detectInstitutionalSweeps, extractSessionLiquidityPools } from '../src/sessionLiquidityDetector';

function createTimestamp(day: number, hour: number, minute: number): number {
  return Date.UTC(2025, 0, day, hour, minute);
}

describe('Institutional Session Liquidity Detector (PDH / PDL / Asia High / Asia Low)', () => {
  test('should accurately track PDH and PDL across day boundaries', () => {
    const candles: Candle[] = [];

    // Day 1: Jan 10, 2025. High = 1.0800, Low = 1.0700
    for (let h = 0; h < 24; h++) {
      candles.push({
        timestamp: createTimestamp(10, h, 0),
        open: 1.0750,
        high: h === 14 ? 1.0800 : 1.0760,
        low: h === 4 ? 1.0700 : 1.0740,
        close: 1.0750,
      });
    }

    // Day 2: Jan 11, 2025.
    for (let h = 0; h < 12; h++) {
      candles.push({
        timestamp: createTimestamp(11, h, 0),
        open: 1.0750,
        high: 1.0770,
        low: 1.0730,
        close: 1.0750,
      });
    }

    const pools = extractSessionLiquidityPools(candles);

    // On Day 1, PDH/PDL are null (no prior day in history)
    expect(pools.get(5)?.pdh).toBeNull();

    // On Day 2 (index 24+), PDH must be 1.0800 and PDL must be 1.0700
    const day2Pools = pools.get(25);
    expect(day2Pools).toBeDefined();
    expect(day2Pools?.pdh).toBe(1.0800);
    expect(day2Pools?.pdl).toBe(1.0700);
  });

  test('should detect PDH sweep and PDL sweep with wick penetration', () => {
    const candles: Candle[] = [];

    // Day 1: Jan 10 (PDH = 1.0800, PDL = 1.0700)
    for (let h = 0; h < 24; h++) {
      candles.push({
        timestamp: createTimestamp(10, h, 0),
        open: 1.0750,
        high: h === 12 ? 1.0800 : 1.0760,
        low: h === 2 ? 1.0700 : 1.0740,
        close: 1.0750,
      });
    }

    // Day 2: Jan 11
    // Candle at 08:00 wicks above PDH (high: 1.0820) and closes back below (close: 1.0790) -> PDH SWEEP!
    candles.push({
      timestamp: createTimestamp(11, 8, 0),
      open: 1.0780,
      high: 1.0820,
      low: 1.0770,
      close: 1.0790,
    });

    // Candle at 11:00 wicks below PDL (low: 1.0680) and closes back above (close: 1.0710) -> PDL SWEEP!
    candles.push({
      timestamp: createTimestamp(11, 11, 0),
      open: 1.0720,
      high: 1.0730,
      low: 1.0680,
      close: 1.0710,
    });

    const sweeps = detectInstitutionalSweeps(candles, 'EURUSD');
    const pdSweeps = sweeps.filter(s => s.type === 'PDH_SWEEP' || s.type === 'PDL_SWEEP');

    expect(pdSweeps).toHaveLength(2);

    expect(pdSweeps[0]).toMatchObject({
      type: 'PDH_SWEEP',
      level: 1.0800,
      wickPrice: 1.0820,
      direction: 'bearish_reversal',
    });

    expect(pdSweeps[1]).toMatchObject({
      type: 'PDL_SWEEP',
      level: 1.0700,
      wickPrice: 1.0680,
      direction: 'bullish_reversal',
    });
  });

  test('should detect Asia High sweep during London Open (Judas Swing)', () => {
    const candles: Candle[] = [];

    // Day 1: Jan 10
    // Asia session (00:00 - 06:00 UTC): Asia High = 1.0780, Asia Low = 1.0720
    for (let h = 0; h < 7; h++) {
      candles.push({
        timestamp: createTimestamp(10, h, 0),
        open: 1.0750,
        high: h === 3 ? 1.0780 : 1.0760,
        low: h === 1 ? 1.0720 : 1.0740,
        close: 1.0750,
      });
    }

    // London Open at 08:00 UTC: Wicks above Asia High (1.0795) and closes back below (1.0770)
    candles.push({
      timestamp: createTimestamp(10, 8, 0),
      open: 1.0760,
      high: 1.0795,
      low: 1.0750,
      close: 1.0770,
    });

    const sweeps = detectInstitutionalSweeps(candles, 'EURUSD');

    expect(sweeps).toHaveLength(1);
    expect(sweeps[0].type).toBe('ASIA_HIGH_SWEEP');
    expect(sweeps[0].level).toBe(1.0780);
    expect(sweeps[0].wickPrice).toBe(1.0795);
    expect(sweeps[0].direction).toBe('bearish_reversal');
    expect(sweeps[0].rationale).toContain('Judas Swing');
  });
});
