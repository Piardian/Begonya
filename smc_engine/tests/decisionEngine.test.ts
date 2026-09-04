import { createDecisionPolicy } from '../src/decisionPolicy';
import { generateDecisionReport } from '../src/decisionEngine';
import { generateLearningReport } from '../src/learningEngine';
import { generateSegmentedBenchmark } from '../src/segmentedBenchmark';
import { createValidatedDataset } from '../src/validatedDataset';
import { validateDataset } from '../src/outcomeValidation';
import { outcome, snapshot } from './outcomeValidation.test';

describe('Decision Engine', () => {
  test('evaluates learning patterns through immutable policy and produces explainable eligible decisions', () => {
    const learningReport = createLearningReport();
    const policy = createDecisionPolicy({
      policyId: 'policy-v1',
      name: 'Conservative performance policy',
      minimumSampleSize: 30,
      minimumCoverage: 0.8,
      minimumConfidence: 'LOW',
      allowedPatternTypes: ['PERFORMANCE_ADVANTAGE'],
      requiredMetrics: ['TPRate'],
      allowedSegments: ['grade'],
      maximumRiskLevel: 'LOW',
    });

    const report = generateDecisionReport(learningReport, policy);
    const eligible = report.decisions.find(decision => decision.status === 'ELIGIBLE');

    expect(Object.isFrozen(policy)).toBe(true);
    expect(report.metadata).toMatchObject({
      decisionReportVersion: 1,
      learningReportVersion: 1,
      datasetFingerprint: learningReport.metadata.datasetFingerprint,
      generatedFromPolicyId: 'policy-v1',
      generatedFromPolicyVersion: 1,
    });
    expect(eligible).toBeDefined();
    expect(eligible?.explanation.policyReference).toEqual({ policyId: 'policy-v1', version: 1 });
    expect(eligible?.explanation.patternReference).toMatchObject({
      type: 'PERFORMANCE_ADVANTAGE',
      metric: 'TPRate',
      segment: 'grade',
      value: 'A+',
    });
    expect(eligible?.observationId).toBeDefined();
    expect(eligible?.explanation.benchmarkReference?.datasetFingerprint).toBe(learningReport.metadata.datasetFingerprint);
    expect(eligible?.executionEligibility).toEqual({
      executable: false,
      reason: 'Execution Engine not implemented',
    });
    expect(eligible?.policyResults.checks).toContainEqual(expect.objectContaining({
      check: 'MAXIMUM_RISK_LEVEL',
      status: 'SKIPPED',
      severity: 'INFO',
    }));
  });

  test('reports insufficient evidence when policy evidence thresholds fail', () => {
    const learningReport = createLearningReport();
    const policy = createDecisionPolicy({
      policyId: 'strict-policy',
      name: 'Strict policy',
      minimumSampleSize: 500,
      minimumCoverage: 0.99,
      minimumConfidence: 'HIGH',
    });

    const report = generateDecisionReport(learningReport, policy);

    expect(report.decisions.some(decision => decision.status === 'INSUFFICIENT_EVIDENCE')).toBe(true);
    expect(report.decisions[0].policyResults.checks).toContainEqual(expect.objectContaining({
      check: 'MIN_SAMPLE_SIZE',
      status: 'FAIL',
      severity: 'WARNING',
    }));
  });

  test('reports blocked by policy before generic not eligible', () => {
    const learningReport = createLearningReport();
    const policy = createDecisionPolicy({
      policyId: 'block-risk',
      name: 'Block risk disadvantage',
      minimumSampleSize: 30,
      minimumCoverage: 0.8,
      minimumConfidence: 'LOW',
      blockedPatternTypes: ['RISK_DISADVANTAGE'],
    });

    const report = generateDecisionReport(learningReport, policy);

    expect(report.decisions.some(decision => decision.status === 'BLOCKED_BY_POLICY')).toBe(true);
    expect(report.decisions.find(decision => decision.status === 'BLOCKED_BY_POLICY')?.policyResults.checks)
      .toContainEqual(expect.objectContaining({
        check: 'BLOCKED_PATTERN_TYPE',
        status: 'FAIL',
        severity: 'ERROR',
      }));
  });

  test('same learning report can be evaluated with different immutable policies', () => {
    const learningReport = createLearningReport();
    const policyA = createDecisionPolicy({
      policyId: 'policy-a',
      name: 'Performance only',
      minimumSampleSize: 30,
      minimumCoverage: 0.8,
      minimumConfidence: 'LOW',
      allowedPatternTypes: ['PERFORMANCE_ADVANTAGE'],
    });
    const policyB = createDecisionPolicy({
      policyId: 'policy-b',
      name: 'Risk only',
      minimumSampleSize: 30,
      minimumCoverage: 0.8,
      minimumConfidence: 'LOW',
      allowedPatternTypes: ['RISK_ADVANTAGE'],
    });
    const before = JSON.stringify(learningReport);

    const reportA = generateDecisionReport(learningReport, policyA);
    const reportB = generateDecisionReport(learningReport, policyB);

    expect(reportA).not.toEqual(reportB);
    expect(reportA.metadata.generatedFromPolicyId).toBe('policy-a');
    expect(reportB.metadata.generatedFromPolicyId).toBe('policy-b');
    expect(JSON.stringify(learningReport)).toBe(before);
    expect(Object.isFrozen(policyA.allowedPatternTypes)).toBe(true);
    expect(Object.isFrozen(policyB.allowedPatternTypes)).toBe(true);
  });

  test('reports no matching pattern when learning report contains no patterns', () => {
    const emptyLearningReport = Object.freeze({
      metadata: Object.freeze({
        learningReportVersion: 1 as const,
        benchmarkVersion: 1,
        segmentedBenchmarkVersion: 1,
        datasetFingerprint: 'empty',
        generatedAtDatasetCoverage: 1,
        minSampleSize: 30 as const,
        minCoverageRate: 0.8 as const,
      }),
      overallLearning: Object.freeze({
        evaluatedSegments: 0,
        observations: 0,
        learnedPatterns: 0,
        skippedSegments: 0,
      }),
      observations: Object.freeze([]),
      patterns: Object.freeze([]),
      warnings: Object.freeze([]),
    });
    const policy = createDecisionPolicy({
      policyId: 'policy-empty',
      name: 'Empty policy',
      minimumSampleSize: 30,
      minimumCoverage: 0.8,
      minimumConfidence: 'LOW',
    });

    const report = generateDecisionReport(emptyLearningReport, policy);

    expect(report.evaluatedPatterns).toBe(0);
    expect(report.decisions).toHaveLength(0);
    expect(report.warnings).toContainEqual(expect.objectContaining({
      type: 'NO_MATCHING_PATTERN',
    }));
  });
});

function createLearningReport() {
  const snapshots = [
    ...createSnapshots('aplus-tp', 'A+', 80),
    ...createSnapshots('aplus-sl', 'A+', 20),
    ...createSnapshots('a-tp', 'A', 40),
    ...createSnapshots('a-sl', 'A', 60),
  ];
  const outcomes = [
    ...createOutcomes('aplus-tp', 80, 'TP'),
    ...createOutcomes('aplus-sl', 20, 'SL'),
    ...createOutcomes('a-tp', 40, 'TP'),
    ...createOutcomes('a-sl', 60, 'SL'),
  ];
  const dataset = createValidatedDataset({
    snapshots,
    outcomes,
    validationReport: validateDataset({ snapshots, outcomes }),
  });

  return generateLearningReport(generateSegmentedBenchmark(dataset));
}

function createSnapshots(prefix: string, grade: 'A+' | 'A', count: number) {
  return Array.from({ length: count }, (_, index) => snapshotWithGrade(`${prefix}-${index}`, grade));
}

function createOutcomes(prefix: string, count: number, status: 'TP' | 'SL') {
  return Array.from({ length: count }, (_, index) => outcome(`${prefix}-${index}`, status));
}

function snapshotWithGrade(candidateId: string, grade: 'A+' | 'A') {
  const result = snapshot(candidateId);
  result.grade.grade = grade;
  return result;
}
