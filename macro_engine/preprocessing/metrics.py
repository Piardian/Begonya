import math
import logging
import json
from pathlib import Path
from typing import Dict, Any, List, Optional
from config import HYSTERESIS_CONFIG, BIAS_GATE_FILE

logger = logging.getLogger("MacroMetricsCalculator")

# Tarihsel 12 Aylık Standart Sapmalar (Z-Score birim denkleştirmesi)
HISTORICAL_SIGMAS = {
    "cpi": 0.12,           # Aylık % sapma std dev (~0.12%)
    "core_cpi": 0.10,      # Çekirdek TÜFE std dev (~0.10%)
    "nfp": 50.0,           # Bin (K) kişi sapma std dev (~50K)
    "unemployment": 0.15,  # İşsizlik oranı % sapma std dev (~0.15%)
    "pmi": 1.5,            # ISM / S&P PMI puan sapma std dev (~1.5 puan)
    "gdp": 0.50,           # GSYİH % sapma std dev
    "retail_sales": 0.40,  # Perakende satışlar % sapma std dev
    "generic": 1.0
}


class MacroMetricsCalculator:
    """
    Ham piyasa ve takvim verilerini matematiksel ve istatistiksel
    olarak standartlaştırılmış metrik rejimlerine dönüştürür.
    """

    @staticmethod
    def identify_indicator_type(title: str) -> str:
        """Haber başlığından göstergenin türünü güvenle tespit eder."""
        t = title.lower()
        if any(term in t for term in ["non-farm", "nfp", "payrolls", "employment change"]):
            return "nfp"
        elif any(term in t for term in ["unemployment rate", "jobless rate"]):
            return "unemployment"
        elif "core cpi" in t:
            return "core_cpi"
        elif "cpi" in t or "inflation" in t:
            return "cpi"
        elif "pmi" in t:
            return "pmi"
        elif "gdp" in t:
            return "gdp"
        elif "retail" in t:
            return "retail_sales"
        return "generic"

    @staticmethod
    def calculate_surprise_zscore(indicator_type: str, actual: float, forecast: float) -> float:
        """
        Standardize Edilmiş Sürpriz Endeksi (Z-Score):
        S = (Gerçekleşen - Beklenti) / σ_12m
        Uç değer distorsiyonlarını önlemek için [-4.0, +4.0] aralığına sınırlandırılır (clipped).
        """
        sigma = HISTORICAL_SIGMAS.get(indicator_type.lower(), 1.0)
        raw_diff = actual - forecast
        zscore = raw_diff / sigma
        
        # [-4.0, +4.0] sigma aralığına sınırla
        clipped_z = max(-4.0, min(4.0, round(zscore, 2)))
        return clipped_z

    @staticmethod
    def evaluate_yield_curve(
        us10y: float,
        us02y: float,
        us10y_prev: Optional[float] = None,
        us02y_prev: Optional[float] = None,
        us10y_5d: Optional[float] = None,
        us02y_5d: Optional[float] = None,
        us10y_20d: Optional[float] = None,
        us02y_20d: Optional[float] = None,
    ) -> Dict[str, Any]:
        """
        Getiri Eğrisi Durumu (US10Y - US02Y spread ve çoklu zaman dilimli Slope Trendi):
        - 1 Günlük mikro hareketler (örn. 1.6 bps) istatistiksel gürültüdür (noise).
        - 5 Günlük (ΔSpread_5D) ve 20 Günlük (ΔSpread_20D) bileşik eğim teyidi aranır.
        - Değişim en az ±5.0 bps eşiğini aşmadıkça 'Range-bound Slope' olarak korunur, testere (whipsaw) engellenir.
        """
        spread_bps = round((us10y - us02y) * 100, 1)

        # 1 Günlük Değişimler
        u10_prev = us10y_prev if us10y_prev is not None else us10y
        u02_prev = us02y_prev if us02y_prev is not None else us02y
        prev_spread_bps = round((u10_prev - u02_prev) * 100, 1)
        delta_spread_1d = round(spread_bps - prev_spread_bps, 1)
        delta_10y_1d = round((us10y - u10_prev) * 100, 1)
        delta_02y_1d = round((us02y - u02_prev) * 100, 1)

        # 5 Günlük Değişimler (Slope Trend)
        u10_5d = us10y_5d if us10y_5d is not None else u10_prev
        u02_5d = us02y_5d if us02y_5d is not None else u02_prev
        spread_5d_bps = round((u10_5d - u02_5d) * 100, 1)
        delta_spread_5d = round(spread_bps - spread_5d_bps, 1)
        delta_10y_5d = round((us10y - u10_5d) * 100, 1)
        delta_02y_5d = round((us02y - u02_5d) * 100, 1)

        # 20 Günlük Değişimler (1 Aylık Ana Trend)
        u10_20d = us10y_20d if us10y_20d is not None else u10_5d
        u02_20d = us02y_20d if us02y_20d is not None else u02_5d
        spread_20d_bps = round((u10_20d - u02_20d) * 100, 1)
        delta_spread_20d = round(spread_bps - spread_20d_bps, 1)

        # Gürültü Filtresi: 5 günlük spread değişimi en az ±5.0 bps veya 20 günlük en az ±8.0 bps olmalı
        is_trend_significant = abs(delta_spread_5d) >= 5.0 or abs(delta_spread_20d) >= 8.0
        is_inverted = (spread_bps < 0)

        if not is_trend_significant:
            regime = "Inverted" if is_inverted else "Range-bound Slope"
            risk_category = "High Recession Risk" if is_inverted else "Stable / Noise Level"
            description = (
                f"Ters Getiri Eğrisi ({spread_bps} bps). Eğim yatay, geç döngü resesyon uyarısı."
                if is_inverted
                else f"Getiri Eğrisi Yatay / Gürültü Seviyesi ({spread_bps} bps | 5G Δ: {delta_spread_5d:+.1f} bps | 1G Δ: {delta_spread_1d:+.1f} bps). "
                f"Tekil gün oynamaları istatistiksel gürültü kabul edilir; rejim testeresi engellendi."
            )
        elif delta_spread_5d >= 5.0 or delta_spread_20d >= 8.0:
            # Eğri DİKLEŞİYOR (Steepening) - Ters eğriden çıkış veya pozitif eğride dikleşme
            if delta_02y_5d < 0 and delta_02y_5d < delta_10y_5d:
                regime = "Bull Steepening"
                risk_category = "Recessionary Easing (Panik/Kriz İndirimi)"
                description = (
                    f"Bull Steepening ({spread_bps} bps | 5G ΔSpread: {delta_spread_5d:+.1f} bps | 2Y 5G Δ: {delta_02y_5d:+.1f} bps). "
                    f"DİKKAT: 2Y faizlerindeki çöküş Fed acil resesyon indirimine işaret eder; hisse senedi (SPX) için ralli değil düzeltme/çöküş riskidir!"
                )
            else:
                regime = "Bear Steepening"
                risk_category = "Term Premium / Fiscal Supply or Inflation Risk"
                description = (
                    f"Bear Steepening ({spread_bps} bps | 5G ΔSpread: {delta_spread_5d:+.1f} bps | 10Y 5G Δ: {delta_10y_5d:+.1f} bps). "
                    f"Uzun vadeli faizler vade primi (term premium), Hazine tahvil arzı baskısı veya yapışkan enflasyon riskiyle yükseliyor."
                )
        else:
            # Eğri YATIKLAŞIYOR (Flattening)
            if delta_02y_5d > 0:
                regime = "Bear Flattening"
                risk_category = "Monetary Tightening"
                description = f"Bear Flattening ({spread_bps} bps | 5G ΔSpread: {delta_spread_5d:+.1f} bps). Kısa vadeli faizler Fed sıkılaşmasıyla yükseliyor."
            else:
                regime = "Bull Flattening"
                risk_category = "Disinflation"
                description = f"Bull Flattening ({spread_bps} bps | 5G ΔSpread: {delta_spread_5d:+.1f} bps). Uzun vadeli tahvillere güvenli liman girişi."

        return {
            "spread_bps": spread_bps,
            "regime": regime,
            "risk_category": risk_category,
            "description": description,
            "delta_spread_1d_bps": delta_spread_1d,
            "delta_spread_5d_bps": delta_spread_5d,
            "delta_spread_20d_bps": delta_spread_20d,
            "delta_10y_5d_bps": delta_10y_5d,
            "delta_02y_5d_bps": delta_02y_5d,
            "is_trend_significant": is_trend_significant
        }

    @staticmethod
    def calculate_real_yield(
        us10y: float,
        dfii10_tips: Optional[float] = None,
        breakeven_10y: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Reel Getiri:
        1. Öncelik: FRED DFII10 (10-Year TIPS Constant Maturity - Doğrudan Piyasa Reel Faizi)
        2. İkincil / Yedek: US10Y Nominal Getiri - 10Y Breakeven Enflasyon Oranı (T10YIE)
        
        Reel faiz > %2.0 ise Altın (XAUUSD) üzerinde yüksek fırsat maliyeti baskısı oluşur.
        """
        if dfii10_tips is not None and dfii10_tips > 0:
            real_yield = round(dfii10_tips, 3)
            source = "FRED DFII10 (Doğrudan 10Y TIPS Reel Getirisi)"
        else:
            be = breakeven_10y if breakeven_10y is not None else 2.15
            real_yield = round(us10y - be, 3)
            source = f"Sentetik (US10Y {us10y}% - Breakeven {be}%)"

        pressure_on_gold = (
            "High Fırsat Maliyeti (Stagflasyon / Jeopolitik Şokta Decoupling İstisnası Vardır)"
            if real_yield > 2.0
            else "Low (Destekleyici)"
            if real_yield < 1.0
            else "Moderate (Stagflasyon ve Güvenli Liman Talebi Ön Planda)"
        )

        return {
            "real_yield_pct": real_yield,
            "yield_source": source,
            "pressure_on_gold": pressure_on_gold,
            "description": f"10Y Reel Getiri: %{real_yield} [{source}] (Altın baskısı: {pressure_on_gold})"
        }

    @staticmethod
    def calculate_correlation(series_a: List[float], series_b: List[float]) -> float:
        """Pearson Korelasyon Katsayısı (-1.0 ile +1.0 arası)."""
        if len(series_a) != len(series_b) or len(series_a) < 3:
            return 0.0

        n = len(series_a)
        mean_a = sum(series_a) / n
        mean_b = sum(series_b) / n

        var_a = sum((x - mean_a) ** 2 for x in series_a)
        var_b = sum((y - mean_b) ** 2 for y in series_b)

        if var_a == 0 or var_b == 0:
            return 0.0

        cov = sum((series_a[i] - mean_a) * (series_b[i] - mean_b) for i in range(n))
        r = cov / (math.sqrt(var_a) * math.sqrt(var_b))
        return round(r, 2)

    def process_all_macro_data(
        self,
        market_data: Dict[str, Any],
        fred_data: Dict[str, Any],
        calendar_events: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Tüm ham verileri delta ve momentum destekli deterministik makro metrik paketine derler."""
        us10y_data = market_data.get("US10Y", {})
        us02y_data = market_data.get("US02Y", {})
        us10y = us10y_data.get("value", 3.88)
        us02y = us02y_data.get("value", 3.94)
        us10y_prev = us10y_data.get("prev", us10y)
        us02y_prev = us02y_data.get("prev", us02y)
        us10y_5d = us10y_data.get("val_5d_ago", us10y_prev)
        us02y_5d = us02y_data.get("val_5d_ago", us02y_prev)
        us10y_20d = us10y_data.get("month_ago", us10y_5d)
        us02y_20d = us02y_data.get("month_ago", us02y_5d)

        dfii10 = fred_data.get("DFII10")
        t10yie = fred_data.get("T10YIE", 2.15)
        dxy = market_data.get("DXY", {}).get("value", 104.2)
        brent = market_data.get("BRENT", {}).get("value", 78.4)
        gold = market_data.get("GOLD", {}).get("value", 2480.0)
        copper = market_data.get("COPPER", {}).get("value", 4.15)

        # 1. Getiri Eğrisi (Gürültü Filtreli 5G/20G Slope Trend Analizi)
        yield_curve = self.evaluate_yield_curve(
            us10y, us02y, us10y_prev, us02y_prev,
            us10y_5d, us02y_5d, us10y_20d, us02y_20d
        )

        # 2. Reel Getiri (Öncelik: FRED DFII10 Doğrudan TIPS Oranı)
        real_yield_info = self.calculate_real_yield(us10y, dfii10_tips=dfii10, breakeven_10y=t10yie)

        # 3. Bakır / Altın Rasyosu ve 4 Haftalık Momentum Deltası (Δ%)
        current_ratio = round((copper / gold) * 1000, 3) if gold else 1.50
        gold_month_ago = market_data.get("GOLD", {}).get("month_ago", gold)
        copper_month_ago = market_data.get("COPPER", {}).get("month_ago", copper)
        prev_ratio = round((copper_month_ago / gold_month_ago) * 1000, 3) if gold_month_ago else current_ratio
        ratio_delta_4w_pct = round(((current_ratio - prev_ratio) / prev_ratio) * 100, 2) if prev_ratio else 0.0

        copper_gold_analysis = {
            "current_ratio": current_ratio,
            "ratio_4w_ago": prev_ratio,
            "delta_4w_pct": ratio_delta_4w_pct,
            "momentum_signal": "Büyüme İvmeleniyor (İmalat Talebi)" if ratio_delta_4w_pct > 2.0 else "Büyüme Yavaşlıyor (Altına Kaçış)" if ratio_delta_4w_pct < -2.0 else "Nötr / Yatay"
        }

        # 4. 5 Günlük DXY x Brent Korelasyonu
        dxy_hist = market_data.get("DXY", {}).get("history_close", [])
        brent_hist = market_data.get("BRENT", {}).get("history_close", [])
        dxy_oil_corr = self.calculate_correlation(dxy_hist, brent_hist)

        # 5. Net Likidite ve 4 Haftalık Değişim Hızı (Δ Liquidity) + TGA Sezonsallık Filtresi
        walcl_b = fred_data.get("WALCL", 7180000.0) / 1000.0
        tga_b = fred_data.get("WTREGEN", 780000.0) / 1000.0
        rrp_b = fred_data.get("RRPONTSYD", 290.0)
        current_net_liq_b = round(walcl_b - tga_b - rrp_b, 1)

        walcl_4w_b = fred_data.get("WALCL_4W_AGO", walcl_b * 1000.0) / 1000.0
        tga_4w_b = fred_data.get("WTREGEN_4W_AGO", tga_b * 1000.0) / 1000.0
        rrp_4w_b = fred_data.get("RRPONTSYD_4W_AGO", rrp_b)
        prev_net_liq_b = round(walcl_4w_b - tga_4w_b - rrp_4w_b, 1)

        delta_liq_b = round(current_net_liq_b - prev_net_liq_b, 1)
        delta_liq_pct = round((delta_liq_b / prev_net_liq_b) * 100, 2) if prev_net_liq_b else 0.0

        # TGA Sezonsallık Denetimi (Nisan & Eylül Vergi Tahsilat Dönemi Tuzağı)
        import datetime
        now_dt = datetime.date.today()
        m, d = now_dt.month, now_dt.day
        is_tga_tax_season = (
            (m == 4 and 10 <= d <= 28) or  # Nisan Yıllık Bireysel Gelir Vergisi
            (m == 9 and 10 <= d <= 25) or  # Eylül Çeyreklik Kurumlar Vergisi
            (m == 6 and 10 <= d <= 25) or  # Haziran Çeyreklik Vergi
            (m == 1 and 10 <= d <= 25)     # Ocak Çeyreklik Vergi
        )
        tga_seasonality_note = (
            "⚠️ Takvimsel Vergi Tahsilat Dönemi: TGA'daki likidite çekilişi geçici bir kamu tahsilatıdır. "
            "Kalıcı bir likidite krizine işaret etmez; likidite daralması cezalandırılmamalıdır."
            if is_tga_tax_season
            else "TGA olağan bütçe harcama/borçlanma döngüsünde; takvimsel vergi distorsiyonu yok."
        )

        liquidity_dynamics = {
            "current_net_liquidity_billion": current_net_liq_b,
            "prev_4w_net_liquidity_billion": prev_net_liq_b,
            "delta_liquidity_billion": delta_liq_b,
            "delta_liquidity_pct_4w": delta_liq_pct,
            "is_tga_tax_season": is_tga_tax_season,
            "tga_seasonality_note": tga_seasonality_note,
            "flow_direction": "Likidite Piyasaya Akıyor (Genişleme)" if delta_liq_b > 0 else "Likidite Piyasadan Çekiliyor (Daralma)"
        }

        # 6. Düzeltilmiş ve Sınırlandırılmış (Clipped) Sürpriz Z-Skorları
        surprises = []
        for event in calendar_events:
            title = event.get('title', '')
            actual_str = str(event.get('actual', '')).replace('%', '').replace('K', '').strip()
            forecast_str = str(event.get('forecast', '')).replace('%', '').replace('K', '').strip()
            try:
                act = float(actual_str)
                fcst = float(forecast_str)
                ind_type = self.identify_indicator_type(title)
                z = self.calculate_surprise_zscore(ind_type, act, fcst)
                surprises.append({
                    "title": title,
                    "indicator_type": ind_type,
                    "actual": act,
                    "forecast": fcst,
                    "z_score": z,
                    "interpretation": "Ilımlı Pozitif" if 0.2 < z <= 1.0 else "Güçlü Pozitif" if z > 1.0 else "Ilımlı Negatif" if -1.0 <= z < -0.2 else "Güçlü Negatif" if z < -1.0 else "Nötr / Beklentiye Paralel"
                })
            except (ValueError, TypeError):
                continue

        # 7. Kredi Risk Primi (High Yield OAS - BAMLH0A0HYM2)
        hy_oas = fred_data.get("BAMLH0A0HYM2", 3.28)
        credit_spread_analysis = {
            "hy_oas_spread_pct": hy_oas,
            "stress_level": "Sakin / Düşük Risk (Benign)" if hy_oas < 3.8 else "Orta Düzey Kredi Baskısı" if hy_oas < 4.8 else "Şiddetli Kredi Krizi (Distress)",
            "equity_implication": (
                f"Kredi makası %{hy_oas:.2f} (Tarihsel ortalamanın altında, sakin). Şirketler rahat borçlanıyor, temerrüt riski yok. "
                "Kredi piyasası sakinken borsalarda (SPX) kalıcı çöküş veya kriz fiyatlaması beklenemez; SPX en fazla Neutral/ılımlı düzeltme alabilir."
                if hy_oas < 3.8
                else f"Kredi makası %{hy_oas:.2f} seviyesine fırladı; temerrüt riski hisseleri baskılayabilir."
            )
        }

        # 8. Finansal Koşullar Endeksi (Chicago Fed NFCI)
        nfci = fred_data.get("NFCI", -0.52)
        financial_conditions_analysis = {
            "nfci_value": nfci,
            "regime": "Gevşek / Akıcı (Accommodative)" if nfci < 0 else "Sıkı / Kısıtlayıcı (Restrictive)",
            "buffer_effect": (
                f"NFCI {nfci:.2f} (< 0). Bankacılık sistemi ve özel sektör likiditesi Fed bilanço küçülmesini (QT) dengeliyor; "
                "piyasa likidite şokundan korunuyor."
                if nfci < 0
                else f"NFCI {nfci:.2f} (> 0). Finansal koşullar tarihsel ortalamanın üzerinde sıkı."
            )
        }

        # 9. DXY Fiyat Seviyesi ve 5G / 20G Momentum Trendi
        dxy_data = market_data.get("DXY", {})
        dxy_val = dxy_data.get("value", 104.2)
        dxy_5d = dxy_data.get("val_5d_ago", dxy_val)
        dxy_20d = dxy_data.get("month_ago", dxy_5d)
        dxy_delta_5d_pct = round(((dxy_val - dxy_5d) / dxy_5d) * 100, 2) if dxy_5d else 0.0
        dxy_delta_20d_pct = round(((dxy_val - dxy_20d) / dxy_20d) * 100, 2) if dxy_20d else 0.0
        dxy_trend_analysis = {
            "level": dxy_val,
            "delta_5d_pct": dxy_delta_5d_pct,
            "delta_20d_pct": dxy_delta_20d_pct,
            "momentum_regime": "Düşüş Trendi / Zayıf Dolar" if (dxy_val < 100.0 or dxy_delta_20d_pct < -0.5) else "Yükseliş Trendi / Güçlü Dolar" if dxy_delta_20d_pct > 1.0 else "Nötr / Yatay Bant",
            "warning": (
                f"DXY {dxy_val:.2f} seviyesinde (100'ün altında) ve 20G momentumu %{dxy_delta_20d_pct:+.2f}. "
                "Dolar zayıflarken DXY'ye körü körüne Bullish, EURUSD'ye körü körüne Bearish verme! "
                "Piyasa ABD borç sürdürülebilirliğini (Fiscal Dominance / Debasement Trade) fiyatlıyor."
                if (dxy_val < 100.0 or dxy_delta_20d_pct < -0.5)
                else "DXY momentumu pozitif / stabil."
            )
        }

        # 10. Haftalık Öncü İstihdam (FRED ICSA - Initial Claims)
        icsa = fred_data.get("ICSA", 218.0)
        jobless_claims_analysis = {
            "initial_claims_k": icsa,
            "status": "Sağlıklı / Tam İstihdam Teyitli" if icsa <= 235.0 else "Ilımlı Zayıflama Uyarısı" if icsa <= 260.0 else "İstihdamda Kırılma / Resesyonel Artış",
            "leading_signal": (
                f"Haftalık ilk işsizlik başvuruları {icsa:.0f}K (210K-230K sağlıklı istihdam bandında). "
                "Aylık NFP verisinin gücü haftalık öncü veriyle teyit edilmektedir; istihdamda ani bir çatlama yok."
                if icsa <= 235.0
                else f"Haftalık başvurular {icsa:.0f}K seviyesine tırmandı! Bir sonraki NFP öncesi işgücü piyasasında zayıflama sinyali."
            )
        }

        # 11. Histeresis Destekli Dış Ticaret Hadleri & EURUSD Enerji Şoku Tuzağı (Terms-of-Trade)
        # Önceki rejim durumunu bias gate dosyasından oku (Regime Flickering / Titreme önleyici)
        prev_energy_penalty = False
        prev_cap_preservation = False
        if BIAS_GATE_FILE.exists():
            try:
                with open(BIAS_GATE_FILE, "r", encoding="utf-8") as f:
                    prev_gate = json.load(f)
                    prev_regime_state = prev_gate.get("regime_state", {})
                    prev_energy_penalty = prev_regime_state.get("energy_penalty_active", False)
                    prev_cap_preservation = prev_regime_state.get("capital_preservation_active", False)
            except Exception:
                pass

        enter_level = HYSTERESIS_CONFIG.get("BRENT_ENERGY_PENALTY_ENTER", 85.0)
        exit_level = HYSTERESIS_CONFIG.get("BRENT_ENERGY_PENALTY_EXIT", 81.0)
        is_global_mfg_slowing = ratio_delta_4w_pct < -2.0

        if prev_energy_penalty:
            # Zaten aktifse, ancak petrol çıkış seviyesinin (<$81) altına inerse ceza kalkar (~%5 histeresis bandı)
            eurusd_energy_penalty = not (brent < exit_level)
            hysteresis_note = f"Histeresis Aktif: Önceki durum korundu (Brent ${brent:.1f} >= ${exit_level:.1f} çıkış eşiği)"
        else:
            # Pasifse, ancak $85'i aşarsa ve sanayi zayıfsa aktifleşir
            eurusd_energy_penalty = (brent >= enter_level) and is_global_mfg_slowing
            hysteresis_note = f"Standart Eşik: Brent ${brent:.1f} (Giriş eşiği: ${enter_level:.1f})"

        terms_of_trade_energy_analysis = {
            "brent_level": brent,
            "eurusd_energy_penalty": eurusd_energy_penalty,
            "hysteresis_note": hysteresis_note,
            "recommended_eurusd_gate": "NEUTRAL_RANGE" if eurusd_energy_penalty else "DIRECTIONAL_ALLOWED",
            "rationale": (
                f"Brent petrol ${brent:.1f} ve küresel imalat zayıfken (Bakır/Altın %{ratio_delta_4w_pct:+.2f}) Euro Bölgesi enerji ithalatçısı olarak dış ticaret şoku yaşar. "
                "DXY'nin borç endişesiyle zayıflaması Euro'ya kalıcı güç kazandırmaz; debasement altını ve emtiayı beslerken enerji faturası Euro'yu baskılar. "
                "Bu sebeple EURUSD körlemesine LONG_ONLY yapılamaz; NEUTRAL_RANGE veya DEFENSIVE_HOLD olarak sınırlandırılmalıdır. "
                f"[{hysteresis_note}]"
                if eurusd_energy_penalty
                else "Enerji şoku baskısı yok; döviz pariteleri normal faiz farkı rejiminde."
            )
        }

        # 12. Transatlantik Faiz Makası (US 10Y vs Almanya 10Y Bund Spread & Trendi)
        de10y = fred_data.get("DE10Y", 2.40)
        de10y_prev = fred_data.get("DE10Y_4W_AGO", 2.48)
        transatlantic_spread_bps = round((us10y - de10y) * 100, 1)
        prev_transatlantic_spread_bps = round((us10y_20d - de10y_prev) * 100, 1)
        delta_transatlantic_20d_bps = round(transatlantic_spread_bps - prev_transatlantic_spread_bps, 1)

        transatlantic_analysis = {
            "us10y": us10y,
            "de10y_bund": de10y,
            "spread_bps": transatlantic_spread_bps,
            "delta_spread_20d_bps": delta_transatlantic_20d_bps,
            "direction": "ABD Lehine Genişliyor (Dolar Getiri Avantajı Artıyor)" if delta_transatlantic_20d_bps > 5.0 else "Euro/Almanya Lehine Daralıyor" if delta_transatlantic_20d_bps < -5.0 else "Dengeli / Yatay",
            "implication": (
                f"Transatlantik getiri makası +{transatlantic_spread_bps:.1f} bps (20G Δ: {delta_transatlantic_20d_bps:+.1f} bps). "
                "Almanya 10Y Bund faizlerine kıyasla ABD tahvillerinin sunduğu net getiri primi Dolar lehine sermaye akışını destekler. "
                "Enerji şokuyla birleştiğinde EURUSD için yukarı yönlü alan kapalıdır."
                if delta_transatlantic_20d_bps >= 0
                else f"Almanya Bund getirileri ABD'ye kıyasla daha güçlü (Makas daralıyor: {delta_transatlantic_20d_bps:+.1f} bps)."
            )
        }

        # 13. T-0 Anlık Piyasa Stresi Devre Kesicisi (Fast Stress Override)
        hyg_data = market_data.get("HYG", {})
        lqd_data = market_data.get("LQD", {})
        vix_data = market_data.get("VIX", {})
        brent_data = market_data.get("BRENT", {})

        hyg_val = hyg_data.get("value", 79.2)
        lqd_val = lqd_data.get("value", 105.5)
        hyg_prev = hyg_data.get("prev", hyg_val)
        lqd_prev = lqd_data.get("prev", lqd_val)
        hyg_5d = hyg_data.get("val_5d_ago", hyg_prev)
        lqd_5d = lqd_data.get("val_5d_ago", lqd_prev)

        current_hyg_lqd = round(hyg_val / lqd_val, 4) if lqd_val else 0.7507
        prev_hyg_lqd = round(hyg_prev / lqd_prev, 4) if lqd_prev else current_hyg_lqd
        hyg_lqd_5d = round(hyg_5d / lqd_5d, 4) if lqd_5d else current_hyg_lqd

        hyg_lqd_delta_1d_pct = round(((current_hyg_lqd - prev_hyg_lqd) / prev_hyg_lqd) * 100, 2) if prev_hyg_lqd else 0.0
        hyg_lqd_delta_5d_pct = round(((current_hyg_lqd - hyg_lqd_5d) / hyg_lqd_5d) * 100, 2) if hyg_lqd_5d else 0.0

        vix_val = vix_data.get("value", 14.5)
        vix_delta_1d_pct = vix_data.get("change_pct", 0.0)
        vix_delta_5d_pct = vix_data.get("change_pct_5d", 0.0)

        brent_delta_1d_pct = brent_data.get("change_pct", 0.0)
        brent_delta_5d_pct = brent_data.get("change_pct_5d", 0.0)

        fast_stress_triggers = []
        if hyg_lqd_delta_5d_pct < -1.5 or hyg_lqd_delta_1d_pct < -1.0:
            fast_stress_triggers.append(f"HYG/LQD Canlı Kredi Makası Bozuldu (1G: %{hyg_lqd_delta_1d_pct}, 5G: %{hyg_lqd_delta_5d_pct})")
        if vix_val > 22.0 or vix_delta_1d_pct > 15.0:
            fast_stress_triggers.append(f"VIX Oynaklık Patlaması (Seviye: {vix_val:.1f}, 1G Sıçrama: %{vix_delta_1d_pct:+.1f})")
        if brent_delta_1d_pct > 4.0 or brent_delta_5d_pct > 8.0:
            fast_stress_triggers.append(f"Brent Ani Emtia Şoku (1G Sıçrama: %{brent_delta_1d_pct:+.1f}, 5G: %{brent_delta_5d_pct:+.1f})")

        fast_stress_override = len(fast_stress_triggers) > 0

        t0_fast_stress_analysis = {
            "fast_stress_override": fast_stress_override,
            "triggers": fast_stress_triggers,
            "hyg_lqd_ratio": current_hyg_lqd,
            "hyg_lqd_delta_1d_pct": hyg_lqd_delta_1d_pct,
            "hyg_lqd_delta_5d_pct": hyg_lqd_delta_5d_pct,
            "vix_level": vix_val,
            "vix_delta_1d_pct": vix_delta_1d_pct,
            "vix_delta_5d_pct": vix_delta_5d_pct,
            "brent_delta_1d_pct": brent_delta_1d_pct,
            "warning": (
                "⚠️ [T-0 FAST STRESS OVERRIDE AKTİF] Canlı piyasada anlık stres şoku tespit edildi! "
                "FRED'in haftalık gecikmeli metrikleri (NFCI / OAS) baypas edilerek sistem acil savunma moduna geçirildi."
                if fast_stress_override
                else "T-0 anlık piyasa göstergeleri (VIX, HYG/LQD, Petrol) sakin; FRED verileri geçerli."
            )
        }

        # 14. BTC vs Altın Ayrışması (Bear Steepening & Volatilite Şoku - Dinamik Yüzdelik Dilimli)
        is_bear_steepening = (yield_curve.get("regime") == "Bear Steepening")
        delta_10y_5d = yield_curve.get("delta_10y_5d_bps", 0.0)
        vix_pct_60d = vix_data.get("pct_rank_60d", 50.0)
        brent_pct_60d = brent_data.get("pct_rank_60d", 50.0)

        # Mutlak VIX > 20 veya 60 günlük pencerede %80'in üzerinde oynaklık şoku
        is_volatility_shock = (vix_val > 20.0 or vix_pct_60d >= 80.0 or vix_delta_5d_pct > 10.0)
        btc_decoupling_active = (
            is_bear_steepening and (is_volatility_shock or delta_10y_5d > 15.0)
        )

        btc_decoupling_analysis = {
            "btc_decoupling_active": btc_decoupling_active,
            "is_bear_steepening": is_bear_steepening,
            "vix_level": vix_val,
            "vix_pct_60d": vix_pct_60d,
            "vix_5d_delta_pct": vix_delta_5d_pct,
            "us10y_5d_delta_bps": delta_10y_5d,
            "recommended_btc_gate": "SHORT_ONLY" if btc_decoupling_active else "LONG_ONLY_ALLOWED_IF_DEBASEMENT",
            "rationale": (
                f"Bear Steepening esnasında 10Y faiz sıçraması ({delta_10y_5d:+.1f} bps) ve oynaklık (VIX: {vix_val:.1f}, 60G Dilim: %{vix_pct_60d:.1f}) fonlarda teminat tamamlama (margin call) dalgası başlatır. "
                "Altın merkez bankalarının fiziki rezerv talebiyle korunurken, BTC hafta sonu da nakde dönebilen en likit yüksek beta varlık olarak ilk satılan enstrümandır. "
                "Bu sebeple BTC'de Long yönlü işlemler yüksek risk barındırır; fonların tasfiye dalgasıyla SHORT_ONLY yönlü kırılımlar desteklenir."
                if btc_decoupling_active
                else f"Tahvil oynaklığı sakin (VIX 60G Dilim: %{vix_pct_60d:.1f}); BTC'de egemen borç debasement tezi 0.50x risk ile geçerli."
            )
        }

        # 15. Fiyatlanan Faiz Patikası (FedWatch & Forward Easing / Hawkish Repricing)
        fed_policy_rate = 5.33  # Efektif Fed Fonlama Faizi (~%5.33)
        implied_rate_gap_bps = round((us02y - fed_policy_rate) * 100, 1)
        u02_5d = us02y_data.get("val_5d_ago", us02y_prev)
        delta_02y_5d_bps = round((us02y - u02_5d) * 100, 1)

        fed_forward_path_analysis = {
            "current_policy_rate": fed_policy_rate,
            "us02y_yield": us02y,
            "implied_rate_gap_bps": implied_rate_gap_bps,
            "delta_02y_5d_bps": delta_02y_5d_bps,
            "repricing_direction": (
                "Hawkish Repricing (Piyasa Faiz İndirimlerini Siliyor)"
                if delta_02y_5d_bps >= 8.0
                else "Dovish Repricing (Daha Fazla İndirim Fiyatlanıyor)"
                if delta_02y_5d_bps <= -8.0
                else "Sabit Fiyatlanan Patika (Beklentiler Dengeli)"
            ),
            "implication": (
                f"2Y tahvil faizi (%{us02y}) üzerinden piyasa Fed'den toplam {abs(implied_rate_gap_bps):.0f} bps gevşeme fiyatlamaktadır. "
                f"5G Δ: {delta_02y_5d_bps:+.1f} bps. "
                "Eğer getiri eğrisi dikleşirken faiz indirimleri siliniyorsa bu ikili bir şoktur; ancak indirimler korunuyorsa dikleşme arz baskısı kaynaklıdır."
            )
        }

        # 16. Fed Tepki Fonksiyonu (Reaction Function & Değerleme Tavanı)
        unemp_rate = 4.1
        nfp_val = 190.0
        for s in surprises:
            if s.get("indicator_type") == "unemployment":
                unemp_rate = s.get("actual", unemp_rate)
            elif s.get("indicator_type") == "nfp":
                nfp_val = s.get("actual", nfp_val)

        fed_reaction_function = {
            "rate_path_expectation": "Higher for Longer (Faiz İndirimleri Öteleniyor)",
            "driver": f"İstihdam canlı (%{unemp_rate} işsizlik, {nfp_val}K NFP, {icsa:.0f}K ICSA) ve enerji yüksek (${brent:.1f}). Fed erken gevşeyemez.",
            "equity_multiple_cap": (
                "Tahvil getirilerindeki yükseliş (%4.50+ nominal, %1.95 reel) hisse senetlerinin F/K çarpanlarını baskılar. "
                "Kredi makası sakin olduğu için çöküş olmasa bile, iskonto oranının yüksek kalması SPX'te ralli potansiyelini sınırlar; "
                "SPX için tavan 'Neutral' (Yatay Bant) olarak korunmalıdır."
            )
        }

        # 17. Ayrışmış Döngü Teşhisi (US Exceptionalism vs Küresel İmalat Yavaşlaması)
        is_labor_strong = (unemp_rate <= 4.3 and nfp_val >= 150.0 and icsa <= 240.0)
        cycle_diagnosis = {
            "unemployment_rate": unemp_rate,
            "nfp_value": nfp_val,
            "icsa_claims": icsa,
            "is_labor_strong": is_labor_strong,
            "us_domestic_cycle": "Late-Cycle Domestic Resilience (US Exceptionalism - Tüketim & Hizmet Canlı)",
            "global_macro_cycle": "Manufacturing Slowdown / Contractionary Pressure (Küresel Sanayi Zayıf)",
            "regime_diagnosis": (
                "Late-Cycle Overheating with Global Divergence"
                if is_labor_strong and brent >= 80.0
                else "Stagflation"
                if not is_labor_strong and brent >= 80.0
                else "Reflationary Growth"
                if is_labor_strong
                else "Deflationary Slowdown"
            ),
            "rationale": (
                f"ABD iç piyasasında işsizlik %{unemp_rate} ve NFP {nfp_val}K (haftalık başvurular {icsa:.0f}K) ile hizmetler canlıdır; "
                f"fakat Bakır/Altın rasyosundaki %{ratio_delta_4w_pct:+.2f}'lik düşüş küresel sanayinin yavaşladığını göstermektedir. "
                "Piyasa homojen bir rejimde değil, 'ABD İstisnacılığı' ile 'Küresel İmalat Yavaşlaması' arasındaki makasta hareket etmektedir."
            )
        }

        # Histeresis Durumu Hafızası
        regime_state = {
            "energy_penalty_active": eurusd_energy_penalty,
            "capital_preservation_active": prev_cap_preservation or fast_stress_override,
            "fast_stress_override": fast_stress_override,
            "btc_decoupling_active": btc_decoupling_active,
            "vix_pct_60d": vix_pct_60d,
            "brent_pct_60d": brent_pct_60d
        }

        processed = {
            "yield_curve": yield_curve,
            "real_yield_info": real_yield_info,
            "copper_gold_analysis": copper_gold_analysis,
            "credit_spread_analysis": credit_spread_analysis,
            "financial_conditions_analysis": financial_conditions_analysis,
            "jobless_claims_analysis": jobless_claims_analysis,
            "terms_of_trade_energy_analysis": terms_of_trade_energy_analysis,
            "transatlantic_analysis": transatlantic_analysis,
            "t0_fast_stress_analysis": t0_fast_stress_analysis,
            "btc_decoupling_analysis": btc_decoupling_analysis,
            "regime_state": regime_state,
            "fed_forward_path_analysis": fed_forward_path_analysis,
            "fed_reaction_function": fed_reaction_function,
            "dxy_trend_analysis": dxy_trend_analysis,
            "cycle_diagnosis": cycle_diagnosis,
            "dxy_oil_correlation": dxy_oil_corr,
            "liquidity_dynamics": liquidity_dynamics,
            "dxy_level": dxy_val,
            "brent_level": brent,
            "gold_level": gold,
            "surprises": surprises
        }

        logger.info(
            f"📊 [DÜZELTİLMİŞ METRİKLER] Döngü: {cycle_diagnosis['regime_diagnosis']} | "
            f"Transatlantik Spread: +{transatlantic_spread_bps:.1f} bps | VIX: {vix_val:.1f} | "
            f"T-0 Stres: {'⚠️ AKTİF' if fast_stress_override else 'Sakin'} | "
            f"EURUSD Enerji Cezası: {'VAR (NEUTRAL_RANGE)' if eurusd_energy_penalty else 'YOK'} | "
            f"BTC Ayrışması: {'⚠️ DEFENSIVE_HOLD' if btc_decoupling_active else 'Normal'}"
        )
        return processed
