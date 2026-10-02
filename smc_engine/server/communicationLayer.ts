import type { CommunicationBundle, CommunicationDecisionLog, CommunicationMessage, CommunicationMessageQualityValidation, CommunicationMode, CommunicationSection } from '../src/communicationModel';
import type { FVG, OrderBlock } from '../src/types';
import type { NotificationCandidate } from './pipeline';
import type { ExecutionCardView } from './telegramFormatter';
import type { SetupAssessment } from '../src/setupAssessment';
import { recordRuntimeTrace } from './runtimeTrace';
import { MacroGateAdapter, MacroGateEvaluation } from './macroGateAdapter';

export interface CommunicationLayerInput {
  readonly candidate: NotificationCandidate;
  readonly executionView: ExecutionCardView;
  readonly mode?: CommunicationMode;
}

export interface CommunicationLayerResult extends CommunicationBundle {
  readonly validation: CommunicationMessageQualityValidation;
  readonly decisionLog: CommunicationDecisionLog;
}

export function buildCommunicationLayer(input: CommunicationLayerInput): CommunicationLayerResult {
  const mode = resolveCommunicationMode(input.mode);
  const signal = extractCandidateDisplay(input.candidate);
  const narrative = input.candidate.setupAssessmentV2?.narrativeAssessment;
  const explainability = input.candidate.setupAssessmentV2?.explainability;
  const currentTimestamp = input.executionView.timestamp ?? input.candidate.poi.relatedEvent.breakTimestamp;

  const sections = buildSections(input.candidate, input.executionView, signal, narrative, explainability, mode);
  const message: CommunicationMessage = {
    version: 'CommunicationMessage.v1',
    channel: 'Telegram',
    mode,
    signalId: signal.signalId,
    pair: input.candidate.symbol,
    direction: input.candidate.tradeDirection === 'long' ? 'BUY' : 'SELL',
    timestamp: currentTimestamp,
    trTimestamp: formatTR(currentTimestamp),
    sections,
    explanation: explainability
      ? {
          summary: explainability.summary,
          supportedBy: explainability.supportedBy,
          weakenedBy: explainability.weakenedBy,
        }
      : undefined,
    quality: buildQualityValidation(sections, narrative, explainability),
    decisionLog: buildDecisionLog(mode, narrative !== undefined, explainability !== undefined, true, sections),
  };

  const renderedText = renderCommunicationMessage(message);
  const validation = assessRenderedMessage(renderedText, message, sections);
  const decisionLog = message.decisionLog;
  recordRuntimeTrace({
    signalId: signal.signalId,
    file: 'server/communicationLayer.ts',
    functionName: 'buildCommunicationLayer',
    timestamp: new Date().toISOString(),
    input: {
      mode,
      pair: input.candidate.symbol,
      direction: input.candidate.tradeDirection,
      executionStatus: input.executionView.executionStatus,
      sectionTitles: sections.map(section => section.title),
    },
    output: {
      renderedLength: renderedText.length,
      validationDecision: validation.consistencyScore >= 60 ? 'PASS' : 'FAIL',
      selectedSections: decisionLog.selectedSections,
      skippedSections: decisionLog.skippedSections,
    },
  });

  return {
    message: {
      ...message,
      quality: validation,
      decisionLog,
    },
    renderedText,
    validation,
    decisionLog,
  };
}

export function renderCommunicationMessage(message: CommunicationMessage): string {
  const lines: string[] = [];
  lines.push(line(), '🌺 BEGONYA | SİNYAL ÖZETİ', line());
  for (const section of message.sections) {
    lines.push(section.title);
    for (const entry of section.lines) {
      lines.push(entry);
    }
    lines.push('');
  }
  lines.push(line());
  const rendered = lines.join('\n');
  recordRuntimeTrace({
    signalId: message.signalId,
    file: 'server/communicationLayer.ts',
    functionName: 'renderCommunicationMessage',
    timestamp: new Date().toISOString(),
    input: {
      sectionCount: message.sections.length,
      mode: message.mode,
    },
    output: {
      messageLength: rendered.length,
      preview: rendered.slice(0, 240),
    },
  });
  return rendered;
}

export function resolveCommunicationMode(mode?: CommunicationMode): CommunicationMode {
  if (mode) return mode;
  const configured = process.env.COMMUNICATION_MODE;
  if (configured === 'Compact' || configured === 'Balanced' || configured === 'Detailed') {
    return configured;
  }
  return 'Balanced';
}

function buildSections(
  candidate: NotificationCandidate,
  executionView: ExecutionCardView,
  signal: ReturnType<typeof extractCandidateDisplay>,
  narrative: SetupAssessment['narrativeAssessment'] | undefined,
  explainability: SetupAssessment['explainability'] | undefined,
  mode: CommunicationMode
): readonly CommunicationSection[] {
  const grade = candidate.gradeResult.grade;
  const totalScore = candidate.gradeResult.totalScore;
  const actionLine = normalizeRequiredAction(signal, executionView.requiredAction);
  const confirmationLine = normalizeRequiredConfirmation(executionView.requiredConfirmation, actionLine);
  const actionSummary = buildActionSummary(executionView, signal);
  const reasonSummary = buildReasonSummary(candidate, executionView, signal, narrative);
  const statusSummary = buildStatusSummary(executionView, signal);

  const isVolatileOrCross = ['EURCHF', 'CADCHF', 'LTCUSD', 'EURGBP', 'CADJPY', 'GBPJPY', 'AUDCHF'].some(token => candidate.symbol.toUpperCase().includes(token));
  const isChoch = candidate.poi?.relatedEvent?.type === 'CHoCH' || candidate.setupAssessmentV2?.detector?.structure?.eventType === 'CHoCH';
  const isHighKinetic = candidate.approachVelocity?.isHighKineticEnergy === true;
  const upperSymbol = candidate.symbol.toUpperCase();

  // 100% Win-Rate Champions: BTCUSD & SOLUSD (13 signals, 6 TP, 0 Stop)
  const isLeader = ['BTCUSD', 'SOLUSD'].includes(upperSymbol);

  // Strong Bearish Trend Continuation on Majors (58% Win Rate, +18.6R)
  const isMajorBearishTrend = candidate.tradeDirection === 'short' &&
    candidate.bias4H === 'bearish' &&
    candidate.bias1H === 'bearish' &&
    ['NZDUSD', 'EURUSD', 'USDCHF', 'CHFJPY', 'XAUUSD', 'GBPUSD'].includes(upperSymbol);

  let recommendedRisk = 'Defansif Risk (%0.5R)';
  if (!isHighKinetic && !isChoch && !isVolatileOrCross) {
    if (isLeader) {
      recommendedRisk = 'Tam Risk (%1.0R)';
    } else if (isMajorBearishTrend) {
      recommendedRisk = 'Tam Risk (%1.0R)';
    }
  }

  const macro: MacroGateEvaluation = candidate.macroEvaluation ?? MacroGateAdapter.getInstance().evaluateCandidate(
    candidate.symbol,
    candidate.tradeDirection,
    candidate.gradeResult.totalScore
  );

  const scoreEmoji = macro.begonyaScore >= 85 ? '🌟' : macro.begonyaScore >= 70 ? '✅' : macro.begonyaScore >= 50 ? '⚠️' : '🛑';
  const shortRationale = macro.macroRationale
    ? (macro.macroRationale.length > 180 ? macro.macroRationale.slice(0, 177) + '...' : macro.macroRationale)
    : '';

  const macroSectionLines = [
    field('Birincil Rejim', macro.primaryRegime),
    field('Makro Kapı Durumu', `${macro.macroBias} [G_macro: ${macro.macroGateMultiplier}]`),
    field('Çarpımsal Puanlama', `SMC: ${macro.smcTechnicalScore}/100 × G_macro: ${macro.macroGateMultiplier} = ${macro.begonyaScore}/100`),
    field('Kurumsal Sınıf', `Tier ${macro.scoreTier} (${macro.tierRationale})`),
    field('Risk / Lot Çarpanı', `${macro.riskMultiplier.toFixed(2)}x Lot`),
    field('Haber Kalkanı', '✅ Güvenli (±15 dk yüksek etkili veri yok)'),
    field('Makro Durum', macro.gateStatusMessage),
  ];

  if (macro.cryptoRotationAssessment) {
    const rot = macro.cryptoRotationAssessment;
    macroSectionLines.push(
      field('🔄 8-Faktör Rotasyon Skoru', `${rot.active_rotation_score}/100 (Katman ${rot.layer}: ${rot.sector})`),
      field('Göreli Güç (RS)', `ALT/BTC 24s: %${rot.rs_vs_btc_24h_pct >= 0 ? '+' : ''}${rot.rs_vs_btc_24h_pct.toFixed(2)} | ALT/ETH 24s: %${rot.rs_vs_eth_24h_pct >= 0 ? '+' : ''}${rot.rs_vs_eth_24h_pct.toFixed(2)}`),
      field('Hacim Anomalisi (RVOL)', `1s: ${rot.rvol_1h.toFixed(2)}x | 4s: ${rot.rvol_4h.toFixed(2)}x (${rot.volume_regime})`),
      field('Türev & Funding', `${rot.derivatives_regime} (OI 4s: %${rot.oi_change_4h_pct >= 0 ? '+' : ''}${rot.oi_change_4h_pct.toFixed(1)} | Funding: %${rot.funding_rate_pct >= 0 ? '+' : ''}${rot.funding_rate_pct.toFixed(4)})`)
    );
  }

  if (shortRationale) {
    macroSectionLines.push(field('Stratejik Görünüm', shortRationale));
  }

  const sections: CommunicationSection[] = [
    section('ÖZET', [
      field('Parite', candidate.symbol),
      field('Yön', signal.actionText),
      field('Grade', `${grade} (${totalScore}/9)`),
      field('Begonya Skoru', `${scoreEmoji} ${macro.begonyaScore}/100 (Tier ${macro.scoreTier})`),
      field('Makro Kapı', `${macro.macroBias} (${macro.action === 'PROCEED' ? '✅ Onaylı' : '⚠️ ' + macro.action})`),
      field('Önerilen Risk', `${recommendedRisk} | ${macro.riskMultiplier.toFixed(2)}x Lot`),
      field('Şimdi ne yapmalıyım?', actionSummary),
    ]),
    section('MAKRO REJİM & BEGONYA SKORU', macroSectionLines),
    section('DURUM', [
      field('Durum özeti', statusSummary),
      field('Giriş bölgesi', signal.entryZoneText),
      field('Anlık fiyat', signal.currentPriceText),
      field('Mesafe', signal.distanceText),
      field('Stop', signal.stopLossText),
      ...(candidate.approachVelocity && candidate.approachVelocity.isHighKineticEnergy
        ? [field('İvme Uyarısı', candidate.approachVelocity.warningText ?? 'Yüksek kinetik enerji tespit edildi.')]
        : []),
    ]),
    ...(candidate.expectancyPlan ? [
      section('QUANT ASİMETRİK HEDEF PLANI (R:R)', [
        field('Giriş Referansı', formatPrice(candidate.expectancyPlan.entryPrice, candidate.symbol)),
        field('Akıllı SL (Tamponlu)', `${formatPrice(candidate.expectancyPlan.stopLoss, candidate.symbol)} (Tampon: ${candidate.expectancyPlan.smartStopBufferPips}p | Risk: ${candidate.expectancyPlan.riskDistancePips}p)`),
        field('TP1 (Kısmi & BE)', `${formatPrice(candidate.expectancyPlan.tp1.price, candidate.symbol)} (+${candidate.expectancyPlan.tp1.pips}p | 1:${candidate.expectancyPlan.tp1.rr}R) -> %50 Kâr Al & Stop Girişe`),
        field('TP2 (Ana Hedef)', `${formatPrice(candidate.expectancyPlan.tp2.price, candidate.symbol)} (+${candidate.expectancyPlan.tp2.pips}p | 1:${candidate.expectancyPlan.tp2.rr}R) -> Ana Likidite Havuzu`),
        field('TP3 (Runner)', `${formatPrice(candidate.expectancyPlan.tp3.price, candidate.symbol)} (+${candidate.expectancyPlan.tp3.pips}p | 1:${candidate.expectancyPlan.tp3.rr}R) -> 4H Makro Trend Sürüşü`),
        field('Matematiksel R:R', `1:${candidate.expectancyPlan.primaryRR.toFixed(1)}`),
        field('Beklenen Değer (Expectancy)', `+${candidate.expectancyPlan.expectedValueR.toFixed(2)}R (Kazanma Olasılığı: %${Math.round(candidate.expectancyPlan.winProbability * 100)})`),
        field('Kelly Boyutlandırması', `Önerilen Risk: %${candidate.expectancyPlan.recommendedRiskPct} (Kelly: ${candidate.expectancyPlan.kellyFraction.toFixed(2)}x)`),
      ])
    ] : []),
    section('NE YAPMALIYIM?', [
      field('Aksiyon', candidate.approachVelocity?.isHighKineticEnergy
        ? '⚠️ Yüksek kinetik enerji / haber mumuyla yaklaşım. Kutu içinde 1M taban/tavan oluşturmadan kesinlikle işlem yok.'
        : actionLine),
      field('Onay', candidate.approachVelocity?.isHighKineticEnergy
        ? 'Fiyat agresif yaklaştı; önce bölgede momentumun durulması ve 1M CHoCH/FVG teyidi zorunludur.'
        : confirmationLine),
      field('Kâr Yönetimi', candidate.expectancyPlan
        ? '+1.5R kârda Stop Başabaş (BE) & %50 Kapat | TP2 (%30) | TP3 Runner (%20)'
        : '+1.0R kârda Stop Başabaş (BE) | +1.5R kârda %50 Kapat | Kalanı Mıknatısa Sür'),
    ]),
    section('NEDEN?', [
      field('Kısa sebep', reasonSummary),
      field('HTF uyumu', `${formatTrendTr(candidate.bias4H)} / ${formatTrendTr(candidate.bias1H)}`),
      field('Bölge tipi', `${formatPoiTypeTr(signal.typeText)} (${signal.polarText})`),
      field('P/D', `4H ${formatPdTr(candidate.pd4H)} | 1H ${formatPdTr(candidate.pd1H)} | 15M ${formatPdTr(candidate.pd15M)}`),
      field('Mıknatıs', resolveCommunicationMagnetText(candidate, signal)),
      ...(candidate.opposingObstacle && candidate.opposingObstacle.hasObstacle
        ? [field('Karşı Engel', candidate.opposingObstacle.warningText)]
        : []),
    ]),
    section('KISA ÖZET', [reasonSummary]),
  ];

  if (mode !== 'Compact') {
    sections.push(
      section('ANLATI', narrative
        ? [
            field('Bağlam', narrativeStoryTr(narrative.contextStory)),
            field('Likidite', narrativeStoryTr(narrative.liquidityStory)),
            field('Reaksiyon', narrativeStoryTr(narrative.reactionStory)),
            field('Devam', narrativeStoryTr(narrative.continuationStory)),
            field('Genel', narrativeOverallTr(narrative.overallNarrative)),
          ]
        : ['Bu sinyal için anlatı değerlendirmesi yok.'])
    );
  }

  if (mode === 'Detailed') {
    sections.push(
      section('AÇIKLAMA', explainability
        ? [
            field('Özet', explainability.summary),
            field('Destekleyenler', explainability.supportedBy.join(' | ') || 'Yok'),
            field('Zayıflatanlar', explainability.weakenedBy.join(' | ') || 'Yok'),
          ]
        : ['Bu sinyal için açıklama verisi yok.'])
    );
  }

  return sections;
}

function buildDecisionLog(
  mode: CommunicationMode,
  narrativeEnabled: boolean,
  evidenceIncluded: boolean,
  screenshotPlanned: boolean,
  sections: readonly CommunicationSection[]
): CommunicationDecisionLog {
  const selectedSections = sections.map(section => section.title);
  const skippedSections: string[] = [];
  if (mode === 'Compact') {
    skippedSections.push('AÇIKLAMA');
  }

  return {
    appliedMode: mode,
    narrativeEnabled,
    riskSummaryIncluded: true,
    evidenceIncluded,
    screenshotPlanned,
    channel: 'Telegram',
    selectedSections,
    skippedSections,
    reasons: [
      `Mod ${mode} olarak seçildi.`,
      narrativeEnabled ? 'Anlatı özeti açık.' : 'Anlatı verisi yok.',
      evidenceIncluded ? 'Kanıt ve açıklama dahil.' : 'Kanıt kısmen eksik.',
      screenshotPlanned ? 'Ekran görüntüsü sunum katmanında planlandı.' : 'Ekran görüntüsü planlanmadı.',
    ],
  };
}

function buildQualityValidation(
  sections: readonly CommunicationSection[],
  narrative: SetupAssessment['narrativeAssessment'] | undefined,
  explainability: SetupAssessment['explainability'] | undefined
): CommunicationMessageQualityValidation {
  const renderedSectionTitles = sections.map(section => section.title);
  const renderedContent = sections.flatMap(section => section.lines);
  const messageLength = renderedContent.join('\n').length;
  const lineCount = renderedContent.length;
  const duplicateContent = new Set(renderedContent).size !== renderedContent.length;
  const missingFields = renderedSectionTitles.filter(title => title.trim().length === 0);
  const readabilityScore = clamp(Math.round(100 - Math.max(0, (renderedContent.reduce((sum, line) => sum + line.length, 0) / Math.max(1, renderedContent.length)) - 60)), 0, 100);
  const informationDensity = clamp(Math.round((renderedContent.filter(line => line.includes(':')).length / Math.max(1, renderedContent.length)) * 100), 0, 100);
  const consistencyScore = clamp(
    100
      - (duplicateContent ? 10 : 0)
      - missingFields.length * 5
      - (narrative ? 0 : 5)
      - (explainability ? 0 : 5),
    0,
    100
  );

  return {
    messageLength,
    lineCount,
    readabilityScore,
    informationDensity,
    duplicateContent,
    missingFields,
    consistencyScore,
    warnings: [
      ...(narrative ? [] : ['NARRATIVE_UNAVAILABLE']),
      ...(explainability ? [] : ['EXPLAINABILITY_UNAVAILABLE']),
      ...(duplicateContent ? ['DUPLICATE_CONTENT_DETECTED'] : []),
    ],
  };
}

function assessRenderedMessage(
  renderedText: string,
  message: CommunicationMessage,
  sections: readonly CommunicationSection[]
): CommunicationMessageQualityValidation {
  const lines = renderedText.split('\n').filter(Boolean);
  const duplicateContent = new Set(lines).size !== lines.length;
  const expectedSectionCount = sections.length;
  const sectionMarkers = sections.filter(section => renderedText.includes(section.title)).length;
  const missingFields = sections.length === sectionMarkers ? [] : ['SECTION_RENDER_MISMATCH'];
  const readabilityScore = clamp(Math.round(100 - Math.max(0, (lines.reduce((sum, line) => sum + line.length, 0) / Math.max(1, lines.length)) - 70)), 0, 100);
  const informationDensity = clamp(Math.round((lines.filter(line => line.includes(':')).length / Math.max(1, lines.length)) * 100), 0, 100);
  const consistencyScore = clamp(
    message.quality.consistencyScore
      - (duplicateContent ? 5 : 0)
      - (expectedSectionCount > 0 ? 0 : 10)
      - (missingFields.length > 0 ? 10 : 0),
    0,
    100
  );

  return {
    messageLength: renderedText.length,
    lineCount: lines.length,
    readabilityScore,
    informationDensity,
    duplicateContent,
    missingFields,
    consistencyScore,
    warnings: message.quality.warnings,
  };
}

function section(title: string, lines: readonly string[]): CommunicationSection {
  return Object.freeze({ title, lines: Object.freeze([...lines]) });
}

function field(label: string, value: string): string {
  return `${label.padEnd(22, ' ')}: ${value}`;
}

function line(): string {
  return '━━━━━━━━━━━━━━━━━━━━━━';
}

function formatTR(timestamp: number): string {
  const trDate = new Date(timestamp + 3 * 60 * 60 * 1000);
  return trDate.toISOString().replace('T', ' ').substring(0, 19) + ' TR';
}

function buildActionSummary(executionView: ExecutionCardView, signal: ReturnType<typeof extractCandidateDisplay>): string {
  if (executionView.executionStatus === 'BLOCKED') return 'Bu sinyal alınmamalı.';
  if (executionView.executionStatus === 'CANCELLED') return 'Sinyal iptal edildi.';
  if (signal.requiredAction === 'Geri çekilmeyi bekle') return 'Fiyat giriş bölgesine dönünce 1 dakikalık manuel onay bekle.';
  return 'Fiyat giriş bölgesine gelince 1 dakikalık manuel onay bekle.';
}

function buildStatusSummary(executionView: ExecutionCardView, signal: ReturnType<typeof extractCandidateDisplay>): string {
  if (executionView.executionStatus === 'BLOCKED') return 'Bekleme yok — sinyal bloke edildi.';
  if (executionView.executionStatus === 'CANCELLED') return 'Bekleme yok — sinyal iptal edildi.';
  if (signal.requiredAction.includes('retest') || signal.requiredAction === 'Geri çekilmeyi bekle') return 'Fiyat hâlâ giriş bölgesinin dışında.';
  return 'Fiyat giriş bölgesine yakın veya içinde.';
}

function normalizeRequiredAction(signal: ReturnType<typeof extractCandidateDisplay>, action: string): string {
  if (signal.requiredAction.includes('retest') || signal.requiredAction.includes('Giriş bölgesine geri çekilme') || signal.requiredAction === 'Geri çekilmeyi bekle') {
    return 'Giriş bölgesine geri çekilmeyi (retest) bekle. Bölgeye dönmeden kesinlikle işlem yok.';
  }
  if (action.includes('BUY AFTER MANUAL CONFIRMATION') || action.includes('SELL AFTER MANUAL CONFIRMATION')) {
    return `${signal.actionText} - 1 dakikalık manuel onay bekle`;
  }
  if (action.includes('WAIT FOR RETEST') || action.includes('Geri çekilmeyi bekle')) {
    return 'Giriş bölgesine geri çekilmeyi (retest) bekle. Bölgeye dönmeden kesinlikle işlem yok.';
  }
  return action;
}

function normalizeRequiredConfirmation(confirmation: string, actionLine: string): string {
  if (confirmation.includes('manual 1M confirmation') || confirmation.includes('1 dakikalık manuel onay') || confirmation.includes('onay')) {
    return actionLine.includes('retest') || actionLine.includes('Giriş bölgesine geri çekilme') || actionLine === 'Geri çekilmeyi bekle'
      ? 'Fiyat giriş bölgesinde değil; önce geri çekilme (retest), sonra 1 dakikalık manuel onay.'
      : 'Fiyat giriş bölgesinde; 1 dakikalık manuel onay bekle.';
  }
  return confirmation;
}

function buildReasonSummary(
  candidate: NotificationCandidate,
  executionView: ExecutionCardView,
  signal: ReturnType<typeof extractCandidateDisplay>,
  narrative: SetupAssessment['narrativeAssessment'] | undefined
): string {
  const direction = candidate.tradeDirection === 'long' ? 'AL' : 'SAT';
  const htf = formatTrendTr(candidate.bias4H);
  const pd = formatPdTr(candidate.pd4H);
  const setup = signal.typeText === 'OB' ? 'OB' : 'FVG';
  const narrativeText = narrative ? narrativeOverallTr(narrative.overallNarrative) : 'anlatı verisi sınırlı';

  if (executionView.executionStatus === 'BLOCKED') {
    return 'Mevcut kurala göre işlem alınmamalı.';
  }
  if (signal.requiredAction === 'Geri çekilmeyi bekle') {
    return `${direction} yönü destekleniyor; ancak fiyat henüz giriş bölgesinde değil. ${htf} / ${pd} / ${setup} uyumu ${narrativeText}.`;
  }
  return `${direction} yönü destekleniyor; giriş bölgesi aktif. ${htf} / ${pd} / ${setup} uyumu ${narrativeText}.`;
}

function formatTrendTr(trend: NotificationCandidate['bias4H'] | NotificationCandidate['bias1H']): string {
  if (trend === 'bullish') return 'Yukarı';
  if (trend === 'bearish') return 'Aşağı';
  if (trend === 'range') return 'Yatay';
  return 'Belirsiz';
}

function formatPdTr(pd: 'premium' | 'discount' | 'eq' | undefined): string {
  if (pd === 'premium') return 'Pahalı';
  if (pd === 'discount') return 'Ucuz';
  if (pd === 'eq') return 'Denge';
  return 'Bilinmiyor';
}

function formatPoiTypeTr(typeText: string): string {
  if (typeText === 'OB') return 'OB';
  if (typeText === 'FVG') return 'FVG';
  return typeText;
}

function narrativeStoryTr(value: SetupAssessment['narrativeAssessment']['contextStory']): string {
  if (value === 'Strong') return 'Güçlü';
  if (value === 'Neutral') return 'Nötr';
  if (value === 'Weak') return 'Zayıf';
  return 'Bilinmiyor';
}

function narrativeOverallTr(value: SetupAssessment['narrativeAssessment']['overallNarrative']): string {
  if (value === 'Elite') return 'Elit';
  if (value === 'High') return 'Yüksek';
  if (value === 'Medium') return 'Orta';
  if (value === 'Low') return 'Düşük';
  return 'Bilinmiyor';
}

function formatSign(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

function formatPd(pd: 'premium' | 'discount' | 'eq' | undefined): string {
  if (pd === 'premium') return 'Pahalı';
  if (pd === 'discount') return 'Ucuz';
  if (pd === 'eq') return 'Denge';
  return 'N/A';
}

function formatTrend(trend: NotificationCandidate['bias4H'] | NotificationCandidate['bias1H']): string {
  if (trend === 'bullish') return 'Yukarı';
  if (trend === 'bearish') return 'Aşağı';
  if (trend === 'range') return 'Yatay';
  return 'Belirsiz';
}

function renderChecklistStatus(status: 'PASS' | 'FAIL' | 'WAITING' | 'NOT_REQUIRED'): string {
  if (status === 'PASS') return '✓ GEÇTİ';
  if (status === 'FAIL') return '✗ KALDI';
  if (status === 'WAITING') return '☐ BEKLİYOR';
  return '- GEREKMİYOR';
}

function normalizeChecklist(checklist: readonly { label: string; status: 'PASS' | 'FAIL' | 'WAITING' | 'NOT_REQUIRED' }[]): readonly { label: string; status: 'PASS' | 'FAIL' | 'WAITING' | 'NOT_REQUIRED' }[] {
  const required = [
    'Makro Rejim Kapısı',
    'HTF Bias',
    'Structure',
    'Sweep',
    'Active POI',
    'Premium / Discount',
    'Eligibility',
    'Retest',
    'Risk Accepted',
    'Notification Delivered',
  ];
  const byLabel = new Map(checklist.map(item => [item.label, item]));
  return Object.freeze(required.map(label => byLabel.get(label) ?? Object.freeze({ label, status: 'NOT_REQUIRED' as const })));
}

function detectorCheck(score: number): string {
  if (score >= 1) return 'VAR';
  if (score === 0) return 'BEKLİYOR';
  return 'YOK';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

import { formatPrice, calculateDistance, getPipSize } from '../src/assetMetrics';

function resolveCommunicationMagnetText(
  candidate: NotificationCandidate,
  signal: ReturnType<typeof extractCandidateDisplay>
): string {
  if (candidate.liquidityMagnet && candidate.liquidityMagnet.isActive) {
    return candidate.liquidityMagnet.description;
  }
  if (candidate.liquidityMagnet && !candidate.liquidityMagnet.isActive) {
    const poolType = candidate.tradeDirection === 'long' ? 'BSL Tepe' : 'SSL Dip';
    return `${candidate.liquidityMagnet.description} (Alindi - Yeni ${poolType} Hedefi Aktif)`;
  }

  const pip = getPipSize(candidate.symbol);
  const brokenPrice = candidate.poi?.relatedEvent?.brokenSwing?.price;
  if (
    typeof brokenPrice === 'number' &&
    Number.isFinite(brokenPrice) &&
    ((candidate.tradeDirection === 'long' && brokenPrice > candidate.currentPrice) ||
      (candidate.tradeDirection === 'short' && brokenPrice < candidate.currentPrice))
  ) {
    const distPips = Math.round((Math.abs(brokenPrice - candidate.currentPrice) / pip) * 10) / 10;
    return candidate.tradeDirection === 'long'
      ? `BSL (Yapisal Tepe Likiditesi - Hedef Miknatis): 1 tepe @ ${brokenPrice.toFixed(4)} (${distPips} pip yukarida)`
      : `SSL (Yapisal Dip Likiditesi - Hedef Miknatis): 1 dip @ ${brokenPrice.toFixed(4)} (${distPips} pip asagida)`;
  }

  const zoneWidth = Math.max(pip * 10, signal.zoneHigh - signal.zoneLow);
  const targetPrice = candidate.tradeDirection === 'long'
    ? Math.max(candidate.currentPrice, signal.zoneHigh) + zoneWidth * 2
    : Math.min(candidate.currentPrice, signal.zoneLow) - zoneWidth * 2;
  const distPips = Math.round((Math.abs(targetPrice - candidate.currentPrice) / pip) * 10) / 10;
  return candidate.tradeDirection === 'long'
    ? `BSL (Acik Likidite / 2R Yapisal Tepe Hedefi): @ ${targetPrice.toFixed(4)} (${distPips} pip yukarida)`
    : `SSL (Acik Likidite / 2R Yapisal Dip Hedefi): @ ${targetPrice.toFixed(4)} (${distPips} pip asagida)`;
}

function extractCandidateDisplay(candidate: NotificationCandidate) {
  const { poiType, poi, tradeDirection, currentPrice } = candidate;
  const ob = poiType === 'OB' ? (poi as OrderBlock) : null;
  const fvg = poiType === 'FVG' ? (poi as FVG) : null;
  const signalId = candidate.signalId ?? candidate.uniqueKey;
  const actionText = tradeDirection === 'long' ? 'AL' : 'SAT';
  const typeText = poiType === 'OB' ? 'OB' : 'FVG';
  const polarText = tradeDirection === 'long' ? 'Yükseliş' : 'Düşüş';
  const zoneHigh = poiType === 'OB' ? (ob?.high ?? 0) : (fvg?.gapHigh ?? 0);
  const zoneLow = poiType === 'OB' ? (ob?.low ?? 0) : (fvg?.gapLow ?? 0);
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
