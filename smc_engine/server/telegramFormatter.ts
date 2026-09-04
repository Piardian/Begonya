import { NotificationCandidate } from './pipeline';
import { OrderBlock, FVG } from '../src/types';
import { buildCommunicationLayer, renderCommunicationMessage } from './communicationLayer';
import { recordRuntimeTrace } from './runtimeTrace';

export type ExecutionCardStatus = 'READY' | 'WAITING' | 'BLOCKED' | 'CANCELLED';
export type ChecklistStatus = 'PASS' | 'FAIL' | 'WAITING' | 'NOT_REQUIRED';

export interface ExecutionChecklistItem {
  readonly label: string;
  readonly status: ChecklistStatus;
}

export interface ExecutionCardView {
  readonly decision: string;
  readonly executionStatus: ExecutionCardStatus;
  readonly executionReady: boolean;
  readonly tradableNow: boolean;
  readonly reason: string;
  readonly requiredAction: string;
  readonly requiredConfirmation: string;
  readonly checklist: readonly ExecutionChecklistItem[];
  readonly profile: string;
  readonly riskStatus: string;
  readonly lifecycle: readonly string[];
  readonly version?: string;
  readonly timestamp?: number;
}

export function formatTR(timestamp: number): string {
  const trDate = new Date(timestamp + 3 * 60 * 60 * 1000);
  return trDate.toISOString().replace('T', ' ').substring(0, 19) + ' TR';
}

export function formatNotificationMessage(
  candidate: NotificationCandidate,
  executionView: ExecutionCardView = buildDefaultExecutionView(candidate)
): string {
  const signalId = candidate.signalId ?? candidate.uniqueKey;
  const bundle = buildCommunicationLayer({ candidate, executionView });
  const rendered = renderCommunicationMessage(bundle.message);
  recordRuntimeTrace({
    signalId,
    file: 'server/telegramFormatter.ts',
    functionName: 'formatNotificationMessage',
    timestamp: new Date().toISOString(),
    input: {
      executionStatus: executionView.executionStatus,
      requiredAction: executionView.requiredAction,
      mode: bundle.message.mode,
    },
    output: {
      messageLength: rendered.length,
      sectionCount: bundle.message.sections.length,
      renderedPreview: rendered.slice(0, 240),
    },
  });
  return rendered;
}

export function buildDefaultExecutionView(candidate: NotificationCandidate): ExecutionCardView {
  const signal = extractCandidateDisplay(candidate);
  const inZone = candidate.currentPrice >= signal.zoneLow && candidate.currentPrice <= signal.zoneHigh;
  return Object.freeze({
    decision: candidate.gradeResult.entryAllowed ? 'GRADE_ALLOWED' : 'GRADE_BLOCKED',
    executionStatus: candidate.gradeResult.entryAllowed ? 'WAITING' : 'BLOCKED',
    executionReady: false,
    tradableNow: false,
    reason: candidate.gradeResult.entryAllowed
      ? (inZone
          ? 'Fiyat giriş bölgesinde; 1 dakikalık LTF onay mumu bekleniyor.'
          : 'Fiyat giriş bölgesinin dışında; bölgeye geri dönmeden (retest) işlem yapılmaz.')
      : (candidate.gradeResult.blockReasons[0] ?? 'Grade seviyesindeki bildirim politikası bu sinyali engelledi.'),
    requiredAction: inZone
      ? `${signal.actionText} - Fiyat giriş bölgesinde; 1 dakikalık manuel onay bekle`
      : 'Giriş bölgesine geri çekilmeyi (retest) bekle. Bölgeye dönmeden kesinlikle işlem yok.',
    requiredConfirmation: inZone
      ? 'Fiyat bölgede. 1 dakikalık LTF onay mumu gerekli (manuel onay / otomatik değil)'
      : 'Fiyat giriş bölgesinde değil. Önce bölgeye retest, ardından 1 dakikalık manuel onay.',
    checklist: Object.freeze([
      { label: 'HTF Uyumu', status: scoreToChecklist(candidate.gradeResult.breakdown.htfBiasPD) },
      { label: 'Yapı', status: scoreToChecklist(candidate.gradeResult.breakdown.structure) },
      { label: 'Sweep', status: scoreToChecklist(candidate.gradeResult.breakdown.sweep) },
      { label: 'Aktif POI', status: 'PASS' as const },
      { label: 'Pahalı / Ucuz', status: candidate.pd4H === 'eq' ? 'FAIL' as const : 'PASS' as const },
      { label: 'Uygunluk', status: candidate.gradeResult.entryAllowed ? 'WAITING' as const : 'FAIL' as const },
      { label: 'Geri çekilme', status: 'WAITING' as const },
      { label: 'Risk onayı', status: 'WAITING' as const },
    ]),
    profile: candidate.admissionProfile ?? 'PRODUCTION',
    riskStatus: 'NOT_EVALUATED',
    lifecycle: candidate.signalContext?.lifecycle.states ?? ['DETECTED', 'GRADED'],
    version: undefined,
    timestamp: candidate.signalContext?.timestamp ?? candidate.poi.relatedEvent.breakTimestamp,
  });
}

import { formatPrice, calculateDistance } from '../src/assetMetrics';

export function extractCandidateDisplay(candidate: NotificationCandidate) {
  const { poiType, poi, tradeDirection, currentPrice } = candidate;
  const signalId = candidate.signalId ?? candidate.uniqueKey;
  const actionText = tradeDirection === 'long' ? 'AL' : 'SAT';
  const typeText = poiType === 'OB' ? 'OB' : 'FVG';
  const polarText = tradeDirection === 'long' ? 'Yükseliş' : 'Düşüş';
  const zoneHigh = poiType === 'OB' ? (poi as OrderBlock).high : (poi as FVG).gapHigh;
  const zoneLow = poiType === 'OB' ? (poi as OrderBlock).low : (poi as FVG).gapLow;
  const distInfo = calculateDistance(candidate.symbol, currentPrice, zoneLow, zoneHigh);
  const priceInZone = distInfo.isInZone;
  const requiredAction = priceInZone
    ? `${actionText} - Fiyat giriş bölgesinde; 1 dakikalık manuel onay bekle`
    : 'Giriş bölgesine geri çekilmeyi (retest) bekle. Bölgeye dönmeden kesinlikle işlem yok.';
  const requiredConfirmation = priceInZone
    ? 'Fiyat bölgede. 1 dakikalık LTF onay mumu gerekli (manuel onay / otomatik değil)'
    : 'Fiyat giriş bölgesinde değil. Önce bölgeye retest, ardından 1 dakikalık manuel onay.';

  return Object.freeze({
    signalId,
    actionText,
    typeText,
    polarText,
    zoneHigh,
    zoneLow,
    entryZoneText: `${formatPrice(zoneLow, candidate.symbol)} - ${formatPrice(zoneHigh, candidate.symbol)}`,
    stopLossText: tradeDirection === 'long'
      ? `Altı ${formatPrice(zoneLow, candidate.symbol)} - manuel onay`
      : `Üstü ${formatPrice(zoneHigh, candidate.symbol)} - manuel onay`,
    currentPriceText: formatPrice(currentPrice, candidate.symbol),
    distanceText: distInfo.displayText,
    requiredAction,
    requiredConfirmation,
  });
}

function scoreToChecklist(score: number): ChecklistStatus {
  if (score >= 1) return 'PASS';
  if (score === 0) return 'WAITING';
  return 'FAIL';
}
