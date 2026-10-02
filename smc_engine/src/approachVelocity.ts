import { Candle } from './types';
import { getPipSize } from './assetMetrics';

export interface ApproachVelocityInfo {
  readonly deltaPips: number;
  readonly atrMultiple: number;
  readonly isHighKineticEnergy: boolean;
  readonly warningText?: string;
}

/**
 * Evaluates whether price is aggressively slamming into the POI entry zone with high kinetic energy
 * (e.g. 3-bar displacement exceeding 2.0x 15M ATR).
 *
 * In institutional SMC trading, when price approaches a zone with high kinetic energy (V-shape news spike),
 * the zone is far more prone to being breached/swept immediately rather than holding.
 */
export function evaluateApproachVelocity(
  candles: readonly Candle[],
  currentIndex: number,
  tradeDirection: 'long' | 'short',
  zoneLow: number,
  zoneHigh: number,
  symbol: string,
  atrPips: number | null
): ApproachVelocityInfo {
  const pip = getPipSize(symbol);
  if (!atrPips || atrPips <= 0 || currentIndex < 3 || candles.length < 4) {
    return { deltaPips: 0, atrMultiple: 0, isHighKineticEnergy: false };
  }

  // Look at the displacement of the last 3 closed candles heading into the zone
  const startCandle = candles[Math.max(0, currentIndex - 2)];
  const currentCandle = candles[currentIndex];

  // For a short trade: POI is overhead resistance. Price approaches by moving UP into the zone.
  // For a long trade: POI is support below. Price approaches by moving DOWN into the zone.
  const isApproachingZone = tradeDirection === 'short'
    ? currentCandle.close > startCandle.open && currentCandle.close <= zoneHigh + 5 * pip
    : currentCandle.close < startCandle.open && currentCandle.close >= zoneLow - 5 * pip;

  const deltaPrice = Math.abs(currentCandle.close - startCandle.open);
  const deltaPips = Math.round((deltaPrice / pip) * 10) / 10;
  const atrMultiple = Math.round((deltaPips / atrPips) * 100) / 100;

  // Threshold: Approach velocity exceeding 2.0x 15M ATR in the last 3 candles
  const isHighKineticEnergy = isApproachingZone && atrMultiple >= 2.0;

  const warningText = isHighKineticEnergy
    ? `⚠️ YÜKSEK KİNETİK ENERJİ: Fiyat bölgeye son 3 mumda ${deltaPips} pip (${atrMultiple}x ATR) agresif momentumla yaklaşıyor. Kutu içinde 1M taban/tavan ve durulma görmeden KESİNLİKLE İŞLEM YOK.`
    : undefined;

  return {
    deltaPips,
    atrMultiple,
    isHighKineticEnergy,
    warningText,
  };
}
