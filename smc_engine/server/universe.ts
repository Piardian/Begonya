export const CORE_UNIVERSE = [
  'EURUSD',
  'GBPUSD',
  'AUDUSD',
  'USDCAD',
  'USDJPY',
  'NZDUSD',
  'USDCHF',
] as const;
export const NEW_CROSS_UNIVERSE = [
  'AUDCAD',
  'EURGBP',
  'EURJPY',
  'GBPJPY',
  'CADJPY',
  'AUDJPY',
  'EURAUD',
  'NZDCAD',
  'EURCHF',
  'GBPCHF',
  'AUDCHF',
  'CADCHF',
  'NZDCHF',
  'CHFJPY',
] as const;
export const COMMODITIES_INDICES_UNIVERSE = ['NAS100', 'XAUUSD'] as const;
export const CRYPTO_UNIVERSE = ['BTCUSD', 'ETHUSD', 'LTCUSD', 'SOLUSD'] as const;

/**
 * On-Demand Altcoin Rotation Universe (Layers 2-6, including AI, DeFi/Gaming, Legacy, and Meme Coins).
 * Intentionally excluded from continuous ALL_SYMBOLS polling to protect API rate limits.
 * Polled on-demand ONLY when Macro + 8-Factor Crypto Rotation Engine approve a target coin (score >= 65).
 */
export const ON_DEMAND_ALTCOIN_UNIVERSE = [
  // Layer 2: Major L1 & L2
  'SUIUSD',
  'AVAXUSD',
  'NEARUSD',
  'APTUSD',
  'SEIUSD',
  'ARBUSD',
  'OPUSD',
  // Layer 3: Legacy & Payment Infrastructure
  'XRPUSD',
  'ADAUSD',
  'DASHUSD',
  'BCHUSD',
  'LINKUSD',
  'DOTUSD',
  // Layer 4: AI, Compute & DePIN
  'FETUSD',
  'RENDERUSD',
  'TAOUSD',
  'VIRTUALUSD',
  'WLDUSD',
  'ARKMUSD',
  'IOUSD',
  // Layer 5: DeFi, Gaming & Mid-Cap Utility
  'UNIUSD',
  'AAVEUSD',
  'PENDLEUSD',
  'INJUSD',
  'CHZUSD',
  'RVNUSD',
  'GALAUSD',
  'SANDUSD',
  // Layer 6: Meme Coins (High-Beta Bottom Layer)
  'DOGEUSD',
  'PEPEUSD',
  'SHIBUSD',
  'WIFUSD',
  'BONKUSD',
  'FLOKIUSD',
  'PENGUUSD',
] as const;

export const ALL_SYMBOLS = [
  ...CORE_UNIVERSE,
  ...NEW_CROSS_UNIVERSE,
  ...COMMODITIES_INDICES_UNIVERSE,
  ...CRYPTO_UNIVERSE,
] as const;

export type Symbol =
  | (typeof ALL_SYMBOLS)[number]
  | (typeof ON_DEMAND_ALTCOIN_UNIVERSE)[number]
  | 'BTCEUR'
  | 'ETHEUR'
  | 'LTCEUR';

export type UniverseCohort =
  | 'CORE_UNIVERSE'
  | 'NEW_CROSS_UNIVERSE'
  | 'COMMODITIES_INDICES_UNIVERSE'
  | 'CRYPTO_UNIVERSE';

export const UNIVERSE_VERSION = 'fx-metals-indices-crypto-v2-ondemand' as const;

export const BLACKLISTED_SYMBOLS: readonly string[] = ['GBPCHF'];

export function isSymbolBlacklisted(symbol: string): boolean {
  return BLACKLISTED_SYMBOLS.includes(symbol.toUpperCase());
}

export function isOnDemandAltcoinSymbol(symbol: string): boolean {
  return (ON_DEMAND_ALTCOIN_UNIVERSE as readonly string[]).includes(symbol.toUpperCase());
}

export function universeCohort(symbol: Symbol): UniverseCohort {
  if ((CORE_UNIVERSE as readonly string[]).includes(symbol)) return 'CORE_UNIVERSE';
  if ((NEW_CROSS_UNIVERSE as readonly string[]).includes(symbol)) return 'NEW_CROSS_UNIVERSE';
  if ((COMMODITIES_INDICES_UNIVERSE as readonly string[]).includes(symbol)) return 'COMMODITIES_INDICES_UNIVERSE';
  if (
    (CRYPTO_UNIVERSE as readonly string[]).includes(symbol) ||
    (ON_DEMAND_ALTCOIN_UNIVERSE as readonly string[]).includes(symbol)
  ) {
    return 'CRYPTO_UNIVERSE';
  }
  return 'CORE_UNIVERSE';
}



