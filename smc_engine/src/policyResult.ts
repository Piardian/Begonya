export type PolicyCheckType =
  | 'MIN_SAMPLE_SIZE'
  | 'MIN_COVERAGE'
  | 'MIN_CONFIDENCE'
  | 'ALLOWED_PATTERN_TYPE'
  | 'BLOCKED_PATTERN_TYPE'
  | 'REQUIRED_METRIC'
  | 'ALLOWED_SEGMENT'
  | 'MAXIMUM_RISK_LEVEL';

export type PolicyCheckStatus = 'PASS' | 'FAIL' | 'SKIPPED';
export type PolicyCheckSeverity = 'INFO' | 'WARNING' | 'ERROR';

export interface PolicyCheckResult {
  readonly check: PolicyCheckType;
  readonly status: PolicyCheckStatus;
  readonly severity: PolicyCheckSeverity;
  readonly expected?: unknown;
  readonly actual?: unknown;
  readonly message: string;
}

export interface PatternPolicyResult {
  readonly patternId: string;
  readonly passed: boolean;
  readonly checks: readonly PolicyCheckResult[];
}

