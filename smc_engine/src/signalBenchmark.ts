import { SignalContext } from './signalContext';
import { SignalOutcome } from './signalOutcome';

export const SIGNAL_BENCHMARK_VERSION = 1 as const;

export type SignalBenchmarkStatus =
  | 'PENDING'
  | 'MATCHED'
  | 'MISMATCHED'
  | 'INSUFFICIENT_DATA'
  | 'SKIPPED';

export interface SignalBenchmarkPrediction {
  readonly predictedGrade: string;
  readonly predictedScore: number;
}

export interface SignalBenchmarkReality {
  readonly outcomeType: SignalOutcome['outcomeType'];
  readonly outcomeVersion: SignalOutcome['version'];
}

export interface SignalBenchmarkMetadata {
  readonly benchmarkVersion: typeof SIGNAL_BENCHMARK_VERSION;
  readonly source: 'RUNTIME_FOUNDATION';
  readonly decisionMade: false;
  readonly learningApplied: false;
  readonly policyEvolutionApplied: false;
}

export type SignalSmcReviewStatus =
  | 'WAITING'
  | 'IN_TRADE'
  | 'TAKE_PROFIT'
  | 'STOP_LOSS'
  | 'BREAK_EVEN'
  | 'REJECTED_BY_USER'
  | 'UNKNOWN';

export type SignalSmcReviewVerdict =
  | 'PASS'
  | 'PASS_WITH_NOTES'
  | 'FAIL'
  | 'WATCHLIST_ONLY'
  | 'REJECTED'
  | 'UNKNOWN';

export interface SignalSmcReview {
  readonly reviewVersion: 1;
  readonly reviewer: string;
  readonly reviewedAt: string;
  readonly source: 'MANUAL_SMC_JOURNAL';
  readonly status: SignalSmcReviewStatus;
  readonly finalVerdict: SignalSmcReviewVerdict;
  readonly outcome?: {
    readonly entryReached?: boolean;
    readonly confirmationReached?: boolean;
    readonly tp1Hit?: boolean;
    readonly tp2Hit?: boolean;
    readonly stopHit?: boolean;
    readonly breakEvenHit?: boolean;
    readonly rejectedByUser?: boolean;
  };
  readonly smcNotes: readonly string[];
  readonly improvementQuestions: readonly string[];
  readonly tags: readonly string[];
}

export interface SignalBenchmark {
  readonly version: typeof SIGNAL_BENCHMARK_VERSION;
  readonly signalId: string;
  readonly prediction: SignalBenchmarkPrediction;
  readonly reality: SignalBenchmarkReality;
  readonly benchmarkStatus: SignalBenchmarkStatus;
  readonly benchmarkTimestamp: number;
  readonly smcReview?: SignalSmcReview;
  readonly metadata: SignalBenchmarkMetadata;
}

export function createPendingSignalBenchmark(input: {
  readonly signalContext: SignalContext;
  readonly signalOutcome: SignalOutcome;
  readonly smcReview?: SignalSmcReview;
}): SignalBenchmark {
  return Object.freeze({
    version: SIGNAL_BENCHMARK_VERSION,
    signalId: input.signalContext.signalId,
    prediction: Object.freeze({
      predictedGrade: input.signalContext.grade ?? 'UNKNOWN',
      predictedScore: input.signalContext.score ?? 0,
    }),
    reality: Object.freeze({
      outcomeType: input.signalOutcome.outcomeType,
      outcomeVersion: input.signalOutcome.version,
    }),
    benchmarkStatus: 'PENDING' as const,
    benchmarkTimestamp: input.signalOutcome.timestamp,
    smcReview: input.smcReview,
    metadata: Object.freeze({
      benchmarkVersion: SIGNAL_BENCHMARK_VERSION,
      source: 'RUNTIME_FOUNDATION' as const,
      decisionMade: false as const,
      learningApplied: false as const,
      policyEvolutionApplied: false as const,
    }),
  });
}
