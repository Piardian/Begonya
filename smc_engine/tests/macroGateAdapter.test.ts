import { MacroGateAdapter, MacroGatePayload } from '../server/macroGateAdapter';
import * as fs from 'fs';
import * as path from 'path';

describe('Begonya Macro Gate & 1-100 Confluence Scoring Tests', () => {
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
      timestamp: '2026-09-05 08:30:00',
      primary_regime: 'Late-Cycle Overheating',
      volatility_risk_score: 0.40,
      capital_preservation_mode: false,
      btc_decoupling_active: false,
      recommended_risk_multiplier: 1.0,
      execution_bias_gates: {
        XAUUSD: 'LONG_ONLY',
        BTC: 'SHORT_ONLY',
        EURUSD: 'NEUTRAL_RANGE',
        SPX: 'SHORT_ONLY'
      },
      asset_biases: {
        XAUUSD: 'Strong Bullish',
        BTC: 'Bearish',
        EURUSD: 'Neutral',
        SPX: 'Bearish'
      },
      macro_rationale: 'Test mock rationale',
      ...payload
    };
    fs.writeFileSync(sharedGatePath, JSON.stringify(fullPayload, null, 2), 'utf-8');
  }

  it('assigns Tier A+ (85-100) and 1.0x risk to Long on XAUUSD when Macro Gate is LONG_ONLY', () => {
    writeMockGate({
      execution_bias_gates: { XAUUSD: 'LONG_ONLY' }
    });
    const adapter = MacroGateAdapter.getInstance();
    const result = adapter.evaluateCandidate('XAUUSD', 'long', 90);

    expect(result.allowed).toBe(true);
    expect(result.action).toBe('PROCEED');
    expect(result.scoreTier).toBe('A+');
    expect(result.begonyaScore).toBeGreaterThanOrEqual(85);
    expect(result.riskMultiplier).toBe(1.00);
  });

  it('assigns high score and PROCEED to Short on BTCUSD during Bear Steepening decoupling', () => {
    writeMockGate({
      btc_decoupling_active: true,
      execution_bias_gates: { BTC: 'SHORT_ONLY' }
    });
    const adapter = MacroGateAdapter.getInstance();
    const result = adapter.evaluateCandidate('BTCUSD', 'short', 85);

    expect(result.allowed).toBe(true);
    expect(result.action).toBe('PROCEED');
    expect(result.scoreTier).toBe('A+');
    expect(result.begonyaScore).toBeGreaterThanOrEqual(85);
    expect(result.riskMultiplier).toBe(1.00);
    expect(result.gateStatusMessage).toContain('1.00x');
  });

  it('penalizes Long on BTCUSD during Bear Steepening decoupling with Tier C/D and 0.15x risk', () => {
    writeMockGate({
      btc_decoupling_active: true,
      execution_bias_gates: { BTC: 'SHORT_ONLY' }
    });
    const adapter = MacroGateAdapter.getInstance();
    const result = adapter.evaluateCandidate('BTCUSD', 'long', 70);

    expect(result.allowed).toBe(true); // Artık katı veto yok; düşük puan ve düşük risk ile uyarır!
    expect(result.action).toBe('DEFENSIVE_REDUCE');
    expect(result.scoreTier).toBe('C');
    expect(result.begonyaScore).toBeLessThan(50);
    expect(result.riskMultiplier).toBeLessThanOrEqual(0.20);
  });

  it('handles NEUTRAL_RANGE with controlled risk and Tier B', () => {
    writeMockGate({
      execution_bias_gates: { EURUSD: 'NEUTRAL_RANGE' }
    });
    const adapter = MacroGateAdapter.getInstance();
    const result = adapter.evaluateCandidate('EURUSD', 'long', 70);

    expect(result.allowed).toBe(true);
    expect(result.scoreTier).toBe('B');
    expect(result.begonyaScore).toBeGreaterThanOrEqual(65);
  });

  it('triggers Nuclear Emergency Circuit Breaker (VETO) when capital_preservation_mode is true', () => {
    writeMockGate({
      capital_preservation_mode: true,
      volatility_risk_score: 0.98
    });
    const adapter = MacroGateAdapter.getInstance();
    const result = adapter.evaluateCandidate('XAUUSD', 'long', 95);

    expect(result.allowed).toBe(false);
    expect(result.action).toBe('VETO');
    expect(result.riskMultiplier).toBe(0.0);
    expect(result.begonyaScore).toBeLessThanOrEqual(10);
    expect(result.gateStatusMessage).toContain('Sermaye Koruma Kalkanı');
  });

  it('correctly maps NAS100 to SPX and evaluates Short direction', () => {
    writeMockGate({
      execution_bias_gates: { SPX: 'SHORT_ONLY' }
    });
    const adapter = MacroGateAdapter.getInstance();
    const resultShort = adapter.evaluateCandidate('NAS100', 'short', 85);
    const resultLong = adapter.evaluateCandidate('NAS100', 'long', 70);

    expect(resultShort.mappedMacroKey).toBe('SPX');
    expect(resultShort.begonyaScore).toBeGreaterThan(resultLong.begonyaScore);
    expect(resultShort.scoreTier).toBe('A+');
    expect(resultLong.scoreTier).toBe('C');
  });
});
