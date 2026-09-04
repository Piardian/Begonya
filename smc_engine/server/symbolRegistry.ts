export interface SymbolRegistryEntry {
  internalSymbol: string;
  marketDataProvider: 'TwelveData';
  marketDataSymbol: string;
  chartProvider: 'TradingView';
  chartSymbol: string;
  assetClass: 'Index' | 'Forex' | 'Commodity' | 'Crypto';
  tickSize: number;
  pointValue: number | null;
  timezone: string;
  sessions: string[];
  enabledForDetection: boolean;
  dataStatus: 'UNVERIFIED' | 'VERIFIED';
}

export const NAS100_REGISTRY: SymbolRegistryEntry = Object.freeze({
  internalSymbol: 'NAS100',
  marketDataProvider: 'TwelveData',
  marketDataSymbol: 'QQQ',
  chartProvider: 'TradingView',
  chartSymbol: 'PEPPERSTONE:NAS100',
  assetClass: 'Index',
  tickSize: 1,
  pointValue: null,
  timezone: 'UTC',
  sessions: ['US_EQUITIES', 'NEW_YORK'],
  enabledForDetection: true,
  dataStatus: 'VERIFIED',
});

export const AUDUSD_REGISTRY: SymbolRegistryEntry = Object.freeze({
  internalSymbol: 'AUDUSD',
  marketDataProvider: 'TwelveData',
  marketDataSymbol: 'AUD/USD',
  chartProvider: 'TradingView',
  chartSymbol: 'PEPPERSTONE:AUDUSD',
  assetClass: 'Forex',
  tickSize: 0.00001,
  pointValue: 1,
  timezone: 'UTC',
  sessions: ['LONDON', 'NEW_YORK', 'ASIA'],
  enabledForDetection: true,
  dataStatus: 'VERIFIED',
});

export const USDCAD_REGISTRY: SymbolRegistryEntry = Object.freeze({
  internalSymbol: 'USDCAD',
  marketDataProvider: 'TwelveData',
  marketDataSymbol: 'USD/CAD',
  chartProvider: 'TradingView',
  chartSymbol: 'PEPPERSTONE:USDCAD',
  assetClass: 'Forex',
  tickSize: 0.00001,
  pointValue: 1,
  timezone: 'UTC',
  sessions: ['LONDON', 'NEW_YORK', 'ASIA'],
  enabledForDetection: true,
  dataStatus: 'VERIFIED',
});

export const USDJPY_REGISTRY: SymbolRegistryEntry = Object.freeze({
  internalSymbol: 'USDJPY',
  marketDataProvider: 'TwelveData',
  marketDataSymbol: 'USD/JPY',
  chartProvider: 'TradingView',
  chartSymbol: 'PEPPERSTONE:USDJPY',
  assetClass: 'Forex',
  tickSize: 0.001,
  pointValue: 1,
  timezone: 'UTC',
  sessions: ['LONDON', 'NEW_YORK', 'ASIA'],
  enabledForDetection: true,
  dataStatus: 'VERIFIED',
});

export const NZDUSD_REGISTRY: SymbolRegistryEntry = Object.freeze({
  internalSymbol: 'NZDUSD',
  marketDataProvider: 'TwelveData',
  marketDataSymbol: 'NZD/USD',
  chartProvider: 'TradingView',
  chartSymbol: 'PEPPERSTONE:NZDUSD',
  assetClass: 'Forex',
  tickSize: 0.00001,
  pointValue: 1,
  timezone: 'UTC',
  sessions: ['LONDON', 'NEW_YORK', 'ASIA'],
  enabledForDetection: true,
  dataStatus: 'VERIFIED',
});

export const USDCHF_REGISTRY: SymbolRegistryEntry = Object.freeze({
  internalSymbol: 'USDCHF',
  marketDataProvider: 'TwelveData',
  marketDataSymbol: 'USD/CHF',
  chartProvider: 'TradingView',
  chartSymbol: 'PEPPERSTONE:USDCHF',
  assetClass: 'Forex',
  tickSize: 0.00001,
  pointValue: 1,
  timezone: 'UTC',
  sessions: ['LONDON', 'NEW_YORK', 'ASIA'],
  enabledForDetection: true,
  dataStatus: 'VERIFIED',
});

export const EURCHF_REGISTRY: SymbolRegistryEntry = Object.freeze({
  internalSymbol: 'EURCHF',
  marketDataProvider: 'TwelveData',
  marketDataSymbol: 'EUR/CHF',
  chartProvider: 'TradingView',
  chartSymbol: 'PEPPERSTONE:EURCHF',
  assetClass: 'Forex',
  tickSize: 0.00001,
  pointValue: 1,
  timezone: 'UTC',
  sessions: ['LONDON', 'NEW_YORK', 'ASIA'],
  enabledForDetection: true,
  dataStatus: 'VERIFIED',
});

export const GBPCHF_REGISTRY: SymbolRegistryEntry = Object.freeze({
  internalSymbol: 'GBPCHF',
  marketDataProvider: 'TwelveData',
  marketDataSymbol: 'GBP/CHF',
  chartProvider: 'TradingView',
  chartSymbol: 'PEPPERSTONE:GBPCHF',
  assetClass: 'Forex',
  tickSize: 0.00001,
  pointValue: 1,
  timezone: 'UTC',
  sessions: ['LONDON', 'NEW_YORK', 'ASIA'],
  enabledForDetection: true,
  dataStatus: 'VERIFIED',
});

export const AUDCHF_REGISTRY: SymbolRegistryEntry = Object.freeze({
  internalSymbol: 'AUDCHF',
  marketDataProvider: 'TwelveData',
  marketDataSymbol: 'AUD/CHF',
  chartProvider: 'TradingView',
  chartSymbol: 'PEPPERSTONE:AUDCHF',
  assetClass: 'Forex',
  tickSize: 0.00001,
  pointValue: 1,
  timezone: 'UTC',
  sessions: ['LONDON', 'NEW_YORK', 'ASIA'],
  enabledForDetection: true,
  dataStatus: 'VERIFIED',
});

export const CADCHF_REGISTRY: SymbolRegistryEntry = Object.freeze({
  internalSymbol: 'CADCHF',
  marketDataProvider: 'TwelveData',
  marketDataSymbol: 'CAD/CHF',
  chartProvider: 'TradingView',
  chartSymbol: 'PEPPERSTONE:CADCHF',
  assetClass: 'Forex',
  tickSize: 0.00001,
  pointValue: 1,
  timezone: 'UTC',
  sessions: ['LONDON', 'NEW_YORK', 'ASIA'],
  enabledForDetection: true,
  dataStatus: 'VERIFIED',
});

export const NZDCHF_REGISTRY: SymbolRegistryEntry = Object.freeze({
  internalSymbol: 'NZDCHF',
  marketDataProvider: 'TwelveData',
  marketDataSymbol: 'NZD/CHF',
  chartProvider: 'TradingView',
  chartSymbol: 'PEPPERSTONE:NZDCHF',
  assetClass: 'Forex',
  tickSize: 0.00001,
  pointValue: 1,
  timezone: 'UTC',
  sessions: ['LONDON', 'NEW_YORK', 'ASIA'],
  enabledForDetection: true,
  dataStatus: 'VERIFIED',
});

export const CHFJPY_REGISTRY: SymbolRegistryEntry = Object.freeze({
  internalSymbol: 'CHFJPY',
  marketDataProvider: 'TwelveData',
  marketDataSymbol: 'CHF/JPY',
  chartProvider: 'TradingView',
  chartSymbol: 'PEPPERSTONE:CHFJPY',
  assetClass: 'Forex',
  tickSize: 0.001,
  pointValue: 1,
  timezone: 'UTC',
  sessions: ['LONDON', 'NEW_YORK', 'ASIA'],
  enabledForDetection: true,
  dataStatus: 'VERIFIED',
});

export const SOLUSD_REGISTRY: SymbolRegistryEntry = Object.freeze({
  internalSymbol: 'SOLUSD',
  marketDataProvider: 'TwelveData',
  marketDataSymbol: 'SOL/USD',
  chartProvider: 'TradingView',
  chartSymbol: 'BINANCE:SOLUSDT',
  assetClass: 'Crypto',
  tickSize: 0.01,
  pointValue: 1,
  timezone: 'UTC',
  sessions: ['CRYPTO_24_7'],
  enabledForDetection: true,
  dataStatus: 'VERIFIED',
});

export const XAUUSD_REGISTRY: SymbolRegistryEntry = Object.freeze({
  internalSymbol: 'XAUUSD',
  marketDataProvider: 'TwelveData',
  marketDataSymbol: 'XAU/USD',
  chartProvider: 'TradingView',
  chartSymbol: 'OANDA:XAUUSD',
  assetClass: 'Commodity',
  tickSize: 0.01,
  pointValue: 1,
  timezone: 'UTC',
  sessions: ['LONDON', 'NEW_YORK', 'ASIA'],
  enabledForDetection: true,
  dataStatus: 'VERIFIED',
});


export const BTCUSD_REGISTRY: SymbolRegistryEntry = Object.freeze({
  internalSymbol: 'BTCUSD',
  marketDataProvider: 'TwelveData',
  marketDataSymbol: 'BTC/USD',
  chartProvider: 'TradingView',
  chartSymbol: 'BINANCE:BTCUSDT',
  assetClass: 'Crypto',
  tickSize: 0.01,
  pointValue: 1,
  timezone: 'UTC',
  sessions: ['CRYPTO_24_7'],
  enabledForDetection: true,
  dataStatus: 'VERIFIED',
});

export const BTCEUR_REGISTRY: SymbolRegistryEntry = Object.freeze({
  internalSymbol: 'BTCEUR',
  marketDataProvider: 'TwelveData',
  marketDataSymbol: 'BTC/EUR',
  chartProvider: 'TradingView',
  chartSymbol: 'BINANCE:BTCEUR',
  assetClass: 'Crypto',
  tickSize: 0.01,
  pointValue: 1,
  timezone: 'UTC',
  sessions: ['CRYPTO_24_7'],
  enabledForDetection: true,
  dataStatus: 'VERIFIED',
});

export const ETHUSD_REGISTRY: SymbolRegistryEntry = Object.freeze({
  internalSymbol: 'ETHUSD',
  marketDataProvider: 'TwelveData',
  marketDataSymbol: 'ETH/USD',
  chartProvider: 'TradingView',
  chartSymbol: 'BINANCE:ETHUSDT',
  assetClass: 'Crypto',
  tickSize: 0.01,
  pointValue: 1,
  timezone: 'UTC',
  sessions: ['CRYPTO_24_7'],
  enabledForDetection: true,
  dataStatus: 'VERIFIED',
});

export const ETHEUR_REGISTRY: SymbolRegistryEntry = Object.freeze({
  internalSymbol: 'ETHEUR',
  marketDataProvider: 'TwelveData',
  marketDataSymbol: 'ETH/EUR',
  chartProvider: 'TradingView',
  chartSymbol: 'BINANCE:ETHEUR',
  assetClass: 'Crypto',
  tickSize: 0.01,
  pointValue: 1,
  timezone: 'UTC',
  sessions: ['CRYPTO_24_7'],
  enabledForDetection: true,
  dataStatus: 'VERIFIED',
});

export const LTCUSD_REGISTRY: SymbolRegistryEntry = Object.freeze({
  internalSymbol: 'LTCUSD',
  marketDataProvider: 'TwelveData',
  marketDataSymbol: 'LTC/USD',
  chartProvider: 'TradingView',
  chartSymbol: 'BINANCE:LTCUSDT',
  assetClass: 'Crypto',
  tickSize: 0.01,
  pointValue: 1,
  timezone: 'UTC',
  sessions: ['CRYPTO_24_7'],
  enabledForDetection: true,
  dataStatus: 'VERIFIED',
});

export const LTCEUR_REGISTRY: SymbolRegistryEntry = Object.freeze({
  internalSymbol: 'LTCEUR',
  marketDataProvider: 'TwelveData',
  marketDataSymbol: 'LTC/EUR',
  chartProvider: 'TradingView',
  chartSymbol: 'BINANCE:LTCEUR',
  assetClass: 'Crypto',
  tickSize: 0.01,
  pointValue: 1,
  timezone: 'UTC',
  sessions: ['CRYPTO_24_7'],
  enabledForDetection: true,
  dataStatus: 'VERIFIED',
});
