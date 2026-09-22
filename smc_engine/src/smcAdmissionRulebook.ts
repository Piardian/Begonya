import type { AssetClass } from './assetMetrics';

export const SMC_ADMISSION_RULEBOOK_VERSION = 'SmcAdmissionRulebook.v1' as const;

export const SMC_ADMISSION_RULES = Object.freeze({
  poiTtlHours: 48,
  minimumDisplacementGradePoints: 1,
  distance: Object.freeze({
    FOREX: Object.freeze({ maxUnits: 35 }),
    FOREX_JPY: Object.freeze({ maxUnits: 50 }),
    XAU: Object.freeze({ maxUnits: 25, maxPercent: 0.60 }),
    COMMODITY: Object.freeze({ maxPercent: 1.0 }),
    CRYPTO_INDEX: Object.freeze({ maxPercent: 1.5 }),
  }),
  box: Object.freeze({
    FOREX: Object.freeze({
      defaultMinUnits: 7.0,
      volatileCrossMinUnits: 7.0,
      volatileCrossSymbols: Object.freeze(['CHF', 'CAD']),
    }),
    FOREX_JPY: Object.freeze({
      defaultMinUnits: 7.0,
      crossMinUnits: 7.0,
      crossPrefixes: Object.freeze(['GBP', 'CHF', 'EUR']),
    }),
    COMMODITY: Object.freeze({
      xauMinUnits: 25.0,
      defaultMinUnits: 15.0,
    }),
    CRYPTO: Object.freeze({
      btcMinUnits: 50.0,
      btcMinPercent: 0.06,
      altcoinMinPercent: 0.35,
    }),
    INDEX: Object.freeze({
      minUnits: 2.0,
      minPercent: 0.15,
    }),
    fallbackMinUnits: 7.0,
    dynamicAtrFraction: 0.25,
  }),
});

export type SmcAdmissionRulebookSnapshot =
  typeof SMC_ADMISSION_RULES & { version: typeof SMC_ADMISSION_RULEBOOK_VERSION };

export function getSmcAdmissionRulebookSnapshot(): SmcAdmissionRulebookSnapshot {
  return Object.freeze({
    version: SMC_ADMISSION_RULEBOOK_VERSION,
    ...SMC_ADMISSION_RULES,
  });
}

export function getPoiTtlMs(): number {
  return SMC_ADMISSION_RULES.poiTtlHours * 60 * 60 * 1000;
}

export function getMinimumDisplacementGradePoints(): number {
  return SMC_ADMISSION_RULES.minimumDisplacementGradePoints;
}

export function getDistanceRule(symbol: string, assetClass: AssetClass): {
  maxUnits?: number;
  maxPercent: number | null;
} {
  const upper = symbol.toUpperCase();

  if (assetClass === 'FOREX') {
    return { maxUnits: SMC_ADMISSION_RULES.distance.FOREX.maxUnits, maxPercent: null };
  }
  if (assetClass === 'FOREX_JPY') {
    return { maxUnits: SMC_ADMISSION_RULES.distance.FOREX_JPY.maxUnits, maxPercent: null };
  }
  if (assetClass === 'COMMODITY' && upper.startsWith('XAU')) {
    return {
      maxUnits: SMC_ADMISSION_RULES.distance.XAU.maxUnits,
      maxPercent: SMC_ADMISSION_RULES.distance.XAU.maxPercent,
    };
  }
  if (assetClass === 'COMMODITY') {
    return { maxPercent: SMC_ADMISSION_RULES.distance.COMMODITY.maxPercent };
  }
  return { maxPercent: SMC_ADMISSION_RULES.distance.CRYPTO_INDEX.maxPercent };
}
