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
});
