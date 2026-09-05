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
    equity_short_allowed?: boolean;
    gold_short_allowed?: boolean;
    vix_complacent?: boolean;
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
      const smcScore = typeof smcGradeScore === 'number' ? Math.min(100, Math.max(10, smcGradeScore)) : 75;
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
        macroGateMultiplier: 1,
        smcTechnicalScore: smcScore,
        begonyaScore: Math.round(smcScore * 0.7),
        scoreTier: 'B',
        tierRationale: 'Veri yok; kontrollü nötr işlem (0.50x risk)',
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
    // 1. ADIM: MAKRO İZİN ANAHTARI (G_macro: 0 veya 1) - ASİMETRİK PİYASA KURALLARI
    // ──────────────────────────────────────────────────────────────────────────
    let gMacro: 0 | 1 = 1;
    let gateVetoReason = '';

    // A) Sistemik Donma / Küresel Kriz (Nükleer Yangın Sigortası)
    if (capitalPreservation || riskScore >= 0.95) {
      gMacro = 0;
      gateVetoReason = `🛑 VETO: Sistemik Kriz & Sermaye Koruma Kalkanı Devrede (Risk Skoru: ${riskScore.toFixed(2)})`;
    }

    // B) ALTIN (XAUUSD) SHORT KURALI: Mali Hakimiyet & Egemen Borç Kalkanı
    else if (cleanSym.includes('XAU') || cleanSym.includes('GOLD')) {
      if (tradeDirection === 'short') {
        const isCashDash = riskScore >= 0.90 && regime.includes('Deflationary');
        if (!isCashDash) {
          gMacro = 0;
          gateVetoReason = '🛑 VETO: Mali Hakimiyet Çağında Altında SHORT Kesinlikle Yasaktır (Merkez Bankası Fiziki Talebi / Egemen Borç Kalkanı)';
        }
      }
    }

    // C) BORSA ENDEKSLERİ (NAS100 / SPX) SHORT KURALI: VIX Gecikme & Short Squeeze Kalkanı
    else if (cleanSym.includes('NAS') || cleanSym.includes('SPX') || cleanSym.includes('US100') || cleanSym.includes('US500')) {
      if (tradeDirection === 'short') {
        // VIX >= 22 ise borsa zaten çökmüştür; short covering rallisi riski vardır!
        if (riskScore >= 0.65 || (regimeState.vix_pct_60d ?? 50) >= 80) {
          gMacro = 0;
          gateVetoReason = '🛑 VETO: Endekslerde VIX Yüksek (Gecikildi / Ayı Piyasası Rallisi ve Short Squeeze Riski Nedeniyle Short Yasak!)';
        }
      }
    }

    // D) KRİPTO (BTCUSD / ETHUSD) SHORT KURALI: Fon Tasfiye Dalgası vs Squeeze Riski
    else if (cleanSym.includes('BTC') || cleanSym.includes('ETH')) {
      if (tradeDirection === 'long' && btcDecoupling) {
        gMacro = 0;
        gateVetoReason = '🛑 VETO: Tahvil Şoku Kaynaklı Fon Tasfiye Dalgası (Margin Call) Devrede; Kripto Long İntihardır!';
      }
    }

    // E) DÖVİZ (EURUSD): Transatlantik Makas & Makro Rüzgar Kalkanı
    else if (cleanSym.includes('EURUSD')) {
      if (tradeDirection === 'long' && macroBias === 'SHORT_ONLY') {
        gMacro = 0;
        gateVetoReason = '🛑 VETO: Makro Rüzgar Ters (Faiz Makası ABD Lehine ve DXY Güçlü; Euro Almak Tuzaktır)';
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 2. ADIM: SMC TEKNİK KALİTE PUANLAMASI (0 - 100)
    // ──────────────────────────────────────────────────────────────────────────
    // SMC Skoru: Sweep (30) + Displacement (30) + Retest (25) + RR/Hedef (15)
    let smcScore = 80; // Varsayılan kurumsal A kalite kurulum
    if (typeof smcGradeScore === 'number' && !isNaN(smcGradeScore)) {
      smcScore = Math.min(100, Math.max(10, Math.round(smcGradeScore)));
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 3. ADIM: ÇAR PIMSAL NİHAİ SKOR (Nihai = G_macro * smcScore)
    // ──────────────────────────────────────────────────────────────────────────
    const begonyaScore = gMacro === 0 ? 0 : smcScore;

    // Eğer Makro İzin Vermediyse: KESİN VETO (Nihai Skor = 0)
    if (gMacro === 0) {
      return {
        allowed: false,
        action: 'VETO',
        symbol: cleanSym,
        mappedMacroKey: macroKey,
        tradeDirection,
        macroBias,
        primaryRegime: regime,
        riskMultiplier: 0.0,
        capitalPreservationMode: capitalPreservation,
        btcDecouplingActive: btcDecoupling,
        macroRationale: rationale,
        gateStatusMessage: gateVetoReason,
        macroGateMultiplier: 0,
        smcTechnicalScore: smcScore,
        begonyaScore: 0,
        scoreTier: 'D',
        tierRationale: 'Makro Kapı Kilitli (G_macro = 0). Teknik ne kadar iyi olursa olsun işlem açılmaz.',
      };
    }

    // Makro İzin Verdi (G_macro = 1) -> Sinyal SMC Puanına göre derecelendirilir
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
      gateStatusMessage = `🌟 A+ ELİT İŞLEM (Skor: ${begonyaScore}/100) -> 1.00x Tam Lot ile Uygula`;
    } else if (begonyaScore >= 70) {
      scoreTier = 'A';
      riskMultiplier = 0.75;
      action = 'PROCEED';
      tierRationale = 'Güçlü Kurumsal Kurulum (0.75x Lot)';
      gateStatusMessage = `✅ A GÜÇLÜ İŞLEM (Skor: ${begonyaScore}/100) -> 0.75x Lot ile Uygula`;
    } else if (begonyaScore >= 50) {
      scoreTier = 'B';
      riskMultiplier = 0.40;
      action = 'NEUTRAL_CAUTION';
      tierRationale = 'Orta Seviye / M1 Manuel Teyit Bekle (0.40x Lot)';
      gateStatusMessage = `⚠️ B ORTA SEVİYE (Skor: ${begonyaScore}/100) -> 0.40x Kontrollü Lot`;
    } else {
      scoreTier = 'C';
      riskMultiplier = 0.15;
      action = 'DEFENSIVE_REDUCE';
      tierRationale = 'Zayıf Kurulum (Pas Geçilmesi Önerilir - 0.15x)';
      gateStatusMessage = `⚠️ ZAYIF KURULUM (Skor: ${begonyaScore}/100) -> Pas Geç Önerisi`;
    }

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
      macroGateMultiplier: 1,
      smcTechnicalScore: smcScore,
      begonyaScore,
      scoreTier,
      tierRationale,
    };
  }
}
