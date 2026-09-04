export type SimulationExecutionLifecycleState =
  | 'QUEUED'
  | 'SIMULATING'
  | 'SIMULATED'
  | 'REJECTED'
  | 'SKIPPED';

export interface SimulationExecutionLifecycle {
  readonly initialState: Extract<SimulationExecutionLifecycleState, 'QUEUED' | 'REJECTED' | 'SKIPPED'>;
  readonly activeState?: Extract<SimulationExecutionLifecycleState, 'SIMULATING'>;
  readonly finalState: Extract<SimulationExecutionLifecycleState, 'SIMULATED' | 'REJECTED' | 'SKIPPED'>;
}

export function createSimulatedLifecycle(): SimulationExecutionLifecycle {
  return Object.freeze({
    initialState: 'QUEUED' as const,
    activeState: 'SIMULATING' as const,
    finalState: 'SIMULATED' as const,
  });
}

export function createRejectedSimulationLifecycle(): SimulationExecutionLifecycle {
  return Object.freeze({
    initialState: 'REJECTED' as const,
    finalState: 'REJECTED' as const,
  });
}

export function createSkippedSimulationLifecycle(): SimulationExecutionLifecycle {
  return Object.freeze({
    initialState: 'SKIPPED' as const,
    finalState: 'SKIPPED' as const,
  });
}

