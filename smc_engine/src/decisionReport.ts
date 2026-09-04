import { DecisionEvaluation } from './decisionEvaluation';

export const DECISION_REPORT_VERSION = 1 as const;

export type DecisionWarningType = 'NO_MATCHING_PATTERN' | string;

export interface DecisionWarning {
  readonly type: DecisionWarningType;
  readonly message: string;
}

export interface DecisionReport {
  readonly metadata: {
    readonly decisionReportVersion: typeof DECISION_REPORT_VERSION;
    readonly learningReportVersion: number;
    readonly datasetFingerprint: string;
    readonly generatedFromPolicyId: string;
    readonly generatedFromPolicyVersion: number;
  };
  readonly policyReference: {
    readonly policyId: string;
    readonly name: string;
    readonly version: number;
  };
  readonly evaluatedPatterns: number;
  readonly eligiblePatterns: number;
  readonly blockedPatterns: number;
  readonly decisions: readonly DecisionEvaluation[];
  readonly warnings: readonly DecisionWarning[];
}
