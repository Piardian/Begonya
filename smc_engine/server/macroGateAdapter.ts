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

  // 🌺 Begonya 1-100 Hibrit Güven Skoru
  begonyaScore: number;           // 1 - 100
  smcTechnicalScore: number;       // 0 - 50
  macroAlignmentScore: number;     // 0 - 50
  scoreTier: BegonyaScoreTier;
  tierRationale: string;
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

  public evaluateCandidate(
    symbol: string,
    tradeDirection: 'long' | 'short',
    smcGradeScore?: number
  ): MacroGateEvaluation {
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
        riskMultiplier: 0.50,
        capitalPreservationMode: false,
        btcDecouplingActive: false,
        macroRationale: 'Makro kapı verisi bulunamadı. Failsafe 0.50x risk ile devam ediliyor.',
        gateStatusMessage: '⚠️ Makro veri aktif değil (Failsafe 0.50x)',
        begonyaScore: 60,
        smcTechnicalScore: 35,
        macroAlignmentScore: 25,
        scoreTier: 'B',
        tierRationale: 'Veri yok; nötr 60 puan (0.50x risk)',
      };
    }

    const regime = payload.primary_regime ?? 'Genel Makro Rejim';
    const riskScore = payload.volatility_risk_score ?? 0.40;
    const capitalPreservation = payload.capital_preservation_mode ?? false;
    const btcDecoupling = payload.btc_decoupling_active ?? false;
    const rationale = payload.macro_rationale ?? '';

    // Kapı yönü sorgula
    const gates = payload.execution_bias_gates ?? {};
    const macroBias = (gates[macroKey] || gates[cleanSym] || 'NEUTRAL_ALL').toUpperCase();

    // 1. KURAL: Nükleer Yangın Sigortası (Sadece Sistemik Donma / Kriz Anında Devrede)
    if (capitalPreservation || riskScore >= 0.95) {
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
        gateStatusMessage: `🛑 VETO: Sistemik Kriz & Sermaye Koruma Kalkanı Devrede (Risk Skoru: ${riskScore.toFixed(2)})`,
        begonyaScore: 5,
        smcTechnicalScore: 0,
        macroAlignmentScore: 5,
        scoreTier: 'D',
        tierRationale: 'Sistemik Kriz: Tüm yönlü işlemler kilitlendi.',
      };
    }

    // 2. ADIM: 1-100 BEGONYA HİBRİT PUAN HESAPLAMA MOTORU
    // A) SMC Teknik Kalite Skoru (0 - 50 Puan)
    let smcScore = 40; // Varsayılan güçlü teknik taban
    if (typeof smcGradeScore === 'number' && !isNaN(smcGradeScore)) {
      smcScore = Math.min(50, Math.max(10, Math.round(smcGradeScore * 0.5)));
    }

    // B) Makro Rejim & Yön Uyum Skoru (0 - 50 Puan)
    let macroScore = 30; // Nötr başlangıç

    const isCrypto = cleanSym.includes('BTC') || cleanSym.includes('ETH');

    if (isCrypto && btcDecoupling) {
      // 🚀 GELİŞTİRME 1: Tahvil Şokunda Fon Tasfiye Dalgasından SHORT ile Kâr Sağlama
      if (tradeDirection === 'short') {
        macroScore = 48; // Fon tasfiyeleri mükemmel düşüş rüzgarı sağlar!
      } else {
        macroScore = 8;  // Long yönünde margin call dalgası büyük tehlikedir
      }
    } else {
      // Standart Yön Uyumu Hesaplaması
      const isPerfectLong = tradeDirection === 'long' && (macroBias === 'LONG_ONLY' || macroBias.includes('BULL'));
      const isPerfectShort = tradeDirection === 'short' && (macroBias === 'SHORT_ONLY' || macroBias.includes('BEAR'));
      const isOpposingLong = tradeDirection === 'long' && (macroBias === 'SHORT_ONLY' || macroBias.includes('BEAR'));
      const isOpposingShort = tradeDirection === 'short' && (macroBias === 'LONG_ONLY' || macroBias.includes('BULL'));

      if (isPerfectLong || isPerfectShort) {
        macroScore = 46; // Mükemmel Çift Teyit
      } else if (isOpposingLong || isOpposingShort) {
        macroScore = 12; // Ters rüzgar (Veto edilmez, puanı düşürür)
      } else if (macroBias === 'NEUTRAL_RANGE') {
        macroScore = 32; // Kontrollü bant işlemi
      } else {
        macroScore = 30; // Nötr piyasa
      }
    }

    // Oynaklık baskısı cezası
    if (riskScore > 0.65) {
      macroScore = Math.max(5, macroScore - Math.round((riskScore - 0.65) * 25));
    }

    // Toplam Begonya Puanı (1 - 100)
    const begonyaScore = Math.min(100, Math.max(1, smcScore + macroScore));

    // C) Kademeli Derecelendirme (Tiers) ve Dinamik Risk Belirleme
    let scoreTier: BegonyaScoreTier;
    let riskMultiplier: number;
    let action: MacroGateEvaluation['action'];
    let tierRationale: string;
    let gateStatusMessage: string;

    if (begonyaScore >= 85) {
      scoreTier = 'A+';
      riskMultiplier = 1.00;
      action = 'PROCEED';
      tierRationale = 'Elit Kurumsal Çift Teyit (Tam Lot - 1.00x)';
      gateStatusMessage = `🌟 A+ KUSURSUZ UYUM (Skor: ${begonyaScore}/100) -> 1.00x Tam Risk`;
    } else if (begonyaScore >= 70) {
      scoreTier = 'A';
      riskMultiplier = 0.75;
      action = 'PROCEED';
      tierRationale = 'Güçlü Uyumlu Kurumsal Sinyal (0.75x Lot)';
      gateStatusMessage = `✅ A GÜÇLÜ UYUM (Skor: ${begonyaScore}/100) -> 0.75x Risk`;
    } else if (begonyaScore >= 50) {
      scoreTier = 'B';
      riskMultiplier = 0.40;
      action = 'NEUTRAL_CAUTION';
      tierRationale = 'Orta Seviye / Dikkatli İşlem (0.40x Lot)';
      gateStatusMessage = `⚠️ B KONTROLLÜ SEVİYE (Skor: ${begonyaScore}/100) -> 0.40x Risk`;
    } else {
      scoreTier = 'C';
      riskMultiplier = 0.15;
      action = 'DEFENSIVE_REDUCE';
      tierRationale = 'Zayıf / Yüksek Risk (Pas Geçilmesi Önerilir - 0.15x)';
      gateStatusMessage = `⚠️ DÜŞÜK SKOR (Skor: ${begonyaScore}/100) -> Yüksek Risk / Pas Geç Önerisi (0.15x)`;
    }

    // Veto edilmez (Allowed = True), trader bilgilendirilir ve risk küçültülür
    return {
      allowed: true,
      action,
      symbol: cleanSym,
      mappedMacroKey: macroKey,
      tradeDirection,
      macroBias,
      primaryRegime: regime,
      riskMultiplier,
      capitalPreservationMode: false,
      btcDecouplingActive: btcDecoupling,
      macroRationale: rationale,
      gateStatusMessage,
      begonyaScore,
      smcTechnicalScore: smcScore,
      macroAlignmentScore: macroScore,
      scoreTier,
      tierRationale,
    };
  }
}
