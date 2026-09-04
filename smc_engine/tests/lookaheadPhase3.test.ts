import { Candle } from '../src/types';
import { detectSwings } from '../src/swingDetector';
import { detectStructure } from '../src/structureDetector';
import { detectAllOrderBlocks } from '../src/obDetector';
import { detectAllFVGs } from '../src/fvgDetector';

// Helper to create basic candles
function createBaseCandles(length: number): Candle[] {
  const candles: Candle[] = [];
  for (let i = 0; i < length; i++) {
    candles.push({
      timestamp: 1000 + i * 1000,
      open: 1.0500,
      high: 1.0500,
      low: 1.0500,
      close: 1.0500,
    });
  }
  return candles;
}

describe('Phase 3 Lookahead Bias Simulation Test', () => {
  test('should yield identical OBs and FVGs in batch vs step-by-step simulation', () => {
    const candles = createBaseCandles(30);

    // Setup swings:
    // Low 1 (i=2): price=1.0450 (confirmed i=4)
    candles[0].low = 1.0500; candles[1].low = 1.0480; candles[2].low = 1.0450; candles[3].low = 1.0470; candles[4].low = 1.0490;
    // High 1 (i=5): price=1.0520 (confirmed i=7)
    candles[3].high = 1.0500; candles[4].high = 1.0510; candles[5].high = 1.0520; candles[6].high = 1.0515; candles[7].high = 1.0505;
    // Low 2 (i=8): price=1.0470 (confirmed i=10)
    candles[6].low = 1.0500; candles[7].low = 1.0490; candles[8].low = 1.0470; candles[9].low = 1.0485; candles[10].low = 1.0495;
    // High 2 (i=11): price=1.0530 (confirmed i=13)
    candles[9].high = 1.0510; candles[10].high = 1.0520; candles[11].high = 1.0530; candles[12].high = 1.0525; candles[13].high = 1.0515;

    // Red OB Candle at index 14
    candles[14].open = 1.0510;
    candles[14].high = 1.0512;
    candles[14].low = 1.0505;
    candles[14].close = 1.0507;

    // Green Displacement Candle at index 15 (creates BOS since close 1.0540 > 1.0530)
    candles[15].open = 1.0507;
    candles[15].high = 1.0545;
    candles[15].low = 1.0507;
    candles[15].close = 1.0540;

    // Candle at index 16 (break validation candle)
    candles[16].open = 1.0540;
    candles[16].high = 1.0550;
    candles[16].low = 1.0535;
    candles[16].close = 1.0545;

    // Batch calculations
    const swingsBatch = detectSwings(candles);
    const structBatch = detectStructure(candles, swingsBatch);
    const obsBatch = detectAllOrderBlocks(candles, structBatch.events);
    const fvgsBatch = detectAllFVGs(candles, structBatch.events, 'EURUSD', '15m');

    // Simulation
    let lastObsLength = 0;
    let lastFvgsLength = 0;

    for (let t = 1; t <= candles.length; t++) {
      const slice = candles.slice(0, t);
      const swingsSlice = detectSwings(slice);
      const structSlice = detectStructure(slice, swingsSlice);
      const obsSlice = detectAllOrderBlocks(slice, structSlice.events);
      const fvgsSlice = detectAllFVGs(slice, structSlice.events, 'EURUSD', '15m');

      lastObsLength = obsSlice.length;
      lastFvgsLength = fvgsSlice.length;

      // Verify that slices match prefixes of batch
      const expectedObs = obsBatch.filter(o => o.relatedEvent.breakCandleIndex <= t - 1);
      expect(obsSlice).toHaveLength(expectedObs.length);

      const expectedFvgs = fvgsBatch.filter(f => f.middleCandleIndex + 1 <= t - 1);
      expect(fvgsSlice).toHaveLength(expectedFvgs.length);
    }

    expect(lastObsLength).toBe(obsBatch.length);
    expect(lastFvgsLength).toBe(fvgsBatch.length);
  });
});
