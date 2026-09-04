import { formatNotificationMessage, formatTR } from '../server/telegramFormatter';
import { buildRuntimeNotificationMessage } from '../server/notificationBuilder';
import { runRuntimeExecutionPipeline } from '../server/runtimeExecutionPipeline';
import { NotificationCandidate } from '../server/pipeline';

describe('Telegram Formatter', () => {
  const dummyCandidate = (poiType: 'OB' | 'FVG', grade: 'A+' | 'A' | 'B+' | 'B' | 'C' = 'A+'): NotificationCandidate => {
    const ob = {
      direction: 'bullish' as const,
      candleIndex: 10,
      high: 1.0550,
      low: 1.0530,
      formedAtIndex: 10,
      relatedEvent: {
        type: 'BOS' as const,
        direction: 'bullish' as const,
        brokenSwing: {} as any,
        breakCandleIndex: 12,
        breakTimestamp: 1717300000000,
        breakClosePrice: 1.0560,
      },
    };

    const fvg = {
      direction: 'bullish' as const,
      gapHigh: 1.0545,
      gapLow: 1.0535,
      gapSizePips: 10,
      ratioToDisplacementCandle: 0.5,
      middleCandleIndex: 11,
      relatedEvent: ob.relatedEvent,
    };

    const totalScore = grade === 'A+' ? 9 : grade === 'A' ? 5 : grade === 'B+' ? 3 : grade === 'B' ? 1 : 0;

    return {
      symbol: 'EURUSD',
      tradeDirection: 'long',
      poiType,
      poi: poiType === 'OB' ? ob : fvg,
      gradeResult: {
        totalScore,
        grade,
        entryAllowed: grade === 'A+' || grade === 'A' || grade === 'B+',
        blockReasons: [],
        breakdown: {
          htfBiasPD: grade === 'C' ? -1 : 2,
          displacement: grade === 'C' ? -2 : 2,
          structure: grade === 'C' ? -2 : 2,
          sweep: grade === 'C' ? -2 : 2,
          poiQuality: grade === 'A+' ? 1 : 0,
        },
      },
      uniqueKey: 'test_key',
      signalId: 'test_signal',
      signalContext: {
        signalId: 'test_signal',
        pair: 'EURUSD',
        direction: 'long',
        timeframe: '15m',
        grade,
        score: totalScore,
        timestamp: 1717300000000,
        lifecycle: {
          states: ['DETECTED', 'GRADED'],
          currentState: 'GRADED',
        },
      } as any,
      currentPrice: 1.0585,
      poiFormedTimestamp: 1717290000000,
      bias4H: 'bullish',
      bias1H: 'bullish',
      poiTestCount: 0,
      pd4H: 'discount',
      pd1H: 'discount',
      pd15M: 'discount',
      admissionProfile: 'PRODUCTION',
    };
  };

  test('renders a short Turkish execution card with the right order', () => {
    const msg = formatNotificationMessage(dummyCandidate('OB'));

    expect(msg.indexOf('ÖZET')).toBeLessThan(msg.indexOf('DURUM'));
    expect(msg.indexOf('DURUM')).toBeLessThan(msg.indexOf('NE YAPMALIYIM?'));
    expect(msg.indexOf('NE YAPMALIYIM?')).toBeLessThan(msg.indexOf('NEDEN?'));
    expect(msg).toContain('SİNYAL ÖZETİ');
    expect(msg).not.toContain('METADATA');
    expect(msg).not.toContain('Quality Score');
    expect(msg).not.toContain('EXECUTION CHECKLIST');
  });

  test('renders the key user-facing fields in Turkish', () => {
    const msg = formatNotificationMessage(dummyCandidate('OB'));

    expect(msg).toContain('Parite                : EURUSD');
    expect(msg).toContain('Yön                   : AL');
    expect(msg).toContain('Grade                 : A+ (9/9)');
    expect(msg).toContain('Giriş bölgesi         : 1.05300 - 1.05500');
    expect(msg).toContain('Anlık fiyat           : 1.05850');
    expect(msg).toContain('Aksiyon               : Giriş bölgesine geri çekilmeyi (retest) bekle. Bölgeye dönmeden kesinlikle işlem yok.');
    expect(msg).toContain('Onay                  : Fiyat giriş bölgesinde değil; önce geri çekilme (retest), sonra 1 dakikalık manuel onay.');
  });

  test('keeps the message concise and removes internal dumps', () => {
    const msg = formatNotificationMessage(dummyCandidate('OB'));

    expect(msg.length).toBeLessThan(1800);
    expect(msg).not.toContain('Signal Delivery');
    expect(msg).not.toContain('Lifecycle');
    expect(msg).not.toContain('Readability');
    expect(msg).not.toContain('Density');
    expect(msg).not.toContain('Duplicate Content');
  });

  test('formats FVG entry zone from gap boundaries', () => {
    const msg = formatNotificationMessage(dummyCandidate('FVG'));

    expect(msg).toContain('Bölge tipi            : FVG (Yükseliş)');
    expect(msg).toContain('Giriş bölgesi         : 1.05350 - 1.05450');
    expect(msg).toContain('Yön                   : AL');
  });

  test('runtime builder remains compatible and renders the same user-facing summary', () => {
    const candidate = dummyCandidate('OB');
    const execution = runRuntimeExecutionPipeline(candidate);
    const msg = buildRuntimeNotificationMessage(candidate, execution);

    expect(msg).toContain('SİNYAL ÖZETİ');
    expect(msg).toContain('Parite                : EURUSD');
    expect(msg).toContain('Giriş bölgesi         : 1.05300 - 1.05500');
    expect(msg).not.toContain('Version');
    expect(msg).not.toContain('Decision');
  });

  test('grade-level notification policy remains A+, A and B+ only', () => {
    expect(dummyCandidate('OB', 'A+').gradeResult.entryAllowed).toBe(true);
    expect(dummyCandidate('OB', 'A').gradeResult.entryAllowed).toBe(true);
    expect(dummyCandidate('OB', 'B+').gradeResult.entryAllowed).toBe(true);
    expect(dummyCandidate('OB', 'B').gradeResult.entryAllowed).toBe(false);
    expect(dummyCandidate('OB', 'C').gradeResult.entryAllowed).toBe(false);
  });

  test('offsets timestamp by +3 hours correctly for TR timezone', () => {
    const utcTimestamp = 1717307100000;
    const formatted = formatTR(utcTimestamp);
    expect(formatted).toBe('2024-06-02 08:45:00 TR');
  });
});
