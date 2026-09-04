import {
  ConfidenceFactors,
  ConfidenceLevel,
} from './learningPattern';

export interface ConfidenceInput {
  sampleSize: number;
  coverage: number;
}

export function calculateConfidence(input: ConfidenceInput): {
  confidence: ConfidenceLevel;
  confidenceFactors: ConfidenceFactors;
} {
  const sample = scoreSample(input.sampleSize);
  const coverage = scoreCoverage(input.coverage);
  const stability = 'UNKNOWN' as const;

  return {
    confidence: minConfidence(sample, coverage),
    confidenceFactors: {
      sample,
      coverage,
      stability,
    },
  };
}

function scoreSample(sampleSize: number): ConfidenceLevel {
  if (sampleSize >= 100) return 'HIGH';
  if (sampleSize >= 50) return 'MEDIUM';
  return 'LOW';
}

function scoreCoverage(coverage: number): ConfidenceLevel {
  if (coverage >= 0.9) return 'HIGH';
  if (coverage >= 0.8) return 'MEDIUM';
  return 'LOW';
}

function minConfidence(a: ConfidenceLevel, b: ConfidenceLevel): ConfidenceLevel {
  const order: Record<ConfidenceLevel, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };
  return order[a] <= order[b] ? a : b;
}

