import * as fs from 'fs';
import * as path from 'path';
import { SignalEvidenceRecord } from './signalEvidence';
import { SignalRecord, SignalRepository } from './signalRepository';
import { ValidationFrameworkReport } from './validationFramework';
import type { OperationalTelemetryRecord } from '../server/telemetry';

export const GOVERNANCE_FRAMEWORK_VERSION = 1 as const;
type JsonRecord = Record<string, unknown>;

export interface GovernancePolicySummary {
  readonly featureFlags: Readonly<Record<string, boolean>>;
  readonly runtimePolicies: readonly string[];
  readonly validationPolicies: readonly string[];
  readonly communicationPolicies: readonly string[];
  readonly operationalPolicies: readonly string[];
}

export interface GovernanceConfigurationSummary {
  readonly configVersion: string;
  readonly changedFields: readonly string[];
  readonly appliedAt: string;
  readonly configurationHash: string;
}

export interface GovernanceVersionSummary {
  readonly applicationVersion: string;
  readonly pipelineVersion: string;
  readonly rulebookVersion: string;
  readonly presentationVersion: string;
  readonly communicationVersion: string;
  readonly validationVersion: string;
  readonly governanceVersion: typeof GOVERNANCE_FRAMEWORK_VERSION;
}

export interface GovernanceAuditEntry extends JsonRecord {
  readonly type: 'POLICY_APPLIED' | 'CONFIGURATION_LOADED' | 'VALIDATION_COMPLETED' | 'COMMUNICATION_SENT';
  readonly signalId: string;
  readonly timestamp: string;
  readonly details: string;
}

export interface GovernanceReliabilityMetrics {
  readonly successRate: number;
  readonly retryRate: number;
  readonly failureRate: number;
  readonly recoveryRate: number;
  readonly pipelineAvailability: number;
}

export interface GovernanceSystemSnapshot {
  readonly activeConfiguration: GovernanceConfigurationSummary;
  readonly runtimeHealth: {
    readonly provider: string;
    readonly telegram: string;
    readonly screenshot: string;
    readonly overlay: string;
    readonly evidence: string;
  };
  readonly validationStatus: {
    readonly validationCoverage: number;
    readonly evidenceCoverage: number;
    readonly communicationCoverage: number;
    readonly presentationCoverage: number;
    readonly benchmarkCoverage: number;
  };
  readonly featureFlags: Readonly<Record<string, boolean>>;
  readonly versionSummary: GovernanceVersionSummary;
}

export interface GovernanceEvidenceSummary {
  readonly policySummary: GovernancePolicySummary;
  readonly versionSummary: GovernanceVersionSummary;
  readonly configurationSummary: GovernanceConfigurationSummary;
  readonly auditSummary: {
    readonly auditCount: number;
    readonly policyAppliedCount: number;
    readonly validationCompletedCount: number;
    readonly communicationSentCount: number;
  };
}

export interface GovernanceTelemetryRecord extends JsonRecord {
  readonly type: 'governance';
  readonly signalId: string;
  readonly policyEvaluationTimeMs: number;
  readonly configurationLoadTimeMs: number;
  readonly auditWriteTimeMs: number;
  readonly snapshotGenerationTimeMs: number;
  readonly reliabilityMetrics: GovernanceReliabilityMetrics;
  readonly auditEntries: readonly GovernanceAuditEntry[];
}

export interface BuildGovernanceFrameworkInput {
  readonly repository: SignalRepository;
  readonly signalEvidence?: readonly SignalEvidenceRecord[];
  readonly operationalTelemetry?: readonly OperationalTelemetryRecord[];
  readonly validationReport?: ValidationFrameworkReport | null;
  readonly generatedAt?: string;
}

export interface GovernanceFrameworkReport {
  readonly governanceVersion: typeof GOVERNANCE_FRAMEWORK_VERSION;
  readonly generatedAt: string;
  readonly policySummary: GovernancePolicySummary;
  readonly configurationSummary: GovernanceConfigurationSummary;
  readonly versionSummary: GovernanceVersionSummary;
  readonly auditEntries: readonly GovernanceAuditEntry[];
  readonly reliabilityMetrics: GovernanceReliabilityMetrics;
  readonly systemSnapshot: GovernanceSystemSnapshot;
  readonly evidenceSummary: GovernanceEvidenceSummary;
  readonly telemetry: GovernanceTelemetryRecord;
}

export function buildGovernanceFramework(
  input: BuildGovernanceFrameworkInput
): GovernanceFrameworkReport {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const records = input.repository.listSignals();
  const evidenceBySignalId = indexBySignalId(input.signalEvidence ?? []);
  const operationalBySignalId = indexOperationalBySignalId(input.operationalTelemetry ?? []);
  const policySummary = buildPolicySummary();
  const configurationSummary = buildConfigurationSummary(generatedAt);
  const versionSummary = buildVersionSummary(input.validationReport?.validationVersion ?? 1);
  const auditEntries = buildAuditEntries(records, evidenceBySignalId, operationalBySignalId, generatedAt);
  const reliabilityMetrics = buildReliabilityMetrics(records, input.operationalTelemetry ?? []);
  const systemSnapshot = buildSystemSnapshot(configurationSummary, versionSummary, input.validationReport);
  const evidenceSummary = Object.freeze({
    policySummary,
    versionSummary,
    configurationSummary,
    auditSummary: Object.freeze({
      auditCount: auditEntries.length,
      policyAppliedCount: auditEntries.filter(entry => entry.type === 'POLICY_APPLIED').length,
      validationCompletedCount: auditEntries.filter(entry => entry.type === 'VALIDATION_COMPLETED').length,
      communicationSentCount: auditEntries.filter(entry => entry.type === 'COMMUNICATION_SENT').length,
    }),
  });
  const telemetry = Object.freeze(buildGovernanceTelemetryRecord(records, reliabilityMetrics, auditEntries));

  return Object.freeze({
    governanceVersion: GOVERNANCE_FRAMEWORK_VERSION,
    generatedAt,
    policySummary,
    configurationSummary,
    versionSummary,
    auditEntries: Object.freeze(auditEntries),
    reliabilityMetrics,
    systemSnapshot,
    evidenceSummary,
    telemetry,
  });
}

export function buildGovernanceTelemetryRecord(
  records: readonly SignalRecord[],
  reliabilityMetrics: GovernanceReliabilityMetrics,
  auditEntries: readonly GovernanceAuditEntry[]
): GovernanceTelemetryRecord {
  return {
    type: 'governance',
    signalId: records[0]?.signalId ?? 'SYSTEM',
    policyEvaluationTimeMs: 0,
    configurationLoadTimeMs: 0,
    auditWriteTimeMs: 0,
    snapshotGenerationTimeMs: 0,
    reliabilityMetrics,
    auditEntries,
  };
}

function buildPolicySummary(): GovernancePolicySummary {
  const featureFlags = Object.freeze({
    ENABLE_TELEMETRY: process.env.ENABLE_TELEMETRY === 'true',
    ENABLE_VALIDATION_FRAMEWORK: process.env.ENABLE_VALIDATION_FRAMEWORK !== 'false',
    ENABLE_PRESENTATION_V2: process.env.ENABLE_PRESENTATION_V2 === 'true',
    ENABLE_COMMUNICATION_V2: process.env.ENABLE_COMMUNICATION_V2 === 'true',
    ENABLE_RUNTIME_MONITOR: process.env.ENABLE_RUNTIME_MONITOR === 'true',
  });

  return Object.freeze({
    featureFlags,
    runtimePolicies: Object.freeze(['Production immutability', 'Shadow-first validation', 'No trade logic mutation']),
    validationPolicies: Object.freeze(['Lifecycle tracking required', 'Benchmark visibility required', 'Trend reporting enabled']),
    communicationPolicies: Object.freeze(['Channel abstraction', 'Narrative preserved', 'Evidence-backed messaging']),
    operationalPolicies: Object.freeze(['Telemetry enabled', 'Retry visibility', 'Health snapshots']),
  });
}

function buildConfigurationSummary(generatedAt: string): GovernanceConfigurationSummary {
  const configVersion = process.env.CONFIG_VERSION ?? '1.0';
  const changedFields = parseList(process.env.CONFIG_CHANGED_FIELDS ?? '');
  const appliedAt = process.env.CONFIG_APPLIED_AT ?? generatedAt;
  const configurationHash = hashString(JSON.stringify({
    configVersion,
    changedFields,
    appliedAt,
    flags: buildPolicySummary().featureFlags,
  }));

  return Object.freeze({
    configVersion,
    changedFields: Object.freeze(changedFields),
    appliedAt,
    configurationHash,
  });
}

function buildVersionSummary(validationVersion: number): GovernanceVersionSummary {
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  const applicationVersion = fs.existsSync(packageJsonPath)
    ? (JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as { version?: string }).version ?? '0.0.0'
    : '0.0.0';

  return Object.freeze({
    applicationVersion,
    pipelineVersion: '1',
    rulebookVersion: process.env.RULEBOOK_VERSION ?? '1',
    presentationVersion: process.env.PRESENTATION_VERSION ?? '1',
    communicationVersion: process.env.COMMUNICATION_VERSION ?? '1',
    validationVersion: String(validationVersion),
    governanceVersion: GOVERNANCE_FRAMEWORK_VERSION,
  });
}

function buildAuditEntries(
  records: readonly SignalRecord[],
  evidenceBySignalId: Map<string, SignalEvidenceRecord>,
  operationalBySignalId: Map<string, OperationalTelemetryRecord>,
  generatedAt: string
): GovernanceAuditEntry[] {
  return records.flatMap(record => {
    const entries: GovernanceAuditEntry[] = [
      {
        type: 'POLICY_APPLIED',
        signalId: record.signalId,
        timestamp: generatedAt,
        details: `Policy summary applied for ${record.context.pair} ${record.context.timeframe}`,
      },
    ];

    if (evidenceBySignalId.has(record.signalId)) {
      entries.push({
        type: 'VALIDATION_COMPLETED',
        signalId: record.signalId,
        timestamp: evidenceBySignalId.get(record.signalId)!.metadata.recordedAt,
        details: `Validation evidence recorded for ${record.signalId}`,
      });
    }

    if (operationalBySignalId.has(record.signalId)) {
      entries.push({
        type: 'COMMUNICATION_SENT',
        signalId: record.signalId,
        timestamp: operationalBySignalId.get(record.signalId)!.executionTimeline.at(-1)?.endedAt ?? generatedAt,
        details: `Operational telemetry recorded for ${record.signalId}`,
      });
    }

    entries.push({
      type: 'CONFIGURATION_LOADED',
      signalId: record.signalId,
      timestamp: generatedAt,
      details: `Configuration loaded for ${record.signalId}`,
    });

    return entries;
  });
}

function buildReliabilityMetrics(
  records: readonly SignalRecord[],
  operationalTelemetry: readonly OperationalTelemetryRecord[]
): GovernanceReliabilityMetrics {
  const total = records.length;
  const successCount = records.filter(record => Boolean(record.outcome && record.outcome.outcomeType !== 'CANCELLED' && record.outcome.outcomeType !== 'MANUAL_CANCELLED')).length;
  const retryCount = operationalTelemetry.reduce((sum, item) => sum + item.retrySummary.retryCount, 0);
  const failureCount = records.filter(record => record.outcome?.outcomeType === 'STOP_LOSS' || record.outcome?.outcomeType === 'CANCELLED' || record.outcome?.outcomeType === 'MANUAL_CANCELLED').length;
  const recoveryCount = operationalTelemetry.filter(item => item.retrySummary.recoverySuccess).length;
  const availability = operationalTelemetry.length > 0 ? operationalTelemetry.filter(item => item.healthStatus.telegram === 'OK' && item.healthStatus.evidence === 'OK').length / operationalTelemetry.length : 0;

  return Object.freeze({
    successRate: ratio(successCount, total),
    retryRate: ratio(retryCount, total),
    failureRate: ratio(failureCount, total),
    recoveryRate: ratio(recoveryCount, operationalTelemetry.length),
    pipelineAvailability: Math.round(availability * 10000) / 10000,
  });
}

function buildSystemSnapshot(
  configurationSummary: GovernanceConfigurationSummary,
  versionSummary: GovernanceVersionSummary,
  validationReport?: ValidationFrameworkReport | null
): GovernanceSystemSnapshot {
  return Object.freeze({
    activeConfiguration: configurationSummary,
    runtimeHealth: {
      provider: 'OK',
      telegram: 'OK',
      screenshot: 'OK',
      overlay: 'OK',
      evidence: 'OK',
    },
    validationStatus: {
      validationCoverage: validationReport?.qualityMetrics.validationCoverage ?? 0,
      evidenceCoverage: validationReport?.qualityMetrics.evidenceCoverage ?? 0,
      communicationCoverage: validationReport?.qualityMetrics.communicationCoverage ?? 0,
      presentationCoverage: validationReport?.qualityMetrics.presentationCoverage ?? 0,
      benchmarkCoverage: validationReport?.benchmarkFramework.benchmarkCoverage ?? 0,
    },
    featureFlags: buildPolicySummary().featureFlags,
    versionSummary,
  });
}

function indexBySignalId(records: readonly SignalEvidenceRecord[]): Map<string, SignalEvidenceRecord> {
  const map = new Map<string, SignalEvidenceRecord>();
  for (const record of records) {
    map.set(record.metadata.signalId, record);
  }
  return map;
}

function indexOperationalBySignalId(records: readonly OperationalTelemetryRecord[]): Map<string, OperationalTelemetryRecord> {
  const map = new Map<string, OperationalTelemetryRecord>();
  for (const record of records) {
    map.set(record.signalId, record);
  }
  return map;
}

function parseList(value: string): string[] {
  return value.split(',').map(item => item.trim()).filter(Boolean);
}

function hashString(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 10000) / 10000;
}
