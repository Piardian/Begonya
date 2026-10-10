import { Candle, SwingPoint } from './types';

export interface SMTDivergenceResult {
  hasDivergence: boolean;
  type: 'BULLISH_SMT' | 'BEARISH_SMT' | 'NONE';
  primarySymbol: string;
  correlatedSymbol: string;
  divergenceCandleIndex: number;
  timestamp: number;
  qualityScore: number; // 1 (standard) or 2 (strong sweep divergence)
  primarySwingPrice: number;
  correlatedSwingPrice: number;
  rationale: string;
}

export const CORRELATED_PAIRS_MAP: Record<string, string> = {
  'EURUSD': 'GBPUSD',
  'GBPUSD': 'EURUSD',
  'BTCUSD': 'ETHUSD',
  'ETHUSD': 'BTCUSD',
  'NAS100': 'SPX500',
  'SPX500': 'NAS100',
  'US100': 'US500',
  'US500': 'US100',
  'AUDUSD': 'NZDUSD',
  'NZDUSD': 'AUDUSD',
};

/**
 * Detects Smart Money Tool (SMT) Divergence between a primary symbol and its correlated partner.
 * 
 * SMT Divergence principles:
 * - Bearish SMT: One asset forms a Higher High (sweeping BSL) while the correlated asset fails to make a Higher High (forming a Lower High). Indicates institutional distribution.
 * - Bullish SMT: One asset forms a Lower Low (sweeping SSL) while the correlated asset fails to make a Lower Low (forming a Higher Low). Indicates institutional accumulation.
 * 
 * Strict Zero-Lookahead safety: only confirmed swings formed prior to currentCandleIndex are compared.
 */
export function detectSMTDivergence(
  primarySymbol: string,
  correlatedSymbol: string,
  currentCandleIndex: number,
  primarySwings: readonly SwingPoint[],
  correlatedSwings: readonly SwingPoint[],
  primaryCandles: readonly Candle[],
  maxLookbackBars = 48
): SMTDivergenceResult {
  const noneResult: SMTDivergenceResult = {
    hasDivergence: false,
    type: 'NONE',
    primarySymbol,
    correlatedSymbol,
    divergenceCandleIndex: currentCandleIndex,
    timestamp: primaryCandles[currentCandleIndex]?.timestamp ?? Date.now(),
    qualityScore: 0,
    primarySwingPrice: 0,
    correlatedSwingPrice: 0,
    rationale: 'No SMT divergence detected.',
  };

  if (primarySwings.length < 2 || correlatedSwings.length < 2 || currentCandleIndex < 5) {
    return noneResult;
  }

  // Filter confirmed swings formed prior to current index and within lookback
  const validPrimaryHighs = primarySwings
    .filter(s => s.type === 'high' && s.confirmedAtIndex <= currentCandleIndex && currentCandleIndex - s.formedAtIndex <= maxLookbackBars)
    .sort((a, b) => a.formedAtIndex - b.formedAtIndex);

  const validCorrelatedHighs = correlatedSwings
    .filter(s => s.type === 'high' && s.confirmedAtIndex <= currentCandleIndex && currentCandleIndex - s.formedAtIndex <= maxLookbackBars)
    .sort((a, b) => a.formedAtIndex - b.formedAtIndex);

  // 1. Evaluate Bearish SMT Divergence (Highs)
  if (validPrimaryHighs.length >= 2 && validCorrelatedHighs.length >= 2) {
    const p1 = validPrimaryHighs[validPrimaryHighs.length - 2];
    const p2 = validPrimaryHighs[validPrimaryHighs.length - 1];
    const c1 = validCorrelatedHighs[validCorrelatedHighs.length - 2];
    const c2 = validCorrelatedHighs[validCorrelatedHighs.length - 1];

    // Swings must have rough time alignment (within 12 bars)
    const indexDiff1 = Math.abs(p1.formedAtIndex - c1.formedAtIndex);
    const indexDiff2 = Math.abs(p2.formedAtIndex - c2.formedAtIndex);

    if (indexDiff1 <= 12 && indexDiff2 <= 12) {
      const primaryIsHH = p2.price > p1.price;
      const correlatedIsHH = c2.price > c1.price;

      if (primaryIsHH && !correlatedIsHH) {
        return {
          hasDivergence: true,
          type: 'BEARISH_SMT',
          primarySymbol,
          correlatedSymbol,
          divergenceCandleIndex: p2.formedAtIndex,
          timestamp: p2.timestamp,
          qualityScore: 2,
          primarySwingPrice: p2.price,
          correlatedSwingPrice: c2.price,
          rationale: `Bearish SMT: ${primarySymbol} yeni zirve yaptı (HH: ${p2.price} > ${p1.price}), fakat ${correlatedSymbol} zirvesini aşamadı (LH: ${c2.price} <= ${c1.price}). Kurumsal zayıflık ve likidite avı teyit edildi.`,
        };
      } else if (!primaryIsHH && correlatedIsHH) {
        return {
          hasDivergence: true,
          type: 'BEARISH_SMT',
          primarySymbol,
          correlatedSymbol,
          divergenceCandleIndex: p2.formedAtIndex,
          timestamp: p2.timestamp,
          qualityScore: 2,
          primarySwingPrice: p2.price,
          correlatedSwingPrice: c2.price,
          rationale: `Bearish SMT: ${correlatedSymbol} yeni zirve yaptı (HH: ${c2.price} > ${c1.price}), fakat ${primarySymbol} zirvesini aşamadı (LH: ${p2.price} <= ${p1.price}). ${primarySymbol} üzerindeki kurumsal satış baskısı teyit edildi.`,
        };
      }
    }
  }

  // 2. Evaluate Bullish SMT Divergence (Lows)
  const validPrimaryLows = primarySwings
    .filter(s => s.type === 'low' && s.confirmedAtIndex <= currentCandleIndex && currentCandleIndex - s.formedAtIndex <= maxLookbackBars)
    .sort((a, b) => a.formedAtIndex - b.formedAtIndex);

  const validCorrelatedLows = correlatedSwings
    .filter(s => s.type === 'low' && s.confirmedAtIndex <= currentCandleIndex && currentCandleIndex - s.formedAtIndex <= maxLookbackBars)
    .sort((a, b) => a.formedAtIndex - b.formedAtIndex);

  if (validPrimaryLows.length >= 2 && validCorrelatedLows.length >= 2) {
    const p1 = validPrimaryLows[validPrimaryLows.length - 2];
    const p2 = validPrimaryLows[validPrimaryLows.length - 1];
    const c1 = validCorrelatedLows[validCorrelatedLows.length - 2];
    const c2 = validCorrelatedLows[validCorrelatedLows.length - 1];

    const indexDiff1 = Math.abs(p1.formedAtIndex - c1.formedAtIndex);
    const indexDiff2 = Math.abs(p2.formedAtIndex - c2.formedAtIndex);

    if (indexDiff1 <= 12 && indexDiff2 <= 12) {
      const primaryIsLL = p2.price < p1.price;
      const correlatedIsLL = c2.price < c1.price;

      if (primaryIsLL && !correlatedIsLL) {
        return {
          hasDivergence: true,
          type: 'BULLISH_SMT',
          primarySymbol,
          correlatedSymbol,
          divergenceCandleIndex: p2.formedAtIndex,
          timestamp: p2.timestamp,
          qualityScore: 2,
          primarySwingPrice: p2.price,
          correlatedSwingPrice: c2.price,
          rationale: `Bullish SMT: ${primarySymbol} yeni dip yaptı (LL: ${p2.price} < ${p1.price}), fakat ${correlatedSymbol} dip yapmayı reddetti (HL: ${c2.price} >= ${c1.price}). Kurumsal alım ve SSL emilimi teyit edildi.`,
        };
      } else if (!primaryIsLL && correlatedIsLL) {
        return {
          hasDivergence: true,
          type: 'BULLISH_SMT',
          primarySymbol,
          correlatedSymbol,
          divergenceCandleIndex: p2.formedAtIndex,
          timestamp: p2.timestamp,
          qualityScore: 2,
          primarySwingPrice: p2.price,
          correlatedSwingPrice: c2.price,
          rationale: `Bullish SMT: ${correlatedSymbol} yeni dip yaptı (LL: ${c2.price} < ${c1.price}), fakat ${primarySymbol} dip yapmayarak güç gösterdi (HL: ${p2.price} >= ${p1.price}). Kurumsal görece güç teyit edildi.`,
        };
      }
    }
  }

  return noneResult;
}
