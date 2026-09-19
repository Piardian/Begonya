import { MacroGateAdapter, MacroGatePayload } from '../server/macroGateAdapter';
import * as fs from 'fs';
import * as path from 'path';

describe('Begonya Asymmetric Short & Multiplicative Gating Tests', () => {
  const sharedGatePath = path.resolve(__dirname, '../../shared/macro_bias_gate.json');
  let originalGateContent: string | null = null;

  beforeAll(() => {
    if (fs.existsSync(sharedGatePath)) {
      originalGateContent = fs.readFileSync(sharedGatePath, 'utf-8');
    }
  });

  afterAll(() => {
    if (originalGateContent !== null) {
      fs.writeFileSync(sharedGatePath, originalGateContent, 'utf-8');
    }
  });

  function writeMockGate(payload: Partial<MacroGatePayload>) {
    const fullPayload: MacroGatePayload = {
      timestamp: '2026-09-05 08:45:00',
      primary_regime: 'Late-Cycle Overheating',
      volatility_risk_score: 0.35,
      capital_preservation_mode: false,
      btc_decoupling_active: false,
      recommended_risk_multiplier: 1.0,
      execution_bias_gates: {
        XAUUSD: 'LONG_ONLY',
        BTC: 'SHORT_ONLY',
        EURUSD: 'SHORT_ONLY',
        SPX: 'SHORT_ONLY'
      },
      asset_biases: {
        XAUUSD: 'Strong Bullish',
        BTC: 'Bearish',
        EURUSD: 'Bearish',
        SPX: 'Bearish'
      },
      regime_state: {
        vix_pct_60d: 40.0,
        brent_pct_60d: 85.0
      },
      macro_rationale: 'Test mock rationale',
      ...payload
    };
    fs.writeFileSync(sharedGatePath, JSON.stringify(fullPayload, null, 2), 'utf-8');
  }

  it('0. MAKRO DATA YOK: Gate dosyası yoksa işlem fail-closed olur', () => {
    if (fs.existsSync(sharedGatePath)) fs.unlinkSync(sharedGatePath);
    const adapter = MacroGateAdapter.getInstance();
    const result = adapter.evaluateCandidate('EURUSD', 'long', 95);

    expect(result.allowed).toBe(false);
    expect(result.action).toBe('VETO');
    expect(result.macroGateMultiplier).toBe(0);
    expect(result.riskMultiplier).toBe(0.0);
    expect(result.macroBias).toBe('NO_DATA');
    expect(result.begonyaScore).toBe(0);
    expect(result.gateStatusMessage).toContain('işlem açılmaz');
    expect(result.macroRationale).toContain('fail-closed');
  });

  it('1. XAUUSD SHORT YASAĞI: Mali hakimiyet çağında altında short kesinlikle kilitlenir (G_macro = 0)', () => {
    writeMockGate({
      execution_bias_gates: { XAUUSD: 'NEUTRAL_RANGE' }
    });
    const adapter = MacroGateAdapter.getInstance();
    // SMC teknik skoru 95 (mükemmel) bile olsa makro kapalıysa skor 0 olmalı!
    const result = adapter.evaluateCandidate('XAUUSD', 'short', 95);

    expect(result.allowed).toBe(false);
    expect(result.macroGateMultiplier).toBe(0);
    expect(result.begonyaScore).toBe(0);
    expect(result.riskMultiplier).toBe(0.0);
    expect(result.action).toBe('VETO');
    expect(result.gateStatusMessage).toContain('Mali Hakimiyet');
  });

  it('2. XAUUSD LONG ONAYI: Altında Long yönünde makro kapı açıktır (G_macro = 1)', () => {
    writeMockGate({
      execution_bias_gates: { XAUUSD: 'LONG_ONLY' }
    });
    const adapter = MacroGateAdapter.getInstance();
    const result = adapter.evaluateCandidate('XAUUSD', 'long', 92);

    expect(result.allowed).toBe(true);
    expect(result.macroGateMultiplier).toBe(1);
    expect(result.begonyaScore).toBe(92);
    expect(result.scoreTier).toBe('A+');
    expect(result.riskMultiplier).toBe(1.00);
  });

  it('3. BORSA GECİKME TUZAĞI: VIX yüksekken endekste gecikmiş short VETO edilir (G_macro = 0)', () => {
    writeMockGate({
      volatility_risk_score: 0.75, // VIX yüksek
      regime_state: { vix_pct_60d: 88.0 },
      execution_bias_gates: { SPX: 'SHORT_ONLY' }
    });
    const adapter = MacroGateAdapter.getInstance();
    const result = adapter.evaluateCandidate('NAS100', 'short', 90);

    expect(result.allowed).toBe(false);
    expect(result.macroGateMultiplier).toBe(0);
    expect(result.begonyaScore).toBe(0);
    expect(result.gateStatusMessage).toContain('Short Squeeze Riski');
  });

  it('4. BORSA REHAVET SHORTU: Sakin piyasada zirve dönüşü endeks shortuna izin verilir (G_macro = 1)', () => {
    writeMockGate({
      volatility_risk_score: 0.35, // VIX sakin / rehavet
      regime_state: { vix_pct_60d: 35.0 },
      execution_bias_gates: { SPX: 'SHORT_ONLY' }
    });
    const adapter = MacroGateAdapter.getInstance();
    const result = adapter.evaluateCandidate('NAS100', 'short', 86);

    expect(result.allowed).toBe(true);
    expect(result.macroGateMultiplier).toBe(1);
    expect(result.begonyaScore).toBe(86);
    expect(result.scoreTier).toBe('A+');
    expect(result.riskMultiplier).toBe(1.00);
  });

  it('5. ÇARPIMSAL KAPI DOĞRULAMASI: EURUSD makro SHORT_ONLY iken gelen Long sinyali 0 puan alır', () => {
    writeMockGate({
      execution_bias_gates: { EURUSD: 'SHORT_ONLY' }
    });
    const adapter = MacroGateAdapter.getInstance();
    // SMC'den 98 gelse dahi toplamsal saçmalık bitti, G_macro = 0 ile sonuç 0 çıkmalı!
    const result = adapter.evaluateCandidate('EURUSD', 'long', 98);

    expect(result.allowed).toBe(false);
    expect(result.macroGateMultiplier).toBe(0);
    expect(result.begonyaScore).toBe(0);
    expect(result.action).toBe('VETO');
    expect(result.gateStatusMessage).toContain('SHORT_ONLY iken LONG Açılamaz');
  });

  it('6. EURUSD POZİTİF CARRY SHORT: Faiz makası Dolar lehindeyken EURUSD SHORT onaylanır (G_macro = 1)', () => {
    writeMockGate({
      execution_bias_gates: { EURUSD: 'SHORT_ONLY' }
    });
    const adapter = MacroGateAdapter.getInstance();
    const result = adapter.evaluateCandidate('EURUSD', 'short', 88);

    expect(result.allowed).toBe(true);
    expect(result.macroGateMultiplier).toBe(1);
    expect(result.begonyaScore).toBe(88);
    expect(result.scoreTier).toBe('A+');
    expect(result.riskMultiplier).toBe(1.00);
  });

  it('7. BTC TAHVİL ŞOKU TASFİYE SHORTU: Fon tasfiye dalgasında BTC SHORT onaylanır (G_macro = 1)', () => {
    writeMockGate({
      btc_decoupling_active: true,
      execution_bias_gates: { BTC: 'SHORT_ONLY' }
    });
    const adapter = MacroGateAdapter.getInstance();
    const result = adapter.evaluateCandidate('BTCUSD', 'short', 85);

    expect(result.allowed).toBe(true);
    expect(result.macroGateMultiplier).toBe(1);
    expect(result.begonyaScore).toBe(85);
    expect(result.scoreTier).toBe('A+');
  });

  it('8. BTC TAHVİL ŞOKUNDA LONG İNTİHARI: Fonlar satarken BTC Long doğrudan VETO edilir (G_macro = 0)', () => {
    writeMockGate({
      btc_decoupling_active: true,
      execution_bias_gates: { BTC: 'NEUTRAL_RANGE' }
    });
    const adapter = MacroGateAdapter.getInstance();
    const result = adapter.evaluateCandidate('BTCUSD', 'long', 90);

    expect(result.allowed).toBe(false);
    expect(result.macroGateMultiplier).toBe(0);
    expect(result.begonyaScore).toBe(0);
    expect(result.gateStatusMessage).toContain('Margin Call');
  });

  it('9. AÇIK 1 ÇÖZÜMÜ - TERS YÖN KONTROLÜ: EURUSD LONG_ONLY iken SMC Short üretirse 1. Katmanda VETO edilir', () => {
    writeMockGate({
      execution_bias_gates: { EURUSD: 'LONG_ONLY' }
    });
    const adapter = MacroGateAdapter.getInstance();
    const result = adapter.evaluateCandidate('EURUSD', 'short', 94);

    expect(result.allowed).toBe(false);
    expect(result.macroGateMultiplier).toBe(0);
    expect(result.begonyaScore).toBe(0);
    expect(result.action).toBe('VETO');
    expect(result.gateStatusMessage).toContain('LONG_ONLY iken SHORT Açılamaz');
  });

  it('10. AÇIK 2 ÇÖZÜMÜ - DEFENSIVE_HOLD KONTROLÜ: Makro savunma modundaki varlık 1. Katmanda VETO edilir', () => {
    writeMockGate({
      execution_bias_gates: { SPX: 'DEFENSIVE_HOLD' }
    });
    const adapter = MacroGateAdapter.getInstance();
    const result = adapter.evaluateCandidate('NAS100', 'short', 90);

    expect(result.allowed).toBe(false);
    expect(result.macroGateMultiplier).toBe(0);
    expect(result.begonyaScore).toBe(0);
    expect(result.action).toBe('VETO');
    expect(result.gateStatusMessage).toContain('DEFENSIVE_HOLD');
  });

  it('11. AÇIK 3 ÇÖZÜMÜ - GENEL VARLIK KORUMASI: GBPUSD SHORT_ONLY iken gelen LONG sinyali boşluğa düşmeden VETO edilir', () => {
    writeMockGate({
      execution_bias_gates: { GBPUSD: 'SHORT_ONLY' }
    });
    const adapter = MacroGateAdapter.getInstance();
    const result = adapter.evaluateCandidate('GBPUSD', 'long', 89);

    expect(result.allowed).toBe(false);
    expect(result.macroGateMultiplier).toBe(0);
    expect(result.begonyaScore).toBe(0);
    expect(result.action).toBe('VETO');
    expect(result.gateStatusMessage).toContain('SHORT_ONLY iken LONG Açılamaz');
  });

  it('12. ÇELİŞKİ ÇÖZÜMÜ: Sermaye koruma modunda (0.25x risk) makro ile doğru orantılı işlem VETO edilmez, 0.25x lot ile onaylanır', () => {
    writeMockGate({
      capital_preservation_mode: true,
      recommended_risk_multiplier: 0.25,
      execution_bias_gates: { BTC: 'SHORT_ONLY' },
      asset_biases: { BTC: 'Bearish' }
    });
    const adapter = MacroGateAdapter.getInstance();
    // A+ Kalite SMC Short sinyali (90 puan)
    const result = adapter.evaluateCandidate('BTCUSD', 'short', 90);

    expect(result.allowed).toBe(true);
    expect(result.macroGateMultiplier).toBe(1);
    expect(result.begonyaScore).toBe(90);
    expect(result.scoreTier).toBe('A+');
    // Taban risk 1.00 * 0.25 makro çarpanı = 0.25x
    expect(result.riskMultiplier).toBe(0.25);
    expect(result.capitalPreservationMode).toBe(true);
    expect(result.gateStatusMessage).toContain('DOĞRU ORANTILI MAKRO İŞLEM');
    expect(result.gateStatusMessage).toContain('0.25x Lot');
  });

  it('13. DOĞRU ORANTILILIK KURALI: Sermaye koruma modunda makroya zıt yön VETO edilir', () => {
    writeMockGate({
      capital_preservation_mode: true,
      recommended_risk_multiplier: 0.25,
      execution_bias_gates: { BTC: 'SHORT_ONLY' },
      asset_biases: { BTC: 'Bearish' }
    });
    const adapter = MacroGateAdapter.getInstance();
    // BTC Short iken gelen Long sinyali
    const result = adapter.evaluateCandidate('BTCUSD', 'long', 92);

    expect(result.allowed).toBe(false);
    expect(result.macroGateMultiplier).toBe(0);
    expect(result.action).toBe('VETO');
  });

  it('14. NÖTR VARLIK VETO KURALI: Makro yönü nötr olan varlıklar arkasında rüzgar olmadığı için VETO edilir', () => {
    writeMockGate({
      execution_bias_gates: { EURUSD: 'NEUTRAL_RANGE' },
      asset_biases: { EURUSD: 'Neutral' }
    });
    const adapter = MacroGateAdapter.getInstance();
    const resultLong = adapter.evaluateCandidate('EURUSD', 'long', 88);
    const resultShort = adapter.evaluateCandidate('EURUSD', 'short', 88);

    expect(resultLong.allowed).toBe(false);
    expect(resultLong.action).toBe('VETO');
    expect(resultLong.gateStatusMessage).toContain('nötr / yönsüzdür');

    expect(resultShort.allowed).toBe(false);
    expect(resultShort.action).toBe('VETO');
    expect(resultShort.gateStatusMessage).toContain('nötr / yönsüzdür');
  });

  it('15. AUDCAD SENTETİK ÇAPRAZ SHORT ONAYI: Petrol yüksek (CAD güçlü) ve Maden durgun (AUD zayıf) iken AUDCAD SHORT onaylanır, LONG veto edilir', () => {
    writeMockGate({
      regime_state: {
        brent_level: 105.0,
        brent_pct_60d: 90.0,
        copper_gold_delta_4w_pct: 0.1,
      },
      recommended_risk_multiplier: 0.25,
      capital_preservation_mode: false,
    });
    const adapter = MacroGateAdapter.getInstance();
    
    // AUDCAD Short: Onaylanmalı
    const shortRes = adapter.evaluateCandidate('AUDCAD', 'short', 85);
    expect(shortRes.allowed).toBe(true);
    expect(shortRes.macroGateMultiplier).toBe(1);
    expect(shortRes.action).toBe('PROCEED');
    expect(shortRes.macroBias).toBe('SHORT');
    expect(shortRes.gateStatusMessage).toContain('Sentetik Çapraz');

    // AUDCAD Long: Zıt yön VETO edilmeli
    const longRes = adapter.evaluateCandidate('AUDCAD', 'long', 85);
    expect(longRes.allowed).toBe(false);
    expect(longRes.macroGateMultiplier).toBe(0);
    expect(longRes.action).toBe('VETO');
    expect(longRes.gateStatusMessage).toContain('SHORT_ONLY iken LONG Açılamaz');
  });

  it('16. AUDCAD DENGELİ SENTETİK ÇAPRAZ NÖTR VETO: Emtialar dengeliyken yönsüz olduğu için işlem engellenir', () => {
    writeMockGate({
      regime_state: {
        brent_level: 78.0,
        brent_pct_60d: 50.0,
        copper_gold_delta_4w_pct: 0.2, // Her iki taraf da nötr
      },
    });
    const adapter = MacroGateAdapter.getInstance();
    const result = adapter.evaluateCandidate('AUDCAD', 'short', 80);
    expect(result.allowed).toBe(false);
    expect(result.action).toBe('VETO');
    expect(result.gateStatusMessage).toContain('nötr / yönsüzdür');
  });

  it('17. SOL/BTC GÖRELİ GÜÇ VETO: BTC Long olsa bile SOL/BTC momentum negatifse SOL Long VETO edilir', () => {
    writeMockGate({
      execution_bias_gates: { BTC: 'LONG_ONLY' },
      regime_state: {
        sol_btc_roc_5d: -3.5,
        sol_btc_structure_bullish: false,
      },
      btc_decoupling_active: false,
    });
    const adapter = MacroGateAdapter.getInstance();
    const result = adapter.evaluateCandidate('SOLUSD', 'long', 88);
    expect(result.allowed).toBe(false);
    expect(result.action).toBe('VETO');
    expect(result.gateStatusMessage).toContain('SOL/BTC momentumu negatif');
  });

  it('18. SOL/BTC GÖRELİ GÜÇ ONAY: BTC Long ve SOL/BTC momentum pozitifse SOL Long onaylanır', () => {
    writeMockGate({
      execution_bias_gates: { BTC: 'LONG_ONLY', SOL: 'LONG_ONLY' },
      regime_state: {
        sol_btc_roc_5d: 4.8,
        sol_btc_structure_bullish: true,
      },
      btc_decoupling_active: false,
    });
    const adapter = MacroGateAdapter.getInstance();
    const result = adapter.evaluateCandidate('SOLUSD', 'long', 88);
    expect(result.allowed).toBe(true);
    expect(result.macroGateMultiplier).toBe(1);
    expect(result.action).toBe('PROCEED');
  });

  it('19. NZDCAD MANDIRA (GDT) AYRIŞMASI: Süt endeksi pozitif ve petrol zayıfken NZDCAD LONG onaylanır', () => {
    writeMockGate({
      regime_state: {
        dairy_gdt_roc_20d: 5.2,
        brent_roc_20d: -4.5,
        spread_ca_us_2y_delta_5d: -6.0,
        vix_level: 14.5,
      },
    });
    const adapter = MacroGateAdapter.getInstance();
    const result = adapter.evaluateCandidate('NZDCAD', 'long', 82);
    expect(result.allowed).toBe(true);
    expect(result.macroGateMultiplier).toBe(1);
    expect(result.action).toBe('PROCEED');
    expect(result.macroBias).toBe('LONG');
    expect(result.gateStatusMessage).toContain('Sentetik Çapraz');
  });

  it('20. NZD GDT BAYAT VERİ (STALE DATA) KORUMASI: Süt yatayken AU-NZ 2Y spread daralması NZDCAD LONG onaylar', () => {
    writeMockGate({
      regime_state: {
        dairy_gdt_roc_20d: 0.0, // 14 günlük sabit pencere
        spread_au_nz_2y_delta_5d: -6.0, // NZ faizi AU'dan daha hızlı arttı (> 3 bps filtre)
        brent_roc_20d: -4.5,
        spread_ca_us_2y_delta_5d: -6.0,
        vix_level: 14.5,
      },
    });
    const adapter = MacroGateAdapter.getInstance();
    const result = adapter.evaluateCandidate('NZDCAD', 'long', 82);
    expect(result.allowed).toBe(true);
    expect(result.macroGateMultiplier).toBe(1);
    expect(result.action).toBe('PROCEED');
    expect(result.macroBias).toBe('LONG');
    expect(result.gateStatusMessage).toContain('AU-NZ 2Y Makası');
  });

  it('21. SOL/BTC 4H SWING LOW CHoCH KORUMASI: 5G RoC pozitif olsa dahi 4H dip kırılınca SOL Long VETO edilir', () => {
    writeMockGate({
      execution_bias_gates: { BTC: 'LONG_ONLY', SOL: 'LONG_ONLY' },
      regime_state: {
        sol_btc_roc_5d: 6.2,
        sol_btc_structure_bullish: true,
        sol_btc_4h_structure_broken: true, // 4H Market Structure Shift / CHoCH kırıldı!
      },
      btc_decoupling_active: false,
    });
    const adapter = MacroGateAdapter.getInstance();
    const result = adapter.evaluateCandidate('SOLUSD', 'long', 88);
    expect(result.allowed).toBe(false);
    expect(result.action).toBe('VETO');
    expect(result.gateStatusMessage).toContain('CHoCH');
  });

  it('22. KIRMIZI BÜLTEN DEVRE KESİCİSİ (±15 DAKİKA DONDURMA): Event freeze aktifken tüm adaylar VETO edilir', () => {
    writeMockGate({
      execution_bias_gates: { EURUSD: 'LONG_ONLY' },
      regime_state: {
        event_freeze_active: true,
        active_event_info: 'ABD Çekirdek TÜFE (Core CPI) (T-5 dk)',
      },
    });
    const adapter = MacroGateAdapter.getInstance();
    const result = adapter.evaluateCandidate('EURUSD', 'long', 92);
    expect(result.allowed).toBe(false);
    expect(result.action).toBe('VETO');
    expect(result.gateStatusMessage).toContain('Event Freeze');
  });

  it('23. USDCAD MAJÖR ONAYI: USD güçlü (+1) ve CAD zayıf (-1) iken USDCAD LONG onaylanır', () => {
    writeMockGate({
      regime_state: {
        cross_currency_scores: { USD: 1, CAD: -1 },
      },
    });
    const adapter = MacroGateAdapter.getInstance();
    const result = adapter.evaluateCandidate('USDCAD', 'long', 85);
    expect(result.allowed).toBe(true);
    expect(result.action).toBe('PROCEED');
    expect(result.macroBias).toBe('LONG');
    expect(result.gateStatusMessage).toContain('SENTETİK ÇAPRAZ');
  });

  it('24. USDJPY MAJÖR CARRY ONAYI: USD güçlü (+1) ve JPY zayıf (-1) iken USDJPY LONG onaylanır', () => {
    writeMockGate({
      regime_state: {
        cross_currency_scores: { USD: 1, JPY: -1 },
      },
    });
    const adapter = MacroGateAdapter.getInstance();
    const result = adapter.evaluateCandidate('USDJPY', 'long', 88);
    expect(result.allowed).toBe(true);
    expect(result.action).toBe('PROCEED');
    expect(result.macroBias).toBe('LONG');
  });

  it('25. PORTFÖY KORELASYON KALKANI - DOLAR TAVANI: 2 adet USD-Long aktifken 3. USD-Long VETO edilir', () => {
    writeMockGate({
      regime_state: {
        cross_currency_scores: { USD: 1, EUR: -1, GBP: -1, CAD: -1 },
      },
    });
    const adapter = MacroGateAdapter.getInstance();
    // 2 aktif USD-Long pozisyonu: EURUSD SHORT (= USD LONG) ve GBPUSD SHORT (= USD LONG)
    const activePositions: Array<{ symbol: string; tradeDirection: 'long' | 'short' }> = [
      { symbol: 'EURUSD', tradeDirection: 'short' },
      { symbol: 'GBPUSD', tradeDirection: 'short' },
    ];
    // 3. USD-Long adayı: USDCAD LONG (= USD LONG)
    const result = adapter.evaluateCandidate('USDCAD', 'long', 90, activePositions);
    expect(result.allowed).toBe(false);
    expect(result.action).toBe('VETO');
    expect(result.gateStatusMessage).toContain('PORTFOLIO_EXPOSURE_CAP');
    expect(result.gateStatusMessage).toContain('Dolar');
  });

  it('26. PORTFÖY KORELASYON KALKANI - JPY SHORT TAVANI: 2 adet JPY-Short aktifken 3. JPY-Short VETO edilir', () => {
    writeMockGate({
      regime_state: {
        cross_currency_scores: { CAD: 1, AUD: 1, GBP: 1, JPY: -1 },
      },
    });
    const adapter = MacroGateAdapter.getInstance();
    // 2 aktif JPY-Short pozisyonu: CADJPY LONG ve AUDJPY LONG
    const activePositions: Array<{ symbol: string; tradeDirection: 'long' | 'short' }> = [
      { symbol: 'CADJPY', tradeDirection: 'long' },
      { symbol: 'AUDJPY', tradeDirection: 'long' },
    ];
    // 3. JPY-Short adayı: GBPJPY LONG
    const result = adapter.evaluateCandidate('GBPJPY', 'long', 88, activePositions);
    expect(result.allowed).toBe(false);
    expect(result.action).toBe('VETO');
    expect(result.gateStatusMessage).toContain('PORTFOLIO_EXPOSURE_CAP');
    expect(result.gateStatusMessage).toContain('JPY-Short');
  });

  it('27. PORTFÖY KORELASYON KALKANI - KRİPTO TAVANI: BTC Long aktifken SOL Long VETO edilir', () => {
    writeMockGate({
      execution_bias_gates: { BTC: 'LONG_ONLY', SOL: 'LONG_ONLY' },
      regime_state: {
        sol_btc_roc_5d: 5.0,
        sol_btc_structure_bullish: true,
      },
      btc_decoupling_active: false,
    });
    const adapter = MacroGateAdapter.getInstance();
    // 1 aktif Kripto pozisyonu: BTCUSD LONG
    const activePositions: Array<{ symbol: string; tradeDirection: 'long' | 'short' }> = [
      { symbol: 'BTCUSD', tradeDirection: 'long' },
    ];
    // 2. Kripto adayı: SOLUSD LONG
    const result = adapter.evaluateCandidate('SOLUSD', 'long', 92, activePositions);
    expect(result.allowed).toBe(false);
    expect(result.action).toBe('VETO');
    expect(result.gateStatusMessage).toContain('PORTFOLIO_EXPOSURE_CAP');
    expect(result.gateStatusMessage).toContain('Kripto');
  });
});


