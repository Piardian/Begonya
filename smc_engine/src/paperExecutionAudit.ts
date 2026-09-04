export interface PaperExecutionAudit {
  readonly inputCommands: number;
  readonly inputEngineWarnings: number;
  readonly generatedPaperItems: number;
  readonly completedItems: number;
  readonly rejectedItems: number;
  readonly skippedItems: number;
  readonly realExecutions: 0;
  readonly ordersCreated: 0;
  readonly positionsCreated: 0;
  readonly pnlCalculations: 0;
}

