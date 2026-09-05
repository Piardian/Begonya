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

  it('1. XAUUSD SHORT YASAĞI: Mali hakimiyet çağında altında short kesinlikle kilitlenir (G_macro = 0)', () => {
    writeMockGate({
      execution_bias_gates: { XAUUSD: 'LONG_ONLY' }
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
      regime_state: { vix_pct_60d: 88.0 }
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
      execution_bias_gates: { BTC: 'SHORT_ONLY' }
    });
    const adapter = MacroGateAdapter.getInstance();
    const result = adapter.evaluateCandidate('BTCUSD', 'long', 90);

    expect(result.allowed).toBe(false);
    expect(result.macroGateMultiplier).toBe(0);
    expect(result.begonyaScore).toBe(0);
    expect(result.gateStatusMessage).toContain('Margin Call');
  });
});
