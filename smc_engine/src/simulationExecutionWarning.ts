export type SimulationExecutionWarningType =
  | 'NO_EXECUTION_COMMANDS'
  | 'ENGINE_WARNINGS_PRESENT'
  | 'NON_READY_COMMAND_REJECTED'
  | 'MAXIMUM_SIMULATION_ITEMS_EXCEEDED'
  | 'REAL_EXECUTION_DISABLED'
  | 'NON_SIMULATION_ENGINE_MODE'
  | 'MARKET_DATA_NOT_AVAILABLE_BY_DESIGN';

export interface SimulationExecutionWarning {
  readonly type: SimulationExecutionWarningType;
  readonly severity: 'INFO' | 'WARNING' | 'ERROR';
  readonly message: string;
}

export function createSimulationExecutionWarning(
  type: SimulationExecutionWarningType,
  severity: SimulationExecutionWarning['severity'],
  message: string
): SimulationExecutionWarning {
  return Object.freeze({ type, severity, message });
}

