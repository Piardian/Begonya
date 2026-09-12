import json
import logging
import urllib.request
import urllib.parse
from typing import Dict, Any, List, Optional
from pathlib import Path
import datetime
import sys

ROOT_DIR = Path(__file__).parent.parent.resolve()
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import html
from config import TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID

logger = logging.getLogger("TelegramNotifier")


def send_telegram_message(text: str, parse_mode: str = "HTML") -> bool:
    """Telegram Bot API üzerinden belirtilen CHAT_ID'ye mesaj gönderir."""
    token = TELEGRAM_BOT_TOKEN
    chat_id = TELEGRAM_CHAT_ID

    if not token or not chat_id:
        logger.warning("[TelegramNotifier] TELEGRAM_BOT_TOKEN veya TELEGRAM_CHAT_ID ayarlanmamış!")
        return False

    # Telegram 4096 karakter limiti: Metin 3800'ü aşarsa mantıksal bloktan 2 parçaya bölüp ilet
    if len(text) > 3800:
        logger.info(f"[TelegramNotifier] Mesaj uzunluğu ({len(text)} karakter) limiti aşıyor, akıllı 2 parçaya bölünüyor...")
        split_marker = "\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n💡 <b>EYLEM PLANI"
        if split_marker in text:
            parts = text.split(split_marker)
            part1 = parts[0] + "\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n<i>(Devamı Aşağıda ⬇️)</i>"
            part2 = "🌺 <b>BEGONYA | STRATEJİ & EYLEM PLANI (DEVAM)</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n💡 <b>EYLEM PLANI" + parts[1]
            return send_telegram_message(part1, parse_mode=parse_mode) and send_telegram_message(part2, parse_mode=parse_mode)
        else:
            split_idx = text.rfind("\n\n", 0, 3500)
            if split_idx == -1:
                split_idx = 3500
            part1 = text[:split_idx]
            part2 = text[split_idx:]
            return send_telegram_message(part1, parse_mode=parse_mode) and send_telegram_message(part2, parse_mode=parse_mode)

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": parse_mode,
        "disable_web_page_preview": True
    }

    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=15) as response:
            res_json = json.loads(response.read().decode("utf-8"))
            if res_json.get("ok"):
                logger.info("[TelegramNotifier] ✅ Telegram mesajı başarıyla iletildi.")
                return True
            else:
                logger.error(f"[TelegramNotifier] ❌ Telegram API hatası: {res_json}")
                return False
    except urllib.error.HTTPError as he:
        err_body = he.read().decode("utf-8", errors="ignore")
        logger.error(f"[TelegramNotifier] ❌ Telegram HTTPError {he.code}: {err_body}")
        if "can't parse entities" in err_body and parse_mode != "":
            logger.info("[TelegramNotifier] 🔄 Format hatası nedeniyle düz metin olarak tekrar deneniyor...")
            import re
            plain_text = re.sub(r'<[^>]+>', '', text)
            return send_telegram_message(plain_text, parse_mode="")
        elif "message is too long" in err_body:
            logger.warning("[TelegramNotifier] ⚠️ Mesaj uzunluğu hatası alındı, zorla ikiye bölünüyor...")
            half = len(text) // 2
            split_idx = text.rfind("\n", 0, half)
            if split_idx == -1:
                split_idx = half
            return send_telegram_message(text[:split_idx], parse_mode=parse_mode) and send_telegram_message(text[split_idx:], parse_mode=parse_mode)
        return False
    except Exception as e:
        logger.error(f"[TelegramNotifier] ❌ Telegram mesajı gönderilirken istisna: {e}")
        return False


REGIME_TR_MAP = {
    "Late-Cycle Overheating with Global Divergence": "Geç Döngü Aşırı Isınma & Küresel Ayrışma (ABD Güçlü / Dünya Yavaş)",
    "Late-Cycle Overheating": "Geç Döngü Aşırı Isınma (Ekonomi Canlı / Enflasyon Baskısı)",
    "Reflationary Growth": "Reflasyonist Büyüme (Canlı Büyüme & Dengeli Enflasyon)",
    "Deflationary Slowdown": "Deflasyonist Yavaşlama (Durgunluk & Fiyat Düşüşü)",
    "Stagflationary Overheating": "Stagflasyon (Düşük Büyüme & Yüksek Enflasyon)",
}

YIELD_CURVE_TR_MAP = {
    "Bear Steepening": "Bear Steepening (Uzun Vadeli Faizler Artıyor / Tahvil Satışı)",
    "Bull Steepening": "Bull Steepening (Kısa Vadeli Faizler Düşüyor / İndirim Beklentisi)",
    "Bear Flattening": "Bear Flattening (Kısa Vadeli Faizler Artıyor / Sıkılaşma)",
    "Bull Flattening": "Bull Flattening (Uzun Vadeli Faizler Düşüyor / Yavaşlama)",
    "Inverted": "Ters Getiri Eğrisi (Resesyon Uyarısı)",
    "Normal": "Normal Getiri Eğrisi (Sağlıklı Seyir)",
}


def build_three_horizon_strategy(strat: Dict[str, Any], gates: Dict[str, str], risk_score: float, capital_pres: bool, tot: Dict[str, Any]) -> str:
    """Yatırımcının Bugün, Bu Hafta ve Bu Ay ufuklarında doğrudan uygulayabileceği net kurumsal eylem rehberi."""
    
    # ─── 1. BUGÜN (M15 / GÜN İÇİ TAKTİK) ───
    today_items = []
    
    # Altın
    xau = (gates.get("XAUUSD") or "").upper()
    if "LONG" in xau:
        today_items.append("• 🟡 <b>Altın (XAUUSD):</b> Küresel borç endişeleriyle yükseliş trendi teyitli. <u>Sadece ALIM (Long)</u> kurulumlarını ara; satış (Short) kesinlikle yasak.")
    elif "SHORT" in xau:
        today_items.append("• 🟡 <b>Altın (XAUUSD):</b> Tahvil faiz sıçraması fırsat maliyetini artırdı; <u>Sadece SATIŞ (Short)</u> odaklı kal, düşen bıçağı tutma.")
    elif "RANGE" in xau:
        today_items.append("• 🟡 <b>Altın (XAUUSD):</b> Yüksek tahvil oynaklığı nedeniyle <u>Bant İşlemi (Range)</u> devrede; ortada işlem açma, sadece uç tepki seviyelerinde teyit ara.")
    else:
        today_items.append("• 🟡 <b>Altın (XAUUSD):</b> Nötr seyir; M15 kırılımını bekle.")

    # Bitcoin
    btc = (gates.get("BTC") or "").upper()
    if "SHORT" in btc:
        today_items.append("• 🔵 <b>Bitcoin (BTCUSD):</b> Tahvil şoku fonlarda teminat tamamlama (margin call) dalgası yarattı. 🔴 <u>Sadece SATIŞ (Short)</u> fırsatlarına odaklan; ALIM KESİNLİKLE YASAK!")
    elif "LONG" in btc:
        today_items.append("• 🔵 <b>Bitcoin (BTCUSD):</b> Değer kaybı kalkanı devrede; 🟢 <u>Alım (Long)</u> yönü açık, ancak 0.50x kontrollü lot ile seviye retestini bekle.")
    elif "DEFENSIVE" in btc or "HOLD" in btc:
        today_items.append("• 🔵 <b>Bitcoin (BTCUSD):</b> 🛑 Savunma modunda (Defensive Hold); fon tasfiyeleri riski nedeniyle yeni yönlü pozisyon açma, bekle.")
    else:
        today_items.append("• 🔵 <b>Bitcoin (BTCUSD):</b> 🟡 Yatay bantta; 15 dakikalık net BOS kırılımı görmeden girme.")

    # Euro
    eur = (gates.get("EURUSD") or "").upper()
    if "SHORT" in eur:
        today_items.append("• 💶 <b>Euro (EURUSD):</b> Transatlantik faiz üstünlüğü ve enerji faturası Dolar'ı destekliyor; 🔴 <u>Sadece SATIŞ (Short)</u> yönlü kurulumları takip et.")
    elif "RANGE" in eur or tot.get("eurusd_energy_penalty"):
        today_items.append("• 💶 <b>Euro (EURUSD):</b> Yüksek petrol ($100+) ve ABD faiz üstünlüğü Euro üzerinde baskı kuruyor. Trend arama; <u>sadece dipte al / tepede sat (Bant İşlemi)</u> uygula.")
    elif "LONG" in eur:
        today_items.append("• 💶 <b>Euro (EURUSD):</b> Dolar zayıflığı destekliyor; 🟢 Geri çekilmelerde ALIM (Long) ara.")
    else:
        today_items.append("• 💶 <b>Euro (EURUSD):</b> Çift yönlü denge; haber saatlerinde temkinli ol.")

    # Endeksler
    spx = (gates.get("SPX") or "").upper()
    if "SHORT" in spx:
        today_items.append("• 🇺🇸 <b>Endeksler (SPX/NAS100):</b> Likidite daralması hisseleri baskılıyor; yükselişleri 🔴 SATIŞ fırsatı olarak izle.")
    else:
        today_items.append("• 🇺🇸 <b>Endeksler (SPX/NAS100):</b> Yüksek faizler büyüme hisselerine tavan koyuyor; tavan seviyelerde yeni alım kovalama, temkinli ol.")

    today_str = "\n".join(today_items)
    today_custom = html.escape(strat.get("horizon_today", "").strip())
    if today_custom:
        today_str = f"<i>{today_custom}</i>\n" + today_str

    # ─── 2. BU HAFTA (H4 / SWING UFKU) ───
    week_custom = html.escape(strat.get("horizon_this_week", "").strip())
    if not week_custom:
        week_custom = "Haftalık takvimdeki merkez bankası kararları ve faiz eğrisindeki dikleşme (Bear Steepening) oynaklığı canlı tutacak. Kredi makasları sakin kaldığı sürece ani çöküş beklenmiyor; ancak haftalık direnç bölgelerinde kâr realizasyonu ön planda tutulmalı."

    # ─── 3. BU AY (D1-W1 / MAKRO REJİM & TREND) ───
    month_custom = html.escape(strat.get("horizon_this_month", "").strip())
    if not month_custom:
        month_custom = "ABD Hazine borçlanma tavanı ve Fed'in bilanço küçültmesi (QT) likiditeyi dar tutuyor. Mali hakimiyet (borçların para basılarak ödenmesi endişesi) orta vadede Altın ve sert varlıkların ana yükseliş omurgasını korumasını sağlayacaktır."

    return f"""🎯 <b>1. BUGÜN NE YAPMALIYIZ? (M15 / Gün İçi Seans Taktikleri):</b>
{today_str}

📅 <b>2. BU HAFTA NE BEKLEMELİYİZ? (H4 / Swing Ufku):</b>
• {week_custom}

🏛️ <b>3. BU AY REJİM NEREYE GİDİYOR? (D1-W1 / Makro Trend):</b>
• {month_custom}"""


def format_morning_briefing(pipeline_result: Dict[str, Any], upcoming_events: Optional[List[Dict[str, Any]]] = None) -> str:
    """Makro pipeline çıktısından zengin verili, derinlikli ve 3 ufuklu Sabah Makro Bülteni üretir."""
    strat = pipeline_result.get("final_output") or {}
    metrics = pipeline_result.get("processed_metrics") or {}
    
    # 1. Tarih & Zaman
    now_str = datetime.datetime.now().strftime("%d.%m.%Y - %H:%M")
    
    # 2. Rejim ve Risk
    raw_regime = strat.get("primary_regime", "Geç Döngü Aşırı Isınma")
    regime = REGIME_TR_MAP.get(raw_regime, raw_regime)
    
    risk_score = strat.get("volatility_risk_score", 0.40)
    risk_multiplier = strat.get("recommended_risk_multiplier", 1.0)
    capital_pres = strat.get("capital_preservation_mode", False)
    
    # 3. Zengin Metrikler
    yc = metrics.get("yield_curve", {})
    raw_yc_regime = yc.get("regime", "Bear Steepening")
    yc_regime_tr = YIELD_CURVE_TR_MAP.get(raw_yc_regime, raw_yc_regime)

    t0_stress = metrics.get("t0_fast_stress_analysis", {})
    transatlantic = metrics.get("transatlantic_analysis", {})
    liq_dyn = metrics.get("liquidity_dynamics", {})
    nfci = metrics.get("financial_conditions_analysis", {})
    dxy_t = metrics.get("dxy_trend_analysis", {})
    ry = metrics.get("real_yield_info", {})
    tot = metrics.get("terms_of_trade_energy_analysis", {})
    cg = metrics.get("copper_gold_analysis", {})
    credit = metrics.get("credit_spread_analysis", {})
    cycle = metrics.get("cycle_diagnosis", {})
    claims = metrics.get("jobless_claims_analysis", {})
    
    # Kapılar
    gates = strat.get("execution_bias_gates", {})
    
    # Risk Durumu İkonu
    if capital_pres or risk_score >= 0.70:
        risk_icon = "🛑 YÜKSEK (Sermaye Koruma Devrede)"
    elif risk_score >= 0.50:
        risk_icon = "⚠️ ORTA / TEMKİNLİ"
    else:
        risk_icon = "🟢 DÜŞÜK / OLAĞAN (Piyasa Sakin)"
        
    stress_status = "⚠️ DEVREDE (Oynaklık Yüksek)" if t0_stress.get("fast_stress_override") else "✅ Sakin (Olağan Seyir)"
    
    # Kapı İkonları & Türkçe Açıklamalar
    def gate_badge(g: str) -> str:
        g_up = (g or "").upper()
        if "LONG" in g_up:
            return "🟢 <b>SADECE ALIM (LONG_ONLY)</b>"
        elif "SHORT" in g_up:
            return "🔴 <b>SADECE SATIŞ (SHORT_ONLY)</b>"
        elif "RANGE" in g_up:
            return "🟡 <b>BANT İŞLEMİ (NEUTRAL_RANGE)</b>"
        elif "DEFENSIVE" in g_up or "HOLD" in g_up or "NO_TRADE" in g_up:
            return "🛑 <b>BEKLE / İŞLEM AÇMA (DEFENSIVE_HOLD)</b>"
        return "⚪ <b>NÖTR / ÇİFT YÖNLÜ</b>"

    xau_gate = gate_badge(gates.get("XAUUSD", "LONG_ONLY"))
    btc_gate = gate_badge(gates.get("BTC", "LONG_ONLY"))
    eur_gate = gate_badge(gates.get("EURUSD", "NEUTRAL_RANGE"))
    spx_gate = gate_badge(gates.get("SPX", "NEUTRAL"))

    # Rasyonel (Smart chunking devrede olduğundan metin tam ve eksiksiz korunur)
    raw_rat = strat.get("macro_rationale", "").strip()
    rationale = html.escape(raw_rat)

    # Haber Takvimi Bölümü
    news_lines = []
    if upcoming_events:
        for ev in upcoming_events[:4]:
            t_str = html.escape(str(ev.get("time", "")))
            title = html.escape(str(ev.get("title", "")))
            country = html.escape(str(ev.get("country", "")))
            news_lines.append(f"  • <b>{t_str}</b> [{country}] {title}")
    
    news_block = "\n".join(news_lines) if news_lines else "  • <i>Bugün için yüksek etkili kritik veri bulunmuyor.</i>"

    # 3 Zaman Ufku Stratejisi
    horizon_strategy = build_three_horizon_strategy(strat, gates, risk_score, capital_pres, tot)

    # HTML Bülteni Derle
    msg = f"""🌺 <b>BEGONYA | GÜNLÜK SABAH MAKRO BÜLTENİ</b>
📅 <i>{now_str} (TSİ)</i>
━━━━━━━━━━━━━━━━━━━━━━━━━━

🏛️ <b>MAKRO PİYASA REJİMİ:</b>
• <b>Döngü Teşhisi:</b> {regime}
• <b>Sistemik Risk Seviyesi:</b> {risk_score:.2f} / 1.0 -> {risk_icon}
• <b>T-0 Anlık Piyasa Stresi:</b> {stress_status}
• <b>Önerilen İşlem Boyutu:</b> <b>{risk_multiplier}x Lot</b>

📊 <b>KURUMSAL MAKRO GÖSTERGELER & MATRİS:</b>
• <b>1. İktisadi Büyüme & Sanayi:</b>
  └ Bakır/Altın Rasyosu: {cg.get('current_ratio', 1.50)} (4 Haftalık İvme: %{cg.get('delta_4w_pct', -1.9)} -> {cg.get('momentum_signal', 'Zayıf İmalat')})
  └ İstihdam Piyasası: İşsizlik %{cycle.get('unemployment_rate', 4.1)} | NFP: {cycle.get('nfp_value', 190)}K | Haftalık Başvurular (ICSA): {claims.get('initial_claims_k', 218)}K
• <b>2. Kredi & Şirket İflas Riski:</b>
  └ HY OAS Kredi Makası: %{credit.get('hy_oas_spread_pct', 3.28)} ({credit.get('stress_level', 'Sakin / Düşük Kredi Stresi')})
  └ HYG/LQD Canlı Oranı: {t0_stress.get('hyg_lqd_ratio', 0.75)} (Piyasa Kredi Ayrışması Yok)
  └ Chicago Fed Koşulları (NFCI): {nfci.get('nfci_value', -0.52)} (Piyasada Kredi Koşulları Rahat)
• <b>3. Reel Faizler, Para & Likidite:</b>
  └ Getiri Eğrisi: {yc_regime_tr} ({yc.get('spread_bps', 0):+.1f} bps)
  └ Transatlantik Faiz Üstünlüğü: +{transatlantic.get('spread_bps', 0):.1f} bps (ABD Faizi Alman Tahvilinin Üzerinde)
  └ 10Y TIPS Reel Getirisi: %{ry.get('real_yield_pct', 1.95)} (Altın baskısı: Ilımlı)
  └ Fed Net Likiditesi: ${liq_dyn.get('current_net_liquidity_billion', 6110.0):,.1f}B (4H Değişim: ${liq_dyn.get('delta_liquidity_billion', -60.0):+,.1f}B)
  └ Dolar Endeksi (DXY): {dxy_t.get('level', 100.0)} ({dxy_t.get('momentum_regime', 'Düşüş Trendi')})
• <b>4. Enerji Şoku & Dış Ticaret Hadleri:</b>
  └ Brent Petrol: ${metrics.get('raw_market', {}).get('BRENT', {}).get('value', 104.6) if isinstance(metrics.get('raw_market', {}).get('BRENT'), dict) else 104.6} (Euro Bölgesi Enerji Faturası Cezası: {'⚠️ AKTİF' if tot.get('eurusd_energy_penalty') else 'YOK'})

🛡️ <b>GÜNÜN İŞLEM KAPILARI (EXECUTION GATES):</b>
• <b>Altın (XAUUSD) :</b> {xau_gate}
• <b>Bitcoin (BTCUSD):</b> {btc_gate}
• <b>Euro (EURUSD)  :</b> {eur_gate}
• <b>Endeks (SPX/NAS):</b> {spx_gate}

⚠️ <b>BUGÜNKÜ KRİTİK HABER TAKVİMİ:</b>
{news_block}

📝 <b>BAŞ STRATEJİST RAPORU:</b>
<i>"{rationale}"</i>

━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 <b>EYLEM PLANI (BUGÜN / BU HAFTA / BU AY):</b>
{horizon_strategy}
━━━━━━━━━━━━━━━━━━━━━━━━━━
🌺 <i>Begonya Kurumsal Makro Rejim & SMC Hibrit Motoru</i>
"""
    return msg

