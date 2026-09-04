import { GradeResult } from './gradeCalculator';
import { SignalQualityResult, SIGNAL_QUALITY_RESULT_VERSION } from './signalQualityEngine';
import type { Symbol } from '../server/universe';

export const SIGNAL_INTELLIGENCE_SNAPSHOT_VERSION = 1 as const;
export const GRADE_ENGINE_VERSION = 1 as const;

export interface SignalIntelligenceCandidateSnapshot {
  poiType: 'OB' | 'FVG';
  tradeDirection: 'long' | 'short';
  currentPrice: number;
  poiFormedTimestamp: number;
  relatedEventType: 'BOS' | 'CHoCH';
  relatedEventTimestamp: number;
}

export interface SignalIntelligenceSnapshotInput {
  symbol: Symbol;
  timeframe: '15m';
  candidateId: string;
  candidate: SignalIntelligenceCandidateSnapshot;
  signalQuality: SignalQualityResult;
  grade: GradeResult;
}

export interface SignalIntelligenceSnapshot {
  snapshotVersion: typeof SIGNAL_INTELLIGENCE_SNAPSHOT_VERSION;
  timestamp: string;
  symbol: Symbol;
  timeframe: '15m';
  candidateId: string;
  candidate: SignalIntelligenceCandidateSnapshot;
  signalQuality: SignalQualityResult;
  grade: GradeResult;
  engine: {
    signalQualityVersion: typeof SIGNAL_QUALITY_RESULT_VERSION;
    gradeVersion: typeof GRADE_ENGINE_VERSION;
  };
}

export function createSignalIntelligenceSnapshot(
  input: SignalIntelligenceSnapshotInput
): SignalIntelligenceSnapshot {
  return {
    snapshotVersion: SIGNAL_INTELLIGENCE_SNAPSHOT_VERSION,
    timestamp: new Date(input.candidate.relatedEventTimestamp).toISOString(),
    symbol: input.symbol,
    timeframe: input.timeframe,
    candidateId: input.candidateId,
    candidate: input.candidate,
    signalQuality: input.signalQuality,
    grade: input.grade,
    engine: {
      signalQualityVersion: input.signalQuality.version,
      gradeVersion: GRADE_ENGINE_VERSION,
    },
  };
}
