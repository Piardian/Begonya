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
  'EURCHF',
  'GBPCHF',
  'AUDCHF',
  'CADCHF',
  'NZDCHF',
  'CHFJPY',
] as const;
export const COMMODITIES_INDICES_UNIVERSE = ['NAS100', 'XAUUSD'] as const;
export const CRYPTO_UNIVERSE = ['BTCUSD', 'ETHUSD', 'LTCUSD', 'SOLUSD'] as const;

export const ALL_SYMBOLS = [
  ...CORE_UNIVERSE,
  ...NEW_CROSS_UNIVERSE,
  ...COMMODITIES_INDICES_UNIVERSE,
  ...CRYPTO_UNIVERSE,
] as const;

export type Symbol =
  | (typeof ALL_SYMBOLS)[number]
  | 'BTCEUR'
  | 'ETHEUR'
  | 'LTCEUR';



export type UniverseCohort =
  | 'CORE_UNIVERSE'
  | 'NEW_CROSS_UNIVERSE'
  | 'COMMODITIES_INDICES_UNIVERSE'
  | 'CRYPTO_UNIVERSE';

export const UNIVERSE_VERSION = 'fx-metals-indices-crypto-v1' as const;

export function universeCohort(symbol: Symbol): UniverseCohort {
  if ((CORE_UNIVERSE as readonly string[]).includes(symbol)) return 'CORE_UNIVERSE';
  if ((NEW_CROSS_UNIVERSE as readonly string[]).includes(symbol)) return 'NEW_CROSS_UNIVERSE';
  if ((COMMODITIES_INDICES_UNIVERSE as readonly string[]).includes(symbol)) return 'COMMODITIES_INDICES_UNIVERSE';
  if ((CRYPTO_UNIVERSE as readonly string[]).includes(symbol)) return 'CRYPTO_UNIVERSE';
  return 'CORE_UNIVERSE';
}


