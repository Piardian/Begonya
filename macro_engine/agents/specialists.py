import logging
from typing import Dict, Any
from core.key_manager import DualCascadeRouter
from agents.schemas import LiquidityOutput, GrowthOutput, MacroStrategistOutput

logger = logging.getLogger("MacroSpecialistAgents")

class MacroSpecialists:
    def __init__(self):
        self.router = DualCascadeRouter()

    def analyze_liquidity(self, metrics: Dict[str, Any]) -> LiquidityOutput:
        """
        Ajan 1: Likidite, Kredi ve Finansal Koşullar Analisti
        Getiri eğrisi trendi, Net Likidite Deltası (Δ4W), HY OAS Kredi Makası, NFCI ve DXY analiz edilir.
        """
        yc = metrics.get('yield_curve', {})
        liq_dyn = metrics.get('liquidity_dynamics', {})
        ry = metrics.get('real_yield_info', {})
        credit = metrics.get('credit_spread_analysis', {})
        nfci_data = metrics.get('financial_conditions_analysis', {})
        dxy_trend = metrics.get('dxy_trend_analysis', {})
        t0_stress = metrics.get('t0_fast_stress_analysis', {})

        prompt = f"""
        Aşağıdaki dinamik ve delta destekli likidite metriklerini kurumsal bir tahvil/likidite uzmanı olarak değerlendir:
        
        [T-0 ANLIK PİYASA STRESİ DEVRE KESİCİSİ (FAST STRESS OVERRIDE)]:
        - Fast Stress Devrede mi?: {t0_stress.get('fast_stress_override')}
        - Tetikleyiciler: {t0_stress.get('triggers')}
        - HYG / LQD Kredi Oranı: {t0_stress.get('hyg_lqd_ratio')} (1G: %{t0_stress.get('hyg_lqd_delta_1d_pct')}, 5G: %{t0_stress.get('hyg_lqd_delta_5d_pct')})
        - VIX Seviyesi & Değişimi: {t0_stress.get('vix_level')} (1G: %{t0_stress.get('vix_delta_1d_pct')}, 5G: %{t0_stress.get('vix_delta_5d_pct')})
        - Uyarı: {t0_stress.get('warning')}
        
        [GETİRİ EĞRİSİ VE ÇOKLU ZAMAN DİLİMLİ SLOPE TRENDİ]:
        - Eğri Rejimi: {yc.get('regime')} ({yc.get('spread_bps')} bps)
        - Risk Kategorisi: {yc.get('risk_category')}
        - 5 Günlük Spread Değişimi (ΔSpread_5D): {yc.get('delta_spread_5d_bps')} bps
        - 20 Günlük Spread Değişimi (ΔSpread_20D): {yc.get('delta_spread_20d_bps')} bps
        - 1 Günlük Mikro Değişim (Gürültü): {yc.get('delta_spread_1d_bps')} bps
        - 10Y 5G Değişimi: {yc.get('delta_10y_5d_bps')} bps | 2Y 5G Değişimi: {yc.get('delta_02y_5d_bps')} bps
        - Teknik Tanım: {yc.get('description')}
        - 10Y Doğrudan Reel Getiri: %{ry.get('real_yield_pct')} [{ry.get('yield_source')}] ({ry.get('pressure_on_gold')})
        
        [HAFTALIK ÖNCÜ İSTİHDAM (FRED ICSA)]:
        - Haftalık İlk İşsizlik Başvuruları: {metrics.get('jobless_claims_analysis', {}).get('initial_claims_k')}K
        - İstihdam Öncü Durumu: {metrics.get('jobless_claims_analysis', {}).get('status')}
        - Sinyal: {metrics.get('jobless_claims_analysis', {}).get('leading_signal')}
        
        [KREDİ PİYASASI & ŞİRKET TAHVİL MAKASI (HY OAS)]:
        - ABD Yüksek Getirili Şirket Makası (BAMLH0A0HYM2): %{credit.get('hy_oas_spread_pct')}
        - Kredi Stres Seviyesi: {credit.get('stress_level')}
        - Kredi Piyasası Mesajı: {credit.get('equity_implication')}
        
        [FİNANSAL KOŞULLAR ENDEKSİ (CHICAGO FED NFCI)]:
        - NFCI Değeri: {nfci_data.get('nfci_value')} ({nfci_data.get('regime')})
        - Likidite Tamponu: {nfci_data.get('buffer_effect')}
        
        [LİKİDİTE AKIŞ HIZI (DELTA LIQUIDITY)]:
        - Güncel Net Likidite: ${liq_dyn.get('current_net_liquidity_billion'):,.1f}B
        - 4 Haftalık Net Likidite Değişimi (Δ): ${liq_dyn.get('delta_liquidity_billion'):,.1f}B (%{liq_dyn.get('delta_liquidity_pct_4w')})
        - Akış Yönü: {liq_dyn.get('flow_direction')}
        - TGA Sezonsallık Durumu: {liq_dyn.get('tga_seasonality_note')}
        
        [DÖVİZ VE DXY MOMENTUMU]:
        - DXY Seviyesi: {dxy_trend.get('level')} | 20G Momentum: %{dxy_trend.get('delta_20d_pct')} ({dxy_trend.get('momentum_regime')})
        - Uyarı Notu: {dxy_trend.get('warning')}
        
        KATİ ANALİZ KURALLARI:
        1. T-0 PİYASA STRESİ: Eğer fast_stress_override True ise, haftalık gecikmeli FRED sakinliğini (NFCI/OAS) geçersiz kıl ve fast_stress_override alanını True yap!
        2. DXY 100'ün altında ve negatif momentumdaysa Dolar Baskısı 'High' DEĞİL; 'Low' veya 'Neutral'dir.
        3. Kredi Makası (HY OAS) %3.8'in altındaysa ve HYG/LQD sakinse kredi stresi 'Low / Benign'dir; piyasa likidite krizi yaşamamaktadır.
        4. ICSA 218K seviyesindeyken istihdam piyasası sağlamdır; NFP'nin gücü haftalık olarak teyitlidir.
        5. TGA VERGİ SEZONSALLIĞI: Eğer is_tga_tax_season True ise ({liq_dyn.get('is_tga_tax_season')}), likiditedeki düşüşün geçici federal vergi tahsilatından kaynaklandığını, kalıcı bir kredi/likidite krizi olmadığını özette belirt.
        """
        system_instruction = (
            "Sen Wall Street düzeyinde çalışan bir Baş Likidite, Kredi ve Tahvil Piyasası Analistisin. "
            "Fed bilançosuna, T-0 anlık piyasa stresine (HYG/LQD, VIX), haftalık ICSA istihdamına ve Chicago Fed NFCI endeksine bakarsın."
        )

        logger.info("🌊 [Ajan 1: Likidite Analisti] Çalışıyor...")
        return self.router.execute_structured(
            role="analyst",
            prompt=prompt,
            schema=LiquidityOutput,
            system_instruction=system_instruction
        )

    def analyze_growth_and_commodities(self, metrics: Dict[str, Any]) -> GrowthOutput:
        """
        Ajan 2: Büyüme ve Emtia Analisti
        ABD İstisnacılığı ile Küresel İmalat Yavaşlaması ve Transatlantik Faiz Makasını modeller.
        """
        cg = metrics.get('copper_gold_analysis', {})
        cycle = metrics.get('cycle_diagnosis', {})
        energy_tot = metrics.get('terms_of_trade_energy_analysis', {})
        transatlantic = metrics.get('transatlantic_analysis', {})

        prompt = f"""
        Aşağıdaki büyüme, emtia ve döngü ayrışması verilerini değerlendir:
        
        [ABD İSTİSNACILIĞI VS KÜRESEL DÖNGÜ AYRIŞMASI]:
        - ABD İç Piyasası: {cycle.get('us_domestic_cycle')} (İşsizlik: %{cycle.get('unemployment_rate')}, NFP: {cycle.get('nfp_value')}K, ICSA: {cycle.get('icsa_claims')}K)
        - Küresel Sanayi Döngüsü: {cycle.get('global_macro_cycle')} (Bakır/Altın 4H Δ: %{cg.get('delta_4w_pct')})
        - Döngü Teşhisi: {cycle.get('regime_diagnosis')}
        - Rasyonel: {cycle.get('rationale')}
        
        [TRANSATLANTİK FAİZ MAKASI (US10Y - ALMANYA 10Y BUND)]:
        - US 10Y: %{transatlantic.get('us10y')} | Almanya 10Y Bund: %{transatlantic.get('de10y_bund')}
        - Makas: +{transatlantic.get('spread_bps')} bps (20G Δ: {transatlantic.get('delta_spread_20d_bps')} bps)
        - Yön: {transatlantic.get('direction')}
        - İma: {transatlantic.get('implication')}
        
        [DIŞ TİCARET HADLERİ & ENERJİ ŞOKU (HİSTERESİS KORUMALI)]:
        - Brent Petrol: ${metrics.get('brent_level')}
        - EURUSD Enerji Cezası: {'VAR' if energy_tot.get('eurusd_energy_penalty') else 'YOK'}
        - Histeresis Durumu: {energy_tot.get('hysteresis_note')}
        - Enerji Analizi: {energy_tot.get('rationale')}
        
        [STANDARTLAŞTIRILMIŞ SÜRPRİZLER (Z-SCORES)]:
        {metrics.get('surprises')}
        
        KATİ ANALİZ KURALLARI:
        1. İKTİSADİ TANIM: İşsizlik %4.1 ve NFP 190K iken kesinlikle 'Stagflation' DEME! ABD tarafında 'Late-Cycle Overheating' vardır. macro_quadrant olarak 'Late-Cycle Overheating' seç.
        2. KÜRESEL AYRIŞMA: us_vs_global_divergence alanında ABD iç pazarının güçlü olduğunu, ancak düşen Bakır/Altın rasyosu ve yüksek petrol nedeniyle Avrupa ve Asya imalatının ezildiğini (US Exceptionalism vs Global Slowdown) açıkça belirt.
        3. TRANSATLANTİK MAKAS: transatlantic_spread_bps değerini ({transatlantic.get('spread_bps')}) aktar; eurusd_terms_of_trade_penalty değerini {energy_tot.get('eurusd_energy_penalty')} olarak set et.
        """
        system_instruction = (
            "Sen Bridgewater Associates standartlarında çalışan bir Kıdemli Makro Dörtgen ve Emtia Analistisin. "
            "ABD İstisnacılığı ile küresel sanayi yavaşlaması arasındaki makası ve Transatlantik faiz makasını teşhis edersin."
        )

        logger.info("📈 [Ajan 2: Büyüme & Emtia Analisti] Çalışıyor...")
        return self.router.execute_structured(
            role="analyst",
            prompt=prompt,
            schema=GrowthOutput,
            system_instruction=system_instruction
        )

    def synthesize_macro_regime(
        self,
        liquidity: LiquidityOutput,
        growth: GrowthOutput,
        metrics: Dict[str, Any]
    ) -> MacroStrategistOutput:
        """
        Ajan 3: Baş Makro Stratejist & Karar Motoru
        Ajan 1 ve Ajan 2 çıktılarını çapraz kontrol eder; BTC decoupling, histeresis, EURUSD enerji tuzağı ve Fed reaksiyon fonksiyonunu yansıtır.
        """
        yc = metrics.get('yield_curve', {})
        ry = metrics.get('real_yield_info', {})
        liq_dyn = metrics.get('liquidity_dynamics', {})
        cg = metrics.get('copper_gold_analysis', {})
        credit = metrics.get('credit_spread_analysis', {})
        nfci_data = metrics.get('financial_conditions_analysis', {})
        dxy_trend = metrics.get('dxy_trend_analysis', {})
        cycle = metrics.get('cycle_diagnosis', {})
        claims = metrics.get('jobless_claims_analysis', {})
        tot_energy = metrics.get('terms_of_trade_energy_analysis', {})
        transatlantic = metrics.get('transatlantic_analysis', {})
        t0_stress = metrics.get('t0_fast_stress_analysis', {})
        btc_dec = metrics.get('btc_decoupling_analysis', {})
        regime_st = metrics.get('regime_state', {})
        fed_rf = metrics.get('fed_reaction_function', {})
        cross_analysis = metrics.get('cross_pairs_analysis', {})
        cross_gates = cross_analysis.get('cross_gates', {}) or regime_st.get('cross_pair_gates', {}) or {}

        prompt = f"""
        Aşağıdaki iki uzman analist raporunu ve çapraz piyasa metriklerini değerlendirip portföy yönelimlerini sentezle:
        
        [AJAN 1 - LİKİDİTE, KREDİ VE TAHVİL]:
        - Likidite Rejimi: {liquidity.liquidity_regime}
        - Getiri Eğrisi Dinamiği: {liquidity.yield_curve_dynamic}
        - T-0 Fast Stress Override: {liquidity.fast_stress_override}
        - Kredi Stresi (HY OAS): {liquidity.credit_stress} (%{credit.get('hy_oas_spread_pct')})
        - Finansal Koşullar (NFCI): {liquidity.financial_conditions_state} ({nfci_data.get('nfci_value')})
        - Dolar Baskısı: {liquidity.dollar_pressure}
        - Özet: {liquidity.summary}
        
        [AJAN 2 - BÜYÜME VE EMTİA]:
        - Makro Dörtgen: {growth.macro_quadrant}
        - ABD vs Küresel Ayrışma: {growth.us_vs_global_divergence}
        - Enerji Şoku Riski: {growth.energy_shock_risk}
        - Transatlantik Faiz Makası (US-DE Bund): +{growth.transatlantic_spread_bps} bps
        - EURUSD Enerji Cezası: {growth.eurusd_terms_of_trade_penalty}
        - Büyüme İvmesi: {growth.growth_momentum}
        - Enflasyon Riski: {growth.inflation_risk}
        - Özet: {growth.summary}
        
        [KRİTİK DOĞRULAMA VE HİPOTEZ TESTİ METRİKLERİ]:
        - Gerçek Döngü Teşhisi: {cycle.get('regime_diagnosis')} (İşsizlik: %{cycle.get('unemployment_rate')}, NFP: {cycle.get('nfp_value')}K, ICSA: {claims.get('initial_claims_k')}K)
        - DXY Durumu: Seviye {dxy_trend.get('level')}, 20G: %{dxy_trend.get('delta_20d_pct')} ({dxy_trend.get('momentum_regime')})
        - Transatlantik Faiz Makası: +{transatlantic.get('spread_bps')} bps ({transatlantic.get('direction')})
        - EURUSD Enerji Şoku / Dış Ticaret Hadleri: {tot_energy.get('rationale')}
        - Önerilen EURUSD Kapısı: {tot_energy.get('recommended_eurusd_gate')}
        - BTC vs Altın Ayrışması (Decoupling): {btc_dec.get('btc_decoupling_active')} | Önerilen BTC Kapısı: {btc_dec.get('recommended_btc_gate')}
        - BTC Ayrışma Nedeni: {btc_dec.get('rationale')}
        - T-0 Hızlı Piyasa Stresi: {t0_stress.get('warning')}
        - Fed Tepki Fonksiyonu: {fed_rf.get('rate_path_expectation')} | {fed_rf.get('equity_multiple_cap')}
        - Kredi Makası (HY OAS): %{credit.get('hy_oas_spread_pct')} ({credit.get('stress_level')})
        - 10Y Reel Getiri: %{ry.get('real_yield_pct')} [{ry.get('yield_source')}]
        - 4H Net Likidite Deltası (Δ): ${liq_dyn.get('delta_liquidity_billion')}B (%{liq_dyn.get('delta_liquidity_pct_4w')}) | TGA Notu: {liq_dyn.get('tga_seasonality_note')}
        - Bakır/Altın Momentum Deltası: %{cg.get('delta_4w_pct')}
        - Para Birimi Güç Puanları (3-Faktör): {regime_st.get('cross_currency_scores', {})}
        - Dolar Majörleri Kapıları: USDJPY: {cross_gates.get('USDJPY', 'NEUTRAL_RANGE')}, GBPUSD: {cross_gates.get('GBPUSD', 'NEUTRAL_RANGE')}, USDCAD: {cross_gates.get('USDCAD', 'NEUTRAL_RANGE')}, USDCHF: {cross_gates.get('USDCHF', 'NEUTRAL_RANGE')}
        
        🚨 ZORUNLU KURUMSAL PORTFÖY VE RİSK YÖNETİMİ KURALLARI:
        1. ALTIN (XAUUSD) - DİNAMİK MAKRO REJİM VE MALİ HAKİMİYET:
           - Secular (Uzun Vadeli): ABD bütçe açıkları, egemen borç riski ve küresel merkez bankalarının dolarsızlaşma fiziki alımları nedeniyle Altın'a 'SHORT_ONLY' VERİLMEZ (yapısal kalkan).
           - Taktik (Kısa Vadeli Getiri Şoku): Eğer 10Y Reel Getiri >= %1.90 ise veya Bear Steepening ile 10Y faizler sıçrıyorsa (Δ10Y_5d >= 10 bps), artan fırsat maliyeti ve süre riski nedeniyle Altın kapısı 'NEUTRAL_RANGE' (veya DEFENSIVE_HOLD) olarak belirlenmelidir. Böylece düşen bıçak tutulmaz, getiri baskısı bitene dek yeni Long kilitlenir.
           - Yalnızca reel getiriler sakin (< %1.90) ve faiz şoku yokken 'LONG_ONLY' izni verilir.
        2. BORSA ENDEKSLERİ (SPX/NAS100) VE ÇARPAN BASKISI:
           - VIX >= 22.0 olduğunda borsa zaten düşmüştür; kurumsal short cover ve ayı piyasası rallisi riski nedeniyle hisselerde 'SHORT_ONLY' YASAKTIR!
           - Endekslerde SHORT izni sadece fırtına öncesi sessizlikte verilebilir: VIX < 18.0 (Rehavet) ve Net Likidite daralırken.
           - Bear Steepening veya 10Y getiri sıçramasında (Δ10Y >= 10 bps), teknoloji/büyüme hisselerinin (NAS100) iskonto çarpanları daralır (değerleme şoku). Bu durumda SPX kapısı 'NEUTRAL_RANGE' veya likidite çekiliyorsa 'SHORT_ONLY' olmalıdır.
        3. BTC VE AYRIŞMA (BEAR STEEPENING & T-0 FAST STRESS):
           - Eğer btc_decoupling_active True ise veya fast_stress_override / capital_preservation_mode True ise: BTC KESİNLİKLE 'LONG_ONLY' OLAMAZ!
             * Bear Steepening faiz şokunda: BTC 'SHORT_ONLY' olmalı (hazine arz şoku & fon teminat tamamlama tasfiyeleri).
             * T-0 Fast Stress veya Sermaye Koruma modunda (Brent şoku, VIX sıçraması, likidite daralması): BTC 'DEFENSIVE_HOLD' (veya NEUTRAL_RANGE) olarak kilitlenmelidir.
           - Yalnızca piyasada stres yokken (fast_stress_override False, sermaye koruma pasif) ve tahvil oynaklığı sakinken BTC için fiat debasement temasıyla 'LONG_ONLY' izni verilebilir.
        4. EURUSD VE ENERJİ ŞOKU + TRANSATLANTİK MAKAS (İKİ TARAFLI DENGE):
           - Brent > $85 üzerindeyken Euro Bölgesi enerji ithalatçısıdır ve ticaret hadleri çöker.
           - Transatlantik makas (+{transatlantic.get('spread_bps')} bps) ABD lehine açık kaldıkça sermaye Dolar'a akar ve pozitif swap (carry) avantajı EURUSD SHORT'u destekler. DXY momentumu zayıfsa NEUTRAL_RANGE uygula.
        5. T-0 FAST STRESS & SERMAYE KORUMA MODU:
           - Eğer fast_stress_override True ise: capital_preservation_mode = True yap, recommended_risk_multiplier = 0.25'e düşür!
           - Çelişkiyi engelle: Metin ve taktiklerde tüm varlıklar için risk katsayısı olarak sadece 0.25x belirt (asla 0.50x veya 1.0x yazma).
        6. EXECUTION BIAS GATES KILAVUZU:
           - XAUUSD: Reel Getiri >= %1.90 veya Bear Steepening varsa 'NEUTRAL_RANGE'; sakinse 'LONG_ONLY'
           - EURUSD: Transatlantik makas > +180 bps ve Brent yüksekse 'SHORT_ONLY' veya 'NEUTRAL_RANGE'
           - BTC: Bear Steepening şokunda 'SHORT_ONLY'; T-0 stres / sermaye koruma modunda 'DEFENSIVE_HOLD'; sakin piyasada 'LONG_ONLY'
           - SPX: Bear Steepening / faiz şoku / VIX yüksekse 'NEUTRAL_RANGE'; rehavet + likidite daralmasında 'SHORT_ONLY'
            
        7. ÜÇ KATMANLI ZAMAN UFKU STRATEJİSİ (HORIZON GUIDANCE):
           - horizon_today: Bugünkü işlem seansı (M15 / Gün İçi) için net, somut ve doğrudan uygulanabilir taktik. Varlık lot boyutlarını her zaman recommended_risk_multiplier ile tutarlı ver (çelişkili lot yazma).
           - horizon_this_week: Bu haftalık (H4 / Swing) ufku için piyasa yönü, yaklaşan kritik verilerin (TÜFE/ÜFE/Merkez Bankası) getiri eğrisine ve paritelere haftalık etkisi.
           - horizon_this_month: Bu aylık (D1/W1) makro rejim rotası. Fed net likidite seyri, borçlanma tavanı, mali hakimiyet ve portföyün genel yönü.
           - TGA Sezonsallığı: Eğer TGA vergi dönemi aktifse ({liq_dyn.get('is_tga_tax_season')}), 4 haftalık net likidite düşüşünü geçici mevsimsel kamu tahsilatı olarak rasyonele ekle; kalıcı bir kriz gibi abartma.

        8. DOLAR MAJÖRLERİ VE GÖRELİ DEĞER KURALLARI (USD MAJORS - USDJPY, GBPUSD, USDCAD, USDCHF):
           - 3 Faktörlü para birimi puanları (USD, JPY, GBP, CAD, CHF, AUD, NZD) ve getiri farkı dinamiklerini rasyonele ve taktiklere yansıt.
           - GBPUSD: BoE faiz indirim fiyatlaması ve GB-US makası aleyhteyse SHORT_ONLY odaklı ol.
           - USDCAD: BoC faiz indirim baskısı petrolü eziyorsa LONG_ONLY; petrol güçlüyse NEUTRAL_RANGE.
           - USDJPY: US 2Y faiz direnci ile JPY carry çözülmesi dengedeyse NEUTRAL_RANGE; JPY güvenli liman girişi baskınsa SHORT_ONLY.
           - USDCHF: Dolar pozitif carry avantajı ile jeopolitik güvenli liman sığınağı dengedeyse NEUTRAL_RANGE.
        """
        system_instruction = (
            "Sen Küresel Bir Makro Hedge Fonunun Baş Yatırım Komitesi Başkanısın (CIO). "
            "Bear Steepening'de BTC'yi altından ayırmayı, Transatlantik faiz makası ve enerji şokunda Euro tuzağına düşmemeyi, "
            "Higher for Longer ortamında hisseye tavan koymayı ve histeresis ile piyasa titremesini (flickering) engellemeyi bilirsin."
        )

        logger.info("🧠 [Ajan 3: Baş Makro Stratejist] Asimetrik Rejim Sentezi Üretiyor...")
        return self.router.execute_structured(
            role="strategist",
            prompt=prompt,
            schema=MacroStrategistOutput,
            system_instruction=system_instruction
        )
