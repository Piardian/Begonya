import { BosArrowOverlay, FvgOverlay, OrderBlockOverlay, OverlayAnnotation } from './overlayRenderer';

export const OVERLAY_PRIORITY_ENGINE_VERSION = 'OverlayPriorityEngine.v1' as const;
export const OVERLAY_SIMPLIFICATION_VERSION = 'OverlaySimplification.v1' as const;

export type OverlayPriority = 1 | 2 | 3;
export type OverlaySimplificationAction = 'preserved' | 'hidden' | 'deduplicated';

export interface OverlayBudget {
  readonly maxAnnotations: number;
  readonly maxLabels: number;
  readonly maxBoxes: number;
  readonly maxStructureMarkers: number;
  readonly maxLiquidityObjects: number;
}

export interface OverlayDecisionLogEntry {
  readonly action: OverlaySimplificationAction;
  readonly annotationType: OverlayAnnotation['type'];
  readonly priority: OverlayPriority;
  readonly reason: string;
  readonly label?: string;
}

export interface OverlaySimplificationMetrics {
  readonly overlayDensity: number;
  readonly priorityCoverage: number;
  readonly hiddenAnnotations: number;
  readonly hiddenLabels: number;
  readonly visiblePriorityRatio: number;
  readonly clutterScore: number;
  readonly hierarchyScore: number;
}

export interface OverlaySimplificationResult {
  readonly version: typeof OVERLAY_SIMPLIFICATION_VERSION;
  readonly priorityEngineVersion: typeof OVERLAY_PRIORITY_ENGINE_VERSION;
  readonly originalAnnotationCount: number;
  readonly annotations: OverlayAnnotation[];
  readonly decisionLog: readonly OverlayDecisionLogEntry[];
  readonly metrics: OverlaySimplificationMetrics;
  readonly warnings: readonly string[];
}

const DEFAULT_BUDGET: OverlayBudget = {
  maxAnnotations: 9,
  maxLabels: 4,
  maxBoxes: 2,
  maxStructureMarkers: 2,
  maxLiquidityObjects: 2,
};

export function simplifyOverlayAnnotations(
  annotations: readonly OverlayAnnotation[],
  budget: Partial<OverlayBudget> = {}
): OverlaySimplificationResult {
  const mergedBudget: OverlayBudget = {
    ...DEFAULT_BUDGET,
    ...budget,
  };

  const originalAnnotationCount = annotations.length;
  const labeledAnnotations = annotations.map((annotation, index) => ({
    annotation,
    index,
    priority: getOverlayPriority(annotation),
  }));

  const byTypeCounts = {
    labels: labeledAnnotations.filter(item => item.annotation.type === 'label').length,
    boxes: labeledAnnotations.filter(item => item.annotation.type === 'orderBlock' || item.annotation.type === 'fvg').length,
    structureMarkers: labeledAnnotations.filter(item => item.annotation.type === 'bosArrow').length,
    liquidityObjects: labeledAnnotations.filter(item => item.annotation.type === 'premiumDiscount').length,
  };

  const dedupeKeys = new Set<string>();
  const labelUsage = new Map<string, number>();
  const suppressedLabelIndices = new Set<number>();
  const retained = [...labeledAnnotations].sort((a, b) => a.priority - b.priority || a.index - b.index);
  const keepFlags = new Map<number, boolean>();
  const decisionLog: OverlayDecisionLogEntry[] = [];
  const warnings: string[] = [];

  for (const item of retained) {
    keepFlags.set(item.index, true);
  }

  const applyHidden = (index: number, reason: string): void => {
    if (keepFlags.get(index) !== false) {
      keepFlags.set(index, false);
      const item = labeledAnnotations[index];
      decisionLog.push({
        action: 'hidden',
        annotationType: item.annotation.type,
        priority: item.priority,
        reason,
        label: getOverlayLabel(item.annotation),
      });
    }
  };

  const shouldKeepLabel = (annotation: OverlayAnnotation): boolean => {
    if (annotation.type === 'priceLine' && annotation.label) {
      const count = labelUsage.get(annotation.label) ?? 0;
      if (count > 0) return false;
      labelUsage.set(annotation.label, count + 1);
    }
    return true;
  };

  for (const item of retained) {
    const label = getOverlayLabel(item.annotation);
    const type = item.annotation.type;

    if (label && type === 'priceLine' && !shouldKeepLabel(item.annotation)) {
      decisionLog.push({
        action: 'deduplicated',
        annotationType: type,
        priority: item.priority,
        reason: 'Duplicate price line label removed to reduce clutter.',
        label,
      });
      suppressedLabelIndices.add(item.index);
      keepFlags.set(item.index, true);
      continue;
    }

    if (type === 'label') {
      const key = `${type}:${label}`;
      if (dedupeKeys.has(key)) {
        applyHidden(item.index, 'Duplicate label removed to reduce annotation density.');
        continue;
      }
      dedupeKeys.add(key);
    }
  }

  enforceBudget('label', mergedBudget.maxLabels, labeledAnnotations, keepFlags, decisionLog, applyHidden);
  enforceBudget('box', mergedBudget.maxBoxes, labeledAnnotations, keepFlags, decisionLog, applyHidden);
  enforceBudget('structureMarker', mergedBudget.maxStructureMarkers, labeledAnnotations, keepFlags, decisionLog, applyHidden);
  enforceBudget('liquidityObject', mergedBudget.maxLiquidityObjects, labeledAnnotations, keepFlags, decisionLog, applyHidden);
  enforceBudget('annotation', mergedBudget.maxAnnotations, labeledAnnotations, keepFlags, decisionLog, applyHidden);

  const simplifiedAnnotations = labeledAnnotations
    .filter(item => keepFlags.get(item.index) !== false)
    .map(item => sanitizeAnnotation(item.annotation, item.index, item.priority, suppressedLabelIndices));

  const hiddenAnnotations = originalAnnotationCount - simplifiedAnnotations.length;
  const hiddenLabels = decisionLog.filter(entry => entry.action === 'hidden' && entry.label).length
    + decisionLog.filter(entry => entry.action === 'deduplicated' && entry.label).length;
  const visiblePriorityRatio = simplifiedAnnotations.length === 0
    ? 0
    : round4(simplifiedAnnotations.reduce((sum, annotation) => sum + getOverlayPriority(annotation), 0) / (simplifiedAnnotations.length * 3));
  const priorityCoverage = originalAnnotationCount === 0 ? 0 : round4(simplifiedAnnotations.length / originalAnnotationCount);
  const overlayDensity = round4(simplifiedAnnotations.length / Math.max(1, mergedBudget.maxAnnotations));
  const clutterScore = round4(Math.min(100, (hiddenAnnotations * 8) + Math.max(0, simplifiedAnnotations.length - mergedBudget.maxAnnotations) * 6 + Math.max(0, byTypeCounts.labels - mergedBudget.maxLabels) * 5));
  const hierarchyScore = round4(Math.max(0, Math.min(100, 100 - clutterScore + (visiblePriorityRatio * 20))));

  if (hiddenAnnotations > 0) warnings.push('Overlay annotation budget exceeded; low priority items were hidden.');
  if (hiddenLabels > 0) warnings.push('Duplicate or low priority labels were removed.');
  if (simplifiedAnnotations.some(annotation => annotation.type === 'label')) warnings.push('Label layout was simplified for readability.');

  return {
    version: OVERLAY_SIMPLIFICATION_VERSION,
    priorityEngineVersion: OVERLAY_PRIORITY_ENGINE_VERSION,
    originalAnnotationCount,
    annotations: simplifiedAnnotations,
    decisionLog,
    metrics: {
      overlayDensity,
      priorityCoverage,
      hiddenAnnotations,
      hiddenLabels,
      visiblePriorityRatio,
      clutterScore,
      hierarchyScore,
    },
    warnings,
  };
}

function enforceBudget(
  category: 'label' | 'box' | 'structureMarker' | 'liquidityObject' | 'annotation',
  limit: number,
  items: readonly { annotation: OverlayAnnotation; index: number; priority: OverlayPriority }[],
  keepFlags: Map<number, boolean>,
  decisionLog: OverlayDecisionLogEntry[],
  applyHidden: (index: number, reason: string) => void
): void {
  const categoryItems = items.filter(item => keepFlags.get(item.index) !== false && matchesCategory(item.annotation, category));
  if (categoryItems.length <= limit) return;

  const overflow = categoryItems
    .sort((a, b) => a.priority - b.priority || a.index - b.index)
    .slice(limit);
  for (const item of overflow) {
    applyHidden(item.index, `Priority budget exceeded for ${category}.`);
  }
}

function matchesCategory(annotation: OverlayAnnotation, category: 'label' | 'box' | 'structureMarker' | 'liquidityObject' | 'annotation'): boolean {
  if (category === 'annotation') return true;
  if (category === 'label') return annotation.type === 'label' || annotation.type === 'priceLine';
  if (category === 'box') return annotation.type === 'orderBlock' || annotation.type === 'fvg';
  if (category === 'structureMarker') return annotation.type === 'bosArrow';
  if (category === 'liquidityObject') return annotation.type === 'premiumDiscount';
  return false;
}

function sanitizeAnnotation(annotation: OverlayAnnotation, index: number, priority: OverlayPriority, suppressedLabelIndices: Set<number>): OverlayAnnotation {
  if (annotation.type !== 'priceLine') return annotation;
  if (!annotation.label) return annotation;
  if (priority <= 1) return annotation;
  if (suppressedLabelIndices.has(index)) {
    const { label: _label, ...rest } = annotation;
    return rest;
  }
  return annotation;
}

export function getOverlayPriority(annotation: OverlayAnnotation): OverlayPriority {
  switch (annotation.type) {
    case 'orderBlock':
    case 'fvg':
    case 'bosArrow':
      return 1;
    case 'priceLine':
      return isPrimaryPriceLabel(annotation.label) ? 1 : 2;
    case 'premiumDiscount':
      return 2;
    case 'label':
      return isStoryLabel(annotation.text) ? 2 : 3;
    default:
      return 3;
  }
}

function getOverlayLabel(annotation: OverlayAnnotation): string | undefined {
  switch (annotation.type) {
    case 'priceLine':
      return annotation.label;
    case 'orderBlock':
    case 'fvg':
    case 'bosArrow':
      return annotation.label;
    case 'label':
      return annotation.text;
    default:
      return undefined;
  }
}

function isPrimaryPriceLabel(label?: string): boolean {
  if (!label) return false;
  return label === 'ANLIK FİYAT'
    || label === 'FİYAT'
    || label === 'GİRİŞ'
    || label === 'GİRİŞ ÜST'
    || label === 'GİRİŞ ALT';
}

function isStoryLabel(text?: string): boolean {
  if (!text) return false;
  return text.includes('1M')
    || text.includes('15M')
    || text.includes('1H')
    || text.includes('HTF')
    || text.includes('KURULUM')
    || text.includes('YÜRÜTME');
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
