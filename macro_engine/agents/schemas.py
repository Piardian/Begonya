from typing import Literal, Dict, Optional
from pydantic import BaseModel, Field


class LiquidityOutput(BaseModel):
    """Ajan 1: Likidite ve Finansal Koşullar Analisti Çıktı Şeması"""
    liquidity_regime: Literal["Expanding", "Contracting", "Neutral"] = Field(
        description="Fed bilançosu, RRP, TGA ve DXY etkisiyle genel küresel likidite rejimi"
    )
    yield_curve_dynamic: Literal[
        "Bull Steepening",
        "Bear Steepening",
        "Bear Flattening",
        "Bull Flattening",
        "Range-bound Slope",
        "Inverted",
        "Normal"
    ] = Field(
        description="US10Y - US02Y getiri eğrisi dinamik durumu (5G/20G gürültü filtreli trend)"
    )
    dollar_pressure: Literal["High", "Low", "Neutral"] = Field(
        description="DXY kaynaklı finansal sıkılaşma baskısı"
    )
    credit_stress: Literal["Low / Benign", "Moderate", "High / Distress"] = Field(
        default="Low / Benign",
        description="HY OAS Şirket Tahvil Makası bazında kredi stresi seviyesi"
    )
    financial_conditions_state: Literal["Accommodative / Loose", "Neutral", "Restrictive / Tight"] = Field(
        default="Accommodative / Loose",
        description="Chicago Fed NFCI endeksine göre genel finansal gevşeklik/sıkılık"
    )
    fast_stress_override: bool = Field(
        default=False,
        description="T-0 piyasa stresi (VIX sıçraması, HYG/LQD çöküşü veya Brent şoku) FRED gecikmesini baypas etti mi?"
    )
    hyg_lqd_stress: str = Field(
        default="Normal / Benign",
        description="HYG/LQD canlı kredi oranı durumu ve T-0 kredi riski"
    )
    confidence: float = Field(ge=0.0, le=1.0, description="Analizin güven skoru (0.0 - 1.0)")
    key_driver: str = Field(description="En belirleyici likidite faktörü (örn. TGA tasfiyesi, RRP düşüşü)")
    summary: str = Field(description="Likidite koşullarının Türkçe teknik özeti")


class GrowthOutput(BaseModel):
    """Ajan 2: Büyüme ve Enflasyon Dinamikleri Analisti Çıktı Şeması"""
    macro_quadrant: Literal["Goldilocks", "Reflation", "Late-Cycle Overheating", "Stagflation", "Deflation"] = Field(
        description="Bridgewater / Macro Dörtgen rejimi (Goldilocks, Reflasyon, Late-Cycle Overheating, Stagflasyon, Deflasyon)"
    )
    energy_shock_risk: bool = Field(
        description="Petrol ve emtia kaynaklı arz şoku ve maliyet enflasyonu riski var mı?"
    )
    growth_momentum: Literal["Accelerating", "Decelerating", "Stable"] = Field(
        description="Öncü göstergeler (PMI, NFP, Bakır/Altın) bazında büyüme ivmesi"
    )
    inflation_risk: Literal["High", "Medium", "Low"] = Field(
        description="Kısa ve orta vadeli enflasyonist sürpriz riski"
    )
    transatlantic_spread_bps: float = Field(
        default=238.0,
        description="US10Y - Almanya 10Y Bund faiz farkı (bps). Makas ABD lehine açılırsa EURUSD baskılanır."
    )
    eurusd_terms_of_trade_penalty: bool = Field(
        default=False,
        description="Petrol > 85 ve Transatlantik makas sebebiyle EURUSD ticaret haddi cezası devrede mi?"
    )
    confidence: float = Field(ge=0.0, le=1.0, description="Analizin güven skoru")
    us_vs_global_divergence: str = Field(
        default="ABD hizmetleri ve istihdamı canlı (US Exceptionalism) iken küresel imalat ve dış talep zayıflıyor",
        description="ABD iç piyasası (istihdam/tüketim) ile küresel sanayi (bakır/altın, enerji şoku) arasındaki makas"
    )
    summary: str = Field(description="Büyüme ve enflasyon dengesinin Türkçe teknik özeti")


class AssetBiases(BaseModel):
    XAUUSD: Literal["Strong Bullish", "Bullish", "Neutral", "Bearish", "Strong Bearish"] = "Neutral"
    BTC: Literal["Strong Bullish", "Bullish", "Neutral", "Bearish", "Strong Bearish"] = "Neutral"
    DXY: Literal["Strong Bullish", "Bullish", "Neutral", "Bearish", "Strong Bearish"] = "Neutral"
    EURUSD: Literal["Strong Bullish", "Bullish", "Neutral", "Bearish", "Strong Bearish"] = "Neutral"
    US10Y: Literal["Strong Bullish", "Bullish", "Neutral", "Bearish", "Strong Bearish"] = "Neutral"
    SPX: Literal["Strong Bullish", "Bullish", "Neutral", "Bearish", "Strong Bearish"] = "Neutral"


class ExecutionGates(BaseModel):
    XAUUSD: Literal["LONG_ONLY", "SHORT_ONLY", "NEUTRAL_ALL", "NEUTRAL_RANGE", "DEFENSIVE_HOLD", "REDUCE_ONLY", "NO_TRADE"] = "NEUTRAL_ALL"
    BTC: Literal["LONG_ONLY", "SHORT_ONLY", "NEUTRAL_ALL", "NEUTRAL_RANGE", "DEFENSIVE_HOLD", "REDUCE_ONLY", "NO_TRADE"] = "NEUTRAL_ALL"
    EURUSD: Literal["LONG_ONLY", "SHORT_ONLY", "NEUTRAL_ALL", "NEUTRAL_RANGE", "DEFENSIVE_HOLD", "REDUCE_ONLY", "NO_TRADE"] = "NEUTRAL_ALL"


class MacroStrategistOutput(BaseModel):
    """Ajan 3: Baş Makro Stratejist & Karar Motoru Nihai Sentez Çıktısı"""
    primary_regime: str = Field(
        description="Genel makroekonomik rejim (örn. 'Likidite Destekli Reflasyon')"
    )
    asset_biases: AssetBiases = Field(
        description="Varlık sınıfları yön beklentisi (XAUUSD, BTC, DXY, EURUSD, US10Y, SPX)"
    )
    volatility_risk_score: float = Field(
        ge=0.0, le=1.0,
        description="Sistemik oynaklık ve risk skoru (0.0: Sakin, 1.0: Aşırı Çalkantılı/Olay Günü)"
    )
    capital_preservation_mode: bool = Field(
        default=False,
        description="Sistemik risk skoru > 0.65 veya likidite daralması durumunda sermaye koruma modu devrede mi?"
    )
    btc_decoupling_active: bool = Field(
        default=False,
        description="Bear Steepening veya tahvil/VIX oynaklık şokunda BTC altından ayrıştırılarak defansife çekildi mi?"
    )
    hysteresis_active: bool = Field(
        default=False,
        description="Histeresis bandı sayesinde eşik değeri titremesi (whipsaw / flickering) engellendi mi?"
    )
    recommended_risk_multiplier: float = Field(
        default=1.0, ge=0.1, le=1.0,
        description="Sistemik risk seviyesine göre önerilen portföy risk katsayısı (Düşük risk: 1.0, Yüksek risk: 0.50, Aşırı risk/nötr: 0.25)"
    )
    execution_bias_gates: ExecutionGates = Field(
        description="Algoritmik botlar ve execution katmanı için işlem izin ve savunma filtresi (Execution Gate)"
    )
    macro_rationale: str = Field(
        description="Tüm ajanların verilerinin sentezlendiği detaylı Türkçe stratejik rapor"
    )
    timestamp: Optional[str] = None

