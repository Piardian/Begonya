import { parseUserTradeInput } from '../scripts/auditTrade';

describe('auditTrade user input parser', () => {
  test('parses simple Turkish trade outcome string', () => {
    const res = parseUserTradeInput('EURJPY 2 Ekim 2026 2R TP');
    expect(res.symbol).toBe('EURJPY');
    expect(res.dateStr).toBe('2026-10-02');
    expect(res.outcome).toBe('WIN');
    expect(res.realizedR).toBe(2.0);
  });

  test('parses stop loss trade string with negative R', () => {
    const res = parseUserTradeInput('BTCUSD 2 Ekim SAT -1R Stop');
    expect(res.symbol).toBe('BTCUSD');
    expect(res.dateStr).toBe('2026-10-02');
    expect(res.direction).toBe('SHORT');
    expect(res.outcome).toBe('LOSS');
    expect(res.realizedR).toBe(-1.0);
  });

  test('parses Break Even trade string', () => {
    const res = parseUserTradeInput('SOLUSD 3 Ekim AL BE korundu');
    expect(res.symbol).toBe('SOLUSD');
    expect(res.direction).toBe('LONG');
    expect(res.outcome).toBe('BREAK_EVEN');
    expect(res.realizedR).toBe(0.0);
  });

  test('parses 4R runner trade string', () => {
    const res = parseUserTradeInput('NZDCHF 1 Ekim 4.5R TP aldım');
    expect(res.symbol).toBe('NZDCHF');
    expect(res.outcome).toBe('WIN');
    expect(res.realizedR).toBe(4.5);
  });
});
