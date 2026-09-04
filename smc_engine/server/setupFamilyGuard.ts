import type { NotificationCandidate } from './pipeline';

export interface SetupFamilyGuardRecord {
  readonly symbol: string;
  readonly direction: 'long' | 'short';
  readonly breakTimestamp: number;
  readonly zoneLow: number;
  readonly zoneHigh: number;
  readonly grade: string;
  readonly score: number;
  readonly notifiedAt: number;
}

export interface SetupFamilyGuardOptions {
  /** Cooldown in milliseconds for the same symbol & direction. Default: 45 minutes */
  readonly cooldownMs?: number;
  /** Max price overlap ratio (0-1) to consider two zones identical family. Default: 0.4 */
  readonly overlapThreshold?: number;
}

const DEFAULT_COOLDOWN_MS = 45 * 60 * 1000;
const DEFAULT_OVERLAP_THRESHOLD = 0.4;

export class SetupFamilyGuard {
  private readonly history: SetupFamilyGuardRecord[] = [];
  private readonly cooldownMs: number;
  private readonly overlapThreshold: number;

  constructor(options: SetupFamilyGuardOptions = {}) {
    this.cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
    this.overlapThreshold = options.overlapThreshold ?? DEFAULT_OVERLAP_THRESHOLD;
  }

  /**
   * Evaluates if a candidate is an unwanted duplicate/spam from an already notified family.
   */
  shouldAllow(candidate: NotificationCandidate, nowMs: number = Date.now()): { allowed: boolean; reason: string } {
    this.pruneOld(nowMs);

    const zone = resolveZone(candidate);
    const breakTimestamp = candidate.poi.relatedEvent.breakTimestamp;
    const grade = candidate.gradeResult.grade;
    const score = candidate.gradeResult.totalScore;

    // Check recent records for this symbol and direction within cooldown window
    const recentMatching = this.history.filter(
      r => r.symbol === candidate.symbol &&
           r.direction === candidate.tradeDirection &&
           (nowMs - r.notifiedAt <= this.cooldownMs)
    );

    for (const recent of recentMatching) {
      // 1. Same or older impulse origin event
      if (breakTimestamp <= recent.breakTimestamp) {
        // If a higher or equal score was already notified for this or a newer move, block it
        if (score <= recent.score) {
          return {
            allowed: false,
            reason: `Duplicate setup family: An equal or higher grade (${recent.grade}) zone from impulse (${recent.breakTimestamp}) was already notified recently.`,
          };
        }
      }

      // 2. Overlapping price zone within cooldown window
      const overlap = calculateOverlapRatio(zone, { low: recent.zoneLow, high: recent.zoneHigh });
      if (overlap >= this.overlapThreshold) {
        if (score <= recent.score) {
          return {
            allowed: false,
            reason: `Duplicate zone overlap: Similar zone (%${Math.round(overlap * 100)} overlap) was notified within cooldown.`,
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
      breakTimestamp: candidate.poi.relatedEvent.breakTimestamp,
      zoneLow: zone.low,
      zoneHigh: zone.high,
      grade: candidate.gradeResult.grade,
      score: candidate.gradeResult.totalScore,
      notifiedAt: nowMs,
    });
  }

  /**
   * Clears all recorded history (useful for test resets).
   */
  clear(): void {
    this.history.length = 0;
  }

  private pruneOld(nowMs: number): void {
    const cutoff = nowMs - (this.cooldownMs * 2);
    while (this.history.length > 0 && this.history[0].notifiedAt < cutoff) {
      this.history.shift();
    }
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
