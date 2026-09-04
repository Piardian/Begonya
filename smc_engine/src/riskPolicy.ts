export const RISK_POLICY_VERSION = 1 as const;

export type RiskPolicyMode = 'SIMULATION_RISK';
export type RiskType = 'POLICY_LEVEL_RISK';

export interface RiskPolicy {
  readonly version: typeof RISK_POLICY_VERSION;
  readonly riskPolicyId: string;
  readonly mode: RiskPolicyMode;
  readonly riskType: RiskType;
  readonly allowRiskEvaluation: true;
  readonly allowExecution: false;
  readonly maximumRiskItems: number;
  readonly rules: {
    readonly requireSimulatedStatus: true;
    readonly rejectSkipped: true;
    readonly rejectRejected: true;
    readonly requireScenarioAttached: true;
    readonly requireNoMarketData: true;
    readonly requireNoRealExecution: true;
    readonly requireNoOrder: true;
    readonly requireNoTrade: true;
    readonly requireNoPosition: true;
    readonly requireNoPnl: true;
    readonly requireNoRiskCalculation: true;
  };
}

export type CreateRiskPolicyInput = Omit<
  RiskPolicy,
  'version' | 'mode' | 'riskType' | 'allowRiskEvaluation' | 'allowExecution' | 'rules'
> & {
  readonly version?: typeof RISK_POLICY_VERSION;
  readonly mode?: RiskPolicyMode;
  readonly riskType?: RiskType;
  readonly allowRiskEvaluation?: true;
  readonly allowExecution?: false;
  readonly rules?: Partial<RiskPolicy['rules']>;
};

export function createRiskPolicy(input: CreateRiskPolicyInput): RiskPolicy {
  return Object.freeze({
    riskPolicyId: input.riskPolicyId,
    version: input.version ?? RISK_POLICY_VERSION,
    mode: 'SIMULATION_RISK' as const,
    riskType: 'POLICY_LEVEL_RISK' as const,
    allowRiskEvaluation: true as const,
    allowExecution: false as const,
    maximumRiskItems: input.maximumRiskItems,
    rules: Object.freeze({
      requireSimulatedStatus: true as const,
      rejectSkipped: true as const,
      rejectRejected: true as const,
      requireScenarioAttached: true as const,
      requireNoMarketData: true as const,
      requireNoRealExecution: true as const,
      requireNoOrder: true as const,
      requireNoTrade: true as const,
      requireNoPosition: true as const,
      requireNoPnl: true as const,
      requireNoRiskCalculation: true as const,
      ...input.rules,
    }),
  });
}

