import * as fs from 'fs';
import * as path from 'path';

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
    brent_pct_60d?: number;
  };
  macro_rationale?: string;
}

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
}

interface SymbolMapConfig {
  mappings: Record<string, { macro_key: string; proxy?: string }>;
  default_risk_multiplier: number;
  max_gate_staleness_hours: number;
}

export class MacroGateAdapter {
  private static instance: MacroGateAdapter | null = null;
  private readonly sharedGatePath: string;
  private readonly fallbackGatePath: string;
  private readonly configPath: string;
  private cachedSymbolMap: SymbolMapConfig | null = null;

  private constructor() {
    this.sharedGatePath = path.resolve(__dirname, '../../shared/macro_bias_gate.json');
    this.fallbackGatePath = path.resolve(__dirname, '../../macro_engine/gateways/macro_bias_gate.json');
    this.configPath = path.resolve(__dirname, '../../config/symbol_map.json');
  }

  public static getInstance(): MacroGateAdapter {
    if (!MacroGateAdapter.instance) {
      MacroGateAdapter.instance = new MacroGateAdapter();
    }
    return MacroGateAdapter.instance;
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

  public evaluateCandidate(symbol: string, tradeDirection: 'long' | 'short'): MacroGateEvaluation {
    const symbolMap = this.loadSymbolMap();
    const payload = this.loadGatePayload();
    const cleanSym = symbol.toUpperCase();
    const mapped = symbolMap.mappings[cleanSym];
    const macroKey = mapped?.macro_key ?? cleanSym;

    // Failsafe: Eğer makro veri henüz üretilmemişse
    if (!payload) {
      return {
        allowed: true,
        action: 'NEUTRAL_CAUTION',
        symbol: cleanSym,
        mappedMacroKey: macroKey,
        tradeDirection,
        macroBias: 'NO_DATA',
        primaryRegime: 'Uninitialized Regime',
        riskMultiplier: 0.5,
        capitalPreservationMode: false,
        btcDecouplingActive: false,
        macroRationale: 'Makro kapı verisi bulunamadı. Failsafe 0.5x risk ile devam ediliyor.',
        gateStatusMessage: '⚠️ Makro kapı verisi henüz aktif değil (Failsafe 0.50x)',
      };
    }

    const regime = payload.primary_regime ?? 'Genel Makro Rejim';
    const riskScore = payload.volatility_risk_score ?? 0.40;
    const capitalPreservation = payload.capital_preservation_mode ?? false;
    const btcDecoupling = payload.btc_decoupling_active ?? false;
    const recommendedRisk = payload.recommended_risk_multiplier ?? 1.0;
    const rationale = payload.macro_rationale ?? '';

    // Kapı yönü sorgula
    const gates = payload.execution_bias_gates ?? {};
    const macroBias = (gates[macroKey] || gates[cleanSym] || 'NEUTRAL_ALL').toUpperCase();

    // 1. KURAL: Aşırı Kriz / Sermaye Koruma Modu (T-0 Devre Kesici veya Risk >= 0.90)
    if (capitalPreservation || riskScore >= 0.90) {
      return {
        allowed: false,
        action: 'VETO',
        symbol: cleanSym,
        mappedMacroKey: macroKey,
        tradeDirection,
        macroBias,
        primaryRegime: regime,
        riskMultiplier: 0.0,
        capitalPreservationMode: true,
        btcDecouplingActive: btcDecoupling,
        macroRationale: rationale,
        gateStatusMessage: `🛑 VETO: Sistemik Kriz / Sermaye Koruma Modu Aktif (Risk Skoru: ${riskScore.toFixed(2)})`,
      };
    }

    // 2. KURAL: BTC / Kripto Ayrışması Savunması (Bear Steepening & Margin Call Kalkanı)
    if ((cleanSym.includes('BTC') || cleanSym.includes('ETH')) && btcDecoupling) {
      if (tradeDirection === 'long') {
        return {
          allowed: false,
          action: 'VETO',
          symbol: cleanSym,
          mappedMacroKey: macroKey,
          tradeDirection,
          macroBias: 'DEFENSIVE_HOLD',
          primaryRegime: regime,
          riskMultiplier: 0.0,
          capitalPreservationMode: false,
          btcDecouplingActive: true,
          macroRationale: rationale,
          gateStatusMessage: '🛑 VETO: Tahvil Şoku Kaynaklı BTC Decoupling Aktif (Margin Call & Likidite Savunması)',
        };
      }
    }

    // 3. KURAL: Yönlü Uyumsuzluk Filtresi (Macro Bias Gate)
    if (macroBias === 'DEFENSIVE_HOLD') {
      return {
        allowed: false,
        action: 'VETO',
        symbol: cleanSym,
        mappedMacroKey: macroKey,
        tradeDirection,
        macroBias,
        primaryRegime: regime,
        riskMultiplier: 0.0,
        capitalPreservationMode: false,
        btcDecouplingActive: btcDecoupling,
        macroRationale: rationale,
        gateStatusMessage: `🛑 VETO: Makro rejim (${regime}) bu varlık için DEFENSIVE_HOLD modunda.`,
      };
    }

    if (tradeDirection === 'long' && macroBias === 'SHORT_ONLY') {
      return {
        allowed: false,
        action: 'VETO',
        symbol: cleanSym,
        mappedMacroKey: macroKey,
        tradeDirection,
        macroBias,
        primaryRegime: regime,
        riskMultiplier: 0.0,
        capitalPreservationMode: false,
        btcDecouplingActive: btcDecoupling,
        macroRationale: rationale,
        gateStatusMessage: `🛑 VETO: SMC Long sinyali, Makro SHORT_ONLY (${regime}) yönüyle taban tabana zıt.`,
      };
    }

    if (tradeDirection === 'short' && macroBias === 'LONG_ONLY') {
      return {
        allowed: false,
        action: 'VETO',
        symbol: cleanSym,
        mappedMacroKey: macroKey,
        tradeDirection,
        macroBias,
        primaryRegime: regime,
        riskMultiplier: 0.0,
        capitalPreservationMode: false,
        btcDecouplingActive: btcDecoupling,
        macroRationale: rationale,
        gateStatusMessage: `🛑 VETO: SMC Short sinyali, Makro LONG_ONLY (${regime}) yönüyle taban tabana zıt.`,
      };
    }

    // 4. KURAL: NEUTRAL_RANGE (Enerji / Ticaret Hadleri Baskısı - EURUSD örneği)
    if (macroBias === 'NEUTRAL_RANGE') {
      const adjustedRisk = Math.min(recommendedRisk, 0.75);
      return {
        allowed: true,
        action: 'NEUTRAL_CAUTION',
        symbol: cleanSym,
        mappedMacroKey: macroKey,
        tradeDirection,
        macroBias,
        primaryRegime: regime,
        riskMultiplier: adjustedRisk,
        capitalPreservationMode: false,
        btcDecouplingActive: btcDecoupling,
        macroRationale: rationale,
        gateStatusMessage: `⚠️ KONTROLLÜ: Makro NEUTRAL_RANGE (${regime}) - Bant/Range işlemi onaylandı (${adjustedRisk}x risk).`,
      };
    }

    // 5. KURAL: Tam Makro Onayı (Confluence)
    return {
      allowed: true,
      action: 'PROCEED',
      symbol: cleanSym,
      mappedMacroKey: macroKey,
      tradeDirection,
      macroBias,
      primaryRegime: regime,
      riskMultiplier: recommendedRisk,
      capitalPreservationMode: false,
      btcDecouplingActive: btcDecoupling,
      macroRationale: rationale,
      gateStatusMessage: `✅ MAKRO ONAYLI: ${macroBias} (${regime}) ile tam yön uyumu (${recommendedRisk}x risk).`,
    };
  }
}
