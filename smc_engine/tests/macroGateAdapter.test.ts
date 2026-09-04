import { MacroGateAdapter, MacroGatePayload } from '../server/macroGateAdapter';
import * as fs from 'fs';
import * as path from 'path';

describe('Begonya Macro Gate Adapter Confluence Tests', () => {
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
      timestamp: '2026-09-04 23:00:00',
      primary_regime: 'Late-Cycle Overheating',
      volatility_risk_score: 0.40,
      capital_preservation_mode: false,
      btc_decoupling_active: false,
      recommended_risk_multiplier: 1.0,
      execution_bias_gates: {
        XAUUSD: 'LONG_ONLY',
        BTC: 'LONG_ONLY',
        EURUSD: 'NEUTRAL_RANGE',
        SPX: 'SHORT_ONLY'
      },
      asset_biases: {
        XAUUSD: 'Strong Bullish',
        BTC: 'Bullish',
        EURUSD: 'Neutral',
        SPX: 'Bearish'
      },
      macro_rationale: 'Test mock rationale',
      ...payload
    };
    fs.writeFileSync(sharedGatePath, JSON.stringify(fullPayload, null, 2), 'utf-8');
  }

  it('allows Long on XAUUSD when Macro Gate is LONG_ONLY', () => {
    writeMockGate({
      execution_bias_gates: { XAUUSD: 'LONG_ONLY' }
    });
    const adapter = MacroGateAdapter.getInstance();
    const result = adapter.evaluateCandidate('XAUUSD', 'long');

    expect(result.allowed).toBe(true);
    expect(result.action).toBe('PROCEED');
    expect(result.macroBias).toBe('LONG_ONLY');
    expect(result.riskMultiplier).toBe(1.0);
  });

  it('vetoes Short on XAUUSD when Macro Gate is LONG_ONLY', () => {
    writeMockGate({
      execution_bias_gates: { XAUUSD: 'LONG_ONLY' }
    });
    const adapter = MacroGateAdapter.getInstance();
    const result = adapter.evaluateCandidate('XAUUSD', 'short');

    expect(result.allowed).toBe(false);
    expect(result.action).toBe('VETO');
    expect(result.riskMultiplier).toBe(0.0);
    expect(result.gateStatusMessage).toContain('VETO');
  });

  it('vetoes Long on EURUSD when Macro Gate is SHORT_ONLY', () => {
    writeMockGate({
      execution_bias_gates: { EURUSD: 'SHORT_ONLY' }
    });
    const adapter = MacroGateAdapter.getInstance();
    const result = adapter.evaluateCandidate('EURUSD', 'long');

    expect(result.allowed).toBe(false);
    expect(result.action).toBe('VETO');
  });

  it('allows NEUTRAL_RANGE with caution and reduced risk', () => {
    writeMockGate({
      execution_bias_gates: { EURUSD: 'NEUTRAL_RANGE' },
      recommended_risk_multiplier: 1.0
    });
    const adapter = MacroGateAdapter.getInstance();
    const result = adapter.evaluateCandidate('EURUSD', 'long');

    expect(result.allowed).toBe(true);
    expect(result.action).toBe('NEUTRAL_CAUTION');
    expect(result.riskMultiplier).toBeLessThanOrEqual(0.75);
  });

  it('vetoes Long on BTCUSD when btc_decoupling_active is true', () => {
    writeMockGate({
      btc_decoupling_active: true,
      execution_bias_gates: { BTC: 'DEFENSIVE_HOLD' }
    });
    const adapter = MacroGateAdapter.getInstance();
    const result = adapter.evaluateCandidate('BTCUSD', 'long');

    expect(result.allowed).toBe(false);
    expect(result.action).toBe('VETO');
    expect(result.gateStatusMessage).toContain('BTC Decoupling');
  });

  it('vetoes all trades when capital_preservation_mode is true', () => {
    writeMockGate({
      capital_preservation_mode: true,
      volatility_risk_score: 0.95
    });
    const adapter = MacroGateAdapter.getInstance();
    const result = adapter.evaluateCandidate('XAUUSD', 'long');

    expect(result.allowed).toBe(false);
    expect(result.action).toBe('VETO');
    expect(result.riskMultiplier).toBe(0.0);
    expect(result.gateStatusMessage).toContain('Sermaye Koruma Modu');
  });

  it('maps NAS100 to SPX macro key correctly', () => {
    writeMockGate({
      execution_bias_gates: { SPX: 'SHORT_ONLY' }
    });
    const adapter = MacroGateAdapter.getInstance();
    const resultLong = adapter.evaluateCandidate('NAS100', 'long');
    const resultShort = adapter.evaluateCandidate('NAS100', 'short');

    expect(resultLong.allowed).toBe(false);
    expect(resultLong.mappedMacroKey).toBe('SPX');
    expect(resultShort.allowed).toBe(true);
    expect(resultShort.mappedMacroKey).toBe('SPX');
  });
});
