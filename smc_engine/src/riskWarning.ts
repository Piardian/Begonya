export type RiskWarningType =
  | 'NO_SIMULATION_ITEMS'
  | 'SIMULATION_WARNINGS_PRESENT'
  | 'NON_SIMULATED_ITEM_REJECTED'
  | 'MAXIMUM_RISK_ITEMS_EXCEEDED'
  | 'EXECUTION_DISABLED'
  | 'POLICY_LEVEL_RISK_ONLY';

export interface RiskWarning {
  readonly type: RiskWarningType;
  readonly severity: 'INFO' | 'WARNING' | 'ERROR';
  readonly message: string;
}

export function createRiskWarning(
  type: RiskWarningType,
  severity: RiskWarning['severity'],
  message: string
): RiskWarning {
  return Object.freeze({ type, severity, message });
}

