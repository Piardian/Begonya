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

export function detectAssetClass(symbol: string): AssetClass {
  const upper = symbol.toUpperCase();
  if (upper.startsWith('BTC') || upper.startsWith('ETH') || upper.startsWith('LTC') || upper.startsWith('SOL')) {
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
  switch (assetClass) {
    case 'FOREX':
      return 0.0001;
    case 'FOREX_JPY':
      return 0.01;
    case 'CRYPTO':
      if (symbol.toUpperCase().startsWith('LTC') || symbol.toUpperCase().startsWith('SOL')) {
        return 0.01;
      }
      return 1.0;
    case 'COMMODITY':
      if (symbol.toUpperCase().startsWith('XAU')) {
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
  switch (assetClass) {
    case 'FOREX':
      return 5;
    case 'FOREX_JPY':
      return 3;
    case 'CRYPTO':
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
