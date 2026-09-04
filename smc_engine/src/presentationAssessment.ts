export const PRESENTATION_ASSESSMENT_VERSION = 'PresentationAssessment.v1' as const;

export type PresentationQuality = 'Good' | 'Acceptable' | 'Weak';

export interface PresentationAssessment {
  readonly version: typeof PRESENTATION_ASSESSMENT_VERSION;
  readonly timeframe: string;
  readonly composition: PresentationQuality;
  readonly visibility: PresentationQuality;
  readonly overlayQuality: PresentationQuality;
  readonly drawingQuality: PresentationQuality;
  readonly readability: PresentationQuality;
  readonly presentationScore: number;
  readonly warnings: readonly string[];
  readonly metrics: {
    readonly annotationCount: number;
    readonly labelCount: number;
    readonly priceLineCount: number;
    readonly structuralMarkerCount: number;
    readonly poiOverlayCount: number;
    readonly plotAreaRatio: number;
    readonly visibleBarCount: number;
    readonly overlayDensity: number;
    readonly priorityCoverage: number;
    readonly hiddenAnnotations: number;
    readonly hiddenLabels: number;
    readonly visiblePriorityRatio: number;
    readonly clutterScore: number;
    readonly hierarchyScore: number;
  };
}

export interface PresentationAssessmentInput {
  readonly timeframe: string;
  readonly metadata: {
    readonly imageWidth: number;
    readonly imageHeight: number;
    readonly firstVisibleLogical: number;
    readonly lastVisibleLogical: number;
    readonly plotWidth: number;
    readonly plotHeight: number;
  };
  readonly annotations: readonly {
    readonly type: string;
    readonly label?: string;
  }[];
  readonly overlaySimplification?: {
    readonly metrics: {
      readonly overlayDensity: number;
      readonly priorityCoverage: number;
      readonly hiddenAnnotations: number;
      readonly hiddenLabels: number;
      readonly visiblePriorityRatio: number;
      readonly clutterScore: number;
      readonly hierarchyScore: number;
    };
  };
}

export function assessPresentationV1(input: PresentationAssessmentInput | null): PresentationAssessment {
  if (!input) {
    return Object.freeze({
      version: PRESENTATION_ASSESSMENT_VERSION,
      timeframe: 'unknown',
      composition: 'Weak',
      visibility: 'Weak',
      overlayQuality: 'Weak',
      drawingQuality: 'Weak',
      readability: 'Weak',
      presentationScore: 0,
      warnings: Object.freeze(['Overlay input could not be built.']),
      metrics: Object.freeze({
        annotationCount: 0,
        labelCount: 0,
        priceLineCount: 0,
        structuralMarkerCount: 0,
        poiOverlayCount: 0,
        plotAreaRatio: 0,
        visibleBarCount: 0,
        overlayDensity: 0,
        priorityCoverage: 0,
        hiddenAnnotations: 0,
        hiddenLabels: 0,
        visiblePriorityRatio: 0,
        clutterScore: 0,
        hierarchyScore: 0,
      }),
    });
  }

  const annotationCount = input.annotations.length;
  const labelCount = input.annotations.filter(annotation => annotation.type === 'label' || Boolean(annotation.label)).length;
  const priceLineCount = input.annotations.filter(annotation => annotation.type === 'priceLine').length;
  const structuralMarkerCount = input.annotations.filter(annotation => annotation.type === 'bosArrow').length;
  const poiOverlayCount = input.annotations.filter(annotation => annotation.type === 'orderBlock' || annotation.type === 'fvg').length;
  const plotAreaRatio = round4((input.metadata.plotWidth * input.metadata.plotHeight) / Math.max(1, input.metadata.imageWidth * input.metadata.imageHeight));
  const visibleBarCount = Math.max(0, input.metadata.lastVisibleLogical - input.metadata.firstVisibleLogical + 1);
  const overlayMetrics = input.overlaySimplification?.metrics;
  const warnings: string[] = [];

  if (input.metadata.imageWidth < 900 || input.metadata.imageHeight < 520) {
    warnings.push('Screenshot resolution is below preferred review size.');
  }
  if (plotAreaRatio < 0.65) {
    warnings.push('Chart plot area is too small relative to the image.');
  }
  if (visibleBarCount > 120) {
    warnings.push('Too many visible candles may reduce setup readability.');
  }
  if (visibleBarCount < 35) {
    warnings.push('Too few visible candles may hide setup context.');
  }
  if (poiOverlayCount === 0) {
    warnings.push('No POI overlay is visible.');
  }
  if (structuralMarkerCount === 0) {
    warnings.push('No BOS/CHoCH structural marker is visible.');
  }
  if (priceLineCount < 3) {
    warnings.push('Entry/current price lines are incomplete.');
  }
  if (labelCount > 7) {
    warnings.push('Too many labels may clutter the chart.');
  }
  if (annotationCount > 12) {
    warnings.push('Too many overlay annotations may reduce readability.');
  }
  if (overlayMetrics && overlayMetrics.hiddenAnnotations > 0) {
    warnings.push('Overlay simplification removed low priority annotations.');
  }
  if (overlayMetrics && overlayMetrics.clutterScore > 20) {
    warnings.push('Overlay clutter remains above the preferred threshold.');
  }

  const composition = qualityFromWarnings([
    plotAreaRatio < 0.65,
    visibleBarCount > 120,
    visibleBarCount < 35,
  ]);
  const visibility = qualityFromWarnings([
    poiOverlayCount === 0,
    structuralMarkerCount === 0,
    priceLineCount < 3,
  ]);
  const overlayQuality = qualityFromWarnings([
    labelCount > 7,
    annotationCount > 12,
  ]);
  const drawingQuality = qualityFromWarnings([
    poiOverlayCount === 0,
    priceLineCount < 3,
  ]);
  const readability = qualityFromWarnings([
    input.metadata.imageWidth < 900 || input.metadata.imageHeight < 520,
    labelCount > 7,
    annotationCount > 12,
    visibleBarCount > 120,
  ]);

  return Object.freeze({
    version: PRESENTATION_ASSESSMENT_VERSION,
    timeframe: input.timeframe,
    composition,
    visibility,
    overlayQuality,
    drawingQuality,
    readability,
    presentationScore: calculateScore([composition, visibility, overlayQuality, drawingQuality, readability]),
    warnings: Object.freeze(warnings),
    metrics: Object.freeze({
      annotationCount,
      labelCount,
      priceLineCount,
      structuralMarkerCount,
      poiOverlayCount,
      plotAreaRatio,
      visibleBarCount,
      overlayDensity: overlayMetrics?.overlayDensity ?? round4(annotationCount / 9),
      priorityCoverage: overlayMetrics?.priorityCoverage ?? 1,
      hiddenAnnotations: overlayMetrics?.hiddenAnnotations ?? 0,
      hiddenLabels: overlayMetrics?.hiddenLabels ?? 0,
      visiblePriorityRatio: overlayMetrics?.visiblePriorityRatio ?? round4((priceLineCount + structuralMarkerCount + poiOverlayCount) / Math.max(1, annotationCount * 3)),
      clutterScore: overlayMetrics?.clutterScore ?? 0,
      hierarchyScore: overlayMetrics?.hierarchyScore ?? 100,
    }),
  });
}

function qualityFromWarnings(flags: readonly boolean[]): PresentationQuality {
  const count = flags.filter(Boolean).length;
  if (count === 0) return 'Good';
  if (count === 1) return 'Acceptable';
  return 'Weak';
}

function calculateScore(qualities: readonly PresentationQuality[]): number {
  const score = qualities.reduce((sum, quality) => {
    if (quality === 'Good') return sum + 20;
    if (quality === 'Acceptable') return sum + 12;
    return sum + 4;
  }, 0);
  return Math.max(0, Math.min(100, score));
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
