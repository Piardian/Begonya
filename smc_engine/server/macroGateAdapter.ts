import * as fs from 'fs';
import * as path from 'path';
import { NewsGuard } from './newsGuard';

export interface MacroGatePayload {
  timestamp?: string;
  primary_regime?: string;
  volatility_risk_score?: number;
  capital_preservation_mode?: boolean;
  btc_decoupling_active?: boolean;
  hysteresis_active?: boolean;
  recommended_risk_multiplier?: number;
  execution_bias_gates?: Record<string, string>;
  asset_biases?: Record<string, string>;
  regime_state?: {
    energy_penalty_active?: boolean;
    capital_preservation_active?: boolean;
    fast_stress_override?: boolean;
    btc_decoupling_active?: boolean;
    vix_pct_60d?: number;
    vix_level?: number;
    brent_pct_60d?: number;
    brent_level?: number;
    brent_roc_20d?: number;
    brent_roc_5d?: number;
    spread_ca_us_2y_bps?: number;
    spread_ca_us_2y_delta_5d?: number;
    spread_de_us_2y_bps?: number;
    spread_de_us_2y_delta_5d?: number;
    spread_gb_us_2y_bps?: number;
    spread_gb_us_2y_delta_5d?: number;
    spread_au_us_2y_bps?: number;
    spread_au_us_2y_delta_5d?: number;
    spread_au_ca_2y_bps?: number;
    spread_au_ca_2y_delta_5d?: number;
    iron_ore_roc_20d?: number;
    dairy_gdt_roc_20d?: number;
    sol_btc_roc_5d?: number;
    sol_btc_structure_bullish?: boolean;
    cross_currency_scores?: Record<string, number>;
    cross_pair_gates?: Record<string, string>;
    copper_gold_delta_4w_pct?: number;
    transatlantic_spread_bps?: number;
    equity_short_allowed?: boolean;
    gold_short_allowed?: boolean;
    vix_complacent?: boolean;
    [key: string]: any;
  };
  macro_rationale?: string;
}

export type BegonyaScoreTier = 'A+' | 'A' | 'B' | 'C' | 'D';

export interface MacroGateEvaluation {
  allowed: boolean;
  action: 'PROCEED' | 'VETO' | 'DEFENSIVE_REDUCE' | 'NEUTRAL_CAUTION';
  symbol: string;
  mappedMacroKey: string;
  tradeDirection: 'long' | 'short';
  macroBias: string;
  primaryRegime: string;
  riskMultiplier: number;
  capitalPreservationMode: boolean;
  btcDecouplingActive: boolean;
  macroRationale: string;
  gateStatusMessage: string;
  stalenessHours?: number;
  isStale?: boolean;

  // 🌺 Begonya Çarpımsal Kapı & SMC Puanlama Çerçevesi
  macroGateMultiplier: 0 | 1;      // G_macro: 0 (VETO / KİLİT) veya 1 (ONAY)
  smcTechnicalScore: number;       // 0 - 100 SMC Teknik Kalite Skoru
  begonyaScore: number;           // Nihai Skor = G_macro * smcTechnicalScore (0 veya 1-100)
  scoreTier: BegonyaScoreTier;
  tierRationale: string;
}

export interface SymbolMappingEntry {
  macro_key?: string;
  proxy?: string;
  macro_type?: string;
  base_currency?: string;
  quote_currency?: string;
  base_driver?: string;
  quote_driver?: string;
}

interface SymbolMapConfig {
  mappings: Record<string, SymbolMappingEntry>;
  default_risk_multiplier: number;
  max_gate_staleness_hours: number;
}

function findBegonyaRoot(startDir: string): string {
  let curr = startDir;
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(path.join(curr, 'macro_engine')) && fs.existsSync(path.join(curr, 'smc_engine'))) {
      return curr;
    }
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }
  return path.resolve(startDir, '../..');
}

export class MacroGateAdapter {
  private static instance: MacroGateAdapter | null = null;
  private readonly sharedGatePath: string;
  private readonly fallbackGatePath: string;
  private readonly configPath: string;
  private cachedSymbolMap: SymbolMapConfig | null = null;

  private constructor() {
    const root = findBegonyaRoot(__dirname);
    this.sharedGatePath = path.resolve(root, 'shared/macro_bias_gate.json');
    this.fallbackGatePath = path.resolve(root, 'macro_engine/gateways/macro_bias_gate.json');
    this.configPath = path.resolve(root, 'config/symbol_map.json');
  }

  public static getInstance(): MacroGateAdapter {
    if (!MacroGateAdapter.instance) {
      MacroGateAdapter.instance = new MacroGateAdapter();
    }
    return MacroGateAdapter.instance;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PORTFÖY BETA KÜMELENME & KORELASYON TAKİBİ (EXPOSURE MANAGER)
  // ──────────────────────────────────────────────────────────────────────────
  private activePositions: Array<{ symbol: string; tradeDirection: 'long' | 'short'; timestamp: number }> = [];

  public registerActivePosition(symbol: string, tradeDirection: 'long' | 'short'): void {
    const cleanSym = symbol.toUpperCase();
    this.activePositions = this.activePositions.filter(p => p.symbol !== cleanSym);
    this.activePositions.push({ symbol: cleanSym, tradeDirection, timestamp: Date.now() });
  }

  public closeActivePosition(symbol: string): void {
    const cleanSym = symbol.toUpperCase();
    this.activePositions = this.activePositions.filter(p => p.symbol !== cleanSym);
  }

  public clearActivePositions(): void {
    this.activePositions = [];
  }

  public getActivePositions(): Array<{ symbol: string; tradeDirection: 'long' | 'short' }> {
    return [...this.activePositions];
  }

  public resolveCurrencyLegs(symbol: string, tradeDirection: 'long' | 'short', symbolMap: SymbolMapConfig): {
    usdLeg?: 'LONG' | 'SHORT';
    jpyLeg?: 'LONG' | 'SHORT';
    isCrypto?: boolean;
  } {
    const cleanSym = symbol.toUpperCase();
    const mapped = symbolMap.mappings[cleanSym];
    const base = mapped?.base_currency?.toUpperCase() || (cleanSym.length === 6 ? cleanSym.slice(0, 3) : '');
    const quote = mapped?.quote_currency?.toUpperCase() || (cleanSym.length === 6 ? cleanSym.slice(3, 6) : '');
    const isLong = tradeDirection === 'long';

    let usdLeg: 'LONG' | 'SHORT' | undefined;
    let jpyLeg: 'LONG' | 'SHORT' | undefined;
    const isCrypto = ['BTC', 'SOL', 'ETH', 'LTC'].includes(base) || cleanSym.startsWith('BTC') || cleanSym.startsWith('SOL') || cleanSym.startsWith('ETH');

    if (base === 'USD') usdLeg = isLong ? 'LONG' : 'SHORT';
    if (quote === 'USD') usdLeg = isLong ? 'SHORT' : 'LONG';

    if (base === 'JPY') jpyLeg = isLong ? 'LONG' : 'SHORT';
    if (quote === 'JPY') jpyLeg = isLong ? 'SHORT' : 'LONG';

    return { usdLeg, jpyLeg, isCrypto };
  }

  private loadSymbolMap(): SymbolMapConfig {
    if (this.cachedSymbolMap) return this.cachedSymbolMap;
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf-8').replace(/^\uFEFF/, '');
        this.cachedSymbolMap = JSON.parse(raw) as SymbolMapConfig;
        return this.cachedSymbolMap;
      }
    } catch (e) {
      console.warn(`[MacroGateAdapter] symbol_map.json okunamadı, varsayılanlar devrede: ${e}`);
    }
    return {
      mappings: {
        EURUSD: { macro_key: 'EURUSD' },
        XAUUSD: { macro_key: 'XAUUSD' },
        BTCUSD: { macro_key: 'BTC' },
        NAS100: { macro_key: 'SPX' },
      },
      default_risk_multiplier: 1.0,
      max_gate_staleness_hours: 36,
    };
  }

  public loadGatePayload(): MacroGatePayload | null {
    const candidatePaths = [this.sharedGatePath, this.fallbackGatePath];
    for (const filePath of candidatePaths) {
      try {
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '');
          const parsed = JSON.parse(content) as MacroGatePayload;
          return parsed;
        }
      } catch (err) {
        console.warn(`[MacroGateAdapter] ${filePath} okuma hatası:`, err);
      }
    }
    return null;
  }

  private buildVetoResult(
    symbol: string,
    mappedMacroKey: string,
    tradeDirection: 'long' | 'short',
    macroBias: string,
    primaryRegime: string,
    capitalPreservation: boolean,
    btcDecoupling: boolean,
    macroRationale: string,
    smcTechnicalScore: number,
    gateStatusMessage: string
  ): MacroGateEvaluation {
    return {
      allowed: false,
      action: 'VETO',
      symbol,
      mappedMacroKey,
      tradeDirection,
      macroBias,
      primaryRegime,
      riskMultiplier: 0.0,
      capitalPreservationMode: capitalPreservation,
      btcDecouplingActive: btcDecoupling,
      macroRationale,
      gateStatusMessage,
      macroGateMultiplier: 0,
      smcTechnicalScore,
      begonyaScore: 0,
      scoreTier: 'D',
      tierRationale: 'Makro Kapı Kilitli (G_macro = 0). Teknik ne kadar iyi olursa olsun işlem açılmaz.',
    };
  }

  public resolveDriverScore(driver: string, payload: MacroGatePayload): { score: number; reason: string } {
    const rs = payload.regime_state ?? {};
    const assetBiases = payload.asset_biases ?? {};
    const dUpper = (driver || '').toUpperCase();

    // 1. Doğrudan hesaplanmış currency score kontrolü
    if (rs.cross_currency_scores && typeof rs.cross_currency_scores[dUpper] === 'number') {
      const s = rs.cross_currency_scores[dUpper];
      return { score: s, reason: `Rejim Skoru (${dUpper}): ${s > 0 ? '+' : ''}${s}` };
    }

    switch (dUpper) {
      case 'CAD':
      case 'CAD_MACRO':
      case 'BRENT': {
        const brentRoc = rs.brent_roc_20d;
        const caSpreadDelta = rs.spread_ca_us_2y_delta_5d;
        if (typeof brentRoc === 'number' && typeof caSpreadDelta === 'number') {
          if (brentRoc > 3.0 && caSpreadDelta > 0) {
            return { score: 1, reason: `Brent 20G RoC: +%${brentRoc.toFixed(1)} & CA-US 2Y Spread Genişliyor (+${caSpreadDelta.toFixed(1)} bps) -> Güçlü CAD` };
          }
          if (brentRoc < -3.0 && caSpreadDelta < 0) {
            return { score: -1, reason: `Brent 20G RoC: %${brentRoc.toFixed(1)} & CA-US 2Y Spread Daralıyor (${caSpreadDelta.toFixed(1)} bps) -> Zayıf CAD` };
          }
          return { score: 0, reason: `Brent RoC (%${brentRoc.toFixed(1)}) ve 2Y Spread (${caSpreadDelta.toFixed(1)} bps) dengeli/nötr` };
        }
        const brent = rs.brent_level ?? 80;
        const brentPct = rs.brent_pct_60d ?? 50;
        if (brent >= 85 || brentPct >= 80) return { score: 1, reason: `Brent petrol yüksek ($${brent.toFixed(1)}) -> Güçlü CAD` };
        if (brent < 72 || brentPct <= 25) return { score: -1, reason: `Brent petrol zayıf ($${brent.toFixed(1)}) -> Zayıf CAD` };
        return { score: 0, reason: `Brent petrol dengeli ($${brent.toFixed(1)})` };
      }
      case 'AUD':
      case 'AUD_MACRO':
      case 'COPPER_GOLD': {
        const delta = rs.copper_gold_delta_4w_pct ?? 0;
        const ironOreRoc = rs.iron_ore_roc_20d;
        if (typeof ironOreRoc === 'number') {
          if (delta > 0 && ironOreRoc > 0) {
            return { score: 1, reason: `Bakır/Altın (+%${delta.toFixed(2)}) ve Demir Cevheri (+%${ironOreRoc.toFixed(1)}) pozitif -> Güçlü AUD` };
          }
          if (delta < 0 && ironOreRoc < 0) {
            return { score: -1, reason: `Bakır/Altın (%${delta.toFixed(2)}) ve Demir Cevheri (%${ironOreRoc.toFixed(1)}) zayıf -> Zayıf AUD` };
          }
          return { score: 0, reason: `Bakır/Altın (%${delta.toFixed(2)}) ve Demir Cevheri (%${ironOreRoc.toFixed(1)}) nötr/ayrışmış` };
        }
        if (delta > 1.5) return { score: 1, reason: `Bakır/Altın momentumu pozitif (+%${delta.toFixed(2)})` };
        if (delta < -1.0) return { score: -1, reason: `Bakır/Altın sanayi talebi zayıf (%${delta.toFixed(2)})` };
        return { score: 0, reason: `Bakır/Altın momentumu nötr (%${delta.toFixed(2)})` };
      }
      case 'NZD':
      case 'NZD_MACRO': {
        const dairyRoc = rs.dairy_gdt_roc_20d ?? 0;
        const vix = rs.vix_level ?? 15;
        const auNzSpreadDelta = rs.spread_au_nz_2y_delta_5d;

        if (Math.abs(dairyRoc) >= 0.1) {
          if (dairyRoc > 0 && vix < 20) {
            return { score: 1, reason: `GDT Süt İndeksi (+%${dairyRoc.toFixed(1)}) & Asya risk iştahı açık -> Güçlü NZD` };
          }
          if (dairyRoc < 0 && vix >= 20) {
            return { score: -1, reason: `GDT Süt İndeksi (%${dairyRoc.toFixed(1)}) & Asya riskten kaçış -> Zayıf NZD` };
          }
        } else if (typeof auNzSpreadDelta === 'number') {
          // GDT Bayatlık Kalkanı (14 günlük sessizlik penceresi): Canlı AU-NZ 2Y faiz makası devreye girer
          if (auNzSpreadDelta < -3.0) {
            return { score: 1, reason: `GDT Sessizliğinde Canlı AU-NZ 2Y Makası Daralıyor (${auNzSpreadDelta.toFixed(1)} bps) -> Güçlü NZD` };
          }
          if (auNzSpreadDelta > 3.0) {
            return { score: -1, reason: `GDT Sessizliğinde Canlı AU-NZ 2Y Makası Genişliyor (+${auNzSpreadDelta.toFixed(1)} bps) -> Zayıf NZD` };
          }
        }
        return { score: 0, reason: `NZD göstergeleri dengeli (Süt: %${dairyRoc.toFixed(1)}, VIX: ${vix.toFixed(1)})` };
      }
      case 'JPY':
      case 'JPY_MACRO':
      case 'YIELD_CARRY': {
        const vixPct = rs.vix_pct_60d ?? 50;
        const capPres = payload.capital_preservation_mode ?? false;
        if (capPres || vixPct >= 75) {
          return { score: 1, reason: 'Sistemik stres/VIX yüksek -> JPY güvenli liman talebi güçlü' };
        }
        return { score: -1, reason: 'Taşıma getirisi (carry trade) faiz avantajı -> JPY zayıf' };
      }
      case 'EUR':
      case 'EUR_MACRO':
      case 'EUR_ENERGY': {
        const penalty = rs.energy_penalty_active ?? false;
        const deSpreadDelta = rs.spread_de_us_2y_delta_5d;
        if (penalty) return { score: -1, reason: 'Euro Bölgesi enerji cezası aktif -> Zayıf EUR' };
        if (typeof deSpreadDelta === 'number' && deSpreadDelta > 5.0) {
          return { score: 1, reason: `DE-US 2Y getiri makası lehte (+${deSpreadDelta.toFixed(1)} bps) -> Güçlü EUR` };
        }
        if (typeof deSpreadDelta === 'number' && deSpreadDelta < -5.0) {
          return { score: -1, reason: `DE-US 2Y getiri makası aleyhte (${deSpreadDelta.toFixed(1)} bps) -> Zayıf EUR` };
        }
        return { score: 0, reason: 'Euro Bölgesi dengeli' };
      }
      case 'GBP':
      case 'GBP_MACRO': {
        const gbSpreadDelta = rs.spread_gb_us_2y_delta_5d;
        if (typeof gbSpreadDelta === 'number' && gbSpreadDelta > 5.0) {
          return { score: 1, reason: `GB-US 2Y getiri makası lehte (+${gbSpreadDelta.toFixed(1)} bps) -> Güçlü GBP` };
        }
        if (typeof gbSpreadDelta === 'number' && gbSpreadDelta < -5.0) {
          return { score: -1, reason: `GB-US 2Y getiri makası aleyhte (${gbSpreadDelta.toFixed(1)} bps) -> Zayıf GBP` };
        }
        const dxyBias = assetBiases['DXY'];
        if (dxyBias === 'Bearish' || dxyBias === 'Strong Bearish') return { score: 1, reason: "Zayıf Dolar GBP'yi destekliyor" };
        if (dxyBias === 'Bullish' || dxyBias === 'Strong Bullish') return { score: -1, reason: "Güçlü Dolar GBP'yi baskılıyor" };
        return { score: 0, reason: 'GBP dengeli' };
      }
      case 'USD':
      case 'USD_MACRO':
      case 'DXY': {
        const dxyBias = assetBiases['DXY'];
        if (dxyBias === 'Bullish' || dxyBias === 'Strong Bullish') return { score: 1, reason: 'DXY yükseliş trendi / Güçlü USD' };
        if (dxyBias === 'Bearish' || dxyBias === 'Strong Bearish') return { score: -1, reason: 'DXY düşüş trendi / Zayıf USD' };
        return { score: 0, reason: 'USD dengeli / nötr' };
      }
      case 'CHF':
      case 'CHF_MACRO': {
        const vixPct = rs.vix_pct_60d ?? 50;
        const vixVal = rs.vix_level ?? 15;
        const capPres = payload.capital_preservation_mode ?? false;
        if (capPres || vixVal >= 25 || vixPct >= 75) {
          return { score: 1, reason: 'Sistemik stres / krizde CHF güvenli liman talebi güçlü' };
        }
        if (vixVal < 18) {
          return { score: -1, reason: 'Düşük oynaklıkta SNB faiz dezavantajı / Zayıf CHF' };
        }
        return { score: 0, reason: 'CHF dengeli / nötr' };
      }
      default:
        return { score: 0, reason: 'Nötr sürücü' };
    }
  }

  public resolveSyntheticCrossDirection(
    cleanSym: string,
    mapping: SymbolMappingEntry,
    payload: MacroGatePayload
  ): { direction: 'LONG' | 'SHORT' | 'NEUTRAL'; reason: string } {
    const baseDriver = mapping.base_driver ?? '';
    const quoteDriver = mapping.quote_driver ?? '';
    const baseRes = this.resolveDriverScore(baseDriver, payload);
    const quoteRes = this.resolveDriverScore(quoteDriver, payload);

    const netScore = baseRes.score - quoteRes.score;
    const baseSym = mapping.base_currency ?? 'Base';
    const quoteSym = mapping.quote_currency ?? 'Quote';

    // A +1 base versus 0 quote (or vice versa) is not enough evidence for a
    // directional FX gate. Only a +2/-2 divergence (opposite scores) is directional.
    if (netScore >= 2) {
      return {
        direction: 'LONG',
        reason: `Sentetik Çapraz: ${baseSym} (${baseRes.reason}) vs ${quoteSym} (${quoteRes.reason}) -> Net Skor: +${netScore} (LONG)`,
      };
    }
    if (netScore <= -2) {
      return {
        direction: 'SHORT',
        reason: `Sentetik Çapraz: ${baseSym} (${baseRes.reason}) vs ${quoteSym} (${quoteRes.reason}) -> Net Skor: ${netScore} (SHORT)`,
      };
    }
    return {
      direction: 'NEUTRAL',
      reason: `Sentetik Çapraz: ${baseSym} (${baseRes.reason}) vs ${quoteSym} (${quoteRes.reason}) -> Net Skor: 0 (Nötr)`,
    };
  }

  public resolveMacroDirection(
    cleanSym: string,
    macroKey: string,
    payload: MacroGatePayload,
    symbolMap: SymbolMapConfig
  ): { direction: 'LONG' | 'SHORT' | 'NEUTRAL'; reason: string } {
    const gates = payload.execution_bias_gates ?? {};
    const assetBiases = payload.asset_biases ?? {};
    const mapped = symbolMap.mappings[cleanSym];
    const proxy = mapped?.proxy;

    // 1. Önce doğrudan execution_bias_gates kontrolü (Açık kapı tanımlıysa önceliklidir)
    const rawGate = (gates[cleanSym] || gates[macroKey] || '').toUpperCase();
    if (rawGate === 'LONG_ONLY') {
      return { direction: 'LONG', reason: `Makro Kapı: ${cleanSym} LONG_ONLY` };
    }
    if (rawGate === 'SHORT_ONLY') {
      return { direction: 'SHORT', reason: `Makro Kapı: ${cleanSym} SHORT_ONLY` };
    }
    if (['DEFENSIVE_HOLD', 'NO_TRADE', 'REDUCE_ONLY', 'NEUTRAL_RANGE', 'EVENT_FREEZE'].includes(rawGate)) {
      return { direction: 'NEUTRAL', reason: `Makro Kapı Yönsüz / Savunmada (${rawGate})` };
    }

    // 2. Sentetik Çapraz & Majör Kur (Relative Value) kontrolü
    if (mapped?.macro_type === 'SYNTHETIC_CROSS') {
      return this.resolveSyntheticCrossDirection(cleanSym, mapped, payload);
    }

    // 2. Eğer gate atanmamışsa veya NEUTRAL_ALL ise, asset_biases & proxy eşlemesini sorgula
    const biasKey = macroKey in assetBiases ? macroKey : (cleanSym in assetBiases ? cleanSym : null);
    const rawBias = biasKey ? assetBiases[biasKey] : null;

    if (rawBias) {
      const isBull = rawBias === 'Strong Bullish' || rawBias === 'Bullish';
      const isBear = rawBias === 'Strong Bearish' || rawBias === 'Bearish';

      if (proxy === 'DXY_INVERSE') {
        if (isBull) return { direction: 'SHORT', reason: `DXY ${rawBias} -> Ters Korelasyon SHORT` };
        if (isBear) return { direction: 'LONG', reason: `DXY ${rawBias} -> Ters Korelasyon LONG` };
      } else {
        if (isBull) return { direction: 'LONG', reason: `Makro Varlık Görünümü: ${rawBias}` };
        if (isBear) return { direction: 'SHORT', reason: `Makro Varlık Görünümü: ${rawBias}` };
      }
    }

    // 3. Eğer proxy varsa ve DXY bias'ı mevcutsa
    if (proxy && assetBiases['DXY']) {
      const dxyBias = assetBiases['DXY'];
      const dxyBull = dxyBias === 'Strong Bullish' || dxyBias === 'Bullish';
      const dxyBear = dxyBias === 'Strong Bearish' || dxyBias === 'Bearish';

      if (proxy === 'DXY_INVERSE') {
        if (dxyBull) return { direction: 'SHORT', reason: `DXY ${dxyBias} -> Ters Korelasyon SHORT` };
        if (dxyBear) return { direction: 'LONG', reason: `DXY ${dxyBias} -> Ters Korelasyon LONG` };
      } else if (proxy === 'DXY_DIRECT') {
        if (dxyBull) return { direction: 'LONG', reason: `DXY ${dxyBias} -> Doğrudan Korelasyon LONG` };
        if (dxyBear) return { direction: 'SHORT', reason: `DXY ${dxyBias} -> Doğrudan Korelasyon SHORT` };
      }
    }

    return { direction: 'NEUTRAL', reason: `Net bir makroekonomik yön belirlenmedi (${rawGate || 'Nötr'})` };
  }

  public evaluateCandidate(
    symbol: string,
    tradeDirection: 'long' | 'short',
    smcGradeScore?: number,
    activePositionsOverride?: Array<{ symbol: string; tradeDirection: 'long' | 'short' }>
  ): MacroGateEvaluation {
    const symbolMap = this.loadSymbolMap();
    const payload = this.loadGatePayload();
    const cleanSym = symbol.toUpperCase();
    const mapped = symbolMap.mappings[cleanSym];
    const macroKey = mapped?.macro_key ?? cleanSym;

    // Fail-closed: Makro gate yoksa yön tayini yapılamaz ve işlem açılmaz.
    if (!payload) {
      const smcScore = typeof smcGradeScore === 'number' ? Math.min(100, Math.max(10, smcGradeScore)) : 75;
      return {
        allowed: false,
        action: 'VETO',
        symbol: cleanSym,
        mappedMacroKey: macroKey,
        tradeDirection,
        macroBias: 'NO_DATA',
        primaryRegime: 'Uninitialized Regime',
        riskMultiplier: 0.0,
        capitalPreservationMode: true,
        btcDecouplingActive: false,
        macroRationale: 'Makro kapı verisi bulunamadı. Gerçek makro yön doğrulanamadığı için fail-closed uygulanıyor.',
        gateStatusMessage: 'Makro veri aktif değil; işlem açılmaz.',
        macroGateMultiplier: 0,
        smcTechnicalScore: smcScore,
        begonyaScore: 0,
        scoreTier: 'D',
        tierRationale: 'Makro veri yok; yönlü işlem için yeterli kanıt bulunmuyor.',
      };
    }

    const regime = payload.primary_regime ?? 'Genel Makro Rejim';
    const riskScore = payload.volatility_risk_score ?? 0.40;
    const capitalPreservation = payload.capital_preservation_mode ?? false;
    const btcDecoupling = payload.btc_decoupling_active ?? false;
    const rationale = payload.macro_rationale ?? '';
    const regimeState = payload.regime_state ?? {};

    // Kapı yönü sorgula
    const gates = payload.execution_bias_gates ?? {};
    const macroBias = (gates[macroKey] || gates[cleanSym] || 'NEUTRAL_ALL').toUpperCase();

    // ──────────────────────────────────────────────────────────────────────────
    // SMC TEKNİK KALİTE PUANLAMASI (0 - 100)
    // ──────────────────────────────────────────────────────────────────────────
    let smcScore = 80; // Varsayılan kurumsal A kalite kurulum
    if (typeof smcGradeScore === 'number' && !isNaN(smcGradeScore)) {
      if (smcGradeScore <= 9) {
        const mapping: Record<number, number> = {
          9: 98,
          8: 90,
          7: 82,
          6: 75,
          5: 65,
          4: 50,
          3: 40,
          2: 30,
          1: 20,
          0: 10,
        };
        smcScore = mapping[Math.round(smcGradeScore)] ?? Math.min(100, Math.max(10, Math.round((smcGradeScore / 9) * 100)));
      } else {
        smcScore = Math.min(100, Math.max(10, Math.round(smcGradeScore)));
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // -1. KATMAN: PORTFÖY BETA KÜMELENME & KORELASYON KALKANI (EXPOSURE CAPS)
    // ──────────────────────────────────────────────────────────────────────────
    const activeList = activePositionsOverride ?? this.activePositions;
    const candidateLegs = this.resolveCurrencyLegs(cleanSym, tradeDirection, symbolMap);

    let activeUsdSameDirectionCount = 0;
    let activeJpyShortCount = 0;
    let activeCryptoCount = 0;

    for (const pos of activeList) {
      if (pos.symbol.toUpperCase() === cleanSym) continue; // Mevcut pozisyonu çift sayma
      const legs = this.resolveCurrencyLegs(pos.symbol, pos.tradeDirection, symbolMap);
      if (candidateLegs.usdLeg && legs.usdLeg === candidateLegs.usdLeg) {
        activeUsdSameDirectionCount++;
      }
      if (legs.jpyLeg === 'SHORT') {
        activeJpyShortCount++;
      }
      if (legs.isCrypto) {
        activeCryptoCount++;
      }
    }

    // A) USD Bacak Sınırı (Max 2)
    if (candidateLegs.usdLeg && activeUsdSameDirectionCount >= 2) {
      return this.buildVetoResult(
        cleanSym,
        macroKey,
        tradeDirection,
        macroBias,
        regime,
        capitalPreservation,
        btcDecoupling,
        rationale,
        smcScore,
        `🛑 VETO [PORTFOLIO_EXPOSURE_CAP]: Dolar (${candidateLegs.usdLeg === 'LONG' ? 'Uzun/Long' : 'Kısa/Short'}) bacağında izin verilen maksimum aktif pozisyon sınırına (2) ulaşıldı! Portföy beta kümelenmesini önlemek için yeni Dolar işlemi engellendi.`
      );
    }

    // B) JPY-Short / Carry Sınırı (Max 2)
    if (candidateLegs.jpyLeg === 'SHORT' && activeJpyShortCount >= 2) {
      return this.buildVetoResult(
        cleanSym,
        macroKey,
        tradeDirection,
        macroBias,
        regime,
        capitalPreservation,
        btcDecoupling,
        rationale,
        smcScore,
        `🛑 VETO [PORTFOLIO_EXPOSURE_CAP]: JPY-Short (Yen Satış / Carry) bacağında maksimum aktif pozisyon sınırına (2) ulaşıldı! BoJ faiz sıçraması ve küresel kriz riskine karşı 3. JPY satışı engellendi.`
      );
    }

    // C) Kripto Beta Sınırı (Max 1)
    if (candidateLegs.isCrypto && activeCryptoCount >= 1) {
      return this.buildVetoResult(
        cleanSym,
        macroKey,
        tradeDirection,
        macroBias,
        regime,
        capitalPreservation,
        btcDecoupling,
        rationale,
        smcScore,
        `🛑 VETO [PORTFOLIO_EXPOSURE_CAP]: Yüksek beta Kripto sepetinde maksimum aktif pozisyon sınırına (1) ulaşıldı! Fon tasfiyesi (margin call) dalgasına karşı ikinci bir kripto işlemi engellendi.`
      );
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 0. KATMAN: MAKRO HABER KALKANI (NEWS FREEZE GUARD - ±15 DK DONDURMA)
    // ──────────────────────────────────────────────────────────────────────────
    const newsFreeze = NewsGuard.getInstance().checkNewsFreeze(cleanSym);
    const eventFreezeFromGate = regimeState.event_freeze_active ?? false;
    if (newsFreeze.isFrozen || eventFreezeFromGate) {
      const reason = eventFreezeFromGate
        ? `🛑 VETO: Yüksek Etkili Kırmızı Bülten Dondurması (Event Freeze) Devrede! [${regimeState.active_event_info || 'Kritik Veri'}]`
        : `🛡️ VETO: Makro Haber Kalkanı Devrede! ${newsFreeze.reason}`;
      return this.buildVetoResult(
        cleanSym,
        macroKey,
        tradeDirection,
        macroBias,
        regime,
        capitalPreservation,
        btcDecoupling,
        rationale,
        smcScore,
        reason
      );
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 1. KATMAN: SİSTEMİK AŞIRI KRİZ DEVRE KESİCİSİ (VOLATİLİTE SKORU >= 0.95)
    // ──────────────────────────────────────────────────────────────────────────
    if (riskScore >= 0.95) {
      return this.buildVetoResult(
        cleanSym,
        macroKey,
        tradeDirection,
        macroBias,
        regime,
        capitalPreservation,
        btcDecoupling,
        rationale,
        smcScore,
        `🛑 VETO: Sistemik Aşırı Kriz / Acil Devre Kesici Devrede (Risk Skoru: ${riskScore.toFixed(2)})`
      );
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 2. KATMAN: ASİMETRİK PİYASA VE ENSTRÜMAN MUTLAK KALKANLARI
    // ──────────────────────────────────────────────────────────────────────────
    // A) ALTIN (XAUUSD / GOLD): Short requires the explicit macro SHORT_ONLY gate.
    // Do not infer a directional short merely from a crisis state.
    if ((cleanSym.includes('XAU') || cleanSym.includes('GOLD')) && tradeDirection === 'short') {
      if (macroBias !== 'SHORT_ONLY') {
        return this.buildVetoResult(
          cleanSym,
          macroKey,
          tradeDirection,
          macroBias,
          regime,
          capitalPreservation,
          btcDecoupling,
          rationale,
          smcScore,
          '🛑 VETO: XAUUSD SHORT için deterministic makro gate SHORT_ONLY değil.'
        );
      }
    }

    // B) BORSA ENDEKSLERİ (NAS100 / SPX / US100 / US500) SHORT KURALI: VIX Gecikme & Short Squeeze Kalkanı
    if ((cleanSym.includes('NAS') || cleanSym.includes('SPX') || cleanSym.includes('US100') || cleanSym.includes('US500')) && tradeDirection === 'short') {
      if (riskScore >= 0.65 || (regimeState.vix_pct_60d ?? 50) >= 80) {
        return this.buildVetoResult(
          cleanSym,
          macroKey,
          tradeDirection,
          macroBias,
          regime,
          capitalPreservation,
          btcDecoupling,
          rationale,
          smcScore,
          '🛑 VETO: Endekslerde VIX Yüksek (Gecikildi / Ayı Piyasası Rallisi ve Short Squeeze Riski Nedeniyle Short Yasak!)'
        );
      }
    }

    // C) KRİPTO (BTCUSD / ETHUSD) LONG KURALI: Fon Tasfiye Dalgası (Margin Call) Kalkanı
    if ((cleanSym.includes('BTC') || cleanSym.includes('ETH')) && tradeDirection === 'long' && btcDecoupling) {
      return this.buildVetoResult(
        cleanSym,
        macroKey,
        tradeDirection,
        macroBias,
        regime,
        capitalPreservation,
        btcDecoupling,
        rationale,
        smcScore,
        '🛑 VETO: Tahvil Şoku Kaynaklı Fon Tasfiye Dalgası (Margin Call) Devrede; Long Yasak!'
      );
    }

    // D) SOL (SOLUSD / SOL) KURALI: BTC Gate ve SOL/BTC Göreli Güç Filtresi + 4H CHoCH
    if (cleanSym.includes('SOL') && tradeDirection === 'long') {
      const btcGate = (gates['BTC'] || gates['BTCUSD'] || '').toUpperCase();
      const sol4hBroken = regimeState.sol_btc_4h_structure_broken ?? false;
      const solBtcBullish = (regimeState.sol_btc_structure_bullish ?? ((regimeState.sol_btc_roc_5d ?? 0) > 0)) && !sol4hBroken;
      const isBtcLong = (btcGate === 'LONG_ONLY' || btcGate === 'LONG_ONLY_ALLOWED_IF_DEBASEMENT') && !btcDecoupling;

      if (sol4hBroken) {
        return this.buildVetoResult(
          cleanSym,
          macroKey,
          tradeDirection,
          macroBias,
          regime,
          capitalPreservation,
          btcDecoupling,
          rationale,
          smcScore,
          `🛑 VETO: SOL/BTC 4H Piyasa Yapısı Bozuldu (CHoCH / Swing Low Kırıldı); Long Yasak!`
        );
      }
      if (!isBtcLong) {
        return this.buildVetoResult(
          cleanSym,
          macroKey,
          tradeDirection,
          macroBias,
          regime,
          capitalPreservation,
          btcDecoupling,
          rationale,
          smcScore,
          `🛑 VETO: SOL Long İzni Yok! BTC Kapısı LONG_ONLY değil (${btcGate || 'NÖTR'}) veya Decoupling devrede.`
        );
      }
      if (!solBtcBullish) {
        return this.buildVetoResult(
          cleanSym,
          macroKey,
          tradeDirection,
          macroBias,
          regime,
          capitalPreservation,
          btcDecoupling,
          rationale,
          smcScore,
          `🛑 VETO: SOL Long İzni Yok! SOL/BTC momentumu negatif (%${regimeState.sol_btc_roc_5d ?? 0}).`
        );
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 3. KATMAN: MAKRO YÖN ÇÖZÜMLEME & DOĞRU ORANTILILIK DENETİMİ (STRICT ALIGNMENT)
    // ──────────────────────────────────────────────────────────────────────────
    const macroResolution = this.resolveMacroDirection(cleanSym, macroKey, payload, symbolMap);
    const macroDir = macroResolution.direction;
    const effectiveMacroBias = mapped?.macro_type === 'SYNTHETIC_CROSS' ? macroDir : macroBias;

    // A) Doğrudan Yön Uyuşmazlığı / Ters Orantı Kontrolü
    if (tradeDirection === 'long' && (macroDir === 'SHORT' || effectiveMacroBias === 'SHORT_ONLY' || effectiveMacroBias === 'SHORT')) {
      return this.buildVetoResult(
        cleanSym,
        macroKey,
        tradeDirection,
        effectiveMacroBias,
        regime,
        capitalPreservation,
        btcDecoupling,
        rationale,
        smcScore,
        `🛑 VETO: ${cleanSym} Makro Yönü SHORT_ONLY iken LONG Açılamaz!`
      );
    }

    if (tradeDirection === 'short' && (macroDir === 'LONG' || effectiveMacroBias === 'LONG_ONLY' || effectiveMacroBias === 'LONG')) {
      return this.buildVetoResult(
        cleanSym,
        macroKey,
        tradeDirection,
        effectiveMacroBias,
        regime,
        capitalPreservation,
        btcDecoupling,
        rationale,
        smcScore,
        `🛑 VETO: ${cleanSym} Makro Yönü LONG_ONLY iken SHORT Açılamaz!`
      );
    }

    // B) DEFENSIVE_HOLD Kontrolü
    if (macroBias === 'DEFENSIVE_HOLD' || macroResolution.reason.includes('DEFENSIVE_HOLD')) {
      return this.buildVetoResult(
        cleanSym,
        macroKey,
        tradeDirection,
        macroBias,
        regime,
        capitalPreservation,
        btcDecoupling,
        rationale,
        smcScore,
        `🛑 VETO: ${cleanSym} Makro Savunma Modunda (DEFENSIVE_HOLD) - Yeni İşlem Açılamaz!`
      );
    }

    // C) Makro Yönsüz / Nötr Veto Kuralı
    // Kullanıcı talebi: "yalnızca makro ekonomiyle doğru orantıda olan işlemleri versin, diğerlerini veto etsin"
    if (macroDir === 'NEUTRAL') {
      return this.buildVetoResult(
        cleanSym,
        macroKey,
        tradeDirection,
        macroBias,
        regime,
        capitalPreservation,
        btcDecoupling,
        rationale,
        smcScore,
        `🛑 VETO: ${cleanSym} için makroekonomik yön nötr / yönsüzdür (${macroResolution.reason}). Yalnızca makro ile doğru orantılı işlemlere izin verilir!`
      );
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 4. ADIM: MAKRO ONAYI (G_macro = 1) & DİNAMİK RİSK ÇARPANLI NİHAİ SKOR
    // ──────────────────────────────────────────────────────────────────────────
    const begonyaScore = smcScore;

    // Makro çarpanı: payload'dan gelen recommended_risk_multiplier (örn: 0.25x veya 0.50x)
    const macroMultiplier = typeof payload.recommended_risk_multiplier === 'number'
      ? payload.recommended_risk_multiplier
      : (capitalPreservation ? 0.25 : 1.0);

    let scoreTier: BegonyaScoreTier;
    let baseRisk: number;
    let action: MacroGateEvaluation['action'];
    let tierRationale: string;

    if (begonyaScore >= 85) {
      scoreTier = 'A+';
      baseRisk = 1.00;
      action = 'PROCEED';
      tierRationale = 'Elit Kurumsal Çift Teyit (Tam Lot)';
    } else if (begonyaScore >= 70) {
      scoreTier = 'A';
      baseRisk = 0.75;
      action = 'PROCEED';
      tierRationale = 'Güçlü Kurumsal Kurulum (0.75x Lot)';
    } else if (begonyaScore >= 50) {
      scoreTier = 'B';
      baseRisk = 0.40;
      action = 'NEUTRAL_CAUTION';
      tierRationale = 'Orta Seviye / M1 Manuel Teyit Bekle (0.40x Lot)';
    } else {
      scoreTier = 'C';
      baseRisk = 0.15;
      action = 'DEFENSIVE_REDUCE';
      tierRationale = 'Zayıf Kurulum (Pas Geçilmesi Önerilir - 0.15x)';
    }

    // Nihai Risk = Taban SMC Riski * Makro Risk Çarpanı (Örn: 1.00 * 0.25 = 0.25x)
    const finalRiskMultiplier = Math.round(baseRisk * macroMultiplier * 100) / 100;
    const gateStatusMessage = mapped?.macro_type === 'SYNTHETIC_CROSS'
      ? `🌟 ${scoreTier} SENTETİK ÇAPRAZ MAKRO ONAYI (${macroResolution.reason}) -> ${finalRiskMultiplier.toFixed(2)}x Lot ile Uygula`
      : `🌟 ${scoreTier} DOĞRU ORANTILI MAKRO İŞLEM (Skor: ${begonyaScore}/100) -> ${finalRiskMultiplier.toFixed(2)}x Lot (Makro Çarpan: ${macroMultiplier}x) ile Uygula`;

    return {
      allowed: true,
      action,
      symbol: cleanSym,
      mappedMacroKey: macroKey,
      tradeDirection,
      macroBias: effectiveMacroBias,
      primaryRegime: regime,
      riskMultiplier: finalRiskMultiplier,
      capitalPreservationMode: capitalPreservation,
      btcDecouplingActive: btcDecoupling,
      macroRationale: rationale,
      gateStatusMessage,
      macroGateMultiplier: 1,
      smcTechnicalScore: smcScore,
      begonyaScore,
      scoreTier,
      tierRationale: `${tierRationale} [Makro Çarpan: ${macroMultiplier}x]`,
    };
  }
}
