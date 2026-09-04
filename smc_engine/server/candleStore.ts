import * as fs from 'fs';
import * as path from 'path';
import { Symbol } from './universe';
export type { Symbol } from './universe';

export type Timeframe = '1m' | '15m' | '1h' | '4h';

export interface StoredCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export class CandleStore {
  private dataDir: string;

  constructor(dataDir = 'data') {
    this.dataDir = dataDir;
  }

  private getFilePath(symbol: Symbol, timeframe: Timeframe): string {
    return path.join(this.dataDir, `${symbol}_${timeframe}.json`);
  }

  appendCandle(symbol: Symbol, timeframe: Timeframe, candle: StoredCandle): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }

    const filePath = this.getFilePath(symbol, timeframe);
    let candles = this.getCandles(symbol, timeframe);

    if (candles.length === 0) {
      candles.push(candle);
    } else {
      const lastCandle = candles[candles.length - 1];
      if (candle.timestamp > lastCandle.timestamp) {
        candles.push(candle);
      } else if (candle.timestamp === lastCandle.timestamp) {
        // Overwrite last candle
        candles[candles.length - 1] = candle;
      } else {
        // Older timestamp: ignore completely
        return;
      }
    }

    // Limit to 500 candles
    if (candles.length > 500) {
      candles = candles.slice(candles.length - 500);
    }

    // Safe atomic write logic
    const tempFilePath = `${filePath}.${Date.now()}.${Math.random().toString(36).substring(2, 6)}.tmp`;
    try {
      fs.writeFileSync(tempFilePath, JSON.stringify(candles, null, 2), 'utf8');
      try {
        fs.renameSync(tempFilePath, filePath);
      } catch {
        fs.copyFileSync(tempFilePath, filePath);
        try { fs.unlinkSync(tempFilePath); } catch {}
      }
    } catch {
      fs.writeFileSync(filePath, JSON.stringify(candles, null, 2), 'utf8');
    }
  }

  getCandles(symbol: Symbol, timeframe: Timeframe): StoredCandle[] {
    const filePath = this.getFilePath(symbol, timeframe);
    if (!fs.existsSync(filePath)) {
      return [];
    }

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    } catch (e) {
      return [];
    }
  }
}
