import type { NotificationCandidate } from '../server/pipeline';

export interface ConsolidatorOptions {
  /** Maximum number of active POIs permitted per symbol and direction. Default: 2 */
  readonly maxPoisPerSymbolDirection?: number;
  /** Minimum overlap ratio (0-1) to consider two zones duplicate/nested. Default: 0.4 */
  readonly overlapThreshold?: number;
}

export function consolidateCandidates(
  candidates: readonly NotificationCandidate[],
  options: ConsolidatorOptions = {}
): NotificationCandidate[] {
  if (candidates.length <= 1) {
    return [...candidates];
  }

  const maxPerSymbolDirection = options.maxPoisPerSymbolDirection ?? 2;
  const overlapThreshold = options.overlapThreshold ?? 0.4;

  // 1. Group candidates by symbol and direction
  const groups = new Map<string, NotificationCandidate[]>();
  for (const candidate of candidates) {
    const groupKey = `${candidate.symbol}:${candidate.tradeDirection}`;
    const list = groups.get(groupKey) ?? [];
    list.push(candidate);
    groups.set(groupKey, list);
  }

  const output: NotificationCandidate[] = [];

  for (const [, groupCandidates] of groups) {
    if (groupCandidates.length <= 1) {
      output.push(...groupCandidates);
      continue;
    }

    const direction = groupCandidates[0].tradeDirection;

    // Find the latest structure break timestamp in this group (active structural impulse)
    const latestBreakTimestamp = Math.max(
      ...groupCandidates.map(c => c.poi.relatedEvent.breakTimestamp)
    );

    // Filter to candidates originating from the latest active structure, or at most recent 2 breaks
    const activeLegCandidates = groupCandidates.filter(c => {
      // Prioritize the latest structural break, but allow if within active impulse
      return c.poi.relatedEvent.breakTimestamp === latestBreakTimestamp;
    });

    // If latest break has valid candidates, use them; otherwise fallback to the sorted list
    const candidatePool = activeLegCandidates.length > 0 ? activeLegCandidates : groupCandidates;

    // Sort by:
    // 1. Structure Break Timestamp descending (most recent impulse first)
    // 2. Grade total score descending (A+ > A > B+)
    // 3. POI Test count ascending (fresher / 0 tests first)
    const sorted = [...candidatePool].sort((a, b) => {
      const breakDiff = b.poi.relatedEvent.breakTimestamp - a.poi.relatedEvent.breakTimestamp;
      if (breakDiff !== 0) return breakDiff;
      const scoreDiff = b.gradeResult.totalScore - a.gradeResult.totalScore;
      if (scoreDiff !== 0) return scoreDiff;
      return a.poiTestCount - b.poiTestCount;
    });

    const selected: NotificationCandidate[] = [];

    for (const candidate of sorted) {
      const zone = resolveZone(candidate);

      // Check if this candidate significantly overlaps with an already selected candidate
      const isOverlapping = selected.some(existing => {
        const existingZone = resolveZone(existing);
        return calculateOverlapRatio(zone, existingZone) >= overlapThreshold;
      });

      if (!isOverlapping) {
        selected.push(candidate);
      }

      if (selected.length >= maxPerSymbolDirection) {
        break;
      }
    }

    // Sort selected zones structurally (Extreme first, then Decisional)
    selected.sort((a, b) => {
      const zoneA = resolveZone(a);
      const zoneB = resolveZone(b);
      if (direction === 'long') {
        // Deepest (lowest price) first for long (Extreme)
        return zoneA.low - zoneB.low;
      } else {
        // Highest price first for short (Extreme)
        return zoneB.high - zoneA.high;
      }
    });

    output.push(...selected);
  }

  return output;
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
