export type RiskLifecycleState =
  | 'QUEUED'
  | 'EVALUATING'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'SKIPPED';

export interface RiskLifecycle {
  readonly initialState: Extract<RiskLifecycleState, 'QUEUED' | 'REJECTED' | 'SKIPPED'>;
  readonly activeState?: Extract<RiskLifecycleState, 'EVALUATING'>;
  readonly finalState: Extract<RiskLifecycleState, 'ACCEPTED' | 'REJECTED' | 'SKIPPED'>;
}

export function createAcceptedRiskLifecycle(): RiskLifecycle {
  return Object.freeze({
    initialState: 'QUEUED' as const,
    activeState: 'EVALUATING' as const,
    finalState: 'ACCEPTED' as const,
  });
}

export function createRejectedRiskLifecycle(): RiskLifecycle {
  return Object.freeze({
    initialState: 'REJECTED' as const,
    finalState: 'REJECTED' as const,
  });
}

export function createSkippedRiskLifecycle(): RiskLifecycle {
  return Object.freeze({
    initialState: 'SKIPPED' as const,
    finalState: 'SKIPPED' as const,
  });
}

