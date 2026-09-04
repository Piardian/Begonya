import { Candle, SwingPoint } from './types';

/**
 * Detects swing highs and swing lows using a 5-candle fractal definition.
 * A swing point at index i requires the high/low of candles at i-2, i-1, i+1, i+2
 * to be strictly lower (for high) or higher (for low).
 * 
 * EQUAL HIGH/LOW RULE:
 * If candle[i].high === candle[i-1].high or any other equality occurs, it is NOT considered a swing.
 * We enforce strict inequality (> and <) as requested.
 * 
 * LOOKAHEAD BIAS prevention:
 * The swing point is only confirmed when candle i+2 closes. Therefore:
 * - formedAtIndex = i
 * - confirmedAtIndex = i + 2
 */
export function detectSwings(candles: Candle[]): SwingPoint[] {
  const swings: SwingPoint[] = [];
  const n = candles.length;

  for (let i = 2; i < n - 2; i++) {
    const current = candles[i];
    
    // Check Swing High
    // Strict comparison (>): equal high situation is explicitly not a swing.
    if (
      current.high > candles[i - 1].high &&
      current.high > candles[i - 2].high &&
      current.high > candles[i + 1].high &&
      current.high > candles[i + 2].high
    ) {
      swings.push({
        type: 'high',
        price: current.high,
        formedAtIndex: i,
        confirmedAtIndex: i + 2,
        timestamp: current.timestamp,
      });
    }

    // Check Swing Low
    // Strict comparison (<): equal low situation is explicitly not a swing.
    if (
      current.low < candles[i - 1].low &&
      current.low < candles[i - 2].low &&
      current.low < candles[i + 1].low &&
      current.low < candles[i + 2].low
    ) {
      swings.push({
        type: 'low',
        price: current.low,
        formedAtIndex: i,
        confirmedAtIndex: i + 2,
        timestamp: current.timestamp,
      });
    }
  }

  // Sort chronologically by confirmedAtIndex, then by formedAtIndex to ensure order
  return swings.sort((a, b) => {
    if (a.confirmedAtIndex !== b.confirmedAtIndex) {
      return a.confirmedAtIndex - b.confirmedAtIndex;
    }
    return a.formedAtIndex - b.formedAtIndex;
  });
}
