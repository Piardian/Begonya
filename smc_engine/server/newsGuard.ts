import * as fs from 'fs';
import * as path from 'path';

export interface NewsEvent {
  id: string;
  name: string;
  event_time_utc: string; // ISO 8601 string, e.g. "2026-09-11T12:30:00Z"
  currency: string;       // USD, EUR, GBP, ALL
  impact: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  affects_all_symbols?: boolean;
  affects_symbols?: string[];
  freeze_minutes_before?: number;
  freeze_minutes_after?: number;
}

export interface NewsConfigFile {
  default_freeze_minutes_before: number;
  default_freeze_minutes_after: number;
  high_impact_definitions?: Array<{
    id: string;
    name: string;
    currency: string;
    impact: string;
    affects_all_symbols?: boolean;
    freeze_minutes_before?: number;
    freeze_minutes_after?: number;
  }>;
  scheduled_events?: NewsEvent[];
}

export interface NewsFreezeStatus {
  isFrozen: boolean;
  activeEvent?: NewsEvent;
  minutesToEvent?: number;
  reason?: string;
}

function findBegonyaRoot(startDir: string): string {
  let curr = startDir;
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(path.join(curr, 'macro_engine')) && fs.existsSync(path.join(curr, 'smc_engine'))) {
      return curr;
    }
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }
  return path.resolve(startDir, '../..');
}

export class NewsGuard {
  private static instance: NewsGuard | null = null;
  private readonly configPath: string;
  private readonly sharedEventsPath: string;
  private customEvents: NewsEvent[] = [];
  private cachedConfig: NewsConfigFile | null = null;

  private constructor() {
    const root = findBegonyaRoot(__dirname);
    this.configPath = path.resolve(root, 'config/news_events.json');
    this.sharedEventsPath = path.resolve(root, 'shared/economic_events.json');
  }

  public static getInstance(): NewsGuard {
    if (!NewsGuard.instance) {
      NewsGuard.instance = new NewsGuard();
    }
    return NewsGuard.instance;
  }

  private loadConfig(): NewsConfigFile {
    if (this.cachedConfig) return this.cachedConfig;

    let config: NewsConfigFile = {
      default_freeze_minutes_before: 15,
      default_freeze_minutes_after: 15,
      scheduled_events: [],
    };

    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf-8').replace(/^\uFEFF/, '');
        config = JSON.parse(raw) as NewsConfigFile;
      }
    } catch (e) {
      console.warn(`[NewsGuard] news_events.json okunamadı: ${e}`);
    }

    this.cachedConfig = config;
    return config;
  }

  public registerEvent(event: NewsEvent): void {
    this.customEvents.push(event);
  }

  public clearCustomEvents(): void {
    this.customEvents = [];
  }

  public reloadConfig(): void {
    this.cachedConfig = null;
    this.loadConfig();
  }

  private getAllEvents(): NewsEvent[] {
    const config = this.loadConfig();
    const all = [...(config.scheduled_events || []), ...this.customEvents];

    // Shared events dosyasını da kontrol et
    try {
      if (fs.existsSync(this.sharedEventsPath)) {
        const raw = fs.readFileSync(this.sharedEventsPath, 'utf-8').replace(/^\uFEFF/, '');
        const shared = JSON.parse(raw) as NewsEvent[];
        if (Array.isArray(shared)) {
          all.push(...shared);
        }
      }
    } catch {
      // sessizce geç
    }

    return all;
  }

  private isSymbolAffected(event: NewsEvent, cleanSym: string): boolean {
    if (event.affects_all_symbols) return true;
    if (event.currency === 'ALL') return true;

    if (event.affects_symbols && event.affects_symbols.length > 0) {
      return event.affects_symbols.some(s => cleanSym.includes(s.toUpperCase()));
    }

    const cur = event.currency.toUpperCase();
    if (cur === 'USD') {
      // USD olayları EURUSD, GBPUSD, USDJPY, XAUUSD (Altın), BTCUSD (Kripto), NAS100/SPX (Endeksler) hepsini sarsar!
      return (
        cleanSym.includes('USD') ||
        cleanSym.includes('XAU') ||
        cleanSym.includes('GOLD') ||
        cleanSym.includes('BTC') ||
        cleanSym.includes('NAS') ||
        cleanSym.includes('SPX')
      );
    }

    if (cur === 'EUR') {
      return cleanSym.includes('EUR');
    }

    if (cur === 'GBP') {
      return cleanSym.includes('GBP');
    }

    return cleanSym.includes(cur);
  }

  public checkNewsFreeze(symbol?: string, checkTimeMs?: number): NewsFreezeStatus {
    const config = this.loadConfig();
    const defaultBefore = config.default_freeze_minutes_before ?? 15;
    const defaultAfter = config.default_freeze_minutes_after ?? 15;
    const nowMs = checkTimeMs ?? Date.now();
    const cleanSym = (symbol || 'ALL').toUpperCase();

    const events = this.getAllEvents();

    for (const event of events) {
      if (!this.isSymbolAffected(event, cleanSym)) {
        continue;
      }

      const eventTimeMs = new Date(event.event_time_utc).getTime();
      if (isNaN(eventTimeMs)) continue;

      const freezeBeforeMs = (event.freeze_minutes_before ?? defaultBefore) * 60 * 1000;
      const freezeAfterMs = (event.freeze_minutes_after ?? defaultAfter) * 60 * 1000;

      const windowStart = eventTimeMs - freezeBeforeMs;
      const windowEnd = eventTimeMs + freezeAfterMs;

      if (nowMs >= windowStart && nowMs <= windowEnd) {
        const diffMinutes = Math.round((nowMs - eventTimeMs) / (60 * 1000));
        let timingDesc = '';
        if (diffMinutes < 0) {
          timingDesc = `habere ${Math.abs(diffMinutes)} dakika kaldı`;
        } else if (diffMinutes === 0) {
          timingDesc = 'haber anı açıklandı!';
        } else {
          timingDesc = `haberden ${diffMinutes} dakika geçti (sindirme periyodu)`;
        }

        const reason = `[${event.name}] açıklama penceresi aktif (${timingDesc}). Broker spread açılması ve slippage riski sebebiyle işlemler donduruldu.`;

        return {
          isFrozen: true,
          activeEvent: event,
          minutesToEvent: diffMinutes,
          reason,
        };
      }
    }

    return {
      isFrozen: false,
    };
  }
}
