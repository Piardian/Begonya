import { Symbol } from './candleStore';
import { MacroGatePayload } from './macroGateAdapter';

export const ROTATION_SCORE_THRESHOLD = 65;
export const MAX_ON_DEMAND_SMC_TARGETS = 3;
export const INTRADAY_ROTATION_TTL_MS = 15 * 60 * 1000;

export interface CryptoUniverseEntry {
  readonly coin: string;
  readonly spotSymbol: string;
  readonly futuresSymbol: string;
  readonly smcSymbol: Symbol;
  readonly layer: number;
  readonly layerName: string;
  readonly sector: string;
}

function entry(
  coin: string,
  layer: number,
  layerName: string,
  sector: string,
  spotSymbol?: string,
  futuresSymbol?: string
): CryptoUniverseEntry {
  return Object.freeze({
    coin,
    spotSymbol: spotSymbol ?? `${coin}USDT`,
    futuresSymbol: futuresSymbol ?? `${coin}USDT`,
    smcSymbol: `${coin}USD` as Symbol,
    layer,
    layerName,
    sector,
  });
}

export const CRYPTO_ROTATION_UNIVERSE_META: Readonly<Record<string, CryptoUniverseEntry>> = Object.freeze({
  // Layer 0: Core Reserve
  BTC: entry('BTC', 0, 'LAYER_0_ANCHOR', 'CORE_RESERVE'),
  // Layer 1: Large-Cap Smart Contract Bellwether
  ETH: entry('ETH', 1, 'LAYER_1_BELLWETHER', 'LARGE_CAP_SMART_CONTRACT'),
  // Layer 2: Major L1 & L2 Infrastructure (8 Coins)
  SOL: entry('SOL', 2, 'LAYER_2_MAJOR_L1_L2', 'HIGH_BETA_L1_L2'),
  SUI: entry('SUI', 2, 'LAYER_2_MAJOR_L1_L2', 'HIGH_BETA_L1_L2'),
  AVAX: entry('AVAX', 2, 'LAYER_2_MAJOR_L1_L2', 'HIGH_BETA_L1_L2'),
  NEAR: entry('NEAR', 2, 'LAYER_2_MAJOR_L1_L2', 'HIGH_BETA_L1_L2'),
  APT: entry('APT', 2, 'LAYER_2_MAJOR_L1_L2', 'HIGH_BETA_L1_L2'),
  SEI: entry('SEI', 2, 'LAYER_2_MAJOR_L1_L2', 'HIGH_BETA_L1_L2'),
  ARB: entry('ARB', 2, 'LAYER_2_MAJOR_L1_L2', 'HIGH_BETA_L1_L2'),
  OP: entry('OP', 2, 'LAYER_2_MAJOR_L1_L2', 'HIGH_BETA_L1_L2'),
  // Layer 3: Legacy & Payment Infrastructure (7 Coins)
  XRP: entry('XRP', 3, 'LAYER_3_LEGACY_PAYMENT', 'LEGACY_PAYMENT_INFRA'),
  ADA: entry('ADA', 3, 'LAYER_3_LEGACY_PAYMENT', 'LEGACY_PAYMENT_INFRA'),
  LTC: entry('LTC', 3, 'LAYER_3_LEGACY_PAYMENT', 'LEGACY_PAYMENT_INFRA'),
  DASH: entry('DASH', 3, 'LAYER_3_LEGACY_PAYMENT', 'LEGACY_PAYMENT_INFRA'),
  BCH: entry('BCH', 3, 'LAYER_3_LEGACY_PAYMENT', 'LEGACY_PAYMENT_INFRA'),
  LINK: entry('LINK', 3, 'LAYER_3_LEGACY_PAYMENT', 'LEGACY_PAYMENT_INFRA'),
  DOT: entry('DOT', 3, 'LAYER_3_LEGACY_PAYMENT', 'LEGACY_PAYMENT_INFRA'),
  // Layer 4: AI, Compute & DePIN (7 Coins)
  FET: entry('FET', 4, 'LAYER_4_AI_NARRATIVE', 'AI_SECTOR'),
  RENDER: entry('RENDER', 4, 'LAYER_4_AI_NARRATIVE', 'AI_SECTOR'),
  TAO: entry('TAO', 4, 'LAYER_4_AI_NARRATIVE', 'AI_SECTOR'),
  VIRTUAL: entry('VIRTUAL', 4, 'LAYER_4_AI_NARRATIVE', 'AI_SECTOR'),
  WLD: entry('WLD', 4, 'LAYER_4_AI_NARRATIVE', 'AI_SECTOR'),
  ARKM: entry('ARKM', 4, 'LAYER_4_AI_NARRATIVE', 'AI_SECTOR'),
  IO: entry('IO', 4, 'LAYER_4_AI_NARRATIVE', 'AI_SECTOR'),
  // Layer 5: DeFi, Gaming & Mid-Cap Utility (8 Coins)
  UNI: entry('UNI', 5, 'LAYER_5_DEFI_GAMING_MIDCAP', 'DEFI_GAMING_MIDCAP'),
  AAVE: entry('AAVE', 5, 'LAYER_5_DEFI_GAMING_MIDCAP', 'DEFI_GAMING_MIDCAP'),
  PENDLE: entry('PENDLE', 5, 'LAYER_5_DEFI_GAMING_MIDCAP', 'DEFI_GAMING_MIDCAP'),
  INJ: entry('INJ', 5, 'LAYER_5_DEFI_GAMING_MIDCAP', 'DEFI_GAMING_MIDCAP'),
  CHZ: entry('CHZ', 5, 'LAYER_5_DEFI_GAMING_MIDCAP', 'DEFI_GAMING_MIDCAP'),
  RVN: entry('RVN', 5, 'LAYER_5_DEFI_GAMING_MIDCAP', 'DEFI_GAMING_MIDCAP'),
  GALA: entry('GALA', 5, 'LAYER_5_DEFI_GAMING_MIDCAP', 'DEFI_GAMING_MIDCAP'),
  SAND: entry('SAND', 5, 'LAYER_5_DEFI_GAMING_MIDCAP', 'DEFI_GAMING_MIDCAP'),
  // Layer 6: Meme Coins - High-Beta Bottom Layer (7 Coins)
  DOGE: entry('DOGE', 6, 'LAYER_6_MEME_HIGH_BETA', 'MEME_SECTOR'),
  PEPE: entry('PEPE', 6, 'LAYER_6_MEME_HIGH_BETA', 'MEME_SECTOR', 'PEPEUSDT', '1000PEPEUSDT'),
  SHIB: entry('SHIB', 6, 'LAYER_6_MEME_HIGH_BETA', 'MEME_SECTOR', 'SHIBUSDT', '1000SHIBUSDT'),
  WIF: entry('WIF', 6, 'LAYER_6_MEME_HIGH_BETA', 'MEME_SECTOR'),
  BONK: entry('BONK', 6, 'LAYER_6_MEME_HIGH_BETA', 'MEME_SECTOR', 'BONKUSDT', '1000BONKUSDT'),
  FLOKI: entry('FLOKI', 6, 'LAYER_6_MEME_HIGH_BETA', 'MEME_SECTOR', 'FLOKIUSDT', '1000FLOKIUSDT'),
  PENGU: entry('PENGU', 6, 'LAYER_6_MEME_HIGH_BETA', 'MEME_SECTOR'),
});

export interface RawBar {
  open: number;
  high: number;
  low: number;
  close: number;
  quote_volume: number;
}

export interface RawOiPoint {
  sum_open_interest: number;
  sum_open_interest_value: number;
}

export interface RawCoinRotationInput {
  coin?: string;
  spot_symbol?: string;
  futures_symbol?: string;
  smc_symbol?: string;
  layer?: number;
  layer_name?: string;
  sector?: string;
  spot_last_price?: number;
  spot_price_change_24h_pct?: number;
  spot_quote_volume_24h?: number;
  futures_quote_volume_24h?: number;
  funding_rate?: number;
  bars_1h?: RawBar[];
  bars_4h?: RawBar[];
  oi_history_1h?: RawOiPoint[];
  deep_fetched?: boolean;
}

export interface RawRotationSnapshot {
  status?: string;
  btc_dominance?: {
    btc_dominance_pct?: number | null;
    btcdom_change_24h_pct?: number | null;
    btcdom_change_4h_pct?: number | null;
  };
  coins: Record<string, RawCoinRotationInput>;
}

export interface CoinRotationAssessment {
  coin: string;
  spot_symbol: string;
  futures_symbol: string;
  smc_symbol: string;
  layer: number;
  layer_name: string;
  sector: string;
  price: number;
  change_1h_pct: number;
  change_4h_pct: number;
  change_24h_pct: number;
  rs_vs_btc_1h_pct: number;
  rs_vs_btc_4h_pct: number;
  rs_vs_btc_24h_pct: number;
  rs_vs_btc_5d_pct: number;
  rs_vs_eth_24h_pct: number;
  rvol_1h: number;
  rvol_4h: number;
  effective_rvol: number;
  volume_regime: string;
  oi_value_usd: number;
  oi_change_4h_pct: number;
  oi_change_24h_pct: number;
  funding_rate_pct: number;
  spot_to_futures_vol_ratio: number;
  derivatives_regime: string;
  is_single_coin_outlier: boolean;
  long_rotation_score: number;
  short_rotation_score: number;
  active_rotation_score: number;
  score_breakdown: {
    relative_strength: number;
    volume_anomaly: number;
    market_cap_layer: number;
    btc_dominance: number;
    eth_btc_bellwether: number;
    oi_and_funding: number;
    sector_breadth: number;
    late_chase_penalty?: number;
  };
  veto_reasons_long: string[];
  veto_reasons_short: string[];
  rotation_gate: 'LONG_ONLY' | 'SHORT_ONLY' | 'NEUTRAL_RANGE' | 'DEFENSIVE_HOLD';
  smc_handoff_allowed: boolean;
  rationale: string;
}

export interface OnDemandSmcTarget {
  coin: string;
  smc_symbol: Symbol;
  spot_symbol: string;
  futures_symbol: string;
  direction: 'long' | 'short';
  rotation_gate: 'LONG_ONLY' | 'SHORT_ONLY';
  rotation_score: number;
  rs_vs_btc_1h_pct?: number;
  rs_vs_btc_4h_pct?: number;
  rs_vs_btc_24h_pct: number;
  rs_vs_eth_24h_pct: number;
  effective_rvol: number;
  volume_regime: string;
  derivatives_regime: string;
  funding_rate_pct: number;
  oi_change_4h_pct: number;
  layer: number;
  layer_name: string;
  sector: string;
  rationale: string;
}

export interface CryptoRotationEvaluationReport {
  status: string;
  evaluated_at_epoch_ms?: number;
  universe_size: number;
  macro_btc_gate: string;
  target_macro_direction: string;
  rotation_score_threshold: number;
  meme_froth_warning: boolean;
  btc_dominance_panel: {
    btc_dominance_pct: number | null;
    btcdom_change_4h_pct: number;
    btcdom_change_24h_pct: number;
    dominance_regime: string;
  };
  bellwether_ratios: {
    eth_btc_24h_pct: number;
    eth_btc_5d_pct: number;
    sol_eth_24h_pct: number;
    sui_sol_24h_pct: number;
  };
  active_inflow_layers: number[];
  sector_breadth: Record<string, any>;
  approved_long_symbols: string[];
  approved_short_symbols: string[];
  on_demand_smc_targets: OnDemandSmcTarget[];
  vetoed_symbols: Record<string, string>;
  coin_assessments: Record<string, CoinRotationAssessment>;
}

function round2(val: number): number {
  return Math.round(val * 100) / 100;
}

function pctChange(curr?: number | null, prev?: number | null): number {
  if (!curr || !prev || prev === 0) return 0.0;
  return round2(((curr - prev) / prev) * 100.0);
}

function computeBarMetrics(
  bars1h: RawBar[] = [],
  bars4h: RawBar[] = [],
  fallbackPrice = 0.0,
  fallbackChange24hPct = 0.0
) {
  if (bars1h.length === 0 && bars4h.length === 0) {
    return {
      close: fallbackPrice,
      change_1h_pct: round2(fallbackChange24hPct / 12.0),
      change_4h_pct: round2(fallbackChange24hPct / 4.0),
      change_24h_pct: round2(fallbackChange24hPct),
      change_5d_pct: round2(fallbackChange24hPct * 1.5),
      rvol_1h: 1.0,
      rvol_4h: 1.0,
      effective_rvol: 1.0,
    };
  }

  const closeNow = bars1h.length > 0 ? bars1h[bars1h.length - 1].close : (bars4h.length > 0 ? bars4h[bars4h.length - 1].close : fallbackPrice);
  const close1hAgo = bars1h.length >= 2 ? bars1h[bars1h.length - 2].close : closeNow;
  const close4hAgo = bars1h.length >= 5
    ? bars1h[bars1h.length - 5].close
    : (bars4h.length >= 2 ? bars4h[bars4h.length - 2].close : closeNow);
  const close24hAgo = bars1h.length >= 25
    ? bars1h[bars1h.length - 25].close
    : (bars4h.length >= 7 ? bars4h[bars4h.length - 7].close : closeNow);
  const close5dAgo = bars4h.length >= 31
    ? bars4h[bars4h.length - 31].close
    : (bars4h.length > 0 ? bars4h[0].close : closeNow);

  let rvol1h = 1.0;
  if (bars1h.length >= 6) {
    const baseline = bars1h.slice(0, -2).slice(-20).map(b => b.quote_volume).filter(v => v > 0);
    const avg1h = baseline.length > 0 ? baseline.reduce((a, b) => a + b, 0) / baseline.length : 0;
    const curr1h = Math.max(bars1h[bars1h.length - 1].quote_volume ?? 0, bars1h[bars1h.length - 2].quote_volume ?? 0);
    if (avg1h > 0) rvol1h = round2(curr1h / avg1h);
  }

  let rvol4h = 1.0;
  if (bars4h.length >= 6) {
    const baseline = bars4h.slice(0, -2).slice(-20).map(b => b.quote_volume).filter(v => v > 0);
    const avg4h = baseline.length > 0 ? baseline.reduce((a, b) => a + b, 0) / baseline.length : 0;
    const curr4h = Math.max(bars4h[bars4h.length - 1].quote_volume ?? 0, bars4h[bars4h.length - 2].quote_volume ?? 0);
    if (avg4h > 0) rvol4h = round2(curr4h / avg4h);
  }

  let calc24h = pctChange(closeNow, close24hAgo);
  if (calc24h === 0 && fallbackChange24hPct !== 0) {
    calc24h = round2(fallbackChange24hPct);
  }

  return {
    close: closeNow,
    change_1h_pct: pctChange(closeNow, close1hAgo),
    change_4h_pct: pctChange(closeNow, close4hAgo),
    change_24h_pct: calc24h,
    change_5d_pct: pctChange(closeNow, close5dAgo),
    rvol_1h: rvol1h,
    rvol_4h: rvol4h,
    effective_rvol: round2(Math.max(rvol1h, rvol4h)),
  };
}

function computeOiMetrics(oiHist1h: RawOiPoint[] = []) {
  if (oiHist1h.length === 0) {
    return { oi_value_usd: 0.0, oi_change_4h_pct: 0.0, oi_change_24h_pct: 0.0 };
  }
  const currOi = oiHist1h[oiHist1h.length - 1].sum_open_interest ?? 0.0;
  const currVal = oiHist1h[oiHist1h.length - 1].sum_open_interest_value ?? 0.0;
  const oi4hAgo = oiHist1h.length >= 5 ? oiHist1h[oiHist1h.length - 5].sum_open_interest : oiHist1h[0].sum_open_interest;
  const oi24hAgo = oiHist1h[0].sum_open_interest;
  return {
    oi_value_usd: round2(currVal),
    oi_change_4h_pct: pctChange(currOi, oi4hAgo),
    oi_change_24h_pct: pctChange(currOi, oi24hAgo),
  };
}

function checkRatio4hStructure(altBars4h: RawBar[] = [], btcBars4h: RawBar[] = []) {
  const n = Math.min(altBars4h.length, btcBars4h.length);
  if (n < 8) {
    return { bullish: false, bearish: false, swing_low_broken: false, swing_high_broken: false };
  }
  const ratios: number[] = [];
  for (let i = n; i >= 1; i--) {
    const bClose = btcBars4h[btcBars4h.length - i]?.close ?? 0;
    const aClose = altBars4h[altBars4h.length - i]?.close ?? 0;
    if (bClose > 0) ratios.push(aClose / bClose);
  }
  if (ratios.length < 8) {
    return { bullish: false, bearish: false, swing_low_broken: false, swing_high_broken: false };
  }
  const currRatio = ratios[ratios.length - 1];
  const priorWindow = ratios.slice(-7, -1);
  const recentLow = Math.min(...priorWindow);
  const recentHigh = Math.max(...priorWindow);
  const smaShort = ratios.slice(-4).reduce((a, b) => a + b, 0) / 4.0;
  const smaLong = ratios.slice(-8).reduce((a, b) => a + b, 0) / 8.0;

  const swingLowBroken = currRatio < recentLow * 0.997;
  const swingHighBroken = currRatio > recentHigh * 1.003;
  return {
    bullish: (smaShort >= smaLong || swingHighBroken) && !swingLowBroken,
    bearish: (smaShort <= smaLong || swingLowBroken) && !swingHighBroken,
    swing_low_broken: swingLowBroken,
    swing_high_broken: swingHighBroken,
  };
}

export function evaluateCryptoRotationSnapshot(
  rawSnapshot: RawRotationSnapshot,
  macroBtcGate: string = 'NEUTRAL_RANGE',
  options?: {
    btcDecouplingActive?: boolean;
    capitalPreservationMode?: boolean;
    maxOnDemandTargets?: number;
  }
): CryptoRotationEvaluationReport {
  const btcDecouplingActive = options?.btcDecouplingActive ?? false;
  const capitalPreservationMode = options?.capitalPreservationMode ?? false;
  const maxOnDemandTargets = options?.maxOnDemandTargets ?? MAX_ON_DEMAND_SMC_TARGETS;

  const coinsRaw = rawSnapshot?.coins ?? {};
  if (!coinsRaw.BTC || !coinsRaw.ETH) {
    return {
      status: 'UNAVAILABLE',
      universe_size: 0,
      macro_btc_gate: macroBtcGate,
      target_macro_direction: 'NEUTRAL',
      rotation_score_threshold: ROTATION_SCORE_THRESHOLD,
      meme_froth_warning: false,
      btc_dominance_panel: {
        btc_dominance_pct: null,
        btcdom_change_4h_pct: 0,
        btcdom_change_24h_pct: 0,
        dominance_regime: 'NEUTRAL_DOMINANCE',
      },
      bellwether_ratios: {
        eth_btc_24h_pct: 0,
        eth_btc_5d_pct: 0,
        sol_eth_24h_pct: 0,
        sui_sol_24h_pct: 0,
      },
      active_inflow_layers: [],
      sector_breadth: {},
      approved_long_symbols: [],
      approved_short_symbols: [],
      on_demand_smc_targets: [],
      vetoed_symbols: {},
      coin_assessments: {},
    };
  }

  const parsedCoins: Record<string, any> = {};
  for (const [coin, data] of Object.entries(coinsRaw)) {
    const meta = CRYPTO_ROTATION_UNIVERSE_META[coin];
    const barM = computeBarMetrics(
      data.bars_1h ?? [],
      data.bars_4h ?? [],
      Number(data.spot_last_price ?? 0),
      Number(data.spot_price_change_24h_pct ?? 0)
    );
    const oiM = computeOiMetrics(data.oi_history_1h ?? []);
    const spotVol24h = Number(data.spot_quote_volume_24h ?? 0);
    const futVol24h = Number(data.futures_quote_volume_24h ?? 0);
    const spotToFutRatio = futVol24h > 0 ? Math.round((spotVol24h / futVol24h) * 1000) / 1000 : 1.0;
    const fundingRatePct = Math.round(Number(data.funding_rate ?? 0) * 100 * 10000) / 10000;

    parsedCoins[coin] = {
      ...barM,
      ...oiM,
      coin,
      spot_symbol: data.spot_symbol ?? meta?.spotSymbol ?? `${coin}USDT`,
      futures_symbol: data.futures_symbol ?? meta?.futuresSymbol ?? `${coin}USDT`,
      smc_symbol: (data.smc_symbol ?? meta?.smcSymbol ?? `${coin}USD`) as Symbol,
      layer: Number(data.layer ?? meta?.layer ?? 3),
      layer_name: data.layer_name ?? meta?.layerName ?? 'LAYER_3_LEGACY_PAYMENT',
      sector: data.sector ?? meta?.sector ?? 'LEGACY_PAYMENT_INFRA',
      spot_quote_volume_24h: spotVol24h,
      futures_quote_volume_24h: futVol24h,
      spot_to_futures_vol_ratio: spotToFutRatio,
      funding_rate_pct: fundingRatePct,
      deep_fetched: Boolean(data.deep_fetched ?? (data.bars_1h && data.bars_1h.length > 0)),
      bars_4h: data.bars_4h ?? [],
    };
  }

  const btcM = parsedCoins.BTC;
  const ethM = parsedCoins.ETH;
  const solM = parsedCoins.SOL ?? ethM;
  const suiM = parsedCoins.SUI ?? solM;

  const ethBtc24h = round2(ethM.change_24h_pct - btcM.change_24h_pct);
  const ethBtc5d = round2(ethM.change_5d_pct - btcM.change_5d_pct);
  const solEth24h = round2(solM.change_24h_pct - ethM.change_24h_pct);
  const suiSol24h = round2(suiM.change_24h_pct - solM.change_24h_pct);

  for (const cm of Object.values(parsedCoins)) {
    cm.rs_vs_btc_1h_pct = round2(cm.change_1h_pct - btcM.change_1h_pct);
    cm.rs_vs_btc_4h_pct = round2(cm.change_4h_pct - btcM.change_4h_pct);
    cm.rs_vs_btc_24h_pct = round2(cm.change_24h_pct - btcM.change_24h_pct);
    cm.rs_vs_btc_5d_pct = round2(cm.change_5d_pct - btcM.change_5d_pct);
    cm.rs_vs_eth_4h_pct = round2(cm.change_4h_pct - ethM.change_4h_pct);
    cm.rs_vs_eth_24h_pct = round2(cm.change_24h_pct - ethM.change_24h_pct);
    cm.ratio_structure_4h = checkRatio4hStructure(cm.bars_4h, btcM.bars_4h);
  }

  const domInfo = rawSnapshot.btc_dominance ?? {};
  const btcdom24h = Number(domInfo.btcdom_change_24h_pct ?? 0);
  const btcdom4h = Number(domInfo.btcdom_change_4h_pct ?? 0);
  const btcDomPct = domInfo.btc_dominance_pct ?? null;

  const btcdomFalling = btcdom24h <= -0.05 || btcdom4h <= -0.05;
  const btcdomRising = btcdom24h >= 0.10 || btcdom4h >= 0.08;

  let dominanceRegime = 'NEUTRAL_DOMINANCE';
  if (btcM.change_24h_pct >= -0.5 && btcdomFalling) {
    dominanceRegime = 'ALT_CAPITAL_DISPERSION';
  } else if (btcM.change_24h_pct > 0.5 && btcdomRising) {
    dominanceRegime = 'BTC_CONCENTRATION';
  } else if (btcM.change_24h_pct < -0.5 && btcdomRising) {
    dominanceRegime = 'ALT_RISK_OFF_BLEED';
  } else if (btcM.change_24h_pct < -0.5 && btcdomFalling) {
    dominanceRegime = 'ALT_DECOUPLED_RESILIENCE';
  }

  const sectorGroups: Record<string, any[]> = {};
  for (const [coin, cm] of Object.entries(parsedCoins)) {
    if (coin === 'BTC' || coin === 'ETH') continue;
    if (!sectorGroups[cm.sector]) sectorGroups[cm.sector] = [];
    sectorGroups[cm.sector].push(cm);
  }

  const sectorBreadth: Record<string, any> = {};
  for (const [sectorName, members] of Object.entries(sectorGroups)) {
    const count = members.length;
    const outperformingBtc = members
      .filter(m => m.rs_vs_btc_24h_pct > 0.0 || (m.rs_vs_btc_4h_pct > 0.25 && m.effective_rvol >= 1.2))
      .map(m => m.coin);
    const underperformingBtc = members
      .filter(m => m.rs_vs_btc_24h_pct < 0.0 && m.rs_vs_btc_4h_pct <= 0.0)
      .map(m => m.coin);
    const deepMembers = members.filter(m => m.deep_fetched && m.effective_rvol !== 1.0);
    const rvolPool = deepMembers.length > 0 ? deepMembers : members;
    const avgRvol = round2(rvolPool.reduce((s, m) => s + m.effective_rvol, 0) / Math.max(1, rvolPool.length));
    const avgRsBtc24h = round2(members.reduce((s, m) => s + m.rs_vs_btc_24h_pct, 0) / Math.max(1, count));
    const avgFunding = Math.round((members.reduce((s, m) => s + m.funding_rate_pct, 0) / Math.max(1, count)) * 10000) / 10000;
    const longBreadthRatio = round2(outperformingBtc.length / Math.max(1, count));
    const shortBreadthRatio = round2(underperformingBtc.length / Math.max(1, count));
    const confirmedLong = longBreadthRatio >= 0.60 && avgRvol >= 1.15;
    const confirmedShort = shortBreadthRatio >= 0.60;

    sectorBreadth[sectorName] = {
      sector: sectorName,
      member_count: count,
      members: members.map(m => m.coin),
      outperforming_coins: outperformingBtc,
      underperforming_coins: underperformingBtc,
      long_breadth_ratio: longBreadthRatio,
      short_breadth_ratio: shortBreadthRatio,
      avg_rvol: avgRvol,
      avg_rs_vs_btc_24h_pct: avgRsBtc24h,
      avg_funding_rate_pct: avgFunding,
      confirmed_long_rotation: confirmedLong,
      confirmed_short_rotation: confirmedShort,
      status: confirmedLong
        ? 'SECTOR_INFLOW_CONFIRMED'
        : confirmedShort
          ? 'SECTOR_OUTFLOW_CONFIRMED'
          : 'FRAGMENTED_SINGLE_COIN_MOVES',
    };
  }

  const layerGroups: Record<number, any[]> = {};
  for (const cm of Object.values(parsedCoins)) {
    if (!layerGroups[cm.layer]) layerGroups[cm.layer] = [];
    layerGroups[cm.layer].push(cm);
  }

  const activeInflowLayers: number[] = [];
  for (const layerIdxStr of Object.keys(layerGroups)) {
    const layerIdx = Number(layerIdxStr);
    const lMembers = layerGroups[layerIdx];
    const avgRs = round2(lMembers.reduce((s, m) => s + m.rs_vs_btc_24h_pct, 0) / lMembers.length);
    const deepL = lMembers.filter(m => m.deep_fetched && m.effective_rvol !== 1.0);
    const rvolL = deepL.length > 0 ? deepL : lMembers;
    const avgRvol = round2(rvolL.reduce((s, m) => s + m.effective_rvol, 0) / Math.max(1, rvolL.length));
    const inflowActive = (layerIdx === 0 && btcM.change_24h_pct > 0) || (avgRs > 0.0 && avgRvol >= 1.15);
    if (inflowActive) activeInflowLayers.push(layerIdx);
  }

  const memeSec = sectorBreadth.MEME_SECTOR ?? {};
  const l1Sec = sectorBreadth.HIGH_BETA_L1_L2 ?? {};
  const memeFrothWarning =
    Number(memeSec.avg_rs_vs_btc_24h_pct ?? 0) >= 3.0 &&
    Number(memeSec.avg_funding_rate_pct ?? 0) >= 0.030 &&
    ethBtc24h < 0.0 &&
    Number(l1Sec.avg_rs_vs_btc_24h_pct ?? 0) <= 0.0;

  const macroGateUp = (macroBtcGate || 'NEUTRAL_RANGE').toUpperCase();
  let targetMacroDir = 'NEUTRAL';
  if (capitalPreservationMode || macroGateUp.includes('DEFENSIVE') || macroGateUp.includes('HOLD')) {
    targetMacroDir = 'DEFENSIVE_HOLD';
  } else if (macroGateUp.includes('LONG') && !btcDecouplingActive) {
    targetMacroDir = 'LONG';
  } else if (macroGateUp.includes('SHORT')) {
    targetMacroDir = 'SHORT';
  }

  const coinAssessments: Record<string, CoinRotationAssessment> = {};
  const approvedLongSymbols: string[] = [];
  const approvedShortSymbols: string[] = [];
  const vetoedSymbols: Record<string, string> = {};

  for (const [coin, cm] of Object.entries(parsedCoins)) {
    if (coin === 'BTC') continue;

    const secInfo = sectorBreadth[cm.sector] ?? {};
    const ratioStruct = cm.ratio_structure_4h;
    const rvol = cm.effective_rvol;
    const rsBtc1h = cm.rs_vs_btc_1h_pct;
    const rsBtc4h = cm.rs_vs_btc_4h_pct;
    const rsBtc24h = cm.rs_vs_btc_24h_pct;
    const rsEth24h = cm.rs_vs_eth_24h_pct;
    const oi4h = cm.oi_change_4h_pct;
    const oi24h = cm.oi_change_24h_pct;
    const funding = cm.funding_rate_pct;
    const price4h = cm.change_4h_pct;
    const price24h = cm.change_24h_pct;
    const spotFutRatio = cm.spot_to_futures_vol_ratio;

    const isLeverageSqueezeTrap =
      price24h >= 5.0 &&
      (rvol < 1.20 || spotFutRatio < 0.12) &&
      (oi24h >= 12.0 || oi4h >= 8.0 || funding >= 0.035) &&
      funding >= 0.028;

    const isShortSqueezeDanger =
      (rsBtc24h >= 0.5 || rsBtc4h >= 0.5) &&
      (rvol >= 1.25 || oi4h >= 1.5 || spotFutRatio >= 0.25) &&
      funding < -0.003;

    const isOrganicInflow =
      (price4h > 0 || price24h > 0) &&
      rvol >= 1.30 &&
      oi4h >= 0.5 &&
      oi24h <= 25.0 &&
      funding <= 0.025;

    const isCapitulationOiFlushed =
      (price24h <= -9.0 || rsBtc24h <= -8.5) &&
      (oi4h <= -4.5 || oi24h <= -9.0) &&
      !isShortSqueezeDanger;

    const isShortBuildupDistribution =
      (rsBtc24h <= -0.8 || rsBtc4h <= -0.3) &&
      (price4h < 0.0 || price24h < 0.0) &&
      oi4h >= -1.5 &&
      rvol >= 1.20 &&
      !isShortSqueezeDanger &&
      !isCapitulationOiFlushed;

    const isOrganicDistribution =
      (rsBtc24h < 0.0 || rsBtc4h < 0.0) &&
      (price4h < 0.0 || price24h < 0.0) &&
      !isShortSqueezeDanger &&
      !isCapitulationOiFlushed;

    let derivativesRegime = 'NEUTRAL_DERIVATIVES';
    if (isLeverageSqueezeTrap) derivativesRegime = 'LEVERAGE_SQUEEZE_TRAP';
    else if (isShortSqueezeDanger) derivativesRegime = 'SHORT_SQUEEZE_DANGER';
    else if (isOrganicInflow) derivativesRegime = 'ORGANIC_CAPITAL_INFLOW';
    else if (isCapitulationOiFlushed) derivativesRegime = 'CAPITULATION_OI_FLUSHED';
    else if (isShortBuildupDistribution) derivativesRegime = 'SHORT_BUILDUP_DISTRIBUTION';
    else if (isOrganicDistribution) derivativesRegime = 'ORGANIC_DISTRIBUTION_FLUSH';

    const isStealthAccumulation = rvol >= 2.20 && Math.abs(price4h) >= 0.10 && Math.abs(price4h) <= 3.20 && rsBtc4h >= 0.0;
    const isUnconfirmedSpike = Math.abs(price24h) >= 8.0 && rvol < 1.15;

    let volumeRegime = 'NORMAL_OR_LOW_VOLUME';
    if (isStealthAccumulation) volumeRegime = 'STEALTH_ACCUMULATION';
    else if (isUnconfirmedSpike) volumeRegime = 'UNCONFIRMED_PRICE_SPIKE';
    else if (rvol >= 1.80) volumeRegime = 'STRONG_VOLUME_EXPANSION';
    else if (rvol >= 1.25) volumeRegime = 'MODERATE_VOLUME_EXPANSION';

    // 1. Relative Strength (25 pts)
    let rsLongPts = 0;
    if (rsBtc24h > 0 && rsBtc4h > 0) rsLongPts += rsBtc24h >= 2.0 ? 15 : 11;
    else if (rsBtc4h > 0.3 || rsBtc1h > 0.3) rsLongPts += 8;
    if (rsEth24h >= 0 || cm.rs_vs_eth_4h_pct >= 0) rsLongPts += 5;
    if (ratioStruct.bullish) rsLongPts += 5;
    rsLongPts = Math.min(25, rsLongPts);

    let rsShortPts = 0;
    if (rsBtc24h < 0 && rsBtc4h < 0) {
      if (rsBtc24h >= -8.5 && rsBtc24h <= -1.5) rsShortPts += 15;
      else if (rsBtc24h < -8.5) rsShortPts += 12;
      else rsShortPts += 10;
    } else if (rsBtc4h < -0.3 || rsBtc1h < -0.3) {
      rsShortPts += 7;
    }
    if (rsEth24h < 0 || cm.rs_vs_eth_4h_pct < 0) rsShortPts += 5;
    if (ratioStruct.bearish) rsShortPts += 5;
    rsShortPts = Math.min(25, rsShortPts);

    // 2. Volume Expansion & Absorption (20 pts)
    let volLongPts = 3;
    if (isStealthAccumulation) volLongPts = 20;
    else if (isUnconfirmedSpike) volLongPts = 0;
    else if (rvol >= 2.5) volLongPts = 20;
    else if (rvol >= 1.8) volLongPts = 16;
    else if (rvol >= 1.3) volLongPts = 13;
    else if (rvol >= 1.0) volLongPts = 8;

    let volShortPts = 4;
    if (isCapitulationOiFlushed) volShortPts = 6;
    else if (rvol >= 1.8 && rsBtc4h <= -0.3) volShortPts = 20;
    else if (rvol >= 1.35 && (rsBtc4h < 0 || rsBtc24h <= -1.2)) volShortPts = 16;
    else if (rvol >= 1.15 && rsBtc24h < 0) volShortPts = 11;

    // 3. Market-Cap Layer Waterfall (10 pts)
    const upperLayersHealthy = ethBtc24h >= -0.5 || activeInflowLayers.includes(1) || activeInflowLayers.includes(2);
    let layerLongPts = 2;
    if (cm.layer === 6 && memeFrothWarning) layerLongPts = 0;
    else if (activeInflowLayers.includes(cm.layer) && upperLayersHealthy) layerLongPts = 10;
    else if ((cm.layer === 1 || cm.layer === 2) && rsBtc4h > 0) layerLongPts = 8;
    else if (upperLayersHealthy) layerLongPts = 6;

    const layerShortPts = cm.layer >= 2 && ethBtc24h <= 0 && rsBtc4h < 0 ? 10 : 5;

    // 4. BTC Dominance (10 pts)
    let domLongPts = 6;
    let domShortPts = 6;
    if (dominanceRegime === 'ALT_CAPITAL_DISPERSION') { domLongPts = 10; domShortPts = 2; }
    else if (dominanceRegime === 'ALT_DECOUPLED_RESILIENCE') { domLongPts = 8; domShortPts = 0; }
    else if (dominanceRegime === 'ALT_RISK_OFF_BLEED') { domLongPts = 2; domShortPts = 10; }
    else if (dominanceRegime === 'BTC_CONCENTRATION') { domLongPts = 4; domShortPts = 7; }

    // 5. ETH/BTC & Bellwethers (10 pts)
    let bellLongPts = 0;
    if (ethBtc24h > 0 || ethBtc5d > 0) bellLongPts += 5;
    if ((cm.layer >= 2 && solEth24h >= 0) || (cm.coin === 'SUI' && suiSol24h > 0)) bellLongPts += 5;
    else if (rsEth24h > 0) bellLongPts += 4;
    bellLongPts = Math.min(10, bellLongPts);

    let bellShortPts = 0;
    if (ethBtc24h < 0) bellShortPts += 5;
    if (solEth24h < 0 && rsEth24h < 0) bellShortPts += 5;
    else if (rsEth24h < 0) bellShortPts += 3;
    bellShortPts = Math.min(10, bellShortPts);

    // 6. OI + Funding (15 pts)
    let derivLongPts = funding <= 0.015 ? 9 : 5;
    let derivShortPts = funding >= 0.0 ? 8 : 4;
    if (derivativesRegime === 'ORGANIC_CAPITAL_INFLOW') { derivLongPts = 15; derivShortPts = 2; }
    else if (derivativesRegime === 'SHORT_SQUEEZE_DANGER') { derivLongPts = 14; derivShortPts = 0; }
    else if (derivativesRegime === 'LEVERAGE_SQUEEZE_TRAP') { derivLongPts = 0; derivShortPts = 12; }
    else if (derivativesRegime === 'SHORT_BUILDUP_DISTRIBUTION') { derivLongPts = 2; derivShortPts = 15; }
    else if (derivativesRegime === 'ORGANIC_DISTRIBUTION_FLUSH') { derivLongPts = 2; derivShortPts = 12; }
    else if (derivativesRegime === 'CAPITULATION_OI_FLUSHED') { derivLongPts = 4; derivShortPts = 5; }

    // 7. Sector Breadth (10 pts)
    let secLongPts = 0;
    let secShortPts = 0;
    let isSingleCoinOutlier = false;
    if (coin === 'ETH') {
      secLongPts = ethBtc24h > 0 ? 10 : 4;
      secShortPts = ethBtc24h < 0 ? 10 : 4;
    } else {
      const longBr = Number(secInfo.long_breadth_ratio ?? 0);
      const shortBr = Number(secInfo.short_breadth_ratio ?? 0);
      isSingleCoinOutlier = (rsBtc24h > 1.0 && longBr < 0.50) || (rsBtc24h < -1.0 && shortBr < 0.50);
      if (secInfo.confirmed_long_rotation) secLongPts = 10;
      else if (longBr >= 0.50) secLongPts = 6;
      if (secInfo.confirmed_short_rotation) secShortPts = 10;
      else if (shortBr >= 0.50) secShortPts = 6;
    }

    const lateLongFomoPenalty =
      price24h >= 18.0 || (rsBtc24h >= 14.0 && funding >= 0.025) ? 15 : 0;
    const lateShortChasePenalty =
      price24h <= -12.0 || isCapitulationOiFlushed ? 15 : (rsBtc24h <= -9.2 ? 8 : 0);

    const longScore = Math.max(
      0,
      rsLongPts + volLongPts + layerLongPts + domLongPts + bellLongPts + derivLongPts + secLongPts - lateLongFomoPenalty
    );
    const shortScore = Math.max(
      0,
      rsShortPts + volShortPts + layerShortPts + domShortPts + bellShortPts + derivShortPts + secShortPts - lateShortChasePenalty
    );

    const vetoReasonsLong: string[] = [];
    const vetoReasonsShort: string[] = [];

    if (rsBtc24h < -0.5 && rsBtc4h < -0.25) {
      vetoReasonsLong.push(`RS_UNDERPERFORMING_BTC (ALT/BTC 24s: %${rsBtc24h.toFixed(2)}, 4s: %${rsBtc4h.toFixed(2)})`);
    }
    if (rsBtc1h <= -0.65) {
      vetoReasonsLong.push(`MICRO_RS_BREAKDOWN_HOLD (Son 1s ALT/BTC %${rsBtc1h.toFixed(2)} sert aşağı kırıldı; 15m long girişi bekletiliyor)`);
    }
    if (ratioStruct.swing_low_broken) {
      vetoReasonsLong.push('ALT_BTC_4H_SWING_LOW_BROKEN (CHoCH)');
    }
    if (isLeverageSqueezeTrap) {
      vetoReasonsLong.push(`LEVERAGE_SQUEEZE_TRAP (Spot RVOL: ${rvol}x zayıf, OI 24s: %${oi24h.toFixed(1)}, Funding: %${funding.toFixed(4)})`);
    }
    if (isUnconfirmedSpike) {
      vetoReasonsLong.push(`UNCONFIRMED_PRICE_SPIKE (Fiyat %${price24h.toFixed(1)} ama Spot RVOL ${rvol}x)`);
    }
    if (cm.layer === 6 && memeFrothWarning) {
      vetoReasonsLong.push('MEME_LATE_CYCLE_FROTH_VETO (ETH/L1 zayıflarken Meme katmanında aşırı kaldıraç köpüğü)');
    }
    if (coin !== 'ETH' && !secInfo.confirmed_long_rotation && Number(secInfo.long_breadth_ratio ?? 0) < 0.50) {
      vetoReasonsLong.push(`NO_SECTOR_BREADTH (${cm.sector} sepetinde tekil hareket; sektör genişliği %${Math.round(Number(secInfo.long_breadth_ratio ?? 0) * 100)})`);
    }

    if (rsBtc24h > 0.5 || (rsBtc4h > 0.4 && rvol >= 1.25)) {
      vetoReasonsShort.push(`RS_CONTRA_SHORT_VETO (${coin} piyasaya karşı güçleniyor: ALT/BTC 24s %${rsBtc24h.toFixed(2)}, 4s %${rsBtc4h.toFixed(2)}, RVOL ${rvol}x)`);
    }
    if (rsBtc1h >= 0.65) {
      vetoReasonsShort.push(`MICRO_RS_REVERSAL_HOLD (Son 1s ALT/BTC %${rsBtc1h.toFixed(2)} yukarı döndü; 15m short girişi bekletiliyor)`);
    }
    if (isShortSqueezeDanger) {
      vetoReasonsShort.push(`SHORT_SQUEEZE_DANGER (ALT/BTC pozitif + Spot RVOL ${rvol}x + Negatif Funding %${funding.toFixed(4)} -> Short Sıkıştırması!)`);
    }
    if (dominanceRegime === 'ALT_DECOUPLED_RESILIENCE' && rsBtc4h > 0) {
      vetoReasonsShort.push('ALT_DECOUPLED_RESILIENCE (BTC düşerken BTC.D düşüyor ve ALT/BTC yükseliyor -> Short Yasak!)');
    }
    if (ratioStruct.swing_high_broken) {
      vetoReasonsShort.push('ALT_BTC_4H_SWING_HIGH_BROKEN (Yukarı Kırılım)');
    }

    const smcSymbol = cm.smc_symbol as string;
    let rotationGate: 'LONG_ONLY' | 'SHORT_ONLY' | 'NEUTRAL_RANGE' | 'DEFENSIVE_HOLD' = 'NEUTRAL_RANGE';
    let activeScore = 0;
    let gateReason = '';

    if (targetMacroDir === 'DEFENSIVE_HOLD') {
      rotationGate = 'DEFENSIVE_HOLD';
      activeScore = 0;
      gateReason = 'Makro Sermaye Koruma / Defensive Hold aktif.';
    } else if (targetMacroDir === 'LONG') {
      activeScore = longScore;
      if (vetoReasonsLong.length > 0) {
        rotationGate = 'NEUTRAL_RANGE';
        gateReason = `LONG Rotasyon Vetosu: ${vetoReasonsLong.join(' | ')}`;
        vetoedSymbols[smcSymbol] = gateReason;
      } else if (longScore >= ROTATION_SCORE_THRESHOLD) {
        rotationGate = 'LONG_ONLY';
        gateReason = `ROTASYON ONAYLI LONG (Skor: ${longScore}/100 | ALT/BTC 24s: %${rsBtc24h.toFixed(2)}, 1s: %${rsBtc1h.toFixed(2)} | RVOL: ${rvol}x [${volumeRegime}] | Türev: ${derivativesRegime} | Sektör: ${cm.sector})`;
        approvedLongSymbols.push(smcSymbol);
      } else {
        rotationGate = 'NEUTRAL_RANGE';
        gateReason = `Rotasyon Skoru Yetersiz (${longScore}/${ROTATION_SCORE_THRESHOLD})`;
      }
    } else if (targetMacroDir === 'SHORT') {
      activeScore = shortScore;
      if (vetoReasonsShort.length > 0) {
        rotationGate = 'NEUTRAL_RANGE';
        gateReason = `🛑 SHORT ROTASYON KALKANI (VETO): ${vetoReasonsShort.join(' | ')}`;
        vetoedSymbols[smcSymbol] = gateReason;
      } else if (
        shortScore >= ROTATION_SCORE_THRESHOLD &&
        (rsBtc24h <= -0.8 || rsBtc4h <= -0.4) &&
        rvol >= 1.15
      ) {
        rotationGate = 'SHORT_ONLY';
        gateReason = `ROTASYON ONAYLI SHORT (Skor: ${shortScore}/100 | ALT/BTC 24s: %${rsBtc24h.toFixed(2)}, 1s: %${rsBtc1h.toFixed(2)} | RVOL: ${rvol}x | Türev: ${derivativesRegime} | Sektör: ${cm.sector})`;
        approvedShortSymbols.push(smcSymbol);
      } else {
        rotationGate = 'NEUTRAL_RANGE';
        gateReason = `Short Rotasyon / Göreli Zayıflık Skoru Yetersiz (${shortScore}/${ROTATION_SCORE_THRESHOLD}, RVOL: ${rvol}x)`;
      }
    } else {
      activeScore = Math.max(longScore, shortScore);
      rotationGate = 'NEUTRAL_RANGE';
      gateReason = `Makro BTC Kapısı Yönsüz (${macroBtcGate}); altcoin rotasyonu beklemede.`;
    }

    coinAssessments[coin] = {
      coin,
      spot_symbol: cm.spot_symbol,
      futures_symbol: cm.futures_symbol,
      smc_symbol: smcSymbol,
      layer: cm.layer,
      layer_name: cm.layer_name,
      sector: cm.sector,
      price: cm.close,
      change_1h_pct: cm.change_1h_pct,
      change_4h_pct: cm.change_4h_pct,
      change_24h_pct: cm.change_24h_pct,
      rs_vs_btc_1h_pct: rsBtc1h,
      rs_vs_btc_4h_pct: rsBtc4h,
      rs_vs_btc_24h_pct: rsBtc24h,
      rs_vs_btc_5d_pct: cm.rs_vs_btc_5d_pct,
      rs_vs_eth_24h_pct: rsEth24h,
      rvol_1h: cm.rvol_1h,
      rvol_4h: cm.rvol_4h,
      effective_rvol: rvol,
      volume_regime: volumeRegime,
      oi_value_usd: cm.oi_value_usd,
      oi_change_4h_pct: oi4h,
      oi_change_24h_pct: oi24h,
      funding_rate_pct: funding,
      spot_to_futures_vol_ratio: spotFutRatio,
      derivatives_regime: derivativesRegime,
      is_single_coin_outlier: isSingleCoinOutlier,
      long_rotation_score: longScore,
      short_rotation_score: shortScore,
      active_rotation_score: activeScore,
      score_breakdown: {
        relative_strength: targetMacroDir !== 'SHORT' ? rsLongPts : rsShortPts,
        volume_anomaly: targetMacroDir !== 'SHORT' ? volLongPts : volShortPts,
        market_cap_layer: targetMacroDir !== 'SHORT' ? layerLongPts : layerShortPts,
        btc_dominance: targetMacroDir !== 'SHORT' ? domLongPts : domShortPts,
        eth_btc_bellwether: targetMacroDir !== 'SHORT' ? bellLongPts : bellShortPts,
        oi_and_funding: targetMacroDir !== 'SHORT' ? derivLongPts : derivShortPts,
        sector_breadth: targetMacroDir !== 'SHORT' ? secLongPts : secShortPts,
        late_chase_penalty: targetMacroDir !== 'SHORT' ? -lateLongFomoPenalty : -lateShortChasePenalty,
      },
      veto_reasons_long: vetoReasonsLong,
      veto_reasons_short: vetoReasonsShort,
      rotation_gate: rotationGate,
      smc_handoff_allowed: rotationGate === 'LONG_ONLY' || rotationGate === 'SHORT_ONLY',
      rationale: gateReason,
    };
  }

  const rankedCandidates = Object.values(coinAssessments).sort((a, b) => {
    const aAllowed = a.smc_handoff_allowed ? 1 : 0;
    const bAllowed = b.smc_handoff_allowed ? 1 : 0;
    if (bAllowed !== aAllowed) return bAllowed - aAllowed;
    if (b.active_rotation_score !== a.active_rotation_score) return b.active_rotation_score - a.active_rotation_score;
    if (b.effective_rvol !== a.effective_rvol) return b.effective_rvol - a.effective_rvol;
    return Math.abs(b.rs_vs_btc_4h_pct) - Math.abs(a.rs_vs_btc_4h_pct);
  });

  // Sector-Diversified Top 3 On-Demand SMC Targets (Max 1 per sector on first pass, prioritizing Layer 2-6 altcoins)
  let approvedCandidates = rankedCandidates.filter(item => item.smc_handoff_allowed && item.layer >= 2);
  if (approvedCandidates.length === 0) {
    approvedCandidates = rankedCandidates.filter(item => item.smc_handoff_allowed);
  }
  const diversifiedItems: CoinRotationAssessment[] = [];
  const seenSectors = new Set<string>();

  for (const item of approvedCandidates) {
    if (diversifiedItems.length >= maxOnDemandTargets) break;
    if (!seenSectors.has(item.sector)) {
      diversifiedItems.push(item);
      seenSectors.add(item.sector);
    }
  }
  if (diversifiedItems.length < maxOnDemandTargets) {
    const pickedCoins = new Set(diversifiedItems.map(x => x.coin));
    for (const item of approvedCandidates) {
      if (diversifiedItems.length >= maxOnDemandTargets) break;
      if (!pickedCoins.has(item.coin)) {
        diversifiedItems.push(item);
        pickedCoins.add(item.coin);
      }
    }
  }

  const onDemandSmcTargets: OnDemandSmcTarget[] = diversifiedItems.map(item => ({
    coin: item.coin,
    smc_symbol: item.smc_symbol as Symbol,
    spot_symbol: item.spot_symbol,
    futures_symbol: item.futures_symbol,
    direction: item.rotation_gate === 'LONG_ONLY' ? 'long' : 'short',
    rotation_gate: item.rotation_gate as 'LONG_ONLY' | 'SHORT_ONLY',
    rotation_score: item.active_rotation_score,
    rs_vs_btc_1h_pct: item.rs_vs_btc_1h_pct,
    rs_vs_btc_4h_pct: item.rs_vs_btc_4h_pct,
    rs_vs_btc_24h_pct: item.rs_vs_btc_24h_pct,
    rs_vs_eth_24h_pct: item.rs_vs_eth_24h_pct,
    effective_rvol: item.effective_rvol,
    volume_regime: item.volume_regime,
    derivatives_regime: item.derivatives_regime,
    funding_rate_pct: item.funding_rate_pct,
    oi_change_4h_pct: item.oi_change_4h_pct,
    layer: item.layer,
    layer_name: item.layer_name,
    sector: item.sector,
    rationale: item.rationale,
  }));

  return {
    status: rawSnapshot.status ?? 'AVAILABLE',
    evaluated_at_epoch_ms: Date.now(),
    universe_size: Object.keys(parsedCoins).length,
    macro_btc_gate: macroBtcGate,
    target_macro_direction: targetMacroDir,
    rotation_score_threshold: ROTATION_SCORE_THRESHOLD,
    meme_froth_warning: memeFrothWarning,
    btc_dominance_panel: {
      btc_dominance_pct: btcDomPct,
      btcdom_change_4h_pct: btcdom4h,
      btcdom_change_24h_pct: btcdom24h,
      dominance_regime: dominanceRegime,
    },
    bellwether_ratios: {
      eth_btc_24h_pct: ethBtc24h,
      eth_btc_5d_pct: ethBtc5d,
      sol_eth_24h_pct: solEth24h,
      sui_sol_24h_pct: suiSol24h,
    },
    active_inflow_layers: activeInflowLayers,
    sector_breadth: sectorBreadth,
    approved_long_symbols: approvedLongSymbols,
    approved_short_symbols: approvedShortSymbols,
    on_demand_smc_targets: onDemandSmcTargets,
    vetoed_symbols: vetoedSymbols,
    coin_assessments: coinAssessments,
  };
}

export class CryptoRotationEngine {
  private static instance: CryptoRotationEngine | null = null;
  private cachedLiveReport: CryptoRotationEvaluationReport | null = null;
  private cachedLiveReportAtMs = 0;

  public static getInstance(): CryptoRotationEngine {
    if (!CryptoRotationEngine.instance) {
      CryptoRotationEngine.instance = new CryptoRotationEngine();
    }
    return CryptoRotationEngine.instance;
  }

  public extractRotationFromPayload(payload: MacroGatePayload | null): CryptoRotationEvaluationReport | null {
    if (!payload) return this.cachedLiveReport;

    const direct = (payload as any).crypto_rotation as CryptoRotationEvaluationReport | undefined;
    const fromRegime = payload.regime_state?.crypto_rotation as CryptoRotationEvaluationReport | undefined;
    const payloadReport =
      direct && typeof direct === 'object' && direct.coin_assessments
        ? direct
        : fromRegime && typeof fromRegime === 'object' && fromRegime.coin_assessments
          ? fromRegime
          : null;

    // If we have a fresh 15m intraday live report that is newer than the morning macro_bias_gate.json, prefer it!
    const payloadEvalMs = Number(payloadReport?.evaluated_at_epoch_ms ?? 0);
    if (
      this.cachedLiveReport &&
      payloadEvalMs > 0 &&
      this.cachedLiveReportAtMs > payloadEvalMs
    ) {
      return this.cachedLiveReport;
    }

    if (payloadReport) {
      return payloadReport;
    }
    return this.cachedLiveReport;
  }

  public getCoinAssessment(symbolOrCoin: string, payload: MacroGatePayload | null): CoinRotationAssessment | null {
    const report = this.extractRotationFromPayload(payload);
    if (!report || !report.coin_assessments) return null;
    const upper = symbolOrCoin.toUpperCase().trim();
    const coinKey = upper.endsWith('USDT')
      ? upper.slice(0, -4)
      : upper.endsWith('USD') || upper.endsWith('EUR')
        ? upper.slice(0, -3)
        : upper;
    return report.coin_assessments[coinKey] ?? null;
  }

  /**
   * Resolves up to 3 Sector-Diversified On-Demand SMC target altcoins.
   * - Uses the Macro BTC direction (`LONG_ONLY` / `SHORT_ONLY`) from `macro_bias_gate.json`.
   * - If the rotation report in `macro_bias_gate.json` is older than 15 minutes (`INTRADAY_ROTATION_TTL_MS`),
   *   automatically refreshes the 39-coin 8-factor rotation live from Binance so intraday capital flows
   *   and short-squeeze vetoes are never stale.
   */
  public async resolveOnDemandSmcTargets(payload: MacroGatePayload | null): Promise<OnDemandSmcTarget[]> {
    if (!payload) return [];
    const gates = payload.execution_bias_gates ?? {};
    const btcGate = (gates.BTC || gates.BTCUSD || 'NEUTRAL_RANGE').toUpperCase();
    const isDirectional = btcGate.includes('LONG') || btcGate.includes('SHORT');
    if (!isDirectional || payload.capital_preservation_mode) {
      return [];
    }

    const now = Date.now();
    const direct = (payload as any).crypto_rotation as CryptoRotationEvaluationReport | undefined;
    const fromRegime = payload.regime_state?.crypto_rotation as CryptoRotationEvaluationReport | undefined;
    const payloadReport =
      direct && typeof direct === 'object' && Array.isArray(direct.on_demand_smc_targets)
        ? direct
        : fromRegime && typeof fromRegime === 'object' && Array.isArray(fromRegime.on_demand_smc_targets)
          ? fromRegime
          : null;

    if (payloadReport) {
      const evalEpochMs = Number(payloadReport.evaluated_at_epoch_ms ?? 0);
      // If evaluated_at_epoch_ms is omitted (e.g. deterministic unit test fixture) or fresh (<15m), use it directly
      if (!evalEpochMs || now - evalEpochMs <= INTRADAY_ROTATION_TTL_MS) {
        return payloadReport.on_demand_smc_targets.slice(0, MAX_ON_DEMAND_SMC_TARGETS);
      }
    }

    // Intraday Live Refresh (when macro_bias_gate.json is >15 minutes old or missing crypto_rotation)
    if (
      this.cachedLiveReport &&
      now - this.cachedLiveReportAtMs < INTRADAY_ROTATION_TTL_MS &&
      this.cachedLiveReport.macro_btc_gate === btcGate
    ) {
      return this.cachedLiveReport.on_demand_smc_targets.slice(0, MAX_ON_DEMAND_SMC_TARGETS);
    }

    try {
      const snapshot = await this.fetchLiveBulkSnapshot(
        payloadReport?.btc_dominance_panel?.btc_dominance_pct ?? null
      );
      const report = evaluateCryptoRotationSnapshot(snapshot, btcGate, {
        btcDecouplingActive: payload.btc_decoupling_active ?? false,
        capitalPreservationMode: payload.capital_preservation_mode ?? false,
      });
      this.cachedLiveReport = report;
      this.cachedLiveReportAtMs = now;
      console.log(
        `[CryptoRotationEngine] 🔄 Canlı 15dk Gün İçi Rotasyon Yenilendi (${btcGate}): ` +
        `On-Demand Hedefler = ${report.on_demand_smc_targets.map(t => `${t.smc_symbol}(${t.rotation_score})`).join(', ') || 'YOK'}`
      );
      return report.on_demand_smc_targets.slice(0, MAX_ON_DEMAND_SMC_TARGETS);
    } catch (err) {
      console.warn('[CryptoRotationEngine] Live intraday rotation refresh failed, falling back to gate payload:', err);
      if (payloadReport) {
        return payloadReport.on_demand_smc_targets.slice(0, MAX_ON_DEMAND_SMC_TARGETS);
      }
      return [];
    }
  }

  private async fetchCoinIntradayDetail(meta: CryptoUniverseEntry): Promise<{
    bars_1h: RawBar[];
    bars_4h: RawBar[];
    oi_history_1h: RawOiPoint[];
    deep_fetched: boolean;
  }> {
    const [k1hRes, k4hRes, oiRes] = await Promise.all([
      fetch(`https://api.binance.com/api/v3/klines?symbol=${meta.spotSymbol}&interval=1h&limit=26`),
      fetch(`https://api.binance.com/api/v3/klines?symbol=${meta.spotSymbol}&interval=4h&limit=32`),
      fetch(`https://fapi.binance.com/futures/data/openInterestHist?symbol=${meta.futuresSymbol}&period=1h&limit=25`).catch(() => null),
    ]);

    const parseKlines = (rows: any[]): RawBar[] =>
      Array.isArray(rows)
        ? rows.map(r => ({
            open: Number(r[1] ?? 0),
            high: Number(r[2] ?? 0),
            low: Number(r[3] ?? 0),
            close: Number(r[4] ?? 0),
            quote_volume: Number(r[7] ?? 0),
          }))
        : [];

    const bars_1h = k1hRes.ok ? parseKlines((await k1hRes.json()) as any[]) : [];
    const bars_4h = k4hRes.ok ? parseKlines((await k4hRes.json()) as any[]) : [];
    const oiRaw = oiRes && oiRes.ok ? ((await oiRes.json()) as any[]) : [];
    const oi_history_1h: RawOiPoint[] = Array.isArray(oiRaw)
      ? oiRaw.map(item => ({
          sum_open_interest: Number(item.sumOpenInterest ?? 0),
          sum_open_interest_value: Number(item.sumOpenInterestValue ?? 0),
        }))
      : [];

    return {
      bars_1h,
      bars_4h,
      oi_history_1h,
      deep_fetched: bars_1h.length > 0 || bars_4h.length > 0,
    };
  }

  private async fetchLiveBulkSnapshot(fallbackBtcDomPct: number | null = null): Promise<RawRotationSnapshot> {
    const [spotRes, futRes, premRes] = await Promise.all([
      fetch('https://api.binance.com/api/v3/ticker/24hr'),
      fetch('https://fapi.binance.com/fapi/v1/ticker/24hr'),
      fetch('https://fapi.binance.com/fapi/v1/premiumIndex'),
    ]);

    const spotList = spotRes.ok ? ((await spotRes.json()) as any[]) : [];
    const futList = futRes.ok ? ((await futRes.json()) as any[]) : [];
    const premList = premRes.ok ? ((await premRes.json()) as any[]) : [];

    const spotMap = new Map<string, any>(spotList.map(i => [String(i.symbol), i]));
    const futMap = new Map<string, any>(futList.map(i => [String(i.symbol), i]));
    const premMap = new Map<string, any>(premList.map(i => [String(i.symbol), i]));

    const coins: Record<string, RawCoinRotationInput> = {};
    const entries = Object.entries(CRYPTO_ROTATION_UNIVERSE_META);
    for (const [coin, meta] of entries) {
      const sp = spotMap.get(meta.spotSymbol) ?? {};
      const ft = futMap.get(meta.futuresSymbol) ?? {};
      const pr = premMap.get(meta.futuresSymbol) ?? {};
      coins[coin] = {
        coin,
        spot_symbol: meta.spotSymbol,
        futures_symbol: meta.futuresSymbol,
        smc_symbol: meta.smcSymbol,
        layer: meta.layer,
        layer_name: meta.layerName,
        sector: meta.sector,
        spot_last_price: Number(sp.lastPrice ?? pr.markPrice ?? 0),
        spot_price_change_24h_pct: Number(sp.priceChangePercent ?? ft.priceChangePercent ?? 0),
        spot_quote_volume_24h: Number(sp.quoteVolume ?? 0),
        futures_quote_volume_24h: Number(ft.quoteVolume ?? 0),
        funding_rate: Number(pr.lastFundingRate ?? 0),
      };
    }

    // Parallel batch fetch (chunk size 8) for all 39 coins' 1H/4H klines + 1H OI history
    const batchSize = 8;
    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async ([coin, meta]) => {
          try {
            const detail = await this.fetchCoinIntradayDetail(meta);
            Object.assign(coins[coin], detail);
          } catch {
            // Keep bulk fallback if individual kline fetch fails
          }
        })
      );
    }

    const btcdomTicker = futMap.get('BTCDOMUSDT');
    return {
      status: 'AVAILABLE',
      btc_dominance: {
        btc_dominance_pct: fallbackBtcDomPct,
        btcdom_change_24h_pct: btcdomTicker ? Number(btcdomTicker.priceChangePercent ?? 0) : null,
        btcdom_change_4h_pct: null,
      },
      coins,
    };
  }
}
