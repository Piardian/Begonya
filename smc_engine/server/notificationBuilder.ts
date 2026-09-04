import { NotificationCandidate } from './pipeline';
import {
  ChecklistStatus,
  ExecutionCardStatus,
  ExecutionCardView,
  ExecutionChecklistItem,
  extractCandidateDisplay,
  formatNotificationMessage,
} from './telegramFormatter';
import { RuntimeExecutionPipelineResult } from './runtimeExecutionPipeline';
import { recordRuntimeTrace } from './runtimeTrace';

export function buildRuntimeNotificationMessage(
  candidate: NotificationCandidate,
  execution: RuntimeExecutionPipelineResult
): string {
  const signalId = candidate.signalId ?? candidate.uniqueKey;
  const executionView = buildExecutionCardView(candidate, execution);
  recordRuntimeTrace({
    signalId,
    file: 'server/notificationBuilder.ts',
    functionName: 'buildRuntimeNotificationMessage',
    timestamp: new Date().toISOString(),
    input: {
      candidateSignalId: signalId,
      executionStatus: executionView.executionStatus,
      decision: executionView.decision,
      requiredAction: executionView.requiredAction,
    },
    output: {
      executionStatus: executionView.executionStatus,
      decision: executionView.decision,
      profile: executionView.profile,
    },
  });
  return formatNotificationMessage(candidate, executionView);
}

export function buildExecutionCardView(
  candidate: NotificationCandidate,
  execution: RuntimeExecutionPipelineResult
): ExecutionCardView {
  const firstDecision = execution.decisionReport.decisions[0];
  const firstRisk = execution.riskResult.items[0];
  const executionReady = execution.engineResult.audit.readyCommands > 0;
  const riskAccepted = firstRisk?.evaluation.executionAllowed === true;
  const executionStatus = resolveExecutionStatus(execution, executionReady, riskAccepted, candidate);
  const signal = extractCandidateDisplay(candidate);

  return Object.freeze({
    decision: firstDecision?.status ?? 'NO_DECISION',
    executionStatus,
    executionReady,
    tradableNow: executionStatus === 'READY',
    reason: reasonForExecution(execution, riskAccepted, candidate),
    requiredAction: requiredActionForStatus(executionStatus, signal.requiredAction, candidate.tradeDirection),
    requiredConfirmation: requiredConfirmationForStatus(executionStatus, signal.requiredConfirmation),
    checklist: buildChecklist(candidate, execution, riskAccepted),
    profile: candidate.admissionProfile ?? 'PRODUCTION',
    riskStatus: firstRisk?.riskStatus ?? 'NO_RISK',
    lifecycle: execution.signalContext.lifecycle.states,
    version: 'Signal Delivery v1.0 / Execution Eligibility Contract v1.0',
    timestamp: execution.signalContext.timestamp,
  });
}

function resolveExecutionStatus(
  execution: RuntimeExecutionPipelineResult,
  executionReady: boolean,
  riskAccepted: boolean,
  candidate?: NotificationCandidate
): ExecutionCardStatus {
  if (candidate?.macroEvaluation && !candidate.macroEvaluation.allowed) return 'BLOCKED';
  if (execution.signalOutcome.outcomeType === 'CANCELLED') return 'CANCELLED';
  if (!riskAccepted) return 'BLOCKED';
  if (!executionReady) return 'WAITING';
  if (execution.decisionCalibration.status === 'WAIT' || execution.decisionCalibration.status === 'LOW_CONFIDENCE') {
    return 'WAITING';
  }
  if (execution.decisionCalibration.status === 'FILTERED' || execution.decisionCalibration.status === 'NOT_ELIGIBLE') {
    return 'BLOCKED';
  }
  return 'READY';
}

function reasonForExecution(
  execution: RuntimeExecutionPipelineResult,
  riskAccepted: boolean,
  candidate?: NotificationCandidate
): string {
  if (candidate?.macroEvaluation && !candidate.macroEvaluation.allowed) {
    return candidate.macroEvaluation.gateStatusMessage;
  }
  if (!riskAccepted) {
    return execution.riskResult.items[0]?.evaluation.reason.message ?? execution.decisionCalibration.reason.message;
  }
  if (execution.decisionCalibration.status !== 'ELIGIBLE') {
    return execution.decisionCalibration.reason.message;
  }
  return 'Execution eligibility and policy-level risk gates passed. Manual execution confirmation is still required.';
}

function requiredActionForStatus(
  status: ExecutionCardStatus,
  candidateAction: string,
  direction: NotificationCandidate['tradeDirection']
): string {
  if (status === 'BLOCKED') return 'DO NOT EXECUTE';
  if (status === 'CANCELLED') return 'DO NOT EXECUTE - SIGNAL CANCELLED';
  if (status === 'WAITING') return candidateAction;
  return direction === 'long' ? 'BUY AFTER MANUAL CONFIRMATION' : 'SELL AFTER MANUAL CONFIRMATION';
}

function requiredConfirmationForStatus(status: ExecutionCardStatus, candidateConfirmation: string): string {
  if (status === 'BLOCKED') return 'NOT APPLICABLE - signal blocked';
  if (status === 'CANCELLED') return 'NOT APPLICABLE - signal cancelled';
  return candidateConfirmation;
}

function resolveMacroStatus(candidate: NotificationCandidate): ChecklistStatus {
  const gate = candidate.macroEvaluation;
  if (!gate) return 'PASS';
  if (!gate.allowed) return 'FAIL';
  if (gate.action === 'NEUTRAL_CAUTION') return 'WAITING';
  return 'PASS';
}

function buildChecklist(
  candidate: NotificationCandidate,
  execution: RuntimeExecutionPipelineResult,
  riskAccepted: boolean
): readonly ExecutionChecklistItem[] {
  const calibrationByCode = new Map(execution.decisionCalibration.checks.map(check => [check.code, check.status]));

  return Object.freeze([
    item('Makro Rejim Kapısı', resolveMacroStatus(candidate)),
    item('HTF Bias', mergeStatuses(
      fromCalibration(calibrationByCode.get('HTF_BIAS_PD_SCORE')),
      fromCalibration(calibrationByCode.get('HTF_TREND_ALIGNMENT'))
    )),
    item('Structure', fromCalibration(calibrationByCode.get('STRUCTURE_STRENGTH'))),
    item('Sweep', fromCalibration(calibrationByCode.get('SWEEP_QUALITY'))),
    item('Active POI', candidate.poi ? 'PASS' : 'FAIL'),
    item('Premium / Discount', mergeStatuses(
      fromCalibration(calibrationByCode.get('4H_PD_ALIGNMENT')),
      fromCalibration(calibrationByCode.get('1H_PD_ALIGNMENT'))
    )),
    item('Eligibility', execution.decisionCalibration.status === 'ELIGIBLE' ? 'PASS' : statusFromDecision(execution.decisionCalibration.status)),
    item('Retest', candidate.poiTestCount >= 3 ? 'FAIL' : candidate.poiTestCount >= 2 ? 'WAITING' : 'WAITING'),
    item('Risk Accepted', riskAccepted ? 'PASS' : 'FAIL'),
    item('Notification Delivered', 'WAITING'),
  ]);
}

function item(label: string, status: ChecklistStatus): ExecutionChecklistItem {
  return Object.freeze({ label, status });
}

function fromCalibration(status: 'PASS' | 'WARN' | 'FAIL' | undefined): ChecklistStatus {
  if (status === 'PASS') return 'PASS';
  if (status === 'WARN') return 'WAITING';
  if (status === 'FAIL') return 'FAIL';
  return 'NOT_REQUIRED';
}

function statusFromDecision(status: RuntimeExecutionPipelineResult['decisionCalibration']['status']): ChecklistStatus {
  if (status === 'ELIGIBLE') return 'PASS';
  if (status === 'WAIT' || status === 'LOW_CONFIDENCE') return 'WAITING';
  return 'FAIL';
}

function mergeStatuses(left: ChecklistStatus, right: ChecklistStatus): ChecklistStatus {
  if (left === 'FAIL' || right === 'FAIL') return 'FAIL';
  if (left === 'WAITING' || right === 'WAITING') return 'WAITING';
  if (left === 'PASS' || right === 'PASS') return 'PASS';
  return 'NOT_REQUIRED';
}
