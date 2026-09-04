import type {
  DisplacementQuality,
  FVG,
  OrderBlock,
  PremiumDiscountState,
  StructureEvent,
} from './types';

export type TradeDirection = 'long' | 'short';

export type BiasDirection = 'bullish' | 'bearish' | 'range' | 'undefined';

export type SessionName =
  | 'London'
  | 'New York'
  | 'Asia'
  | 'Overlap'
  | 'Off Session'
  | 'Unknown';

export type POIType = 'Order Block' | 'Fair Value Gap';

export type LiquidityEventType =
  | 'Range High'
  | 'Range Low'
  | 'Equal High'
  | 'Equal Low'
  | 'Swing High'
  | 'Swing Low'
  | 'Internal Liquidity'
  | 'External Liquidity'
  | 'Unknown';

export type MarketPhase =
  | 'Expansion'
  | 'Retracement'
  | 'Consolidation'
  | 'Reversal'
  | 'Distribution'
  | 'Accumulation'
  | 'Unknown';

export type AlignmentQuality = 'Aligned' | 'Mixed' | 'Conflicting' | 'Unknown';

export type ContextQuality = 'Ideal' | 'Acceptable' | 'Weak' | 'Invalid' | 'Unknown';

export type ZoneFreshness = 'Fresh' | 'Tested' | 'Overtested' | 'Stale' | 'Unknown';

export type ZoneState = 'Active' | 'Mitigated' | 'Invalidated' | 'Expired' | 'Unknown';

export type NarrativeStrength = 'Strong' | 'Coherent' | 'Weak' | 'Contradictory' | 'Unknown';

export type NarrativeStoryStrength = 'Strong' | 'Neutral' | 'Weak';

export type NarrativeOverallQuality = 'Elite' | 'High' | 'Medium' | 'Low';

export type QualityLevel = 'Elite' | 'High' | 'Medium' | 'Low' | 'Invalid' | 'Unknown';

export type SetupGradeValue = 'A+' | 'A' | 'A-' | 'B+' | 'B' | 'Reject';

export type QualityBand = 'Elite' | 'High' | 'Medium' | 'Low' | 'Rejected';

export type AssessmentVersion = 'SetupAssessment.v2';

export interface DetectorResult {
  signalId: string;
  symbol: string;
  timeframe: string;
  direction: TradeDirection;
  detectedAt: number;

  htfBias: {
    fourHour: BiasDirection;
    oneHour: BiasDirection;
  };

  structure: {
    event: StructureEvent | null;
    eventType: 'BOS' | 'CHoCH' | 'None';
    trend15m: BiasDirection;
  };

  sweep: {
    present: boolean;
    type: LiquidityEventType;
    timestamp: number | null;
    source: 'detector' | 'inferred' | 'unknown';
  };

  poi: {
    type: POIType;
    orderBlock: OrderBlock | null;
    fairValueGap: FVG | null;
    zoneHigh: number;
    zoneLow: number;
    formedAt: number;
    testCount: number;
  };

  premiumDiscount: {
    fourHour: PremiumDiscountState;
    oneHour: PremiumDiscountState;
    fifteenMinute: PremiumDiscountState;
  };

  displacement: DisplacementQuality | null;

  session: {
    name: SessionName;
    timestamp: number;
    timezone: string;
  };

  liquidity: {
    events: LiquidityEventType[];
    notes: string[];
  };
}

export interface ContextAnalysis {
  htfAlignment: {
    quality: AlignmentQuality;
    supportsDirection: boolean;
    conflictReasons: string[];
  };

  premiumDiscount: {
    quality: ContextQuality;
    supportsDirection: boolean;
    conflicts: string[];
  };

  marketPhase: {
    value: MarketPhase;
    confidence: 'High' | 'Medium' | 'Low' | 'Unknown';
  };

  zoneFreshness: {
    value: ZoneFreshness;
    testCount: number;
    notes: string[];
  };

  zoneState: {
    value: ZoneState;
    invalidationReasons: string[];
  };

  sessionQuality: {
    quality: ContextQuality;
    notes: string[];
  };

  summary: string;
}

export interface NarrativeAnalysis {
  liquidityStory: {
    strength: NarrativeStrength;
    summary: string;
    missingPieces: string[];
  };

  reactionLogic: {
    strength: NarrativeStrength;
    summary: string;
  };

  smcNarrative: {
    strength: NarrativeStrength;
    steps: string[];
  };

  structuralConsistency: {
    strength: NarrativeStrength;
    contradictions: string[];
  };

  marketLogic: {
    strength: NarrativeStrength;
    summary: string;
  };
}

export interface NarrativeAssessment {
  version: 'NarrativeAssessment.v1';
  contextStory: NarrativeStoryStrength;
  liquidityStory: NarrativeStoryStrength;
  reactionStory: NarrativeStoryStrength;
  continuationStory: NarrativeStoryStrength;
  overallNarrative: NarrativeOverallQuality;
  consistency: number;
  reasons: string[];
}

export interface QualityAnalysis {
  poiQuality: QualityLevel;
  structureQuality: QualityLevel;
  displacementQuality: QualityLevel;
  contextQuality: QualityLevel;
  narrativeQuality: QualityLevel;
  overallQuality: QualityLevel;
  notes: string[];
}

export interface SetupAssessmentDecision {
  hardReject: boolean;
  rejectReasons: string[];
  gradeCaps: string[];
  penalties: string[];
  rulebookVersion?: string;
  appliedRules?: {
    hardRejects: Array<{
      id: string;
      category: 'HardReject' | 'GradeCap' | 'SoftPenalty';
      severity: 'Critical' | 'High' | 'Medium' | 'Low';
      message: string;
      recommendation: string;
      maxGrade?: SetupGradeValue;
    }>;
    gradeCaps: Array<{
      id: string;
      category: 'HardReject' | 'GradeCap' | 'SoftPenalty';
      severity: 'Critical' | 'High' | 'Medium' | 'Low';
      message: string;
      recommendation: string;
      maxGrade?: SetupGradeValue;
    }>;
    softPenalties: Array<{
      id: string;
      category: 'HardReject' | 'GradeCap' | 'SoftPenalty';
      severity: 'Critical' | 'High' | 'Medium' | 'Low';
      message: string;
      recommendation: string;
      maxGrade?: SetupGradeValue;
    }>;
    all: Array<{
      id: string;
      category: 'HardReject' | 'GradeCap' | 'SoftPenalty';
      severity: 'Critical' | 'High' | 'Medium' | 'Low';
      message: string;
      recommendation: string;
      maxGrade?: SetupGradeValue;
    }>;
  };
}

export interface SetupAssessmentGrade {
  value: SetupGradeValue;
  qualityBand: QualityBand;
}

export interface SetupAssessmentExplainability {
  supportedBy: string[];
  weakenedBy: string[];
  summary: string;
  evidenceScore: number;
}

/**
 * SetupAssessment is the V2 contract for setup-quality classification.
 *
 * It is intentionally not an execution model. It does not decide position size,
 * entry automation, stop loss placement, take profit placement, or trade
 * management. Its purpose is to create a shared, versioned language between
 * Detector, Grade, Decision, Telegram, and Evidence layers.
 */
export interface SetupAssessment {
  version: AssessmentVersion;
  detector: DetectorResult;
  context: ContextAnalysis;
  narrative: NarrativeAnalysis;
  narrativeAssessment: NarrativeAssessment;
  quality: QualityAnalysis;
  decision: SetupAssessmentDecision;
  grade: SetupAssessmentGrade;
  explainability: SetupAssessmentExplainability;
}
