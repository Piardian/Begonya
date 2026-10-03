export type AssetClass = 'FOREX' | 'FOREX_JPY' | 'CRYPTO' | 'COMMODITY' | 'INDEX';

export interface DistanceInfo {
  readonly distanceRaw: number;
  readonly distanceUnits: number;
  readonly unitName: 'pip' | 'point' | 'USD';
  readonly percentDistance: number;
  readonly relation: 'above' | 'below' | 'in_zone';
  readonly relationText: string;
  readonly displayText: string;
  readonly isInZone: boolean;
}

const CRYPTO_PREFIXES = [
  'BTC', 'ETH', 'LTC', 'SOL',
  'SUI', 'AVAX', 'NEAR', 'APT', 'SEI', 'ARB', 'OP',
  'XRP', 'ADA', 'DASH', 'BCH', 'LINK', 'DOT',
  'FET', 'RENDER', 'TAO', 'VIRTUAL', 'WLD', 'ARKM', 'IO',
  'UNI', 'AAVE', 'PENDLE', 'INJ', 'CHZ', 'RVN', 'GALA', 'SAND',
  'DOGE', 'PEPE', 'SHIB', 'WIF', 'BONK', 'FLOKI', 'PENGU',
] as const;

const MICRO_PRICE_CRYPTO_PREFIXES = ['PEPE', 'SHIB', 'BONK', 'FLOKI'] as const;
const SUB_DOLLAR_CRYPTO_PREFIXES = [
  'DOGE', 'CHZ', 'RVN', 'GALA', 'SAND', 'PENGU', 'ADA', 'XRP',
  'SEI', 'ARB', 'OP', 'FET', 'WLD', 'ARKM', 'IO', 'VIRTUAL', 'WIF',
] as const;

export function detectAssetClass(symbol: string): AssetClass {
  const upper = symbol.toUpperCase();
  if (CRYPTO_PREFIXES.some(prefix => upper === `${prefix}USD` || upper === `${prefix}USDT` || upper === `${prefix}EUR` || upper === prefix)) {
    return 'CRYPTO';
  }
  if (upper.startsWith('XAU') || upper.startsWith('XAG') || upper.startsWith('OIL') || upper.startsWith('WTI') || upper.startsWith('BRENT')) {
    return 'COMMODITY';
  }
  if (upper === 'NAS100' || upper === 'US100' || upper === 'SPX500' || upper === 'US30' || upper === 'GER40') {
    return 'INDEX';
  }
  if (upper.includes('JPY')) {
    return 'FOREX_JPY';
  }
  return 'FOREX';
}

export function getPipSize(symbol: string): number {
  const assetClass = detectAssetClass(symbol);
  const upper = symbol.toUpperCase();
  switch (assetClass) {
    case 'FOREX':
      return 0.0001;
    case 'FOREX_JPY':
      return 0.01;
    case 'CRYPTO':
      if (MICRO_PRICE_CRYPTO_PREFIXES.some(p => upper.startsWith(p))) {
        return 0.00000001;
      }
      if (SUB_DOLLAR_CRYPTO_PREFIXES.some(p => upper.startsWith(p))) {
        return 0.0001;
      }
      if (upper.startsWith('BTC')) {
        return 1.0;
      }
      return 0.01;
    case 'COMMODITY':
      if (upper.startsWith('XAU')) {
        return 0.1;
      }
      return 0.01;
    case 'INDEX':
      return 1.0;
    default:
      return 0.0001;
  }
}

export function getDecimalPrecision(symbol: string): number {
  const assetClass = detectAssetClass(symbol);
  const upper = symbol.toUpperCase();
  switch (assetClass) {
    case 'FOREX':
      return 5;
    case 'FOREX_JPY':
      return 3;
    case 'CRYPTO':
      if (MICRO_PRICE_CRYPTO_PREFIXES.some(p => upper.startsWith(p))) {
        return 8;
      }
      if (SUB_DOLLAR_CRYPTO_PREFIXES.some(p => upper.startsWith(p))) {
        return 4;
      }
      return 2;
    case 'COMMODITY':
    case 'INDEX':
      return 2;
    default:
      return 5;
  }
}

export function formatPrice(value: number, symbol: string): string {
  const precision = getDecimalPrecision(symbol);
  return value.toFixed(precision);
}

export function calculateDistance(
  symbol: string,
  currentPrice: number,
  zoneLow: number,
  zoneHigh: number
): DistanceInfo {
  const assetClass = detectAssetClass(symbol);
  const isInZone = currentPrice >= zoneLow && currentPrice <= zoneHigh;
  const pip = getPipSize(symbol);

  if (isInZone) {
    return Object.freeze({
      distanceRaw: 0,
      distanceUnits: 0,
      unitName: assetClass === 'CRYPTO' || assetClass === 'COMMODITY' ? 'USD' : (assetClass === 'FOREX_JPY' || assetClass === 'INDEX' ? 'point' : 'pip'),
      percentDistance: 0,
      relation: 'in_zone',
      relationText: 'giriş bölgesinde',
      displayText: 'giriş bölgesinde (aktif retest)',
      isInZone: true,
    });
  }

  const isAbove = currentPrice > zoneHigh;
  const nearestEdge = isAbove ? zoneHigh : zoneLow;
  const distanceRaw = Math.abs(currentPrice - nearestEdge);
  const relation: 'above' | 'below' = isAbove ? 'above' : 'below';
  const relationText = isAbove ? 'giriş bölgesinin üstünde' : 'giriş bölgesinin altında';
  const percentDistance = nearestEdge > 0 ? (distanceRaw / nearestEdge) * 100 : 0;

  if (assetClass === 'CRYPTO') {
    const unitName = 'USD';
    const distanceUnits = distanceRaw;
    const displayText = `${distanceUnits.toFixed(1)} USD (%${percentDistance.toFixed(2)}) ${relationText}`;
    return Object.freeze({
      distanceRaw,
      distanceUnits,
      unitName,
      percentDistance,
      relation,
      relationText,
      displayText,
      isInZone: false,
    });
  }

  if (assetClass === 'COMMODITY') {
    const unitName = 'USD';
    const distanceUnits = distanceRaw;
    const displayText = `${distanceUnits.toFixed(2)} USD (%${percentDistance.toFixed(2)}) ${relationText}`;
    return Object.freeze({
      distanceRaw,
      distanceUnits,
      unitName,
      percentDistance,
      relation,
      relationText,
      displayText,
      isInZone: false,
    });
  }

  if (assetClass === 'INDEX') {
    const unitName = 'point';
    const distanceUnits = distanceRaw;
    const displayText = `${distanceUnits.toFixed(1)} point (%${percentDistance.toFixed(2)}) ${relationText}`;
    return Object.freeze({
      distanceRaw,
      distanceUnits,
      unitName,
      percentDistance,
      relation,
      relationText,
      displayText,
      isInZone: false,
    });
  }

  if (assetClass === 'FOREX_JPY') {
    const unitName = 'point';
    const distanceUnits = distanceRaw / pip;
    const displayText = `${distanceUnits.toFixed(1)} point ${relationText}`;
    return Object.freeze({
      distanceRaw,
      distanceUnits,
      unitName,
      percentDistance,
      relation,
      relationText,
      displayText,
      isInZone: false,
    });
  }

  // Standard FOREX
  const unitName = 'pip';
  const distanceUnits = distanceRaw / pip;
  const displayText = `${distanceUnits.toFixed(1)} pip ${relationText}`;
  return Object.freeze({
    distanceRaw,
    distanceUnits,
    unitName,
    percentDistance,
    relation,
    relationText,
    displayText,
    isInZone: false,
  });
}

import { SMC_ADMISSION_RULES } from './smcAdmissionRulebook';

export interface MinimumBoxSizeSpec {
  readonly minUnits: number;
  readonly minPercent?: number;
}

export function getMinimumBoxSize(symbol: string): MinimumBoxSizeSpec {
  const assetClass = detectAssetClass(symbol);
  const upper = symbol.toUpperCase();
  const rules = SMC_ADMISSION_RULES.box;

  if (assetClass === 'FOREX') {
    const isVolatileCross = rules.FOREX.volatileCrossSymbols.some(token => upper.includes(token));
    return Object.freeze({
      minUnits: isVolatileCross ? rules.FOREX.volatileCrossMinUnits : rules.FOREX.defaultMinUnits,
    });
  }

  if (assetClass === 'FOREX_JPY') {
    const isCross = rules.FOREX_JPY.crossPrefixes.some(prefix => upper.startsWith(prefix));
    return Object.freeze({
      minUnits: isCross ? rules.FOREX_JPY.crossMinUnits : rules.FOREX_JPY.defaultMinUnits,
    });
  }

  if (assetClass === 'COMMODITY') {
    if (upper.startsWith('XAU')) {
      return Object.freeze({ minUnits: rules.COMMODITY.xauMinUnits });
    }
    return Object.freeze({ minUnits: rules.COMMODITY.defaultMinUnits });
  }

  if (assetClass === 'CRYPTO') {
    if (upper.startsWith('BTC')) {
      return Object.freeze({ minUnits: rules.CRYPTO.btcMinUnits, minPercent: rules.CRYPTO.btcMinPercent });
    }
    return Object.freeze({ minUnits: 0, minPercent: rules.CRYPTO.altcoinMinPercent });
  }

  if (assetClass === 'INDEX') {
    return Object.freeze({ minUnits: rules.INDEX.minUnits, minPercent: rules.INDEX.minPercent });
  }

  return Object.freeze({ minUnits: rules.fallbackMinUnits });
}

export function isBoxTooNarrow(
  symbol: string,
  zoneLow: number,
  zoneHigh: number,
  atrPips?: number | null
): boolean {
  const zoneWidthRaw = Math.max(0, zoneHigh - zoneLow);
  const midPrice = (zoneHigh + zoneLow) / 2;
  if (midPrice <= 0 || zoneWidthRaw <= 0) return true;

  const pip = getPipSize(symbol);
  const zoneWidthUnits = zoneWidthRaw / pip;
  const zoneWidthPercent = (zoneWidthRaw / midPrice) * 100;

  const minSpec = getMinimumBoxSize(symbol);

  // 1. Minimum percent check (Crypto / Index)
  if (minSpec.minPercent !== undefined && zoneWidthPercent < minSpec.minPercent) {
    return true;
  }

  // 2. Minimum units check (Forex / Commodity pips)
  if (minSpec.minUnits > 0 && zoneWidthUnits < minSpec.minUnits) {
    return true;
  }

  // 3. Dynamic ATR check if ATR is provided (must be at least 25% of 15M ATR)
  if (atrPips !== undefined && atrPips !== null && atrPips > 0) {
    if (zoneWidthUnits < SMC_ADMISSION_RULES.box.dynamicAtrFraction * atrPips) {
      return true;
    }
  }

  // 4. Spread-to-Box Friction Check: Spread must not exceed 20% of box width
  const spreadPips = getEstimatedSpreadPips(symbol);
  if (zoneWidthUnits > 0 && (spreadPips / zoneWidthUnits) > 0.20) {
    return true;
  }

  return false;
}

export function getEstimatedSpreadPips(symbol: string): number {
  const upper = symbol.toUpperCase();
  if (upper === 'EURUSD' || upper === 'USDJPY') return 0.8;
  if (upper === 'GBPUSD' || upper === 'USDCHF' || upper === 'AUDUSD' || upper === 'NZDUSD' || upper === 'USDCAD') return 1.2;
  if (upper === 'GBPCHF') return 1.5;
  if (upper.includes('JPY')) return 1.5;
  if (upper.includes('CHF') || upper.includes('CAD') || upper.includes('AUD') || upper.includes('NZD') || upper === 'EURGBP') return 1.8;
  if (upper.startsWith('XAU')) return 2.0;
  if (upper.startsWith('NAS') || upper.startsWith('US100') || upper.startsWith('SPX')) return 1.5;
  if (upper.startsWith('BTC')) return 1.0;
  if (upper.startsWith('ETH') || upper.startsWith('SOL') || upper.startsWith('LTC')) return 0.2;
  return 1.2;
}

/**
 * Checks if the given timestamp falls into the midnight rollover spread spike window.
 * Window: 20:50 UTC to 22:15 UTC (23:50 to 01:15 TSİ / Turkey Time).
 * During this window, institutional liquidity thins and prop firm brokers widen spreads 3x-10x.
 */
export function isRolloverSpreadWindow(timestampMs?: number): boolean {
  if (timestampMs === undefined || !Number.isFinite(timestampMs)) {
    return false;
  }
  const d = new Date(timestampMs);
  const utcHours = d.getUTCHours();
  const utcMinutes = d.getUTCMinutes();
  const totalUtcMinutes = utcHours * 60 + utcMinutes;
  // 20:50 UTC = 20 * 60 + 50 = 1250 minutes
  // 22:15 UTC = 22 * 60 + 15 = 1335 minutes
  return totalUtcMinutes >= 1250 && totalUtcMinutes <= 1335;
}

