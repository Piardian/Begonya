export type ValidationSeverity = 'error' | 'warning';

export interface ValidationIssue {
  severity: ValidationSeverity;
  code: string;
  candidateId?: string;
  message: string;
}

export interface DatasetCoverage {
  snapshotCount: number;
  labeledCount: number;
  missingOutcomeCount: number;
  coverageRate: number;
}

export interface ValidationReport {
  valid: boolean;
  issues: ValidationIssue[];
  summary: {
    errorCount: number;
    warningCount: number;
  };
  coverage: DatasetCoverage;
}

export function createValidationReport(
  issues: readonly ValidationIssue[],
  coverage: DatasetCoverage
): ValidationReport {
  const errorCount = issues.filter(issue => issue.severity === 'error').length;
  const warningCount = issues.filter(issue => issue.severity === 'warning').length;

  return {
    valid: errorCount === 0,
    issues: [...issues],
    summary: {
      errorCount,
      warningCount,
    },
    coverage,
  };
}
