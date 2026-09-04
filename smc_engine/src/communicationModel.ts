export const COMMUNICATION_MODEL_VERSION = 'CommunicationMessage.v1' as const;

export type CommunicationMode = 'Compact' | 'Balanced' | 'Detailed';
export type CommunicationChannel = 'Telegram';

export interface CommunicationSection {
  readonly title: string;
  readonly lines: readonly string[];
}

export interface CommunicationMessageQualityValidation {
  readonly messageLength: number;
  readonly lineCount: number;
  readonly readabilityScore: number;
  readonly informationDensity: number;
  readonly duplicateContent: boolean;
  readonly missingFields: readonly string[];
  readonly consistencyScore: number;
  readonly warnings: readonly string[];
}

export interface CommunicationDecisionLog {
  readonly appliedMode: CommunicationMode;
  readonly narrativeEnabled: boolean;
  readonly riskSummaryIncluded: boolean;
  readonly evidenceIncluded: boolean;
  readonly screenshotPlanned: boolean;
  readonly channel: CommunicationChannel;
  readonly selectedSections: readonly string[];
  readonly skippedSections: readonly string[];
  readonly reasons: readonly string[];
}

export interface CommunicationExplainabilityBlock {
  readonly summary: string;
  readonly supportedBy: readonly string[];
  readonly weakenedBy: readonly string[];
}

export interface CommunicationMessage {
  readonly version: typeof COMMUNICATION_MODEL_VERSION;
  readonly channel: CommunicationChannel;
  readonly mode: CommunicationMode;
  readonly signalId: string;
  readonly pair: string;
  readonly direction: 'BUY' | 'SELL';
  readonly timestamp: number;
  readonly trTimestamp: string;
  readonly sections: readonly CommunicationSection[];
  readonly explanation?: CommunicationExplainabilityBlock;
  readonly quality: CommunicationMessageQualityValidation;
  readonly decisionLog: CommunicationDecisionLog;
}

export interface CommunicationBundle {
  readonly message: CommunicationMessage;
  readonly renderedText: string;
}
