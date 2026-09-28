import { StoredCandle, Symbol, Timeframe } from './candleStore';

const BINANCE_SPOT_BASE_URL = 'https://api.binance.com';

export function mapSmcSymbolToBinanceSpot(symbol: string): string {
  const upper = symbol.toUpperCase().trim();
  if (upper.endsWith('USDT')) return upper;
  if (upper.endsWith('USD')) {
    return `${upper.slice(0, -3)}USDT`;
  }
  return `${upper}USDT`;
}

export function mapSmcTimeframeToBinanceInterval(timeframe: Timeframe): string {
  switch (timeframe) {
    case '1m':
      return '1m';
    case '15m':
      return '15m';
    case '1h':
      return '1h';
    case '4h':
      return '4h';
    default:
      return timeframe;
  }
}

export async function fetchBinanceSpotCandles(
  symbol: Symbol,
  timeframe: Timeframe,
  outputSize: number = 100,
  timeoutMs: number = 10_000
): Promise<StoredCandle[]> {
  const spotSymbol = mapSmcSymbolToBinanceSpot(symbol);
  const interval = mapSmcTimeframeToBinanceInterval(timeframe);
  const limit = Math.min(500, Math.max(10, outputSize));
  const url = `${BINANCE_SPOT_BASE_URL}/api/v3/klines?symbol=${encodeURIComponent(
    spotSymbol
  )}&interval=${encodeURIComponent(interval)}&limit=${limit}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new Error(`Binance Spot klines HTTP ${response.status} for ${spotSymbol} (${interval})`);
  }

  const raw = await response.json();
  if (!Array.isArray(raw)) {
    throw new Error(`Binance Spot klines returned invalid payload for ${spotSymbol} (${interval})`);
  }

  const candles: StoredCandle[] = [];
  for (const row of raw) {
    if (!Array.isArray(row) || row.length < 5) continue;
    const timestamp = Number(row[0]);
    const open = Number(row[1]);
    const high = Number(row[2]);
    const low = Number(row[3]);
    const close = Number(row[4]);
    if (
      !Number.isFinite(timestamp) ||
      !Number.isFinite(open) ||
      !Number.isFinite(high) ||
      !Number.isFinite(low) ||
      !Number.isFinite(close)
    ) {
      continue;
    }
    candles.push({
      timestamp,
      open,
      high,
      low,
      close,
    });
  }

  candles.sort((a, b) => a.timestamp - b.timestamp);
  return candles;
}
