import { PremiumDiscountState, DisplacementQuality } from './types';
import { ModelState } from './modelDeterminer';
import { POITestResult } from './poiTestCounter';

export interface GradeInput {
  tradeDirection: 'long' | 'short';
  bias4H: 'bullish' | 'bearish' | 'range' | 'undefined';
  pd4H: PremiumDiscountState;
  bias1H: 'bullish' | 'bearish' | 'range' | 'undefined';
  has15mEvent: boolean;
  displacementQuality15m: DisplacementQuality | null;
  modelState: ModelState;
  poiTestResultForSweep: POITestResult | null;
  poiTimeframe: '15m' | '1h' | '4h';
  poiTestCount: number;
  pd1H: PremiumDiscountState;
  pd15M?: PremiumDiscountState;
}

export interface GradeResult {
  totalScore: number;
  grade: 'A+' | 'A' | 'B+' | 'B' | 'C';
  entryAllowed: boolean;
  blockReasons: string[];
  breakdown: {
    htfBiasPD: number;
    displacement: number;
    structure: number;
    sweep: number;
    poiQuality: number;
  };
  /** One POI-family decision with its contributing primitive evidence. */
  poiIntegrity?: Readonly<{
    decision: 'PASS' | 'FAIL';
    contributingReasons: readonly string[];
  }>;
}

/**
 * Calculates the score and isEQBlocked flag for HTF Bias + Premium/Discount.
 */
export function scoreHTFBiasPD(
  bias4H: 'bullish' | 'bearish' | 'range' | 'undefined',
  pd4H: PremiumDiscountState,
  bias1H: 'bullish' | 'bearish' | 'range' | 'undefined',
  tradeDirection: 'long' | 'short'
): { score: number; isEQBlocked: boolean } {
  if (bias4H === 'range' || bias4H === 'undefined') {
    return { score: 0, isEQBlocked: false };
  }

  const biasDirection = bias4H === 'bullish' ? 'long' : 'short';
  if (tradeDirection !== biasDirection) {
    return { score: -2, isEQBlocked: false };
  }

  let score = 0;
  let isEQBlocked = false;

  if (pd4H.status === 'eq') {
    score = 1; // -1 penalty compared to ideal zone (2)
    isEQBlocked = false;
  } else if (pd4H.status === 'undefined') {
    score = 0;
    isEQBlocked = false;
  } else {
    const isCorrectZone =
      (tradeDirection === 'short' && pd4H.status === 'premium') ||
      (tradeDirection === 'long' && pd4H.status === 'discount');

    score = isCorrectZone ? 2 : 1;
  }

  // 1H confirmation check (penalty)
  const is1HDirectional = bias1H === 'bullish' || bias1H === 'bearish';
  if (is1HDirectional && bias1H !== bias4H) {
    score -= 1;
  }

  return { score, isEQBlocked };
}

/**
 * Scores the displacement leg quality.
 */
export function scoreDisplacement(dq: DisplacementQuality | null): number {
  if (dq === null) {
    return -2;
  }
  return dq.gradePoints;
}

/**
 * Scores the 15m structure event presence and quality.
 */
export function scoreStructure(has15mEvent: boolean, dq: DisplacementQuality | null): number {
  if (!has15mEvent) {
    return -2;
  }
  if (dq === null) {
    return 0;
  }

  if (dq.quality === 'güçlü') {
    return 2;
  } else if (dq.quality === 'orta') {
    return 1;
  } else {
    // 'zayıf' or 'yok'
    return 0;
  }
}

/**
 * Scores the sweep / model confirmation.
 */
export function scoreSweep(modelState: ModelState, poiTestResultForSweep: POITestResult | null): number {
  if (modelState.model === 'model1_reversal') {
    if (poiTestResultForSweep !== null && poiTestResultForSweep.testCount >= 1) {
      return 2;
    }
    return 0;
  }

  if (modelState.model === 'model2_continuation') {
    return 2;
  }

  return -2;
}

/**
 * Scores the POI quality (TF, fresh/mitigated, 1H PD zone).
 * 0 tests: +1 bonus if aligned 1H PD, 0 if not
 * 1 test: 0 (neutral)
 * 2 tests: -1 penalty
 * 3+ tests: -2 (veto)
 */
export function scorePOIQuality(
  poiTimeframe: '15m' | '1h' | '4h',
  poiTestCount: number,
  pd1H: PremiumDiscountState,
  tradeDirection: 'long' | 'short'
): number {
  if (poiTestCount >= 3) {
    return -2;
  }

  if (poiTestCount === 2) {
    return -1;
  }

  if (poiTestCount === 1) {
    return 0;
  }

  // poiTestCount === 0 (Fresh POI)
  const isCorrectZone =
    (tradeDirection === 'short' && pd1H.status === 'premium') ||
    (tradeDirection === 'long' && pd1H.status === 'discount');

  return isCorrectZone ? 1 : 0;
}

/**
 * Main function to evaluate a trade setup grade.
 */
export function calculateGrade(input: GradeInput): GradeResult {
  const htfBiasPD = scoreHTFBiasPD(input.bias4H, input.pd4H, input.bias1H, input.tradeDirection);
  const displacement = scoreDisplacement(input.displacementQuality15m);
  const structure = scoreStructure(input.has15mEvent, input.displacementQuality15m);
  const sweep = scoreSweep(input.modelState, input.poiTestResultForSweep);
  const poiQuality = scorePOIQuality(input.poiTimeframe, input.poiTestCount, input.pd1H, input.tradeDirection);
  const poiIntegrityReasons: string[] = [];
  if (input.poiTestCount >= 3) {
    poiIntegrityReasons.push('QUALITY_BELOW_MINIMUM', 'TEST_COUNT_GTE_3');
  }

  let totalScore = htfBiasPD.score + displacement + structure + sweep + poiQuality;

  // 15M opposite P/D penalty (-1)
  if (input.pd15M && input.pd15M.status !== 'undefined' && input.pd15M.status !== 'eq') {
    const is15MOpposite =
      (input.tradeDirection === 'long' && input.pd15M.status === 'premium') ||
      (input.tradeDirection === 'short' && input.pd15M.status === 'discount');
    if (is15MOpposite) {
      totalScore -= 1;
    }
  }

  let grade: 'A+' | 'A' | 'B+' | 'B' | 'C';
  if (totalScore >= 8) {
    grade = 'A+';
  } else if (totalScore >= 6) {
    grade = 'A';
  } else if (totalScore >= 4) {
    grade = 'B+';
  } else if (totalScore >= 2) {
    grade = 'B';
  } else {
    grade = 'C';
  }

  const expected4HBias = input.tradeDirection === 'long' ? 'bullish' : 'bearish';

  // Tiered Grade A+ vs Grade A Calibration:
  // 1. Grade A+ Requirements (Elite Pinnacle):
  // Must have: 0 tests, güçlü displacement, 4H+1H full alignment, and no 4H equilibrium.
  if (grade === 'A+') {
    if (input.pd4H.status === 'eq' ||
        input.displacementQuality15m?.quality !== 'güçlü' ||
        input.poiTestCount > 0 ||
        input.bias1H !== expected4HBias) {
      grade = 'A';
    }
  }

  // 2. Grade A Hard Caps (Quality Floor):
  // - Weak displacement: Cap at B+ (no entry)
  if (input.displacementQuality15m?.quality === 'zayıf' || input.displacementQuality15m?.quality === 'yok') {
    if (grade === 'A+' || grade === 'A') grade = 'B+';
  }
  // - Over-tested POI (>= 2 tests): Cap at B+ (no entry)
  if (input.poiTestCount >= 2) {
    if (grade === 'A+' || grade === 'A') grade = 'B+';
  }
  // - 1H opposite in Model 2 continuation: Cap at B+
  const is1HOpposite = (input.bias4H === 'bullish' && input.bias1H === 'bearish') ||
                       (input.bias4H === 'bearish' && input.bias1H === 'bullish');
  if (is1HOpposite && input.modelState.model === 'model2_continuation') {
    if (grade === 'A+' || grade === 'A') grade = 'B+';
  }

  const blockReasons: string[] = [];
  if (input.bias4H !== expected4HBias) {
    blockReasons.push('4H bias is not directional or conflicts with the trade');
  }
  if (is1HOpposite && input.modelState.model === 'model2_continuation') {
    blockReasons.push('1H bias is not aligned with 4H bias for continuation model');
  }
  const is4HPDDirectlyOpposite = (input.tradeDirection === 'long' && input.pd4H.status === 'premium') ||
                                (input.tradeDirection === 'short' && input.pd4H.status === 'discount');
  if (is4HPDDirectlyOpposite) {
    blockReasons.push('4H premium/discount context conflicts with the trade');
  }
  if (!input.has15mEvent) {
    blockReasons.push('15M structure confirmation is missing');
  }
  if (input.displacementQuality15m === null || input.displacementQuality15m.gradePoints < 1) {
    blockReasons.push('15M displacement quality is insufficient');
  }
  if (input.poiTestCount >= 2) {
    blockReasons.push('POI is already tested multiple times; fresh POIs required for entry');
  }
  if (input.modelState.model === 'none') {
    blockReasons.push('liquidity/model confirmation is missing');
  }
  if (poiIntegrityReasons.length > 0) {
    blockReasons.push('POI integrity is below the minimum entry standard');
  }

  // Category minimums check for entryAllowed
  const meetsCategoryMinimums =
    !is4HPDDirectlyOpposite &&
    input.bias4H === expected4HBias &&
    input.modelState.model !== 'none' &&
    (input.displacementQuality15m !== null && input.displacementQuality15m.gradePoints >= 1) &&
    input.poiTestCount <= 1 &&
    input.has15mEvent;

  const entryAllowed = blockReasons.length === 0 && (grade === 'A+' || grade === 'A') && meetsCategoryMinimums;

  return {
    totalScore,
    grade,
    entryAllowed,
    blockReasons,
    breakdown: {
      htfBiasPD: htfBiasPD.score,
      displacement,
      structure,
      sweep,
      poiQuality,
    },
    poiIntegrity: {
      decision: poiIntegrityReasons.length === 0 ? 'PASS' : 'FAIL',
      contributingReasons: poiIntegrityReasons,
    },
  };
}
