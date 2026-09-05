import { NewsGuard, NewsEvent } from '../server/newsGuard';
import { MacroGateAdapter } from '../server/macroGateAdapter';

describe('Begonya Makro Haber Kalkanı (News Freeze Guard) Testleri', () => {
  const newsGuard = NewsGuard.getInstance();

  beforeEach(() => {
    newsGuard.clearCustomEvents();
  });

  afterEach(() => {
    newsGuard.clearCustomEvents();
  });

  it('1. SAKIN PİYASA: Yakında yüksek etkili veri yokken kalkan pasiftir (isFrozen: false)', () => {
    const mockTime = new Date('2026-09-05T10:00:00Z').getTime();
    const status = newsGuard.checkNewsFreeze('EURUSD', mockTime);

    expect(status.isFrozen).toBe(false);
    expect(status.activeEvent).toBeUndefined();
  });

  it('2. HABER ÖNCESİ PENCERESİ: Olaydan 10 dakika önce sistem kilitlenir (isFrozen: true)', () => {
    const eventTime = new Date('2026-09-05T12:30:00Z').getTime();
    const testEvent: NewsEvent = {
      id: 'TEST_US_NFP',
      name: 'ABD Tarım Dışı İstihdam (NFP)',
      event_time_utc: new Date(eventTime).toISOString(),
      currency: 'USD',
      impact: 'CRITICAL',
      affects_all_symbols: true,
      freeze_minutes_before: 15,
      freeze_minutes_after: 15,
    };
    newsGuard.registerEvent(testEvent);

    // Olaydan 20 dk önce -> Açık olmalı
    const before20m = eventTime - 20 * 60 * 1000;
    expect(newsGuard.checkNewsFreeze('EURUSD', before20m).isFrozen).toBe(false);

    // Olaydan 10 dk önce -> KİLİTLİ olmalı
    const before10m = eventTime - 10 * 60 * 1000;
    const freeze10m = newsGuard.checkNewsFreeze('EURUSD', before10m);
    expect(freeze10m.isFrozen).toBe(true);
    expect(freeze10m.reason).toContain('habere 10 dakika kaldı');
  });

  it('3. HABER ANI VE SİNDİRME PERİYODU: Olaydan 5 dakika sonra spread açılması koruması sürer', () => {
    const eventTime = new Date('2026-09-05T18:00:00Z').getTime();
    const testEvent: NewsEvent = {
      id: 'TEST_FOMC',
      name: 'FOMC Faiz Kararı & Basın Toplantısı',
      event_time_utc: new Date(eventTime).toISOString(),
      currency: 'USD',
      impact: 'CRITICAL',
      affects_all_symbols: true,
      freeze_minutes_before: 15,
      freeze_minutes_after: 20,
    };
    newsGuard.registerEvent(testEvent);

    // Tam haber anı -> Kilitli
    expect(newsGuard.checkNewsFreeze('XAUUSD', eventTime).isFrozen).toBe(true);

    // Haberden 10 dk sonra -> Kilitli (sindirme periyodu)
    const after10m = eventTime + 10 * 60 * 1000;
    const freezeAfter = newsGuard.checkNewsFreeze('BTCUSD', after10m);
    expect(freezeAfter.isFrozen).toBe(true);
    expect(freezeAfter.reason).toContain('sindirme periyodu');

    // Haberden 25 dk sonra -> Kilidin kalkması gerekir
    const after25m = eventTime + 25 * 60 * 1000;
    expect(newsGuard.checkNewsFreeze('BTCUSD', after25m).isFrozen).toBe(false);
  });

  it('4. ENSTRÜMAN BAZLI ETKİ: Sadece EUR etkileyen veri BTCUSD veya NAS100\'ü dondurmaz', () => {
    const eventTime = new Date('2026-09-05T14:00:00Z').getTime();
    const ecbEvent: NewsEvent = {
      id: 'TEST_ECB',
      name: 'ECB Faiz Kararı',
      event_time_utc: new Date(eventTime).toISOString(),
      currency: 'EUR',
      impact: 'HIGH',
      affects_all_symbols: false,
      affects_symbols: ['EURUSD', 'EURGBP'],
      freeze_minutes_before: 15,
      freeze_minutes_after: 15,
    };
    newsGuard.registerEvent(ecbEvent);

    // EURUSD dondurulmalı
    expect(newsGuard.checkNewsFreeze('EURUSD', eventTime).isFrozen).toBe(true);

    // BTCUSD dondurulmamalı
    expect(newsGuard.checkNewsFreeze('BTCUSD', eventTime).isFrozen).toBe(false);
  });

  it('5. MACRO GATE ADAPTER ENTEGRASYONU: Haber kalkanı devredeyken evaluateCandidate VETO üretir (0. Katman)', () => {
    // Şimdi tam haber saati simüle edelim (şu anki saate bir etkinlik koyalım)
    const nowIso = new Date().toISOString();
    const currentEvent: NewsEvent = {
      id: 'TEST_LIVE_CPI',
      name: 'ABD Canlı TÜFE (CPI)',
      event_time_utc: nowIso,
      currency: 'USD',
      impact: 'CRITICAL',
      affects_all_symbols: true,
      freeze_minutes_before: 15,
      freeze_minutes_after: 15,
    };
    newsGuard.registerEvent(currentEvent);

    const adapter = MacroGateAdapter.getInstance();
    // SMC teknik skoru 99 olsa dahi 0. Katmandaki haber kalkanı işlemi VETO etmelidir!
    const result = adapter.evaluateCandidate('EURUSD', 'long', 99);

    expect(result.allowed).toBe(false);
    expect(result.macroGateMultiplier).toBe(0);
    expect(result.begonyaScore).toBe(0);
    expect(result.action).toBe('VETO');
    expect(result.gateStatusMessage).toContain('Makro Haber Kalkanı Devrede');
  });
});
