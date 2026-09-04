import { DecisionPolicy } from './decisionPolicy';
import { DecisionEvaluation, DecisionEvaluationStatus } from './decisionEvaluation';
import { DECISION_REPORT_VERSION, DecisionReport, DecisionWarning } from './decisionReport';
import { LearningReport } from './learningReport';
import { LearnedPattern } from './learningPattern';
import { evaluatePolicy } from './policyEvaluator';
import { PatternPolicyResult } from './policyResult';

export function generateDecisionReport(
  learningReport: LearningReport,
  policy: DecisionPolicy
): DecisionReport {
  const decisions = learningReport.patterns.map(pattern => createDecisionEvaluation(pattern, policy));
  const warnings: DecisionWarning[] = [];

  if (learningReport.patterns.length === 0) {
    warnings.push(Object.freeze({
      type: 'NO_MATCHING_PATTERN',
      message: 'LearningReport contains no patterns to evaluate.',
    }));
  }

  return Object.freeze({
    metadata: Object.freeze({
      decisionReportVersion: DECISION_REPORT_VERSION,
      learningReportVersion: learningReport.metadata.learningReportVersion,
      datasetFingerprint: learningReport.metadata.datasetFingerprint,
      generatedFromPolicyId: policy.policyId,
      generatedFromPolicyVersion: policy.version,
    }),
    policyReference: Object.freeze({
      policyId: policy.policyId,
      name: policy.name,
      version: policy.version,
    }),
    evaluatedPatterns: learningReport.patterns.length,
    eligiblePatterns: decisions.filter(decision => decision.status === 'ELIGIBLE').length,
    blockedPatterns: decisions.filter(decision => decision.status !== 'ELIGIBLE').length,
    decisions: Object.freeze(decisions),
    warnings: Object.freeze(warnings),
  });
}

function createDecisionEvaluation(pattern: LearnedPattern, policy: DecisionPolicy): DecisionEvaluation {
  const policyResults = evaluatePolicy(pattern, policy);
  const status = determineStatus(policyResults);
  const reason = createReason(status);

  return Object.freeze({
    id: `decision:${policy.policyId}:${pattern.id}`,
    status,
    patternId: pattern.id,
    observationId: pattern.evidence.observationId,
    policyResults,
    reason: Object.freeze(reason),
    summary: `${pattern.id} is ${status} under policy ${policy.policyId}.`,
    explanation: Object.freeze({
      patternReference: Object.freeze({
        patternId: pattern.id,
        type: pattern.type,
        metric: pattern.metric,
        segment: pattern.segment,
        value: pattern.value,
      }),
      observationReference: Object.freeze({
        observationId: pattern.evidence.observationId,
      }),
      benchmarkReference: Object.freeze(pattern.benchmarkReference),
      policyReference: Object.freeze({
        policyId: policy.policyId,
        version: policy.version,
      }),
      policyChecks: policyResults.checks,
    }),
    executionEligibility: Object.freeze({
      executable: false as const,
      reason: 'Execution Engine not implemented' as const,
    }),
  });
}

function determineStatus(policyResult: PatternPolicyResult): DecisionEvaluationStatus {
  if (policyResult.checks.some(check => check.check === 'BLOCKED_PATTERN_TYPE' && check.status === 'FAIL')) {
    return 'BLOCKED_BY_POLICY';
  }

  if (policyResult.checks.some(check =>
    (check.check === 'MIN_SAMPLE_SIZE' || check.check === 'MIN_COVERAGE' || check.check === 'MIN_CONFIDENCE') &&
    check.status === 'FAIL'
  )) {
    return 'INSUFFICIENT_EVIDENCE';
  }

  if (policyResult.checks.some(check => check.status === 'FAIL')) {
    return 'NOT_ELIGIBLE';
  }

  return 'ELIGIBLE';
}

function createReason(status: DecisionEvaluationStatus): DecisionEvaluation['reason'] {
  switch (status) {
    case 'ELIGIBLE':
      return {
        code: 'POLICY_PASSED',
        message: 'Pattern satisfies all enforced policy checks. This is not execution intent.',
      };
    case 'WAIT':
      return {
        code: 'WAIT_FOR_CONTEXT',
        message: 'Pattern passed base policy but requires clearer market context.',
      };
    case 'LOW_CONFIDENCE':
      return {
        code: 'LOW_CONFIDENCE',
        message: 'Pattern passed base policy but context confidence is too low.',
      };
    case 'FILTERED':
      return {
        code: 'FILTERED_BY_CONTEXT',
        message: 'Pattern passed base policy but failed a hard context filter.',
      };
    case 'INSUFFICIENT_EVIDENCE':
      return {
        code: 'INSUFFICIENT_EVIDENCE',
        message: 'Pattern failed one or more evidence quality policy checks.',
      };
    case 'BLOCKED_BY_POLICY':
      return {
        code: 'BLOCKED_BY_POLICY',
        message: 'Pattern is explicitly blocked by policy.',
      };
    case 'NOT_ELIGIBLE':
      return {
        code: 'NOT_ELIGIBLE',
        message: 'Pattern does not satisfy one or more policy constraints.',
      };
    case 'NO_MATCHING_PATTERN':
      return {
        code: 'NO_MATCHING_PATTERN',
        message: 'No matching pattern was available for policy evaluation.',
      };
  }
}
