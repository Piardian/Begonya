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
    // SMC TEKNİK KALİTE PUANLAMASI (0 - 100)
    // ──────────────────────────────────────────────────────────────────────────
    let smcScore = 80; // Varsayılan kurumsal A kalite kurulum
    if (typeof smcGradeScore === 'number' && !isNaN(smcGradeScore)) {
      if (smcGradeScore <= 9) {
        // 0-9 SMC Grade ölçeğini (6=A, 8=A+, 9=A+) 0-100 kurumsal Begonya ölçeğine dönüştür
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
    // 0. KATMAN: MAKRO HABER KALKANI (NEWS FREEZE GUARD - ±15 DK DONDURMA)
    // ──────────────────────────────────────────────────────────────────────────
    const newsFreeze = NewsGuard.getInstance().checkNewsFreeze(cleanSym);
    if (newsFreeze.isFrozen) {
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
        `🛡️ VETO: Makro Haber Kalkanı Devrede! ${newsFreeze.reason}`
      );
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 1. KATMAN: GENEL MAKRO YÖN VE DEFENSIVE_HOLD KONTROLÜ
    // ──────────────────────────────────────────────────────────────────────────
    // A) Sistemik Donma / Küresel Kriz (Sermaye Koruma Kalkanı)
    if (capitalPreservation || riskScore >= 0.90) {
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
        `🛑 VETO: Sistemik Kriz / Sermaye Koruma Kalkanı Devrede (Risk Skoru: ${riskScore.toFixed(2)})`
      );
    }

    // B) DEFENSIVE_HOLD Kontrolü (Genel Savunma Modu)
    if (macroBias === 'DEFENSIVE_HOLD') {
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

    // C) Temel Yön Uyumu (Directional Compatibility)
    if (tradeDirection === 'short' && macroBias === 'LONG_ONLY') {
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
        `🛑 VETO: ${cleanSym} Makro Yönü LONG_ONLY iken SHORT Açılamaz!`
      );
    }

    if (tradeDirection === 'long' && macroBias === 'SHORT_ONLY') {
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
        `🛑 VETO: ${cleanSym} Makro Yönü SHORT_ONLY iken LONG Açılamaz!`
      );
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 2. KATMAN: ASİMETRİK PİYASA VE ENSTRÜMAN İSTİSNALARI
    // ──────────────────────────────────────────────────────────────────────────
    // A) ALTIN (XAUUSD / GOLD) SHORT KURALI: Mali Hakimiyet & Egemen Borç Kalkanı
    if ((cleanSym.includes('XAU') || cleanSym.includes('GOLD')) && tradeDirection === 'short') {
      const isCashDash = riskScore >= 0.90 && regime.includes('Deflationary');
      if (!isCashDash) {
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
          '🛑 VETO: Mali Hakimiyet Çağında Altında SHORT Kesinlikle Yasaktır (Fiziki Rezerv Talebi / Egemen Borç Kalkanı)'
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

    // ──────────────────────────────────────────────────────────────────────────
    // 3. ADIM: MAKRO ONAYI (G_macro = 1) & ÇARPIMSAL NİHAİ SKOR
    // ──────────────────────────────────────────────────────────────────────────
    const begonyaScore = smcScore;


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
