import { calculateConfidence } from './confidenceCalculator';
import { LearnedPattern, LearnedPatternType } from './learningPattern';
import { LearningObservation } from './learningObservation';

export function detectPatterns(observations: readonly LearningObservation[]): readonly LearnedPattern[] {
  return Object.freeze(observations.map(toPattern));
}

function toPattern(observation: LearningObservation): LearnedPattern {
  const { confidence, confidenceFactors } = calculateConfidence({
    sampleSize: observation.sampleSize,
    coverage: observation.coverage,
  });

  const type = patternTypeFor(observation);

  return Object.freeze({
    id: `pattern:${observation.id}`,
    type,
    metric: observation.metric,
    segment: observation.segment,
    value: observation.value,
    sampleSize: observation.sampleSize,
    coverage: observation.coverage,
    confidence,
    confidenceFactors: Object.freeze(confidenceFactors),
    comparisonEvidence: observation.comparisonEvidence,
    evidence: Object.freeze({
      observationId: observation.id,
      segmentBenchmark: Object.freeze({
        TP: observation.explanation.segmentBenchmark.counts.TP,
        SL: observation.explanation.segmentBenchmark.counts.SL,
        BE: observation.explanation.segmentBenchmark.counts.BE,
        EXPIRED: observation.explanation.segmentBenchmark.counts.EXPIRED,
        UNKNOWN: observation.explanation.segmentBenchmark.counts.UNKNOWN,
        sampleSize: observation.sampleSize,
        coverage: observation.coverage,
      }),
      overallBenchmark: Object.freeze({
        TP: observation.explanation.overallBenchmark.counts.TP,
        SL: observation.explanation.overallBenchmark.counts.SL,
        sampleSize: observation.explanation.overallBenchmark.counts.TP + observation.explanation.overallBenchmark.counts.SL + observation.explanation.overallBenchmark.counts.BE + observation.explanation.overallBenchmark.counts.EXPIRED + observation.explanation.overallBenchmark.counts.UNKNOWN,
        coverage: observation.explanation.overallCoverage,
      }),
    }),
    summary: createPatternSummary(type, observation),
    explanation: Object.freeze({
      because: observation.explanation.because,
      formula: `${observation.metric}: segment - overall = ${observation.comparisonEvidence.difference}`,
      interpretation: 'DESCRIPTIVE_HISTORICAL_PATTERN' as const,
    }),
    benchmarkReference: observation.benchmarkReference,
  });
}

function patternTypeFor(observation: LearningObservation): LearnedPatternType {
  const above = observation.direction === 'ABOVE_BASELINE';

  switch (observation.metric) {
    case 'TPRate':
      return above ? 'PERFORMANCE_ADVANTAGE' : 'PERFORMANCE_DISADVANTAGE';
    case 'SLRate':
      return above ? 'RISK_DISADVANTAGE' : 'RISK_ADVANTAGE';
    case 'averageEvaluationBars':
      return above ? 'EFFICIENCY_DISADVANTAGE' : 'EFFICIENCY_ADVANTAGE';
    case 'averageMFE':
      return above ? 'PERFORMANCE_ADVANTAGE' : 'PERFORMANCE_DISADVANTAGE';
    case 'averageMAE':
      return above ? 'RISK_DISADVANTAGE' : 'RISK_ADVANTAGE';
  }
}

function createPatternSummary(type: LearnedPatternType, observation: LearningObservation): string {
  return `${observation.segment}:${observation.value} shows ${type} on ${observation.metric} versus the overall historical benchmark.`;
}
