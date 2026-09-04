export type PaperExecutionLifecycleState =
  | 'ACCEPTED'
  | 'PROCESSED'
  | 'COMPLETED'
  | 'REJECTED'
  | 'SKIPPED';

export interface PaperExecutionLifecycle {
  readonly initialState: Extract<PaperExecutionLifecycleState, 'ACCEPTED' | 'REJECTED' | 'SKIPPED'>;
  readonly processedState?: Extract<PaperExecutionLifecycleState, 'PROCESSED'>;
  readonly finalState: Extract<PaperExecutionLifecycleState, 'COMPLETED' | 'REJECTED' | 'SKIPPED'>;
}

export function createCompletedPaperLifecycle(): PaperExecutionLifecycle {
  return Object.freeze({
    initialState: 'ACCEPTED' as const,
    processedState: 'PROCESSED' as const,
    finalState: 'COMPLETED' as const,
  });
}

export function createRejectedPaperLifecycle(): PaperExecutionLifecycle {
  return Object.freeze({
    initialState: 'REJECTED' as const,
    finalState: 'REJECTED' as const,
  });
}

export function createSkippedPaperLifecycle(): PaperExecutionLifecycle {
  return Object.freeze({
    initialState: 'SKIPPED' as const,
    finalState: 'SKIPPED' as const,
  });
}

