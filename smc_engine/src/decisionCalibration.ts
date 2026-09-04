import { DecisionEvaluation, DecisionEvaluationStatus } from './decisionEvaluation';
import { DecisionReport } from './decisionReport';

export type DecisionCalibrationStatus =
  | 'ELIGIBLE'
  | 'WAIT'
  | 'LOW_CONFIDENCE'
  | 'FILTERED'
  | 'NOT_ELIGIBLE';

export interface DecisionCalibrationInput {
  readonly tradeDirection: 'long' | 'short';
  readonly bias4H: 'bullish' | 'bearish' | 'range' | 'undefined';
  readonly bias1H: 'bullish' | 'bearish' | 'range' | 'undefined';
  readonly pd4H: 'premium' | 'discount' | 'eq';
  readonly pd1H: 'premium' | 'discount' | 'eq';
  readonly pd15M?: 'premium' | 'discount' | 'eq';
  readonly poiTestCount: number;
  readonly grade: 'A+' | 'A' | 'B+' | 'B' | 'C';
  readonly score: number;
  readonly admissionProfile?: 'PRODUCTION' | 'PVP_ACCELERATION';
  readonly blockReasons: readonly string[];
  readonly breakdown: {
    readonly htfBiasPD: number;
    readonly displacement: number;
    readonly structure: number;
    readonly sweep: number;
    readonly poiQuality: number;
  };
}

export interface DecisionCalibrationCheck {
  readonly code: string;
  readonly status: 'PASS' | 'WARN' | 'FAIL';
  readonly severity: 'INFO' | 'WARNING' | 'ERROR';
  readonly message: string;
}

export interface DecisionCalibrationResult {
  readonly status: DecisionCalibrationStatus;
  readonly reason: {
    readonly code: string;
    readonly message: string;
  };
  readonly checks: readonly DecisionCalibrationCheck[];
}

export function calibrateDecision(input: DecisionCalibrationInput): DecisionCalibrationResult {
  const checks = Object.freeze([
    gradeCheck(input),
    blockReasonCheck(input),
    htfConflictCheck(input),
    premiumDiscountCheck(
      '4H_PD_ALIGNMENT',
      '4H Premium/Discount must support the trade direction.',
      input.tradeDirection,
      input.pd4H,
      true,
      false,
      true
    ),
    premiumDiscountCheck(
      '1H_PD_ALIGNMENT',
      '1H Premium/Discount must support the trade direction.',
      input.tradeDirection,
      input.pd1H,
      false,
      false,
      true
    ),
    ...(input.pd15M
      ? [
          premiumDiscountCheck(
            '15M_PD_ALIGNMENT',
            '15M Premium/Discount must support the trade direction.',
            input.tradeDirection,
            input.pd15M,
            false,
            false,
            true
          ),
        ]
      : []),
    poiRetestCheck(input),
    breakdownCheck('HTF_BIAS_PD_SCORE', (input.breakdown?.htfBiasPD ?? 2) >= 1, false, 'HTF bias and Premium/Discount score must be at least moderate.'),
    breakdownCheck('DISPLACEMENT_STRENGTH', (input.breakdown?.displacement ?? 2) >= 1, false, 'Displacement must be at least moderate.'),
    breakdownCheck('STRUCTURE_STRENGTH', (input.breakdown?.structure ?? 2) >= 1, false, 'Structure must be at least moderate.'),
    breakdownCheck('SWEEP_QUALITY', (input.breakdown?.sweep ?? 2) >= 1, false, 'Sweep/model confirmation must be present.'),
    breakdownCheck('POI_QUALITY', (input.breakdown?.poiQuality ?? 1) >= 0, false, 'POI quality must be confirmed.'),
  ]);
  const status = resolveCalibrationStatus(checks, input.admissionProfile);

  return Object.freeze({
    status,
    reason: Object.freeze(reasonForStatus(status, checks)),
    checks,
  });
}

export function applyDecisionCalibration(
  decisionReport: DecisionReport,
  calibration: DecisionCalibrationResult
): DecisionReport {
  const decisions = decisionReport.decisions.map(decision => calibrateDecisionEvaluation(decision, calibration));

  return Object.freeze({
    ...decisionReport,
    eligiblePatterns: decisions.filter(decision => decision.status === 'ELIGIBLE').length,
    blockedPatterns: decisions.filter(decision => decision.status !== 'ELIGIBLE').length,
    decisions: Object.freeze(decisions),
    warnings: Object.freeze([
      ...decisionReport.warnings,
      ...calibration.checks
        .filter(check => check.status !== 'PASS')
        .map(check => Object.freeze({
          type: check.code,
          message: check.message,
        })),
    ]),
  });
}

function calibrateDecisionEvaluation(
  decision: DecisionEvaluation,
  calibration: DecisionCalibrationResult
): DecisionEvaluation {
  if (decision.status !== 'ELIGIBLE') {
    return decision;
  }

  if (calibration.status === 'ELIGIBLE') {
    return Object.freeze({
      ...decision,
      summary: `${decision.summary} Runtime context calibration passed.`,
      reason: Object.freeze({
        code: 'CONTEXT_POLICY_PASSED',
        message: 'Decision passed grade, HTF, Premium/Discount, POI, structure, displacement, and sweep context gates.',
      }),
    });
  }

  const status = mapCalibrationStatus(calibration.status);
  return Object.freeze({
    ...decision,
    status,
    reason: Object.freeze(calibration.reason),
    summary: `${decision.id} is ${status} after runtime context calibration.`,
  });
}

function mapCalibrationStatus(status: DecisionCalibrationStatus): DecisionEvaluationStatus {
  if (status === 'WAIT' || status === 'LOW_CONFIDENCE' || status === 'FILTERED') {
    return status;
  }
  if (status === 'NOT_ELIGIBLE') {
    return 'NOT_ELIGIBLE';
  }
  return 'ELIGIBLE';
}

function gradeCheck(input: DecisionCalibrationInput): DecisionCalibrationCheck {
  const passed = input.grade === 'A+' || input.grade === 'A';
  return Object.freeze({
    code: 'MINIMUM_RUNTIME_GRADE',
    status: passed ? 'PASS' : 'FAIL',
    severity: passed ? 'INFO' : 'ERROR',
    message: passed
      ? 'Grade is A or A+ and can be evaluated by context gates.'
      : 'Runtime notification requires at least A grade before context gates are evaluated.',
  });
}

function blockReasonCheck(input: DecisionCalibrationInput): DecisionCalibrationCheck {
  const blockReasons = input.blockReasons ?? [];
  const passed = blockReasons.length === 0;
  return Object.freeze({
    code: 'NO_GRADE_BLOCK_REASONS',
    status: passed ? 'PASS' : 'FAIL',
    severity: passed ? 'INFO' : 'ERROR',
    message: passed
      ? 'Grade engine produced no hard block reasons.'
      : `Grade engine produced hard block reasons: ${blockReasons.join('; ')}`,
  });
}

function htfConflictCheck(input: DecisionCalibrationInput): DecisionCalibrationCheck {
  const directional4H = input.bias4H === 'bullish' || input.bias4H === 'bearish';
  const directional1H = input.bias1H === 'bullish' || input.bias1H === 'bearish';
  const conflict = directional4H && directional1H && input.bias4H !== input.bias1H;
  const isHardBlock = input.blockReasons.some(r => r.includes('1H bias is not aligned'));

  return Object.freeze({
    code: 'HTF_TREND_ALIGNMENT',
    status: isHardBlock ? 'FAIL' : 'PASS',
    severity: isHardBlock ? 'ERROR' : (conflict ? 'WARNING' : 'INFO'),
    message: isHardBlock
      ? '1H and 4H trend conflict for continuation model.'
      : (conflict
          ? '1H is in pullback against 4H trend (-1 penalty applied).'
          : '4H and 1H trend context is aligned or non-conflicting.'),
  });
}

function premiumDiscountCheck(
  code: string,
  message: string,
  direction: 'long' | 'short',
  pd: 'premium' | 'discount' | 'eq',
  hardFailure: boolean,
  pvpRelaxed = false,
  allowEQ = false
): DecisionCalibrationCheck {
  const aligned =
    (direction === 'long' && pd === 'discount') ||
    (direction === 'short' && pd === 'premium');

  if (aligned) {
    return Object.freeze({
      code,
      status: 'PASS',
      severity: 'INFO',
      message,
    });
  }

  if (pd === 'eq' && allowEQ) {
    return Object.freeze({
      code,
      status: 'PASS',
      severity: 'INFO',
      message: `${message} Actual: EQ (neutral zone permitted).`,
    });
  }

  const dirText = (direction ?? 'unknown').toUpperCase();
  const pdText = (pd ?? 'unknown').toUpperCase();

  if (pvpRelaxed) {
    return Object.freeze({
      code,
      status: 'PASS',
      severity: 'WARNING',
      message: `${message} Actual: ${dirText} in ${pdText}. PVP acceleration records this mismatch without blocking visualization delivery.`,
    });
  }

  return Object.freeze({
    code,
    status: hardFailure ? 'FAIL' : 'WARN',
    severity: hardFailure ? 'ERROR' : 'WARNING',
    message: `${message} Actual: ${dirText} in ${pdText}.`,
  });
}

function poiRetestCheck(input: DecisionCalibrationInput): DecisionCalibrationCheck {
  if (input.poiTestCount >= 3) {
    return Object.freeze({
      code: 'POI_RETEST_LIMIT',
      status: 'FAIL',
      severity: 'ERROR',
      message: 'POI has been tested 3+ times and must be filtered.',
    });
  }

  if (input.poiTestCount === 2) {
    return Object.freeze({
      code: 'POI_RETEST_LIMIT',
      status: 'PASS',
      severity: 'WARNING',
      message: 'POI has already been tested twice (-1 quality penalty applied).',
    });
  }

  return Object.freeze({
    code: 'POI_RETEST_LIMIT',
    status: 'PASS',
    severity: 'INFO',
    message: 'POI retest count is acceptable.',
  });
}

function breakdownCheck(
  code: string,
  passed: boolean,
  warningThreshold: boolean,
  message: string
): DecisionCalibrationCheck {
  return Object.freeze({
    code,
    status: passed ? 'PASS' : (warningThreshold ? 'WARN' : 'FAIL'),
    severity: passed ? 'INFO' : (warningThreshold ? 'WARNING' : 'ERROR'),
    message,
  });
}

function resolveCalibrationStatus(
  checks: readonly DecisionCalibrationCheck[],
  _admissionProfile?: 'PRODUCTION' | 'PVP_ACCELERATION'
): DecisionCalibrationStatus {
  if (checks.some(check => check.status === 'FAIL')) {
    return 'FILTERED';
  }

  if (checks.some(check => check.code === 'HTF_TREND_ALIGNMENT' && check.status === 'WARN')) {
    return 'WAIT';
  }

  if (checks.some(check => check.code === 'POI_RETEST_LIMIT' && check.status === 'WARN')) {
    return 'WAIT';
  }

  if (checks.some(check => check.status === 'WARN' && check.code !== '15M_PD_ALIGNMENT' && check.code !== '1H_PD_ALIGNMENT')) {
    return 'LOW_CONFIDENCE';
  }

  return 'ELIGIBLE';
}

function reasonForStatus(
  status: DecisionCalibrationStatus,
  checks: readonly DecisionCalibrationCheck[]
): DecisionCalibrationResult['reason'] {
  const firstBlockingCheck = checks.find(check => check.status === 'FAIL') ?? checks.find(check => check.status === 'WARN');
  if (status === 'ELIGIBLE') {
    return {
      code: 'CONTEXT_POLICY_PASSED',
      message: 'All runtime context quality gates passed.',
    };
  }

  if (status === 'WAIT') {
    return {
      code: firstBlockingCheck?.code ?? 'WAIT_FOR_CONTEXT',
      message: firstBlockingCheck?.message ?? 'Setup requires clearer market context before notification.',
    };
  }

  if (status === 'LOW_CONFIDENCE') {
    return {
      code: firstBlockingCheck?.code ?? 'LOW_CONFIDENCE_CONTEXT',
      message: firstBlockingCheck?.message ?? 'Setup quality is not strong enough for runtime notification.',
    };
  }

  if (status === 'FILTERED') {
    return {
      code: firstBlockingCheck?.code ?? 'FILTERED_BY_CONTEXT',
      message: firstBlockingCheck?.message ?? 'Setup failed a hard runtime context quality gate.',
    };
  }

  return {
    code: 'NOT_ELIGIBLE',
    message: 'Setup is not eligible under runtime context calibration.',
  };
}
