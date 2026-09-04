import { PatternDiscoveryResult, SignalPattern } from './signalPatternDiscovery';

export const SIGNAL_HYPOTHESIS_VERSION = 1 as const;

export type SignalHypothesisStatus =
  | 'PROPOSED'
  | 'UNDER_REVIEW'
  | 'READY_FOR_VALIDATION'
  | 'REJECTED';

export interface SignalHypothesisSupportingMetrics {
  readonly patternType: SignalPattern['patternType'];
  readonly patternKey: string;
  readonly patternValue: string;
  readonly observationCount: number;
  readonly patternConfidence: number;
  readonly distribution: Readonly<Record<string, number>>;
}

export interface SignalHypothesisMetadata {
  readonly source: 'PATTERN_DISCOVERY';
  readonly recommendationGenerated: false;
  readonly policyChanged: false;
  readonly gradeChanged: false;
  readonly tradingLogicChanged: false;
  readonly acceptedAsTrue: false;
  readonly validationPerformed: false;
}

export interface SignalHypothesis {
  readonly version: typeof SIGNAL_HYPOTHESIS_VERSION;
  readonly hypothesisId: string;
  readonly relatedPatternId: string;
  readonly hypothesisStatement: string;
  readonly supportingMetrics: SignalHypothesisSupportingMetrics;
  readonly observationCount: number;
  readonly confidence: number;
  readonly createdTimestamp: number;
  readonly status: SignalHypothesisStatus;
  readonly metadata: SignalHypothesisMetadata;
}

export interface HypothesisGenerationResult {
  readonly version: typeof SIGNAL_HYPOTHESIS_VERSION;
  readonly generationId: string;
  readonly sourceDiscoveryId: string;
  readonly createdTimestamp: number;
  readonly hypothesisCount: number;
  readonly hypotheses: readonly SignalHypothesis[];
  readonly metadata: SignalHypothesisMetadata;
}

export function generateSignalHypotheses(input: {
  readonly patternDiscoveryResult: PatternDiscoveryResult;
  readonly createdTimestamp?: number;
}): HypothesisGenerationResult {
  const createdTimestamp =
    input.createdTimestamp ?? input.patternDiscoveryResult.createdTimestamp;
  const metadata = createNeutralMetadata();
  const hypotheses = Object.freeze(
    input.patternDiscoveryResult.patterns
      .map(pattern => createHypothesis(pattern, createdTimestamp))
      .sort((left, right) => left.hypothesisId.localeCompare(right.hypothesisId))
  );

  console.log('Hypothesis Generation Complete');
  console.log(`Hypotheses Generated: ${hypotheses.length}`);

  return Object.freeze({
    version: SIGNAL_HYPOTHESIS_VERSION,
    generationId: createGenerationId(
      input.patternDiscoveryResult.discoveryId,
      hypotheses.map(hypothesis => hypothesis.hypothesisId),
      createdTimestamp
    ),
    sourceDiscoveryId: input.patternDiscoveryResult.discoveryId,
    createdTimestamp,
    hypothesisCount: hypotheses.length,
    hypotheses,
    metadata,
  });
}

function createHypothesis(
  pattern: SignalPattern,
  createdTimestamp: number
): SignalHypothesis {
  const supportingMetrics = Object.freeze({
    patternType: pattern.patternType,
    patternKey: pattern.patternKey,
    patternValue: pattern.patternValue,
    observationCount: pattern.observationCount,
    patternConfidence: pattern.confidence,
    distribution: pattern.evidence.distribution,
  });

  return Object.freeze({
    version: SIGNAL_HYPOTHESIS_VERSION,
    hypothesisId: createHypothesisId(pattern, createdTimestamp),
    relatedPatternId: pattern.patternId,
    hypothesisStatement: createHypothesisStatement(pattern),
    supportingMetrics,
    observationCount: pattern.observationCount,
    confidence: pattern.confidence,
    createdTimestamp,
    status: 'PROPOSED' as const,
    metadata: createNeutralMetadata(),
  });
}

function createHypothesisStatement(pattern: SignalPattern): string {
  const dominantMetric = findMostFrequent(pattern.evidence.distribution);

  switch (pattern.patternType) {
    case 'PAIR_OUTCOME_CLUSTER':
      return `Pair ${pattern.patternValue} may have a recurring ${dominantMetric ?? 'outcome'} outcome pattern.`;
    case 'GRADE_OUTCOME_CLUSTER':
      return `Grade ${pattern.patternValue} may have a recurring ${dominantMetric ?? 'outcome'} outcome pattern.`;
    case 'TIMEFRAME_OUTCOME_CLUSTER':
      return `Timeframe ${pattern.patternValue} may have a recurring ${dominantMetric ?? 'outcome'} outcome pattern.`;
    case 'OUTCOME_DENSITY':
      return `Outcome ${pattern.patternValue} may be recurring in the observed signal set.`;
    case 'GRADE_CLUSTER':
      return `Grade ${pattern.patternValue} may be recurring in the observed signal set.`;
    default:
      return `${pattern.patternKey}=${pattern.patternValue} may represent a recurring descriptive pattern.`;
  }
}

function findMostFrequent(distribution: Readonly<Record<string, number>>): string | null {
  const entries = Object.entries(distribution);
  if (entries.length === 0) return null;

  return entries.sort(([leftKey, leftCount], [rightKey, rightCount]) => {
    if (rightCount !== leftCount) return rightCount - leftCount;
    return leftKey.localeCompare(rightKey);
  })[0][0];
}

function createNeutralMetadata(): SignalHypothesisMetadata {
  return Object.freeze({
    source: 'PATTERN_DISCOVERY' as const,
    recommendationGenerated: false as const,
    policyChanged: false as const,
    gradeChanged: false as const,
    tradingLogicChanged: false as const,
    acceptedAsTrue: false as const,
    validationPerformed: false as const,
  });
}

function createHypothesisId(pattern: SignalPattern, createdTimestamp: number): string {
  return `SIGNAL_HYPOTHESIS_${hashString(
    `${pattern.patternId}|${pattern.patternType}|${pattern.patternKey}|${pattern.patternValue}|${createdTimestamp}`
  )}`;
}

function createGenerationId(
  discoveryId: string,
  hypothesisIds: readonly string[],
  createdTimestamp: number
): string {
  return `HYPOTHESIS_GENERATION_${hashString(
    `${discoveryId}|${[...hypothesisIds].sort().join('|')}|${createdTimestamp}`
  )}`;
}

function hashString(value: string): string {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, '0').toUpperCase();
}
