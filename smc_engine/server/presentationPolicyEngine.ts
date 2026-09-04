import { PresentationAssessment, PresentationQuality } from '../src/presentationAssessment';
import { buildPresentationDesignValidation, PRESENTATION_DESIGN_TOKENS } from '../src/presentationDesignSystem';
import {
  PRESENTATION_POLICY_ENGINE_VERSION,
  PresentationMode,
  PresentationPlan,
  PresentationPlanAction,
} from '../src/presentationPlan';
import { SmartScreenshotPlan } from './smartScreenshotEngine';
import { OverlayBudget, OverlaySimplificationResult } from './overlaySimplifier';

export interface PresentationPolicyInput {
  readonly assessment: PresentationAssessment | null;
  readonly screenshotPlan: SmartScreenshotPlan;
  readonly overlaySimplification: OverlaySimplificationResult;
  readonly candlesLength: number;
}

const COMPACT_BUDGET: OverlayBudget = {
  maxAnnotations: 7,
  maxLabels: 3,
  maxBoxes: 2,
  maxStructureMarkers: 2,
  maxLiquidityObjects: 2,
};

const BALANCED_BUDGET: OverlayBudget = {
  maxAnnotations: 9,
  maxLabels: 4,
  maxBoxes: 2,
  maxStructureMarkers: 2,
  maxLiquidityObjects: 2,
};

const DETAILED_BUDGET: OverlayBudget = {
  maxAnnotations: 12,
  maxLabels: 6,
  maxBoxes: 3,
  maxStructureMarkers: 3,
  maxLiquidityObjects: 3,
};

export function buildPresentationPlan(input: PresentationPolicyInput): PresentationPlan {
  const start = Date.now();
  const assessment = input.assessment;
  const screenshotPlan = input.screenshotPlan;
  const overlaySimplification = input.overlaySimplification;
  const mode = resolveMode(assessment, overlaySimplification);
  const appliedPolicies: string[] = [];
  const skippedPolicies: string[] = [];
  const selectedActions: PresentationPlanAction[] = [];
  const reasoning: string[] = [];

  const screenshotResult = applyScreenshotPolicies(screenshotPlan, input.candlesLength, assessment, mode, appliedPolicies, skippedPolicies, selectedActions, reasoning);
  const overlayBudget = resolveOverlayBudget(mode, assessment, overlaySimplification, appliedPolicies, skippedPolicies, selectedActions, reasoning);

  const adaptationReason = buildAdaptationReason(assessment, overlaySimplification, mode);
  const policyExecutionTime = Math.max(0, Date.now() - start);
  const designValidation = buildPresentationDesignValidation({
    colorConsistency: assessment ? mapQualityToScore(assessment.overlayQuality) : 0.6,
    typographyConsistency: assessment ? mapQualityToScore(assessment.readability) : 0.6,
    layoutConsistency: assessment ? mapQualityToScore(assessment.composition) : 0.6,
    spacingConsistency: assessment ? mapQualityToScore(assessment.visibility) : 0.6,
  });

  return {
    version: PRESENTATION_POLICY_ENGINE_VERSION,
    mode,
    screenshotPlan: screenshotResult,
    overlayBudget,
    selectedActions,
    appliedPolicies,
    skippedPolicies,
    reasoning,
    finalPresentationScore: assessment?.presentationScore ?? 0,
    designValidation,
    designDecisionLog: {
      appliedDesignTokens: PRESENTATION_DESIGN_TOKENS.appliedTokens,
      colorPaletteVersion: 'ColorPaletteV1',
      typographyVersion: 'TypographyV1',
      shapeVersion: 'ShapeV1',
      layerOrderVersion: 'LayerOrderingV1',
      spacingVersion: 'SpacingV1',
    },
    telemetry: {
      appliedPolicyCount: appliedPolicies.length,
      skippedPolicyCount: skippedPolicies.length,
      adaptationReason,
      policyExecutionTime,
    },
  };
}

function resolveMode(assessment: PresentationAssessment | null, overlaySimplification: OverlaySimplificationResult): PresentationMode {
  if (!assessment) return 'Balanced';
  const visibilityWeak = assessment.visibility === 'Weak' || assessment.readability === 'Weak';
  const cluttered = overlaySimplification.metrics.clutterScore >= 20 || overlaySimplification.metrics.hiddenAnnotations > 0;
  if (visibilityWeak) return 'Compact';
  if (assessment.composition === 'Good' && assessment.overlayQuality === 'Good' && !cluttered) return 'Detailed';
  return 'Balanced';
}

function applyScreenshotPolicies(
  plan: SmartScreenshotPlan,
  candlesLength: number,
  assessment: PresentationAssessment | null,
  mode: PresentationMode,
  appliedPolicies: string[],
  skippedPolicies: string[],
  selectedActions: PresentationPlanAction[],
  reasoning: string[]
): SmartScreenshotPlan {
  let nextPlan = plan;
  if (!assessment) {
    skippedPolicies.push('ASSESSMENT_MISSING');
    reasoning.push('PresentationAssessment unavailable; kept smart screenshot plan unchanged.');
    return nextPlan;
  }

  const needsZoomOut = assessment.warnings.some(warning => warning.includes('Too few visible candles')) || assessment.visibility === 'Weak';
  const needsRecenter = assessment.warnings.some(warning => warning.includes('POI overlay is visible')) === false
    || assessment.composition === 'Weak';
  const needsCompact = mode === 'Compact';
  const needsDetailed = mode === 'Detailed';

  if (needsZoomOut || needsCompact) {
    appliedPolicies.push('ZOOM_OUT');
    selectedActions.push({
      policy: 'ZOOM_OUT',
      action: 'Increase visible candles',
      reason: needsCompact ? 'Compact mode prefers broader context.' : 'Presentation warnings indicate insufficient context.',
    });
    nextPlan = {
      ...nextPlan,
      visibleBars: clampBars(nextPlan.visibleBars + (needsCompact ? 12 : 8)),
      visibleRange: resolveVisibleRange(nextPlan.focusIndex, candlesLength, clampBars(nextPlan.visibleBars + (needsCompact ? 12 : 8))),
      reasons: [...nextPlan.reasons, needsCompact ? 'Compact mode expanded the visible candle range.' : 'Zoom-out policy applied from PresentationAssessment.'],
    };
  } else {
    skippedPolicies.push('ZOOM_OUT');
  }

  if (needsRecenter) {
    appliedPolicies.push('RECENTER');
    selectedActions.push({
      policy: 'RECENTER',
      action: 'Recenter setup anchors',
      reason: 'Presentation warnings indicate composition needs a tighter setup center.',
    });
    nextPlan = {
      ...nextPlan,
      visibleRange: resolveVisibleRange(nextPlan.focusIndex, candlesLength, nextPlan.visibleBars),
      reasons: [...nextPlan.reasons, 'Recenter policy confirmed setup anchors remain in frame.'],
    };
  } else {
    skippedPolicies.push('RECENTER');
  }

  if (needsDetailed) {
    appliedPolicies.push('DETAIL_BIAS');
    selectedActions.push({
      policy: 'DETAIL_BIAS',
      action: 'Preserve richer context',
      reason: 'Detailed mode preserves more visual context for review.',
    });
    nextPlan = {
      ...nextPlan,
      reasons: [...nextPlan.reasons, 'Detailed mode kept additional price history visible.'],
    };
  } else {
    skippedPolicies.push('DETAIL_BIAS');
  }

  reasoning.push(`Screenshot plan resolved under ${mode} mode.`);
  return nextPlan;
}

function resolveOverlayBudget(
  mode: PresentationMode,
  assessment: PresentationAssessment | null,
  overlaySimplification: OverlaySimplificationResult,
  appliedPolicies: string[],
  skippedPolicies: string[],
  selectedActions: PresentationPlanAction[],
  reasoning: string[]
): OverlayBudget {
  const cluttered = overlaySimplification.metrics.clutterScore >= 20 || overlaySimplification.metrics.hiddenAnnotations > 0;
  const lowCoverage = overlaySimplification.metrics.priorityCoverage < 0.75;
  const highPrioritySafe = overlaySimplification.metrics.visiblePriorityRatio >= 0.34;

  if (mode === 'Compact' || cluttered || lowCoverage) {
    appliedPolicies.push('OVERLAY_COMPACT');
    selectedActions.push({
      policy: 'OVERLAY_COMPACT',
      action: 'Tighten overlay budget',
      reason: mode === 'Compact'
        ? 'Compact mode requires fewer annotations.'
        : 'Overlay density or priority coverage suggests additional simplification.',
    });
    reasoning.push('Overlay budget tightened to emphasize priority structures.');
    return COMPACT_BUDGET;
  }

  if (mode === 'Detailed' && assessment?.readability === 'Good' && highPrioritySafe) {
    appliedPolicies.push('OVERLAY_DETAILED');
    selectedActions.push({
      policy: 'OVERLAY_DETAILED',
      action: 'Preserve richer annotation set',
      reason: 'Detailed mode with strong readability can keep more annotations visible.',
    });
    reasoning.push('Overlay budget expanded for detailed review mode.');
    return DETAILED_BUDGET;
  }

  skippedPolicies.push('OVERLAY_COMPACT');
  skippedPolicies.push('OVERLAY_DETAILED');
  reasoning.push('Balanced overlay budget selected.');
  return BALANCED_BUDGET;
}

function buildAdaptationReason(assessment: PresentationAssessment | null, overlaySimplification: OverlaySimplificationResult, mode: PresentationMode): string {
  const parts = [`Mode=${mode}`];
  if (assessment) {
    parts.push(`presentationScore=${assessment.presentationScore}`);
    parts.push(`visibility=${assessment.visibility}`);
  }
  parts.push(`clutterScore=${overlaySimplification.metrics.clutterScore}`);
  parts.push(`hiddenAnnotations=${overlaySimplification.metrics.hiddenAnnotations}`);
  return parts.join(' | ');
}

function clampBars(value: number): number {
  return Math.max(48, Math.min(140, value));
}

function mapQualityToScore(quality: PresentationQuality): number {
  if (quality === 'Good') return 0.95;
  if (quality === 'Acceptable') return 0.72;
  return 0.42;
}

function resolveVisibleRange(
  focusIndex: number,
  candlesLength: number,
  visibleBars: number
): { from: number; to: number } {
  const safeLength = Math.max(1, candlesLength);
  const clampedVisibleBars = Math.max(1, Math.min(safeLength, visibleBars));
  const half = Math.floor(clampedVisibleBars / 2);
  let from = Math.max(0, focusIndex - half);
  let to = Math.min(safeLength - 1, from + clampedVisibleBars - 1);
  from = Math.max(0, to - clampedVisibleBars + 1);
  return { from, to };
}
