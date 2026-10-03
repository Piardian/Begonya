import * as fs from 'fs';
import * as path from 'path';
import type { NotificationCandidate } from './pipeline';

export interface SetupFamilyGuardRecord {
  readonly symbol: string;
  readonly direction: 'long' | 'short';
  readonly poiType?: 'OB' | 'FVG';
  readonly breakTimestamp: number;
  readonly zoneLow: number;
  readonly zoneHigh: number;
  readonly grade: string;
  readonly score: number;
  readonly notifiedAt: number;
}

export interface SetupFamilyGuardOptions {
  /** Cooldown in milliseconds for the same symbol & direction impulse. Default: 45 minutes */
  readonly cooldownMs?: number;
  /** Max price overlap ratio (0-1) to consider two zones identical family. Default: 0.4 */
  readonly overlapThreshold?: number;
  /** Cooldown in milliseconds for overlapping price zones on the same symbol (depleted/stale POI). Default: 16 hours */
  readonly zoneOverlapCooldownMs?: number;
  /** Directory path to persist history. Default: 'data' in non-test mode */
  readonly dataDir?: string;
}

const DEFAULT_COOLDOWN_MS = 45 * 60 * 1000;
const DEFAULT_ZONE_OVERLAP_COOLDOWN_MS = 16 * 60 * 60 * 1000; // 16 hours (full intraday session window)
const DEFAULT_OVERLAP_THRESHOLD = 0.4;

export class SetupFamilyGuard {
  private readonly history: SetupFamilyGuardRecord[] = [];
  private readonly cooldownMs: number;
  private readonly zoneOverlapCooldownMs: number;
  private readonly overlapThreshold: number;
  private readonly dataDir?: string;

  constructor(options: SetupFamilyGuardOptions = {}) {
    this.cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
    this.zoneOverlapCooldownMs =
      options.zoneOverlapCooldownMs ??
      (options.cooldownMs !== undefined ? options.cooldownMs : DEFAULT_ZONE_OVERLAP_COOLDOWN_MS);
    this.overlapThreshold = options.overlapThreshold ?? DEFAULT_OVERLAP_THRESHOLD;
    this.dataDir = options.dataDir ?? (process.env.NODE_ENV === 'test' ? undefined : 'data');
    this.loadFromDisk();
  }

  /**
   * Evaluates if a candidate is an unwanted duplicate/spam from an already notified family or depleted zone.
   */
  shouldAllow(candidate: NotificationCandidate, nowMs: number = Date.now()): { allowed: boolean; reason: string } {
    this.pruneOld(nowMs);

    const zone = resolveZone(candidate);
    const breakTimestamp = candidate.poi.relatedEvent.breakTimestamp;
    const grade = candidate.gradeResult.grade;
    const score = candidate.gradeResult.totalScore;

    // 1. Same or older impulse origin event is permanently blocked (unless genuine tier upgrade of the same POI type within cooldown)
    const allSymbolDirectionHistory = this.history.filter(
      r => r.symbol === candidate.symbol && r.direction === candidate.tradeDirection
    );

    for (const recorded of allSymbolDirectionHistory) {
      if (breakTimestamp <= recorded.breakTimestamp) {
        const withinCooldown = nowMs - recorded.notifiedAt <= this.cooldownMs;
        const isSamePoiType = !recorded.poiType || recorded.poiType === candidate.poiType;
        const isGenuineTierUpgrade =
          withinCooldown &&
          isSamePoiType &&
          breakTimestamp === recorded.breakTimestamp &&
          recorded.grade !== 'A+' &&
          grade === 'A+' &&
          score > recorded.score;
        if (!isGenuineTierUpgrade) {
          return {
            allowed: false,
            reason: `Duplicate setup family: Impulse (${recorded.breakTimestamp}) was already notified (${recorded.grade}, score ${recorded.score}).`,
          };
        }
      }
    }

    // 2. Overlapping price zone within zone overlap cooldown window (Stale / Depleted POI Guard)
    const recentMatching = allSymbolDirectionHistory.filter(
      r => nowMs - r.notifiedAt <= this.zoneOverlapCooldownMs
    );

    for (const recent of recentMatching) {
      const overlap = calculateOverlapRatio(zone, { low: recent.zoneLow, high: recent.zoneHigh });
      if (overlap >= this.overlapThreshold) {
        const isSamePoiType = !recent.poiType || recent.poiType === candidate.poiType;
        const isGenuineTierUpgrade =
          nowMs - recent.notifiedAt <= this.cooldownMs &&
          isSamePoiType &&
          recent.grade !== 'A+' &&
          grade === 'A+' &&
          score > recent.score;
        if (!isGenuineTierUpgrade) {
          const hoursAgo = ((nowMs - recent.notifiedAt) / (60 * 60 * 1000)).toFixed(1);
          return {
            allowed: false,
            reason: `Duplicate/depleted zone overlap: Similar zone (%${Math.round(overlap * 100)} overlap) was already notified ${hoursAgo}h ago (${recent.grade}, score ${recent.score}). Institutional orders depleted.`,
          };
        }
      }
    }

    return { allowed: true, reason: 'PASS_FAMILY_GUARD' };
  }

  /**
   * Records that a notification was sent for this candidate.
   */
  recordNotification(candidate: NotificationCandidate, nowMs: number = Date.now()): void {
    const zone = resolveZone(candidate);
    this.history.push({
      symbol: candidate.symbol,
      direction: candidate.tradeDirection,
      poiType: candidate.poiType,
      breakTimestamp: candidate.poi.relatedEvent.breakTimestamp,
      zoneLow: zone.low,
      zoneHigh: zone.high,
      grade: candidate.gradeResult.grade,
      score: candidate.gradeResult.totalScore,
      notifiedAt: nowMs,
    });
    this.saveToDisk();
  }

  /**
   * Clears all recorded history (useful for test resets).
   */
  clear(): void {
    this.history.length = 0;
    if (this.dataDir) {
      const filePath = path.join(this.dataDir, 'setup_family_guard.json');
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch {}
    }
  }

  private pruneOld(nowMs: number): void {
    const cutoff = nowMs - (48 * 60 * 60 * 1000);
    while (this.history.length > 0 && this.history[0].notifiedAt < cutoff) {
      this.history.shift();
    }
  }

  private loadFromDisk(): void {
    if (!this.dataDir) return;
    const filePath = path.join(this.dataDir, 'setup_family_guard.json');
    if (!fs.existsSync(filePath)) return;
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        this.history.push(...parsed);
        this.pruneOld(Date.now());
      }
    } catch {}
  }

  private saveToDisk(): void {
    if (!this.dataDir) return;
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
      const filePath = path.join(this.dataDir, 'setup_family_guard.json');
      fs.writeFileSync(filePath, JSON.stringify(this.history, null, 2), 'utf8');
    } catch {}
  }
}

function resolveZone(candidate: NotificationCandidate): { low: number; high: number } {
  if (candidate.poiType === 'OB') {
    const ob = candidate.poi as { low: number; high: number };
    return { low: ob.low, high: ob.high };
  }
  const fvg = candidate.poi as { gapLow: number; gapHigh: number };
  return { low: fvg.gapLow, high: fvg.gapHigh };
}

function calculateOverlapRatio(
  zoneA: { low: number; high: number },
  zoneB: { low: number; high: number }
): number {
  const overlapLow = Math.max(zoneA.low, zoneB.low);
  const overlapHigh = Math.min(zoneA.high, zoneB.high);
  if (overlapLow >= overlapHigh) return 0;

  const overlapHeight = overlapHigh - overlapLow;
  const heightA = zoneA.high - zoneA.low;
  const heightB = zoneB.high - zoneB.low;
  const minHeight = Math.min(heightA, heightB);

  if (minHeight <= 0) return 0;
  return overlapHeight / minHeight;
}
