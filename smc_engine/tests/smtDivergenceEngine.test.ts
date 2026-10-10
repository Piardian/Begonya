import { Candle, SwingPoint } from '../src/types';
import { detectSMTDivergence, CORRELATED_PAIRS_MAP } from '../src/smtDivergenceEngine';

function createMockCandles(length: number): Candle[] {
  const candles: Candle[] = [];
  for (let i = 0; i < length; i++) {
    candles.push({
      timestamp: 1000 * 60 * 15 * i,
      open: 1.0500,
      high: 1.0550,
      low: 1.0450,
      close: 1.0500,
    });
  }
  return candles;
}

describe('SMT Divergence Engine', () => {
  test('should return NONE when insufficient swings exist', () => {
    const candles = createMockCandles(10);
    const result = detectSMTDivergence('EURUSD', 'GBPUSD', 5, [], [], candles);
    expect(result.hasDivergence).toBe(false);
    expect(result.type).toBe('NONE');
  });

  test('should detect Bearish SMT when EURUSD makes Higher High but GBPUSD makes Lower High', () => {
    const candles = createMockCandles(30);

    // Primary (EURUSD): High 1 at idx 5 (1.0800), High 2 at idx 15 (1.0850) -> Higher High (HH)
    const eurusdSwings: SwingPoint[] = [
      { type: 'high', price: 1.0800, formedAtIndex: 5, confirmedAtIndex: 8, timestamp: 5000 },
      { type: 'high', price: 1.0850, formedAtIndex: 15, confirmedAtIndex: 18, timestamp: 15000 },
    ];

    // Correlated (GBPUSD): High 1 at idx 6 (1.2700), High 2 at idx 16 (1.2650) -> Lower High (LH)
    const gbpusdSwings: SwingPoint[] = [
      { type: 'high', price: 1.2700, formedAtIndex: 6, confirmedAtIndex: 9, timestamp: 6000 },
      { type: 'high', price: 1.2650, formedAtIndex: 16, confirmedAtIndex: 19, timestamp: 16000 },
    ];

    const result = detectSMTDivergence('EURUSD', 'GBPUSD', 20, eurusdSwings, gbpusdSwings, candles);

    expect(result.hasDivergence).toBe(true);
    expect(result.type).toBe('BEARISH_SMT');
    expect(result.qualityScore).toBe(2);
    expect(result.rationale).toContain('Bearish SMT');
  });

  test('should detect Bullish SMT when BTCUSD makes Lower Low but ETHUSD makes Higher Low', () => {
    const candles = createMockCandles(30);

    // Primary (BTCUSD): Low 1 at idx 5 (60000), Low 2 at idx 15 (59000) -> Lower Low (LL)
    const btcSwings: SwingPoint[] = [
      { type: 'low', price: 60000, formedAtIndex: 5, confirmedAtIndex: 8, timestamp: 5000 },
      { type: 'low', price: 59000, formedAtIndex: 15, confirmedAtIndex: 18, timestamp: 15000 },
    ];

    // Correlated (ETHUSD): Low 1 at idx 5 (3000), Low 2 at idx 15 (3050) -> Higher Low (HL)
    const ethSwings: SwingPoint[] = [
      { type: 'low', price: 3000, formedAtIndex: 5, confirmedAtIndex: 8, timestamp: 5000 },
      { type: 'low', price: 3050, formedAtIndex: 15, confirmedAtIndex: 18, timestamp: 15000 },
    ];

    const result = detectSMTDivergence('BTCUSD', 'ETHUSD', 20, btcSwings, ethSwings, candles);

    expect(result.hasDivergence).toBe(true);
    expect(result.type).toBe('BULLISH_SMT');
    expect(result.qualityScore).toBe(2);
    expect(result.rationale).toContain('Bullish SMT');
  });

  test('should have expected correlated pairs map entries', () => {
    expect(CORRELATED_PAIRS_MAP['EURUSD']).toBe('GBPUSD');
    expect(CORRELATED_PAIRS_MAP['BTCUSD']).toBe('ETHUSD');
    expect(CORRELATED_PAIRS_MAP['NAS100']).toBe('SPX500');
  });
});
