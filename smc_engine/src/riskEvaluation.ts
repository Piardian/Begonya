import { SimulationExecutionItem } from './simulationExecutionItem';
import { RiskPolicy } from './riskPolicy';

export const RISK_EVALUATION_VERSION = 1 as const;

export type RiskEvaluationStatus = 'ACCEPTED' | 'REJECTED' | 'SKIPPED';

export interface RiskCheck {
  readonly code: string;
  readonly status: 'PASS' | 'FAIL' | 'SKIP';
  readonly severity: 'INFO' | 'WARNING' | 'ERROR';
  readonly message: string;
}

export interface RiskEvaluation {
  readonly id: string;
  readonly version: typeof RISK_EVALUATION_VERSION;
  readonly evaluationStatus: RiskEvaluationStatus;
  readonly executionAllowed: boolean;
  readonly simulationAccepted: boolean;
  readonly policyViolation: boolean;
  readonly reason: {
    readonly code: string;
    readonly message: string;
  };
  readonly checks: readonly RiskCheck[];
  readonly audit: {
    readonly lotCalculated: false;
    readonly marginCalculated: false;
    readonly pnlCalculated: false;
    readonly orderCreated: false;
    readonly positionCreated: false;
    readonly realExecution: false;
  };
}

export function createRiskEvaluation(input: {
  readonly item: SimulationExecutionItem;
  readonly policy: RiskPolicy;
  readonly riskPolicyId: string;
}): RiskEvaluation {
  const checks = createRiskChecks(input.item);
  const evaluationStatus = resolveEvaluationStatus(input.item, checks);
  const policyViolation = checks.some(check => check.status === 'FAIL');

  return Object.freeze({
    id: `risk-evaluation:${input.riskPolicyId}:${input.item.id}`,
    version: RISK_EVALUATION_VERSION,
    evaluationStatus,
    executionAllowed: evaluationStatus === 'ACCEPTED',
    simulationAccepted: input.item.simulationStatus === 'SIMULATED',
    policyViolation,
    reason: Object.freeze(reasonForStatus(evaluationStatus)),
    checks: Object.freeze(checks),
    audit: Object.freeze({
      lotCalculated: false as const,
      marginCalculated: false as const,
      pnlCalculated: false as const,
      orderCreated: false as const,
      positionCreated: false as const,
      realExecution: false as const,
    }),
  });
}

function createRiskChecks(item: SimulationExecutionItem): RiskCheck[] {
  return [
    check('SIMULATION_STATUS_SIMULATED', item.simulationStatus === 'SIMULATED', 'Simulation item must be SIMULATED.'),
    check('SCENARIO_ATTACHED', item.audit.scenarioAttached === true, 'Simulation item must carry exactly one scenario.'),
    check('NO_MARKET_DATA_USED', item.audit.marketDataUsed === false && item.scenario.audit.marketDataUsed === false, 'Risk Engine requires no market data usage in Sprint 14.'),
    check('NO_REAL_EXECUTION', item.audit.realExecution === false && item.scenario.audit.realExecution === false, 'Risk Engine requires no real execution.'),
    check('NO_ORDER_CREATED', item.audit.orderCreated === false && item.scenario.audit.orderCreated === false, 'Risk Engine requires no order creation.'),
    check('NO_TRADE_CREATED', item.audit.tradeCreated === false && item.scenario.audit.tradeCreated === false, 'Risk Engine requires no trade creation.'),
    check('NO_POSITION_CREATED', item.audit.positionCreated === false && item.scenario.audit.positionCreated === false, 'Risk Engine requires no position creation.'),
    check('NO_PNL_CALCULATED', item.audit.pnlCalculated === false && item.scenario.audit.pnlCalculated === false, 'Risk Engine requires no PnL calculation.'),
    check('NO_RISK_CALCULATED', item.audit.riskCalculated === false && item.scenario.audit.riskCalculated === false, 'Sprint 14 must not calculate financial risk.'),
  ];
}

function check(code: string, passed: boolean, message: string): RiskCheck {
  return Object.freeze({
    code,
    status: passed ? 'PASS' as const : 'FAIL' as const,
    severity: passed ? 'INFO' as const : 'ERROR' as const,
    message,
  });
}

function resolveEvaluationStatus(
  item: SimulationExecutionItem,
  checks: readonly RiskCheck[]
): RiskEvaluationStatus {
  if (item.simulationStatus === 'SKIPPED') return 'SKIPPED';
  if (checks.some(check => check.status === 'FAIL')) return 'REJECTED';
  return 'ACCEPTED';
}

function reasonForStatus(status: RiskEvaluationStatus): RiskEvaluation['reason'] {
  if (status === 'ACCEPTED') {
    return {
      code: 'POLICY_LEVEL_RISK_ACCEPTED',
      message: 'Policy-level risk gate passed. This does not allow broker execution or order creation.',
    };
  }
  if (status === 'SKIPPED') {
    return {
      code: 'POLICY_LEVEL_RISK_SKIPPED',
      message: 'Risk evaluation was skipped because the simulation item was skipped.',
    };
  }
  return {
    code: 'POLICY_LEVEL_RISK_REJECTED',
    message: 'Policy-level risk gate rejected the simulation item.',
  };
}

