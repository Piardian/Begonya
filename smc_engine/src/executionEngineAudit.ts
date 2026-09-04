export interface ExecutionEngineAudit {
  readonly inputSessionItems: number;
  readonly inputSessionWarnings: number;
  readonly generatedCommands: number;
  readonly readyCommands: number;
  readonly blockedCommands: number;
  readonly skippedCommands: number;
}

