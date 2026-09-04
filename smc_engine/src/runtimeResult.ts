import { EXECUTION_PLAN_VERSION } from './executionPlan';
import { RuntimeMode } from './executionRuntimePolicy';
import { RuntimeItem } from './runtimeItem';

export const RUNTIME_RESULT_VERSION = 1 as const;

export type RuntimeWarningType =
  | 'NO_PLANNED_ACTIONS'
  | 'RUNTIME_DISABLED'
  | 'EXECUTION_DISABLED'
  | 'BROKER_RUNTIME_RESERVED'
  | 'UNSUPPORTED_ADAPTER'
  | 'MAXIMUM_RUNTIME_ITEMS_EXCEEDED';

export interface RuntimeWarning {
  readonly type: RuntimeWarningType;
  readonly severity: 'INFO' | 'WARNING' | 'ERROR';
  readonly message: string;
}

export interface RuntimeResult {
  readonly metadata: {
    readonly runtimeResultVersion: typeof RUNTIME_RESULT_VERSION;
    readonly executionPlanVersion: typeof EXECUTION_PLAN_VERSION;
    readonly runtimePolicyVersion: number;
    readonly datasetFingerprint: string;
  };
  readonly runtimeReference: {
    readonly runtimeId: string;
    readonly runtimeMode: RuntimeMode;
  };
  readonly processedItems: readonly RuntimeItem[];
  readonly skippedItems: readonly RuntimeItem[];
  readonly warnings: readonly RuntimeWarning[];
  readonly audit: {
    readonly inputPlannedActions: number;
    readonly inputBlockedActions: number;
    readonly processedItems: number;
    readonly skippedItems: number;
    readonly blockedItems: number;
  };
}
