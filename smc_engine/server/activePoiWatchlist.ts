import * as fs from 'fs';
import * as path from 'path';
import { Symbol } from './candleStore';

export type PoiType = 'OB' | 'FVG';
export type PoiDirection = 'long' | 'short';
export type PoiStatus = 'ACTIVE' | 'TESTED' | 'INVALIDATED' | 'EXPIRED';

export interface ActivePoiRecord {
  readonly id: string;
  readonly symbol: Symbol;
  readonly timeframe: '15m' | '1h' | '4h';
  readonly poiType: PoiType;
  readonly direction: PoiDirection;
  readonly low: number;
  readonly high: number;
  readonly formedTimestamp: number;
  readonly breakTimestamp: number;
  readonly createdAt: number;
  lastCheckedAt: number;
  testCount: number;
  status: PoiStatus;
}

export interface RegisterPoiParams {
  readonly symbol: Symbol;
  readonly timeframe: '15m' | '1h' | '4h';
  readonly poiType: PoiType;
  readonly direction: PoiDirection;
  readonly low: number;
  readonly high: number;
  readonly formedTimestamp: number;
  readonly breakTimestamp: number;
  readonly testCount?: number;
  readonly isInvalidated?: boolean;
  readonly isNotified?: boolean;
}

export class ActivePoiWatchlist {
  private static instance: ActivePoiWatchlist | null = null;
  private dataDir: string;
  private records: Map<string, ActivePoiRecord> = new Map();
  private loaded = false;

  /**
   * Intraday / Swing POI Watchlist TTL (24 Hours).
   * After 24 hours of market time without retest, altcoin intraday momentum context has shifted.
   */
  public static readonly DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

  constructor(dataDir = 'data') {
    this.dataDir = dataDir;
    this.load();
  }

  public static getInstance(dataDir = 'data'): ActivePoiWatchlist {
    if (!ActivePoiWatchlist.instance) {
      ActivePoiWatchlist.instance = new ActivePoiWatchlist(dataDir);
    }
    return ActivePoiWatchlist.instance;
  }

  public static resetInstance(): void {
    ActivePoiWatchlist.instance = null;
  }

  private getFilePath(): string {
    return path.join(this.dataDir, 'active_poi_watchlist.json');
  }

  public static generatePoiId(
    symbol: Symbol,
    timeframe: '15m' | '1h' | '4h',
    poiType: PoiType,
    direction: PoiDirection,
    formedTimestamp: number,
    low: number,
    high: number
  ): string {
    return `POI:${symbol}:${timeframe}:${direction}:${poiType}:${formedTimestamp}:${low.toFixed(6)}:${high.toFixed(6)}`;
  }

  public registerOrUpdatePoi(params: RegisterPoiParams): ActivePoiRecord {
    const id = ActivePoiWatchlist.generatePoiId(
      params.symbol,
      params.timeframe,
      params.poiType,
      params.direction,
      params.formedTimestamp,
      params.low,
      params.high
    );

    const now = Date.now();
    const existing = this.records.get(id);

    let status: PoiStatus = 'ACTIVE';
    if (params.isInvalidated) {
      status = 'INVALIDATED';
    } else if (params.isNotified) {
      status = 'TESTED';
    } else if (existing && (existing.status === 'TESTED' || existing.status === 'INVALIDATED')) {
      status = existing.status;
    } else if (now - params.formedTimestamp > ActivePoiWatchlist.DEFAULT_TTL_MS) {
      status = 'EXPIRED';
    }

    const record: ActivePoiRecord = {
      id,
      symbol: params.symbol,
      timeframe: params.timeframe,
      poiType: params.poiType,
      direction: params.direction,
      low: params.low,
      high: params.high,
      formedTimestamp: params.formedTimestamp,
      breakTimestamp: params.breakTimestamp,
      createdAt: existing ? existing.createdAt : now,
      lastCheckedAt: now,
      testCount: params.testCount ?? existing?.testCount ?? 0,
      status,
    };

    this.records.set(id, record);
    this.save();
    return record;
  }

  public markPoiTested(symbol: Symbol, poiIdOrSubstring?: string): void {
    let changed = false;
    for (const [id, record] of this.records.entries()) {
      if (record.symbol === symbol) {
        if (!poiIdOrSubstring || id.includes(poiIdOrSubstring) || (poiIdOrSubstring && poiIdOrSubstring.includes(record.poiType))) {
          if (record.status === 'ACTIVE') {
            record.status = 'TESTED';
            record.lastCheckedAt = Date.now();
            changed = true;
          }
        }
      }
    }
    if (changed) {
      this.save();
    }
  }

  public markPoiInvalidated(symbol: Symbol, poiIdOrSubstring?: string): void {
    let changed = false;
    for (const [id, record] of this.records.entries()) {
      if (record.symbol === symbol) {
        if (!poiIdOrSubstring || id.includes(poiIdOrSubstring)) {
          if (record.status === 'ACTIVE') {
            record.status = 'INVALIDATED';
            record.lastCheckedAt = Date.now();
            changed = true;
          }
        }
      }
    }
    if (changed) {
      this.save();
    }
  }

  public getActiveSymbols(): Symbol[] {
    const now = Date.now();
    const activeSymbols = new Set<Symbol>();
    let stateChanged = false;

    for (const record of this.records.values()) {
      if (record.status === 'ACTIVE') {
        // Expiration check
        if (now - record.formedTimestamp > ActivePoiWatchlist.DEFAULT_TTL_MS) {
          record.status = 'EXPIRED';
          record.lastCheckedAt = now;
          stateChanged = true;
          continue;
        }
        activeSymbols.add(record.symbol);
      }
    }

    if (stateChanged) {
      this.save();
    }

    return Array.from(activeSymbols);
  }

  public getActivePois(): ActivePoiRecord[] {
    const now = Date.now();
    return Array.from(this.records.values()).filter(
      r => r.status === 'ACTIVE' && now - r.formedTimestamp <= ActivePoiWatchlist.DEFAULT_TTL_MS
    );
  }

  public getActivePoisForSymbol(symbol: Symbol): ActivePoiRecord[] {
    const now = Date.now();
    return Array.from(this.records.values()).filter(
      r => r.symbol === symbol && r.status === 'ACTIVE' && now - r.formedTimestamp <= ActivePoiWatchlist.DEFAULT_TTL_MS
    );
  }

  public getAllRecords(): ActivePoiRecord[] {
    return Array.from(this.records.values());
  }

  public prune(maxAgeMs = ActivePoiWatchlist.DEFAULT_TTL_MS): void {
    const now = Date.now();
    let changed = false;

    for (const [id, record] of this.records.entries()) {
      const age = now - record.formedTimestamp;
      if (record.status === 'EXPIRED' || record.status === 'INVALIDATED' || record.status === 'TESTED') {
        // Retain inactive records for 6 hours for deduplication/telemetry, then purge
        if (now - record.lastCheckedAt > 6 * 60 * 60 * 1000) {
          this.records.delete(id);
          changed = true;
        }
      } else if (age > maxAgeMs) {
        record.status = 'EXPIRED';
        record.lastCheckedAt = now;
        changed = true;
      }
    }

    if (changed) {
      this.save();
    }
  }

  public clear(): void {
    this.records.clear();
    this.save();
  }

  public load(): void {
    try {
      const filePath = this.getFilePath();
      if (!fs.existsSync(filePath)) {
        this.loaded = true;
        return;
      }
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        this.records.clear();
        for (const item of parsed) {
          if (item && item.id) {
            this.records.set(item.id, item);
          }
        }
      }
      this.loaded = true;
    } catch (err) {
      console.warn('[ActivePoiWatchlist] Failed to read active_poi_watchlist.json, initializing empty:', err);
      this.records.clear();
      this.loaded = true;
    }
  }

  public save(): void {
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
      const filePath = this.getFilePath();
      const data = JSON.stringify(Array.from(this.records.values()), null, 2);
      fs.writeFileSync(filePath, data, 'utf8');
    } catch (err) {
      console.warn('[ActivePoiWatchlist] Failed to save active_poi_watchlist.json:', err);
    }
  }
}
