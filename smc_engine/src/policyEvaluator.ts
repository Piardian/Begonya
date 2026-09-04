import { DecisionPolicy } from './decisionPolicy';
import { ConfidenceLevel, LearnedPattern } from './learningPattern';
import { PatternPolicyResult, PolicyCheckResult } from './policyResult';

const CONFIDENCE_ORDER: Record<ConfidenceLevel, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

export function evaluatePolicy(pattern: LearnedPattern, policy: DecisionPolicy): PatternPolicyResult {
  const checks: PolicyCheckResult[] = [
    checkMinimumSampleSize(pattern, policy),
    checkMinimumCoverage(pattern, policy),
    checkMinimumConfidence(pattern, policy),
    checkAllowedPatternTypes(pattern, policy),
    checkBlockedPatternTypes(pattern, policy),
    checkRequiredMetrics(pattern, policy),
    checkAllowedSegments(pattern, policy),
    checkMaximumRiskLevel(policy),
  ];

  return Object.freeze({
    patternId: pattern.id,
    passed: checks.every(check => check.status !== 'FAIL'),
    checks: Object.freeze(checks),
  });
}

function checkMinimumSampleSize(pattern: LearnedPattern, policy: DecisionPolicy): PolicyCheckResult {
  const passed = pattern.sampleSize >= policy.minimumSampleSize;
  return freezeCheck({
    check: 'MIN_SAMPLE_SIZE',
    status: passed ? 'PASS' : 'FAIL',
    severity: passed ? 'INFO' : 'WARNING',
    expected: policy.minimumSampleSize,
    actual: pattern.sampleSize,
    message: passed
      ? 'Pattern sample size satisfies the policy minimum.'
      : 'Pattern sample size is below the policy minimum.',
  });
}

function checkMinimumCoverage(pattern: LearnedPattern, policy: DecisionPolicy): PolicyCheckResult {
  const passed = pattern.coverage >= policy.minimumCoverage;
  return freezeCheck({
    check: 'MIN_COVERAGE',
    status: passed ? 'PASS' : 'FAIL',
    severity: passed ? 'INFO' : 'WARNING',
    expected: policy.minimumCoverage,
    actual: pattern.coverage,
    message: passed
      ? 'Pattern coverage satisfies the policy minimum.'
      : 'Pattern coverage is below the policy minimum.',
  });
}

function checkMinimumConfidence(pattern: LearnedPattern, policy: DecisionPolicy): PolicyCheckResult {
  const passed = CONFIDENCE_ORDER[pattern.confidence] >= CONFIDENCE_ORDER[policy.minimumConfidence];
  return freezeCheck({
    check: 'MIN_CONFIDENCE',
    status: passed ? 'PASS' : 'FAIL',
    severity: passed ? 'INFO' : 'WARNING',
    expected: policy.minimumConfidence,
    actual: pattern.confidence,
    message: passed
      ? 'Pattern confidence satisfies the policy minimum.'
      : 'Pattern confidence is below the policy minimum.',
  });
}

function checkAllowedPatternTypes(pattern: LearnedPattern, policy: DecisionPolicy): PolicyCheckResult {
  if (!policy.allowedPatternTypes) {
    return freezeCheck({
      check: 'ALLOWED_PATTERN_TYPE',
      status: 'SKIPPED',
      severity: 'INFO',
      message: 'No allowed pattern type constraint is configured.',
    });
  }

  const passed = policy.allowedPatternTypes.includes(pattern.type);
  return freezeCheck({
    check: 'ALLOWED_PATTERN_TYPE',
    status: passed ? 'PASS' : 'FAIL',
    severity: passed ? 'INFO' : 'ERROR',
    expected: policy.allowedPatternTypes,
    actual: pattern.type,
    message: passed
      ? 'Pattern type is allowed by policy.'
      : 'Pattern type is not included in the allowed policy list.',
  });
}

function checkBlockedPatternTypes(pattern: LearnedPattern, policy: DecisionPolicy): PolicyCheckResult {
  if (!policy.blockedPatternTypes) {
    return freezeCheck({
      check: 'BLOCKED_PATTERN_TYPE',
      status: 'SKIPPED',
      severity: 'INFO',
      message: 'No blocked pattern type constraint is configured.',
    });
  }

  const blocked = policy.blockedPatternTypes.includes(pattern.type);
  return freezeCheck({
    check: 'BLOCKED_PATTERN_TYPE',
    status: blocked ? 'FAIL' : 'PASS',
    severity: blocked ? 'ERROR' : 'INFO',
    expected: policy.blockedPatternTypes,
    actual: pattern.type,
    message: blocked
      ? 'Pattern type is explicitly blocked by policy.'
      : 'Pattern type is not blocked by policy.',
  });
}

function checkRequiredMetrics(pattern: LearnedPattern, policy: DecisionPolicy): PolicyCheckResult {
  if (!policy.requiredMetrics) {
    return freezeCheck({
      check: 'REQUIRED_METRIC',
      status: 'SKIPPED',
      severity: 'INFO',
      message: 'No required metric constraint is configured.',
    });
  }

  const passed = policy.requiredMetrics.includes(pattern.metric);
  return freezeCheck({
    check: 'REQUIRED_METRIC',
    status: passed ? 'PASS' : 'FAIL',
    severity: passed ? 'INFO' : 'ERROR',
    expected: policy.requiredMetrics,
    actual: pattern.metric,
    message: passed
      ? 'Pattern metric satisfies the policy requirement.'
      : 'Pattern metric does not satisfy the policy requirement.',
  });
}

function checkAllowedSegments(pattern: LearnedPattern, policy: DecisionPolicy): PolicyCheckResult {
  if (!policy.allowedSegments) {
    return freezeCheck({
      check: 'ALLOWED_SEGMENT',
      status: 'SKIPPED',
      severity: 'INFO',
      message: 'No allowed segment constraint is configured.',
    });
  }

  const passed = policy.allowedSegments.includes(pattern.segment);
  return freezeCheck({
    check: 'ALLOWED_SEGMENT',
    status: passed ? 'PASS' : 'FAIL',
    severity: passed ? 'INFO' : 'ERROR',
    expected: policy.allowedSegments,
    actual: pattern.segment,
    message: passed
      ? 'Pattern segment is allowed by policy.'
      : 'Pattern segment is not included in the allowed policy list.',
  });
}

function checkMaximumRiskLevel(policy: DecisionPolicy): PolicyCheckResult {
  return freezeCheck({
    check: 'MAXIMUM_RISK_LEVEL',
    status: 'SKIPPED',
    severity: 'INFO',
    expected: policy.maximumRiskLevel,
    message: policy.maximumRiskLevel
      ? 'maximumRiskLevel is reserved for a future risk model and is not evaluated in Sprint 7.'
      : 'No maximum risk level constraint is configured.',
  });
}

function freezeCheck(check: PolicyCheckResult): PolicyCheckResult {
  return Object.freeze(check);
}

