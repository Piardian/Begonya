import { buildCommunicationLayer, renderCommunicationMessage, resolveCommunicationMode } from '../server/communicationLayer';
import { buildExecutionCardView } from '../server/notificationBuilder';
import { NotificationCandidate } from '../server/pipeline';
import { RuntimeExecutionPipelineResult } from '../server/runtimeExecutionPipeline';

describe('Communication Layer', () => {
  beforeEach(() => {
    delete process.env.COMMUNICATION_MODE;
  });

  test('builds a production Turkish communication message with quality validation kept internal', () => {
    const candidate = makeCandidate();
    const execution = makeExecution();
    const executionView = buildExecutionCardView(candidate, execution);

    const bundle = buildCommunicationLayer({ candidate, executionView });

    expect(bundle.message.version).toBe('CommunicationMessage.v1');
    expect(bundle.message.channel).toBe('Telegram');
    expect(bundle.message.mode).toBe('Balanced');
    expect(bundle.message.sections.map(section => section.title)).toContain('ÖZET');
    expect(bundle.message.sections.map(section => section.title)).toContain('NEDEN?');
    expect(bundle.validation.consistencyScore).toBeGreaterThan(0);
    expect(bundle.decisionLog.channel).toBe('Telegram');
    expect(bundle.decisionLog.appliedMode).toBe('Balanced');
    expect(bundle.renderedText).toContain('SİNYAL ÖZETİ');
    expect(bundle.renderedText).not.toContain('Quality Score');
    expect(bundle.renderedText).not.toContain('EXPLAINABILITY BLOCK');
  });

  test('renders a short readable communication message', () => {
    const candidate = makeCandidate();
    const execution = makeExecution();
    const executionView = buildExecutionCardView(candidate, execution);
    const bundle = buildCommunicationLayer({ candidate, executionView, mode: 'Compact' });

    const rendered = renderCommunicationMessage(bundle.message);
    expect(rendered).toContain('Aksiyon               : Giriş bölgesine geri çekilmeyi (retest) bekle. Bölgeye dönmeden kesinlikle işlem yok.');
    expect(rendered).toContain('Fiyat giriş bölgesinde değil; önce geri çekilme');
    expect(resolveCommunicationMode('Detailed')).toBe('Detailed');
    expect(rendered.length).toBeGreaterThan(150);
    expect(rendered.length).toBeLessThan(2000);
  });
});

function makeCandidate(): NotificationCandidate {
  return {
    symbol: 'EURUSD',
    tradeDirection: 'long',
    poiType: 'OB',
    poi: {
      direction: 'bullish',
      candleIndex: 0,
      high: 1.105,
      low: 1.1,
      formedAtIndex: 0,
      relatedEvent: {
        type: 'BOS',
        direction: 'bullish',
        brokenSwing: {
          type: 'high',
          price: 1.103,
          formedAtIndex: 0,
          confirmedAtIndex: 1,
          timestamp: 1000,
        },
        breakCandleIndex: 1,
        breakTimestamp: 2000,
        breakClosePrice: 1.106,
      },
    },
    gradeResult: {
      totalScore: 9,
      grade: 'A+',
      entryAllowed: true,
      blockReasons: [],
      breakdown: {
        htfBiasPD: 2,
        displacement: 2,
        structure: 2,
        sweep: 2,
        poiQuality: 1,
      },
    },
    uniqueKey: 'EURUSD_15m_OB_demo',
    signalId: 'EURUSD_15m_OB_demo',
    signalContext: {
      signalId: 'EURUSD_15m_OB_demo',
      pair: 'EURUSD',
      direction: 'long',
      timeframe: '15m',
      grade: 'A+',
      score: 9,
      timestamp: 2000,
      lifecycle: {
        states: ['DETECTED', 'GRADED'],
        currentState: 'GRADED',
      },
    },
    currentPrice: 1.106,
    poiFormedTimestamp: 1000,
    bias4H: 'bullish',
    bias1H: 'bullish',
    poiTestCount: 1,
    pd4H: 'discount',
    pd1H: 'discount',
    pd15M: 'discount',
    admissionProfile: 'PRODUCTION',
    setupAssessmentV2: {
      version: 'SetupAssessment.v2',
      grade: 'A+',
      context: {
        htfAlignment: 'Strong',
        premiumDiscountAlignment: 'Strong',
        marketPhase: 'Expansion',
        zoneFreshness: 'Fresh',
        zoneState: 'Active',
        sessionQuality: 'Strong',
      },
      narrativeAssessment: {
        contextStory: 'Strong',
        liquidityStory: 'Strong',
        reactionStory: 'Strong',
        continuationStory: 'Strong',
        overallNarrative: 'Elite',
        consistency: 95,
        reasons: ['HTF aligned', 'Fresh OB'],
      },
      quality: {
        poiQuality: 'High',
        structureQuality: 'High',
        displacementQuality: 'High',
        contextQuality: 'High',
        overallQuality: 'High',
      },
      decision: {
        hardReject: false,
        rejectReasons: [],
        gradeCaps: [],
        penalties: [],
      },
      explainability: {
        supportedBy: ['HTF alignment', 'Strong sweep'],
        weakenedBy: ['Neutral POI'],
        summary: 'Strong setup',
        evidenceScore: 92,
      },
      comparison: {
        v1: { grade: 'A', score: 5 },
        v2: { grade: 'A+', qualityBand: 'Elite' },
        changed: true,
        reasons: ['Narrative strong'],
      },
    },
    setupAssessmentComparison: {
      v1: { grade: 'A', score: 5 },
      v2: { grade: 'A+', qualityBand: 'Elite' },
      changed: true,
      reasons: ['Narrative strong'],
    },
  } as unknown as NotificationCandidate;
}

function makeExecution(): RuntimeExecutionPipelineResult {
  return {
    riskResult: {
      items: [
        {
          riskStatus: 'ACCEPTED',
          evaluation: {
            executionAllowed: true,
            reason: { code: 'POLICY_GATE_PASSED', message: 'Policy-level risk accepted.' },
          },
        },
      ],
    },
    decisionCalibration: {
      status: 'ELIGIBLE',
      reason: { code: 'CONTEXT_POLICY_PASSED', message: 'All runtime context quality gates passed.' },
      checks: [],
    },
    engineResult: { audit: { readyCommands: 1 } },
    decisionReport: { decisions: [{ status: 'ELIGIBLE', reason: { code: 'OK', message: 'OK' } }] },
    signalContext: { lifecycle: { states: ['DETECTED', 'GRADED', 'PLANNED'], currentState: 'PLANNED' }, timestamp: 2000, riskStatus: 'ACCEPTED' },
    signalOutcome: { outcomeType: 'WAITING_ENTRY' },
    signalBenchmark: { benchmarkStatus: 'PENDING' },
  } as unknown as RuntimeExecutionPipelineResult;
}
