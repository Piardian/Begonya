import { PresentationDesignValidation } from './presentationDesignSystem';

export const PRESENTATION_POLICY_ENGINE_VERSION = 'PresentationPolicyEngine.v1' as const;

export type PresentationMode = 'Compact' | 'Balanced' | 'Detailed';

export type PresentationPlanActionPolicy =
  | 'ZOOM_OUT'
  | 'RECENTER'
  | 'DETAIL_BIAS'
  | 'OVERLAY_COMPACT'
  | 'OVERLAY_DETAILED'
  | 'ASSESSMENT_MISSING';

export interface PresentationPlanAction {
  readonly policy: PresentationPlanActionPolicy;
  readonly action: string;
  readonly reason: string;
}

export interface PresentationPlanTelemetry {
  readonly appliedPolicyCount: number;
  readonly skippedPolicyCount: number;
  readonly adaptationReason: string;
  readonly policyExecutionTime: number;
}

export interface PresentationDesignDecisionLog {
  readonly appliedDesignTokens: readonly string[];
  readonly colorPaletteVersion: string;
  readonly typographyVersion: string;
  readonly shapeVersion: string;
  readonly layerOrderVersion: string;
  readonly spacingVersion: string;
}

export interface PresentationPlan {
  readonly version: typeof PRESENTATION_POLICY_ENGINE_VERSION;
  readonly mode: PresentationMode;
  readonly screenshotPlan: {
    readonly version: string;
    readonly timeframe: string;
    readonly focusIndex: number;
    readonly anchorIndices: readonly number[];
    readonly visibleBars: number;
    readonly visibleRange: {
      readonly from: number;
      readonly to: number;
    };
    readonly padding: {
      readonly leftBars: number;
      readonly rightBars: number;
    };
    readonly warnings: readonly string[];
    readonly reasons: readonly string[];
  };
  readonly overlayBudget: {
    readonly maxAnnotations: number;
    readonly maxLabels: number;
    readonly maxBoxes: number;
    readonly maxStructureMarkers: number;
    readonly maxLiquidityObjects: number;
  };
  readonly selectedActions: readonly PresentationPlanAction[];
  readonly appliedPolicies: readonly string[];
  readonly skippedPolicies: readonly string[];
  readonly reasoning: readonly string[];
  readonly finalPresentationScore: number;
  readonly designValidation?: PresentationDesignValidation;
  readonly designDecisionLog?: PresentationDesignDecisionLog;
  readonly telemetry: PresentationPlanTelemetry;
}
