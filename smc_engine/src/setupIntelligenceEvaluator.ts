import type { GradeResult } from './gradeCalculator';
import { assessNarrativeV1 } from './narrativeEngine';
import {
  evaluateSetupQualityRules,
  SETUP_QUALITY_RULEBOOK_VERSION,
  type AppliedQualityRule,
} from './setupQualityRules';
import type {
  ContextAnalysis,
  DetectorResult,
  NarrativeAnalysis,
  NarrativeAssessment,
  QualityAnalysis,
  QualityLevel,
  SetupAssessment,
  SetupGradeValue,
} from './setupAssessment';

export interface SetupIntelligenceEvaluatorInput {
  detector: DetectorResult;
  v1Grade: GradeResult;
}

export function evaluateSetupIntelligenceV2(
  input: SetupIntelligenceEvaluatorInput
): SetupAssessment {
  const context = analyzeContext(input.detector);
  const narrative = analyzeNarrative(input.detector, context);
  const narrativeAssessment = assessNarrativeV1(input.detector, context);
  const quality = analyzeQuality(input.detector, context, narrative, narrativeAssessment);
  const decision = evaluateQualityGates(input.detector, context);
  const grade = assignGrade(quality.overallQuality, decision.appliedRules?.gradeCaps ?? [], decision.hardReject);
  const explainability = explainAssessment(input.detector, context, narrative, narrativeAssessment, quality, decision, grade.value);

  return {
    version: 'SetupAssessment.v2',
    detector: input.detector,
    context,
    narrative,
    narrativeAssessment,
    quality,
    decision,
    grade,
    explainability,
  };
}

function analyzeContext(detector: DetectorResult): ContextAnalysis {
  const htfConflicts: string[] = [];
  if (detector.htfBias.fourHour !== detector.htfBias.oneHour) {
    htfConflicts.push('4H and 1H bias are not aligned.');
  }

  const htfSupportsDirection =
    (detector.direction === 'long' && detector.htfBias.fourHour === 'bullish') ||
    (detector.direction === 'short' && detector.htfBias.fourHour === 'bearish');

  if (!htfSupportsDirection) {
    htfConflicts.push('4H bias does not support trade direction.');
  }

  const pdConflicts: string[] = [];
  const pd4H = detector.premiumDiscount.fourHour.status;
  const pd1H = detector.premiumDiscount.oneHour.status;
  const pd15M = detector.premiumDiscount.fifteenMinute.status;
  const pdSupportsDirection =
    (detector.direction === 'long' && pd4H === 'discount') ||
    (detector.direction === 'short' && pd4H === 'premium');

  if (!pdSupportsDirection) {
    pdConflicts.push(`4H Premium/Discount does not ideally support ${detector.direction}.`);
  }
  if (detector.direction === 'long' && pd1H === 'premium') {
    pdConflicts.push('1H Premium is weak context for long continuation.');
  }
  if (detector.direction === 'short' && pd1H === 'discount') {
    pdConflicts.push('1H Discount is weak context for short continuation.');
  }

  const testCount = detector.poi.testCount;
  const zoneFreshness =
    testCount === 0 ? 'Fresh' :
      testCount <= 2 ? 'Tested' :
        'Overtested';

  return {
    htfAlignment: {
      quality: htfConflicts.length === 0 ? 'Aligned' : htfSupportsDirection ? 'Mixed' : 'Conflicting',
      supportsDirection: htfSupportsDirection,
      conflictReasons: htfConflicts,
    },
    premiumDiscount: {
      quality: pdConflicts.length === 0 ? 'Ideal' : pdSupportsDirection ? 'Acceptable' : 'Weak',
      supportsDirection: pdSupportsDirection,
      conflicts: pdConflicts,
    },
    marketPhase: {
      value: detector.structure.eventType === 'CHoCH' ? 'Reversal' : 'Expansion',
      confidence: detector.structure.event ? 'Medium' : 'Low',
    },
    zoneFreshness: {
      value: zoneFreshness,
      testCount,
      notes: testCount > 2 ? ['POI has been tested multiple times.'] : [],
    },
    zoneState: {
      value: detector.poi.zoneHigh > detector.poi.zoneLow ? 'Active' : 'Invalidated',
      invalidationReasons: detector.poi.zoneHigh > detector.poi.zoneLow ? [] : ['POI zone is malformed.'],
    },
    sessionQuality: {
      quality: detector.session.name === 'Unknown' ? 'Unknown' : 'Acceptable',
      notes: [],
    },
    summary: [
      `HTF=${detector.htfBias.fourHour}/${detector.htfBias.oneHour}`,
      `PD=${pd4H}/${pd1H}/${pd15M}`,
      `POI tests=${testCount}`,
    ].join(' | '),
  };
}

function analyzeNarrative(detector: DetectorResult, context: ContextAnalysis): NarrativeAnalysis {
  const missingPieces: string[] = [];
  if (!detector.sweep.present) missingPieces.push('No sweep/liquidity event.');
  if (!detector.structure.event) missingPieces.push('No BOS/CHoCH structure event.');
  if (!context.premiumDiscount.supportsDirection) missingPieces.push('Premium/Discount story is not ideal.');

  const strength = missingPieces.length === 0
    ? 'Strong'
    : missingPieces.length <= 1
      ? 'Coherent'
      : 'Weak';

  return {
    liquidityStory: {
      strength,
      summary: detector.sweep.present
        ? `Liquidity event is present: ${detector.sweep.type}.`
        : 'Liquidity story is incomplete.',
      missingPieces,
    },
    reactionLogic: {
      strength: detector.poi.testCount <= 1 ? 'Coherent' : 'Weak',
      summary: detector.poi.testCount <= 1
        ? 'POI is fresh enough for shadow evaluation.'
        : 'POI has repeated tests and weaker reaction logic.',
    },
    smcNarrative: {
      strength,
      steps: [
        detector.sweep.present ? 'Liquidity event present' : 'Liquidity event missing',
        detector.structure.eventType,
        detector.poi.type,
        context.premiumDiscount.quality,
      ],
    },
    structuralConsistency: {
      strength: context.htfAlignment.quality === 'Conflicting' ? 'Contradictory' : 'Coherent',
      contradictions: context.htfAlignment.conflictReasons,
    },
    marketLogic: {
      strength,
      summary: missingPieces.length === 0
        ? 'Context, structure, liquidity and POI story are coherent.'
        : `Narrative has ${missingPieces.length} weak point(s).`,
    },
  };
}

function analyzeQuality(
  detector: DetectorResult,
  context: ContextAnalysis,
  narrative: NarrativeAnalysis,
  narrativeAssessment: NarrativeAssessment
): QualityAnalysis {
  const poiQuality: QualityLevel =
    detector.poi.testCount === 0 ? 'High' :
      detector.poi.testCount === 1 ? 'Medium' :
        detector.poi.testCount === 2 ? 'Low' :
          'Invalid';

  const structureQuality: QualityLevel =
    detector.structure.eventType === 'BOS' || detector.structure.eventType === 'CHoCH'
      ? 'Medium'
      : 'Invalid';

  const displacementQuality: QualityLevel =
    detector.displacement?.gradePoints === 2 ? 'High' :
      detector.displacement?.gradePoints === 1 ? 'Medium' :
        detector.displacement ? 'Low' : 'Invalid';

  const contextQuality: QualityLevel =
    context.htfAlignment.quality === 'Aligned' && context.premiumDiscount.quality === 'Ideal' ? 'High' :
      context.htfAlignment.quality === 'Conflicting' || context.premiumDiscount.quality === 'Weak' ? 'Low' :
        'Medium';

  const narrativeQuality: QualityLevel =
    narrativeAssessment.overallNarrative === 'Elite' ? 'Elite' :
      narrativeAssessment.overallNarrative === 'High' ? 'High' :
        narrativeAssessment.overallNarrative === 'Medium' ? 'Medium' : 'Low';

  const overallQuality = weakestQuality([
    poiQuality,
    structureQuality,
    displacementQuality,
    contextQuality,
    narrativeQuality,
  ]);

  return {
    poiQuality,
    structureQuality,
    displacementQuality,
    contextQuality,
    narrativeQuality,
    overallQuality,
    notes: [],
  };
}

function evaluateQualityGates(
  detector: DetectorResult,
  context: ContextAnalysis
): SetupAssessment['decision'] {
  const ruleEvaluation = evaluateSetupQualityRules({ detector, context });
  const rejectReasons = ruleEvaluation.hardRejects.map(rule => rule.message);
  const gradeCaps = ruleEvaluation.gradeCaps.map(rule => rule.message);
  const penalties = ruleEvaluation.softPenalties.map(rule => rule.message);

  return {
    hardReject: rejectReasons.length > 0,
    rejectReasons,
    gradeCaps,
    penalties,
    rulebookVersion: SETUP_QUALITY_RULEBOOK_VERSION,
    appliedRules: ruleEvaluation,
  };
}

function assignGrade(
  quality: QualityLevel,
  gradeCaps: readonly AppliedQualityRule[],
  hardReject: boolean
): SetupAssessment['grade'] {
  if (hardReject || quality === 'Invalid') {
    return { value: 'Reject', qualityBand: 'Rejected' };
  }

  const uncapped = qualityToGrade(quality);
  const capped = gradeCaps.reduce(
    (current, rule) => rule.maxGrade ? minGrade(current, rule.maxGrade) : current,
    uncapped
  );

  return {
    value: capped,
    qualityBand: capped === 'A+' ? 'Elite' :
      capped === 'A' || capped === 'A-' ? 'High' :
        capped === 'B+' ? 'Medium' :
          'Low',
  };
}

function explainAssessment(
  detector: DetectorResult,
  context: ContextAnalysis,
  narrative: NarrativeAnalysis,
  narrativeAssessment: NarrativeAssessment,
  quality: QualityAnalysis,
  decision: SetupAssessment['decision'],
  grade: SetupGradeValue
): SetupAssessment['explainability'] {
  const supportedBy = [
    context.htfAlignment.supportsDirection ? '4H bias supports direction' : null,
    detector.sweep.present ? 'Sweep/liquidity event present' : null,
    detector.structure.event ? `${detector.structure.eventType} present` : null,
    detector.displacement ? 'Displacement present' : null,
  ].filter((value): value is string => value !== null);

  const weakenedBy = [
    ...context.htfAlignment.conflictReasons,
    ...context.premiumDiscount.conflicts,
    ...narrativeAssessment.reasons,
    ...(decision.appliedRules?.all ?? []).map(rule => `${rule.id}: ${rule.message}`),
  ];

  return {
    supportedBy,
    weakenedBy,
    summary: `V2 shadow grade ${grade}: ${narrative.marketLogic.summary} Narrative=${narrativeAssessment.overallNarrative} (${narrativeAssessment.consistency}/100).`,
    evidenceScore: calculateEvidenceScore(quality, decision),
  };
}

function weakestQuality(values: readonly QualityLevel[]): QualityLevel {
  const rank: Record<QualityLevel, number> = {
    Elite: 5,
    High: 4,
    Medium: 3,
    Low: 2,
    Invalid: 1,
    Unknown: 0,
  };
  return values.reduce((weakest, value) => rank[value] < rank[weakest] ? value : weakest, 'Elite' as QualityLevel);
}

function qualityToGrade(quality: QualityLevel): SetupGradeValue {
  if (quality === 'Elite') return 'A+';
  if (quality === 'High') return 'A';
  if (quality === 'Medium') return 'A-';
  if (quality === 'Low') return 'B';
  return 'Reject';
}

function minGrade(current: SetupGradeValue, cap: SetupGradeValue): SetupGradeValue {
  const rank: Record<SetupGradeValue, number> = {
    Reject: 0,
    B: 1,
    'B+': 2,
    'A-': 3,
    A: 4,
    'A+': 5,
  };
  return rank[current] > rank[cap] ? cap : current;
}

function calculateEvidenceScore(
  quality: QualityAnalysis,
  decision: SetupAssessment['decision']
): number {
  const qualityPoints: Record<QualityLevel, number> = {
    Elite: 100,
    High: 85,
    Medium: 70,
    Low: 45,
    Invalid: 0,
    Unknown: 25,
  };
  const base = qualityPoints[quality.overallQuality];
  const adjusted = base - decision.gradeCaps.length * 8 - decision.penalties.length * 3;
  return Math.max(0, Math.min(100, adjusted));
}
