import type { ContextAnalysis, DetectorResult, SetupGradeValue } from './setupAssessment';

export type QualityRuleCategory =
  | 'HardReject'
  | 'GradeCap'
  | 'SoftPenalty';

export type QualityRuleSeverity =
  | 'Critical'
  | 'High'
  | 'Medium'
  | 'Low';

export interface QualityRule {
  id: string;
  category: QualityRuleCategory;
  severity: QualityRuleSeverity;
  message: string;
  recommendation: string;
  maxGrade?: SetupGradeValue;
  condition(input: QualityRuleInput): boolean;
}

export interface QualityRuleInput {
  detector: DetectorResult;
  context: ContextAnalysis;
}

export interface AppliedQualityRule {
  id: string;
  category: QualityRuleCategory;
  severity: QualityRuleSeverity;
  message: string;
  recommendation: string;
  maxGrade?: SetupGradeValue;
}

export interface QualityRuleEvaluation {
  hardRejects: AppliedQualityRule[];
  gradeCaps: AppliedQualityRule[];
  softPenalties: AppliedQualityRule[];
  all: AppliedQualityRule[];
}

export const SETUP_QUALITY_RULEBOOK_VERSION = 'SetupQualityRulebook.v1' as const;

export const SETUP_QUALITY_RULES: readonly QualityRule[] = [
  {
    id: 'MISSING_STRUCTURE_EVENT',
    category: 'HardReject',
    severity: 'Critical',
    message: 'No valid BOS/CHoCH structure event is attached to the setup.',
    recommendation: 'Reject the setup until structure is available and traceable.',
    condition: ({ detector }) => detector.structure.event === null || detector.structure.eventType === 'None',
  },
  {
    id: 'MALFORMED_POI_ZONE',
    category: 'HardReject',
    severity: 'Critical',
    message: 'POI zone is malformed or invalid.',
    recommendation: 'Reject the setup because the expected retest area cannot be trusted.',
    condition: ({ detector }) => detector.poi.zoneHigh <= detector.poi.zoneLow,
  },
  {
    id: 'HTF_DIRECTION_CONFLICT',
    category: 'HardReject',
    severity: 'High',
    message: '4H bias conflicts with the proposed trade direction.',
    recommendation: 'Reject the setup unless the detector contract explicitly defines a reversal mode.',
    condition: ({ detector }) =>
      (detector.direction === 'long' && detector.htfBias.fourHour === 'bearish') ||
      (detector.direction === 'short' && detector.htfBias.fourHour === 'bullish'),
  },
  {
    id: 'CRITICAL_CONTEXT_UNAVAILABLE',
    category: 'HardReject',
    severity: 'High',
    message: 'Critical HTF or Premium/Discount context is unavailable.',
    recommendation: 'Reject the setup until context can be computed deterministically.',
    condition: ({ detector }) =>
      detector.htfBias.fourHour === 'undefined' ||
      detector.premiumDiscount.fourHour.status === 'undefined',
  },
  {
    id: 'SELL_IN_4H_DISCOUNT',
    category: 'GradeCap',
    severity: 'High',
    maxGrade: 'A-',
    message: 'SELL setup is located in 4H Discount.',
    recommendation: 'Cap the setup because HTF Premium/Discount context is not ideal for shorts.',
    condition: ({ detector }) => detector.direction === 'short' && detector.premiumDiscount.fourHour.status === 'discount',
  },
  {
    id: 'BUY_IN_4H_PREMIUM',
    category: 'GradeCap',
    severity: 'High',
    maxGrade: 'A-',
    message: 'BUY setup is located in 4H Premium.',
    recommendation: 'Cap the setup because HTF Premium/Discount context is not ideal for longs.',
    condition: ({ detector }) => detector.direction === 'long' && detector.premiumDiscount.fourHour.status === 'premium',
  },
  {
    id: 'HTF_ALIGNMENT_MIXED',
    category: 'GradeCap',
    severity: 'High',
    maxGrade: 'B+',
    message: '4H and 1H bias are not fully aligned.',
    recommendation: 'Cap the setup because HTF context is mixed.',
    condition: ({ context }) => context.htfAlignment.quality !== 'Aligned',
  },
  {
    id: 'POI_NEUTRAL_OR_WEAK',
    category: 'GradeCap',
    severity: 'Medium',
    maxGrade: 'B+',
    message: 'POI quality is neutral or weak.',
    recommendation: 'Cap the setup until POI quality is confirmed by freshness and reaction logic.',
    condition: ({ detector }) => detector.poi.testCount !== 1,
  },
  {
    id: 'OVERTESTED_POI',
    category: 'GradeCap',
    severity: 'High',
    maxGrade: 'B',
    message: 'POI has been tested too many times.',
    recommendation: 'Cap aggressively because repeated tests reduce zone quality.',
    condition: ({ detector }) => detector.poi.testCount >= 3,
  },
  {
    id: 'MEDIUM_DISPLACEMENT',
    category: 'SoftPenalty',
    severity: 'Medium',
    message: 'Displacement is present but not strong.',
    recommendation: 'Reduce confidence; do not allow displacement alone to create elite classification.',
    condition: ({ detector }) => detector.displacement?.gradePoints === 1,
  },
  {
    id: 'WEAK_OR_MISSING_SWEEP',
    category: 'SoftPenalty',
    severity: 'Medium',
    message: 'Sweep/liquidity evidence is weak or missing.',
    recommendation: 'Reduce confidence because liquidity story is incomplete.',
    condition: ({ detector }) => !detector.sweep.present,
  },
  {
    id: 'NON_IDEAL_1H_PD',
    category: 'SoftPenalty',
    severity: 'Low',
    message: '1H Premium/Discount context is not ideal.',
    recommendation: 'Reduce confidence but do not reject if broader context is coherent.',
    condition: ({ detector }) =>
      (detector.direction === 'long' && detector.premiumDiscount.oneHour.status === 'premium') ||
      (detector.direction === 'short' && detector.premiumDiscount.oneHour.status === 'discount'),
  },
  {
    id: 'CHoCH_REQUIRES_NARRATIVE_CONFIRMATION',
    category: 'SoftPenalty',
    severity: 'Low',
    message: 'CHoCH setup requires stronger narrative confirmation than continuation BOS.',
    recommendation: 'Reduce confidence unless liquidity story and POI quality are strong.',
    condition: ({ detector }) => detector.structure.eventType === 'CHoCH',
  },
];

export function evaluateSetupQualityRules(input: QualityRuleInput): QualityRuleEvaluation {
  const all = SETUP_QUALITY_RULES
    .filter(rule => rule.condition(input))
    .map(toAppliedRule);

  return {
    hardRejects: all.filter(rule => rule.category === 'HardReject'),
    gradeCaps: all.filter(rule => rule.category === 'GradeCap'),
    softPenalties: all.filter(rule => rule.category === 'SoftPenalty'),
    all,
  };
}

function toAppliedRule(rule: QualityRule): AppliedQualityRule {
  return {
    id: rule.id,
    category: rule.category,
    severity: rule.severity,
    message: rule.message,
    recommendation: rule.recommendation,
    ...(rule.maxGrade ? { maxGrade: rule.maxGrade } : {}),
  };
}

