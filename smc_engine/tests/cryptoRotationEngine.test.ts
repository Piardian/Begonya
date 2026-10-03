import * as fs from 'fs';
import * as path from 'path';
import {
  CRYPTO_ROTATION_UNIVERSE_META,
  evaluateCryptoRotationSnapshot,
  RawBar,
  RawOiPoint,
  RawRotationSnapshot,
} from '../server/cryptoRotationEngine';
import { MacroGateAdapter, MacroGatePayload } from '../server/macroGateAdapter';
import { ALL_SYMBOLS, isOnDemandAltcoinSymbol, ON_DEMAND_ALTCOIN_UNIVERSE } from '../server/universe';
import { detectAssetClass, getDecimalPrecision } from '../src/assetMetrics';

function makeBars(baseClose: number, change4hPct: number, change24hPct: number, rvol: number, count = 35): RawBar[] {
  const bars: RawBar[] = [];
  const startPrice = baseClose / (1.0 + change24hPct / 100.0);
  const price4hAgo = baseClose / (1.0 + change4hPct / 100.0);
  for (let i = 0; i < count; i++) {
    let c = startPrice;
    let qv = 1000.0;
    if (i === count - 1) {
      c = baseClose;
      qv = 1000.0 * rvol;
    } else if (i === count - 2) {
      c = (baseClose + price4hAgo) / 2.0;
      qv = 1000.0 * rvol;
    } else if (i === count - 5) {
      c = price4hAgo;
      qv = 1000.0;
    }
    bars.push({ open: c, high: c * 1.002, low: c * 0.998, close: c, quote_volume: qv });
  }
  return bars;
}

function makeOiHist(change4hPct: number, change24hPct: number): RawOiPoint[] {
  const baseOi = 100_000.0;
  const oi4hAgo = baseOi * (1.0 + (change24hPct - change4hPct) / 100.0);
  const oiNow = oi4hAgo * (1.0 + change4hPct / 100.0);
  const hist: RawOiPoint[] = [];
  for (let i = 0; i < 10; i++) {
    let val = baseOi;
    if (i === 5) val = oi4hAgo;
    else if (i === 9) val = oiNow;
    hist.push({ sum_open_interest: val, sum_open_interest_value: val * 10.0 });
  }
  return hist;
}

function setCoin(
  snap: RawRotationSnapshot,
  sym: string,
  opts: {
    chg24: number;
    chg4: number;
    rvol: number;
    oi4?: number;
    oi24?: number;
    fundingPct?: number;
    spotVol?: number;
    futVol?: number;
  }
) {
  const meta = CRYPTO_ROTATION_UNIVERSE_META[sym];
  snap.coins[sym] = {
    coin: sym,
    spot_symbol: meta.spotSymbol,
    futures_symbol: meta.futuresSymbol,
    smc_symbol: meta.smcSymbol,
    layer: meta.layer,
    layer_name: meta.layerName,
    sector: meta.sector,
    spot_last_price: 100.0,
    spot_price_change_24h_pct: opts.chg24,
    spot_quote_volume_24h: opts.spotVol ?? 50_000_000.0,
    futures_quote_volume_24h: opts.futVol ?? 100_000_000.0,
    funding_rate: (opts.fundingPct ?? 0.01) / 100.0,
    bars_1h: makeBars(100.0, opts.chg4, opts.chg24, opts.rvol),
    bars_4h: makeBars(100.0, opts.chg4, opts.chg24, opts.rvol),
    oi_history_1h: makeOiHist(opts.oi4 ?? 1.0, opts.oi24 ?? 2.0),
    deep_fetched: true,
  };
}

function buildBaseSnapshot(
  btcChange24h = 2.0,
  ethChange24h = 3.5,
  btcdomChange4h = -0.35,
  btcdomChange24h = -0.80
): RawRotationSnapshot {
  const coins: RawRotationSnapshot['coins'] = {};
  for (const [sym, meta] of Object.entries(CRYPTO_ROTATION_UNIVERSE_META)) {
    coins[sym] = {
      coin: sym,
      spot_symbol: meta.spotSymbol,
      futures_symbol: meta.futuresSymbol,
      smc_symbol: meta.smcSymbol,
      layer: meta.layer,
      layer_name: meta.layerName,
      sector: meta.sector,
      spot_last_price: 10.0,
      spot_price_change_24h_pct: 1.0,
      spot_quote_volume_24h: 50_000_000.0,
      futures_quote_volume_24h: 100_000_000.0,
      funding_rate: 0.0001,
      bars_1h: [],
      bars_4h: [],
      oi_history_1h: [],
      deep_fetched: false,
    };
  }
  const snap: RawRotationSnapshot = {
    status: 'AVAILABLE',
    btc_dominance: {
      btc_dominance_pct: 56.4,
      btcdom_change_24h_pct: btcdomChange24h,
      btcdom_change_4h_pct: btcdomChange4h,
    },
    coins,
  };
  setCoin(snap, 'BTC', { chg24: btcChange24h, chg4: btcChange24h * 0.4, rvol: 1.35, oi4: 2.0, oi24: 4.0 });
  setCoin(snap, 'ETH', { chg24: ethChange24h, chg4: ethChange24h * 0.45, rvol: 1.45, oi4: 2.5, oi24: 5.0 });
  return snap;
}

describe('8-Factor Crypto Rotation & On-Demand SMC Engine Bridge', () => {
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

  it('1. ON-DEMAND UNIVERSE ISOLATION: 35 altcoins are excluded from continuous ALL_SYMBOLS polling to protect API quota', () => {
    expect(ON_DEMAND_ALTCOIN_UNIVERSE.length).toBe(35);
    for (const sym of ON_DEMAND_ALTCOIN_UNIVERSE) {
      expect((ALL_SYMBOLS as readonly string[]).includes(sym)).toBe(false);
      expect(isOnDemandAltcoinSymbol(sym)).toBe(true);
      expect(detectAssetClass(sym)).toBe('CRYPTO');
    }
    expect(getDecimalPrecision('PEPEUSD')).toBe(8);
    expect(getDecimalPrecision('CHZUSD')).toBe(4);
    expect(getDecimalPrecision('TAOUSD')).toBe(2);
  });

  it('2. ORGANIC SECTOR ROTATION & SECTOR DIVERSIFICATION: Approves top 3 sector-diversified leaders (TAOUSD, SOLUSD, RENDERUSD) for On-Demand SMC execution', () => {
    const snap = buildBaseSnapshot(2.0, 3.6);
    for (const l2 of ['SOL', 'AVAX', 'SUI', 'NEAR', 'APT']) {
      setCoin(snap, l2, { chg24: 4.2, chg4: 1.8, rvol: 1.45, oi4: 2.5, oi24: 5.0 });
    }
    setCoin(snap, 'TAO', { chg24: 8.2, chg4: 2.4, rvol: 2.6, oi4: 4.2, fundingPct: 0.012 });
    setCoin(snap, 'RENDER', { chg24: 7.4, chg4: 2.1, rvol: 2.4, oi4: 3.8, fundingPct: 0.010 });
    setCoin(snap, 'FET', { chg24: 5.9, chg4: 1.8, rvol: 1.8, oi4: 3.0, fundingPct: 0.011 });
    setCoin(snap, 'WLD', { chg24: 5.1, chg4: 1.6, rvol: 1.5, oi4: 2.2, fundingPct: 0.009 });
    setCoin(snap, 'ARKM', { chg24: 4.6, chg4: 1.5, rvol: 1.4, oi4: 2.0, fundingPct: 0.008 });

    const report = evaluateCryptoRotationSnapshot(snap, 'LONG_ONLY', { maxOnDemandTargets: 3 });
    expect(report.btc_dominance_panel.dominance_regime).toBe('ALT_CAPITAL_DISPERSION');
    expect(report.coin_assessments.TAO.rotation_gate).toBe('LONG_ONLY');
    expect(report.coin_assessments.TAO.active_rotation_score).toBeGreaterThanOrEqual(65);
    expect(report.on_demand_smc_targets.length).toBe(3);
    expect(report.on_demand_smc_targets.map(t => t.smc_symbol)).toEqual(['TAOUSD', 'SOLUSD', 'RENDERUSD']);
  });

  it('3. DASH & LTC SHORT-SQUEEZE SHIELD: Blocks shorting altcoins that outperform BTC with volume & negative funding even when Macro is SHORT_ONLY', () => {
    const snap = buildBaseSnapshot(-1.2, -1.8, 0.2, 0.5);
    setCoin(snap, 'LTC', { chg24: 4.5, chg4: 2.2, rvol: 2.1, oi4: 6.4, oi24: 10.0, fundingPct: -0.025 });
    setCoin(snap, 'DASH', { chg24: 2.8, chg4: 1.4, rvol: 1.65, oi4: 2.8, oi24: 5.0, fundingPct: -0.010 });

    const report = evaluateCryptoRotationSnapshot(snap, 'SHORT_ONLY');
    expect(report.coin_assessments.LTC.rotation_gate).toBe('NEUTRAL_RANGE');
    expect(report.coin_assessments.DASH.rotation_gate).toBe('NEUTRAL_RANGE');

    const fullPayload: MacroGatePayload = {
      timestamp: '2026-09-28 08:30:00',
      primary_regime: 'Stagflation Risk',
      volatility_risk_score: 0.45,
      capital_preservation_mode: false,
      btc_decoupling_active: false,
      recommended_risk_multiplier: 0.5,
      execution_bias_gates: { BTC: 'SHORT_ONLY' },
      crypto_rotation: report,
    };
    fs.writeFileSync(sharedGatePath, JSON.stringify(fullPayload, null, 2), 'utf-8');

    const adapter = MacroGateAdapter.getInstance();
    const ltcShortEval = adapter.evaluateCandidate('LTCUSD', 'short', 90);
    const dashShortEval = adapter.evaluateCandidate('DASHUSD', 'short', 90);

    expect(ltcShortEval.allowed).toBe(false);
    expect(ltcShortEval.action).toBe('VETO');
    expect(ltcShortEval.gateStatusMessage).toContain('CRYPTO_SHORT_SQUEEZE_SHIELD');

    expect(dashShortEval.allowed).toBe(false);
    expect(dashShortEval.action).toBe('VETO');
    expect(dashShortEval.gateStatusMessage).toContain('CRYPTO_SHORT_SQUEEZE_SHIELD');
  });

  it('4. LEVERAGE SQUEEZE TRAP & SINGLE-COIN OUTLIER VETO: Vetoes dry-spot futures squeezes and lone movers without sector breadth', () => {
    const snap = buildBaseSnapshot(1.5, 2.5);
    // CHZ moves alone in DEFI_GAMING_MIDCAP
    setCoin(snap, 'CHZ', { chg24: 8.0, chg4: 3.0, rvol: 2.4, oi4: 4.0, oi24: 7.0, fundingPct: 0.01 });

    const report = evaluateCryptoRotationSnapshot(snap, 'LONG_ONLY');
    expect(report.coin_assessments.CHZ.is_single_coin_outlier).toBe(true);
    expect(report.coin_assessments.CHZ.rotation_gate).toBe('NEUTRAL_RANGE');
    expect(report.coin_assessments.CHZ.veto_reasons_long.some(r => r.includes('NO_SECTOR_BREADTH'))).toBe(true);
  });

  it('5. WEEKEND LIQUIDITY TRAP SHIELD: Vetoes low-volume weekend chop (RVOL < 1.15x or Score < 75) and applies 50% risk discount on approved momentum', () => {
    const snap = buildBaseSnapshot(2.0, 3.6);
    // SOL with moderate stats (score ~70, rvol 1.05x)
    setCoin(snap, 'SOL', { chg24: 3.5, chg4: 1.2, rvol: 1.05, oi4: 1.0, oi24: 2.0 });
    // AI Sector peers so TAO has sector breadth and high momentum (score >= 75, rvol >= 1.5x)
    setCoin(snap, 'TAO', { chg24: 8.5, chg4: 2.8, rvol: 2.2, oi4: 4.5, oi24: 8.0, fundingPct: 0.012 });
    setCoin(snap, 'RENDER', { chg24: 7.4, chg4: 2.1, rvol: 2.4, oi4: 3.8, fundingPct: 0.010 });
    setCoin(snap, 'FET', { chg24: 5.9, chg4: 1.8, rvol: 1.8, oi4: 3.0, fundingPct: 0.011 });
    setCoin(snap, 'WLD', { chg24: 5.1, chg4: 1.6, rvol: 1.5, oi4: 2.2, fundingPct: 0.009 });
    setCoin(snap, 'ARKM', { chg24: 4.6, chg4: 1.5, rvol: 1.4, oi4: 2.0, fundingPct: 0.008 });

    const report = evaluateCryptoRotationSnapshot(snap, 'LONG_ONLY');

    const weekendPayload: MacroGatePayload = {
      timestamp: '2026-10-04 12:00:00',
      primary_regime: 'Bullish Expansion',
      volatility_risk_score: 0.30,
      capital_preservation_mode: false,
      btc_decoupling_active: false,
      recommended_risk_multiplier: 1.0,
      execution_bias_gates: { BTC: 'LONG_ONLY' },
      regime_state: {
        is_weekend_utc: true,
      },
      crypto_rotation: report,
    };
    fs.writeFileSync(sharedGatePath, JSON.stringify(weekendPayload, null, 2), 'utf-8');

    const adapter = MacroGateAdapter.getInstance();

    // A) Moderate SOL should be vetoed because of weekend liquidity trap shield (RVOL < 1.15 or Score < 75)
    const solEval = adapter.evaluateCandidate('SOLUSD', 'long', 85);
    expect(solEval.allowed).toBe(false);
    expect(solEval.action).toBe('VETO');
    expect(solEval.gateStatusMessage).toContain('CRYPTO_WEEKEND_LOW_LIQUIDITY');

    // B) High momentum TAO should pass with 50% risk discount
    const taoEval = adapter.evaluateCandidate('TAOUSD', 'long', 90);
    expect(taoEval.allowed).toBe(true);
    expect(taoEval.action).toBe('PROCEED');
    expect(taoEval.riskMultiplier).toBe(0.50);
    expect(taoEval.gateStatusMessage).toContain('Hafta Sonu Kripto Koruması: %50 Risk İndirimi');
  });
});
