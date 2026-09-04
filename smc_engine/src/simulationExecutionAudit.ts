export interface SimulationExecutionAudit {
  readonly inputCommands: number;
  readonly inputEngineWarnings: number;
  readonly generatedSimulationItems: number;
  readonly attachedScenarios: number;
  readonly simulatedItems: number;
  readonly rejectedItems: number;
  readonly skippedItems: number;
  readonly marketDataUsed: 0;
  readonly realExecutions: 0;
  readonly ordersCreated: 0;
  readonly tradesCreated: 0;
  readonly positionsCreated: 0;
  readonly pnlCalculations: 0;
  readonly riskCalculations: 0;
}

