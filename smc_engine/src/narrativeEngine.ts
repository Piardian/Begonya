import type {
  ContextAnalysis,
  DetectorResult,
  NarrativeAssessment,
  NarrativeOverallQuality,
  NarrativeStoryStrength,
} from './setupAssessment';

export function assessNarrativeV1(
  detector: DetectorResult,
  context: ContextAnalysis
): NarrativeAssessment {
  const contextStory = assessContextStory(detector, context);
  const liquidityStory = assessLiquidityStory(detector);
  const reactionStory = assessReactionStory(detector, context);
  const continuationStory = assessContinuationStory(detector, context);
  const stories = [contextStory, liquidityStory, reactionStory, continuationStory];
  const overallNarrative = resolveOverallNarrative(stories);
  const consistency = calculateConsistency(stories);
  const reasons = buildNarrativeReasons({
    detector,
    context,
    contextStory,
    liquidityStory,
    reactionStory,
    continuationStory,
    overallNarrative,
  });

  return {
    version: 'NarrativeAssessment.v1',
    contextStory,
    liquidityStory,
    reactionStory,
    continuationStory,
    overallNarrative,
    consistency,
    reasons,
  };
}

function assessContextStory(
  detector: DetectorResult,
  context: ContextAnalysis
): NarrativeStoryStrength {
  if (
    context.htfAlignment.quality === 'Aligned' &&
    context.premiumDiscount.supportsDirection
  ) {
    return 'Strong';
  }

  if (
    context.htfAlignment.supportsDirection &&
    detector.premiumDiscount.fourHour.status !== 'undefined'
  ) {
    return 'Neutral';
  }

  return 'Weak';
}

function assessLiquidityStory(detector: DetectorResult): NarrativeStoryStrength {
  if (!detector.sweep.present) {
    return 'Weak';
  }

  if (detector.sweep.type !== 'Unknown' || detector.liquidity.events.length > 0) {
    return 'Strong';
  }

  return 'Neutral';
}

function assessReactionStory(
  detector: DetectorResult,
  context: ContextAnalysis
): NarrativeStoryStrength {
  if (context.zoneState.value !== 'Active') {
    return 'Weak';
  }

  if (detector.displacement?.gradePoints === 2 && detector.poi.testCount <= 1) {
    return 'Strong';
  }

  if (detector.displacement && detector.displacement.gradePoints >= 1 && detector.poi.testCount <= 2) {
    return 'Neutral';
  }

  return 'Weak';
}

function assessContinuationStory(
  detector: DetectorResult,
  context: ContextAnalysis
): NarrativeStoryStrength {
  if (
    detector.structure.event !== null &&
    context.htfAlignment.quality === 'Aligned' &&
    context.premiumDiscount.supportsDirection &&
    detector.poi.testCount <= 1
  ) {
    return 'Strong';
  }

  if (
    detector.structure.event !== null &&
    context.htfAlignment.supportsDirection
  ) {
    return 'Neutral';
  }

  return 'Weak';
}

function resolveOverallNarrative(
  stories: readonly NarrativeStoryStrength[]
): NarrativeOverallQuality {
  const strongCount = stories.filter(story => story === 'Strong').length;
  const weakCount = stories.filter(story => story === 'Weak').length;

  if (strongCount === stories.length) return 'Elite';
  if (weakCount === 0 && strongCount >= 2) return 'High';
  if (weakCount <= 1) return 'Medium';
  return 'Low';
}

function calculateConsistency(stories: readonly NarrativeStoryStrength[]): number {
  const points: Record<NarrativeStoryStrength, number> = {
    Strong: 25,
    Neutral: 15,
    Weak: 0,
  };
  return stories.reduce((total, story) => total + points[story], 0);
}

function buildNarrativeReasons(input: {
  detector: DetectorResult;
  context: ContextAnalysis;
  contextStory: NarrativeStoryStrength;
  liquidityStory: NarrativeStoryStrength;
  reactionStory: NarrativeStoryStrength;
  continuationStory: NarrativeStoryStrength;
  overallNarrative: NarrativeOverallQuality;
}): string[] {
  const reasons: string[] = [];

  reasons.push(`Context Story: ${input.contextStory} (${input.context.summary})`);
  reasons.push(input.detector.sweep.present
    ? `Liquidity Story: ${input.liquidityStory} (${input.detector.sweep.type} sweep evidence present)`
    : `Liquidity Story: ${input.liquidityStory} (no sweep evidence)`);
  reasons.push(input.detector.displacement
    ? `Reaction Story: ${input.reactionStory} (displacement grade points=${input.detector.displacement.gradePoints}, POI tests=${input.detector.poi.testCount})`
    : `Reaction Story: ${input.reactionStory} (no displacement evidence)`);
  reasons.push(input.detector.structure.event
    ? `Continuation Story: ${input.continuationStory} (${input.detector.structure.eventType} with HTF support=${input.context.htfAlignment.supportsDirection})`
    : `Continuation Story: ${input.continuationStory} (no structure event)`);
  reasons.push(`Overall Narrative: ${input.overallNarrative}`);

  return reasons;
}
