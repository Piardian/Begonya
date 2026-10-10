import { detectLiquidityMagnet } from '../src/liquidityMagnetDetector';
import { SwingPoint } from '../src/types';

describe('Liquidity Magnet Detector (EQH / EQL)', () => {
  it('detects EQH (Equal Highs) above current price for long trade', () => {
    const swings: SwingPoint[] = [
      { type: 'high', price: 1.0550, formedAtIndex: 10, confirmedAtIndex: 12, timestamp: 1000 },
      { type: 'low', price: 1.0500, formedAtIndex: 15, confirmedAtIndex: 17, timestamp: 2000 },
      { type: 'high', price: 1.0551, formedAtIndex: 20, confirmedAtIndex: 22, timestamp: 3000 }, // ~1 pip diff
    ];
    const currentPrice = 1.0520;

    const magnet = detectLiquidityMagnet(swings, currentPrice, 'long', 'EURUSD');
    expect(magnet).not.toBeNull();
    expect(magnet?.type).toBe('EQH');
    expect(magnet?.pointsCount).toBe(2);
    expect(magnet?.isActive).toBe(true);
    expect(magnet?.distancePips).toBeCloseTo(30.5, 0.5);
    expect(magnet?.description).toContain('EQH');
  });

  it('detects EQL (Equal Lows) below current price for short trade', () => {
    const swings: SwingPoint[] = [
      { type: 'high', price: 195.0, formedAtIndex: 10, confirmedAtIndex: 12, timestamp: 1000 },
      { type: 'low', price: 192.50, formedAtIndex: 15, confirmedAtIndex: 17, timestamp: 2000 },
      { type: 'low', price: 192.52, formedAtIndex: 20, confirmedAtIndex: 22, timestamp: 3000 }, // 2 points diff
    ];
    const currentPrice = 193.50;

    const magnet = detectLiquidityMagnet(swings, currentPrice, 'short', 'CHFJPY');
    expect(magnet).not.toBeNull();
    expect(magnet?.type).toBe('EQL');
    expect(magnet?.pointsCount).toBe(2);
    expect(magnet?.isActive).toBe(true);
    expect(magnet?.distancePips).toBeCloseTo(99, 1);
    expect(magnet?.description).toContain('EQL');
  });

  it('returns null when swings are too dispersed to be equal', () => {
    const swings: SwingPoint[] = [
      { type: 'high', price: 1.0550, formedAtIndex: 10, confirmedAtIndex: 12, timestamp: 1000 },
      { type: 'high', price: 1.0580, formedAtIndex: 20, confirmedAtIndex: 22, timestamp: 3000 }, // 30 pips diff
    ];
    const currentPrice = 1.0520;

    const magnet = detectLiquidityMagnet(swings, currentPrice, 'long', 'EURUSD');
    expect(magnet).toBeNull();
  });

  it('filters out EQH clusters closer than minDistancePips and selects the next cluster >= minDistancePips', () => {
    const swings: SwingPoint[] = [
      // Cluster 1 at 1.0535 (15 pips away)
      { type: 'high', price: 1.0535, formedAtIndex: 5, confirmedAtIndex: 7, timestamp: 500 },
      { type: 'high', price: 1.0536, formedAtIndex: 8, confirmedAtIndex: 10, timestamp: 800 },
      // Cluster 2 at 1.0560 (40 pips away)
      { type: 'high', price: 1.0560, formedAtIndex: 15, confirmedAtIndex: 17, timestamp: 1500 },
      { type: 'high', price: 1.0561, formedAtIndex: 20, confirmedAtIndex: 22, timestamp: 2000 },
    ];
    const currentPrice = 1.0520;

    // Without minDistancePips: selects Cluster 1 (closer, 15 pips)
    const magnetNear = detectLiquidityMagnet(swings, currentPrice, 'long', 'EURUSD');
    expect(magnetNear?.distancePips).toBeCloseTo(15.5, 0.5);

    // With minDistancePips = 30.0 (e.g. 2.0R): skips Cluster 1, selects Cluster 2 (40 pips)
    const magnetFar = detectLiquidityMagnet(swings, currentPrice, 'long', 'EURUSD', undefined, undefined, 30.0);
    expect(magnetFar).not.toBeNull();
    expect(magnetFar?.distancePips).toBeCloseTo(40.5, 0.5);
    expect(magnetFar?.priceLevel).toBeCloseTo(1.05605, 4);
  });
});
