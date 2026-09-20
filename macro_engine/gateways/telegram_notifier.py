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


def sanitize_unverified_price_levels(text: str) -> str:
    """Remove explicit price/level claims from free-form LLM prose."""
    if not text:
        return ""

    patterns = [
        # Currency-qualified prices/ranges: "$66,000", "$2,650-$2,680".
        r"(?:[$€£]\s*)\d[\d,]*(?:\.\d+)?(?:\s*[-–]\s*(?:[$€£]\s*)?\d[\d,]*(?:\.\d+)?)?",
        # Asset-qualified prices/ranges: "XAUUSD 2650-2680", "DXY 100.50".
        r"\b(?:XAUUSD|GOLD|BTCUSD|BTC|DXY|SPX|NAS100|EURUSD|USDJPY|GBPUSD|USDCAD|USDCHF)\s*(?:[:=]\s*)?(?:[$€£]\s*)?\d[\d,]*(?:\.\d+)?(?:\s*[-–]\s*(?:[$€£]\s*)?\d[\d,]*(?:\.\d+)?)?",
    ]

    import re
    cleaned = str(text)
    changed = False
    for pattern in patterns:
        cleaned, count = re.subn(pattern, "", cleaned, flags=re.IGNORECASE)
        changed = changed or count > 0

    if changed:
        cleaned = re.sub(r"\s{2,}", " ", cleaned)
        cleaned = re.sub(r"\(\s*\)", "", cleaned)
        cleaned += " [Doğrulanmış teknik fiyat seviyesi bu makro katmanda üretilmiyor.]"
    return cleaned.strip()


def _fmt(value: Any, spec: str = "") -> str:
    if value is None:
        return "VERİ YOK"
    try:
        return format(value, spec)
    except (TypeError, ValueError):
        return html.escape(str(value))


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


def build_three_horizon_strategy(
    strat: Dict[str, Any],
    gates: Dict[str, str],
    risk_score: float,
    capital_pres: bool,
    tot: Dict[str, Any],
    risk_multiplier: float = 1.0,
    metrics: Optional[Dict[str, Any]] = None,
) -> str:
    """Generate evidence-based horizon guidance without inventing price levels."""

    metrics = metrics or {}
    real_yield = metrics.get("real_yield_info", {}).get("real_yield_pct")
    transatlantic = metrics.get("transatlantic_analysis", {})
    spread_bps = transatlantic.get("spread_bps")
    dxy = metrics.get("dxy_trend_analysis", {})
    dxy_delta = dxy.get("delta_20d_pct")
    t0 = metrics.get("t0_fast_stress_analysis", {})
    stress = bool(t0.get("fast_stress_override"))
    brent = metrics.get("brent_level")
    energy_penalty = bool(tot.get("eurusd_energy_penalty"))

    today_items = []

    xau = (gates.get("XAUUSD") or "").upper()
    if "LONG" in xau:
        today_items.append(
            "• 🟡 <b>Altın (XAUUSD):</b> Makro izin LONG_ONLY; reel faiz ve dolar tarafındaki baskının teyidini koru."
        )
    elif "SHORT" in xau:
        today_items.append(
            "• 🟡 <b>Altın (XAUUSD):</b> Savunmacı SHORT_ONLY kapısı açık; yalnızca mevcut SMC kurulumlarıyla ilerle."
        )
    elif "RANGE" in xau:
        reason = (
            f"reel getiri %{float(real_yield):.2f}"
            if isinstance(real_yield, (int, float))
            else "reel getiri/veri doğrulaması"
        )
        today_items.append(
            f"• 🟡 <b>Altın (XAUUSD):</b> NEUTRAL_RANGE; makro kanıt {reason} nedeniyle yön teyidi olmadan takipte."
        )
    else:
        today_items.append(
            "• 🟡 <b>Altın (XAUUSD):</b> Yeni yönlü pozisyon yok; teknik teyit bekle."
        )

    btc = (gates.get("BTC") or "").upper()
    if "SHORT" in btc:
        today_items.append(
            "• 🔵 <b>Bitcoin (BTCUSD):</b> SHORT_ONLY makro kapısı açık; yüksek beta nedeniyle seçici SMC teyidi bekle."
        )
    elif "LONG" in btc:
        today_items.append(
            f"• 🔵 <b>Bitcoin (BTCUSD):</b> LONG_ONLY makro kapısı açık; {risk_multiplier}x risk ile yalnızca teyitli kurulumları izle."
        )
    elif "DEFENSIVE" in btc or "HOLD" in btc:
        today_items.append(
            "• 🔵 <b>Bitcoin (BTCUSD):</b> DEFENSIVE_HOLD; yeni yönlü pozisyon açma."
        )
    else:
        today_items.append(
            "• 🔵 <b>Bitcoin (BTCUSD):</b> NEUTRAL_RANGE; makro avantaj oluşmadan yön kovalamayın."
        )

    eur = (gates.get("EURUSD") or "").upper()
    if "SHORT" in eur:
        today_items.append(
            "• 💶 <b>EURUSD:</b> Faiz farkı ve dolar teyidi birlikte bearish; yalnızca SHORT kurulumlarını takip et."
        )
    elif "LONG" in eur:
        today_items.append(
            "• 💶 <b>EURUSD:</b> Dolar zayıflığı ve transatlantik fark desteğiyle LONG yönü açık; teknik teyit bekle."
        )
    else:
        context = (
            f"US-DE spread {float(spread_bps):+.1f} bps"
            if isinstance(spread_bps, (int, float))
            else "transatlantik spread"
        )
        today_items.append(
            f"• 💶 <b>EURUSD:</b> NEUTRAL_RANGE; {context} ile yön için ek teyit gerekiyor."
        )

    spx = (gates.get("SPX") or "").upper()
    if "SHORT" in spx:
        today_items.append(
            "• 🇺🇸 <b>Endeksler (SPX/NAS100):</b> SHORT_ONLY yalnızca likidite daralması + düşük oynaklık koşulu ile geçerli."
        )
    elif "DEFENSIVE" in spx or "HOLD" in spx:
        today_items.append(
            "• 🇺🇸 <b>Endeksler (SPX/NAS100):</b> Savunma modu; yeni yönlü risk alma."
        )
    else:
        today_items.append(
            "• 🇺🇸 <b>Endeksler (SPX/NAS100):</b> NEUTRAL_RANGE; faiz/likidite teyidi olmadan yön kovalamayın."
        )

    pair_labels = [
        ("USDJPY", "Dolar / Yen"),
        ("GBPUSD", "Sterlin / Dolar"),
        ("USDCAD", "Dolar / Kanada D."),
        ("USDCHF", "Dolar / Frank"),
        ("AUDUSD", "Avustralya D. / Dolar"),
        ("NZDUSD", "Yeni Zelanda D. / Dolar"),
    ]
    for symbol, label in pair_labels:
        gate = (gates.get(symbol) or "").upper()
        if "LONG" in gate:
            text = "LONG_ONLY makro kapısı açık; teknik kurulum bekle."
        elif "SHORT" in gate:
            text = "SHORT_ONLY makro kapısı açık; teknik kurulum bekle."
        elif "DEFENSIVE" in gate or "HOLD" in gate:
            text = "Savunma modunda; yeni yönlü pozisyon yok."
        else:
            text = "NEUTRAL_RANGE; yön teyidi bekle."
        today_items.append(f"• {label} ({symbol}): {text}")

    cross_items = []
    for symbol in ("AUDCAD", "CADJPY", "NZDCAD", "EURGBP", "GBPJPY", "SOL"):
        gate = (gates.get(symbol) or "").upper()
        if not gate:
            continue
        cross_items.append(
            f"• <b>{symbol}:</b> {gate} makro kapısı; göreli değer teyidi olmadan işlem yok."
        )

    stress_line = (
        "T-0 stres aktif; bugün yeni yönsel riski azalt."
        if stress
        else "T-0 stres sakin; yönsel işlemler için bağımsız SMC teyidi bekle."
    )
    today_items.append(f"• <b>Risk:</b> {stress_line}")

    week = (
        "Bu hafta odak: transatlantik faiz farkı, reel faiz, dolar momentumu ve likidite yönünün aynı sinyali verip vermediğini izlemek."
    )
    if isinstance(brent, (int, float)) and energy_penalty:
        week += " Enerji/terms-of-trade baskısı EURUSD tarafında ayrıca izlenecek."

    month = (
        "Bu ay odak: büyüme-enflasyon-istihdam ile politika beklentilerinin ayrışıp ayrışmadığını izlemek; tek faktörle rejim değişimi yapmamak."
    )

    return (
        "<b>1. BUGÜN:</b>\n"
        + "\n".join(today_items)
        + "\n\n<b>2. BU HAFTA:</b>\n• "
        + week
        + "\n\n<b>3. BU AY:</b>\n• "
        + month
    )

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
    economic_panel = metrics.get("economic_regime_snapshot", {})
    policy_panel = metrics.get("policy_expectations", {})
    
    # Authoritative execution layer: Telegram must not display the LLM advisory gate.
    deterministic = pipeline_result.get("deterministic_execution_gates") or {}
    gates = deterministic.get("execution_bias_gates") or {}
    gate_source = deterministic.get("source", "UNAVAILABLE")
    
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

    xau_gate = gate_badge(gates.get("XAUUSD", "NO_TRADE"))
    btc_gate = gate_badge(gates.get("BTC", "NO_TRADE"))
    eur_gate = gate_badge(gates.get("EURUSD", "NO_TRADE"))
    spx_gate = gate_badge(gates.get("SPX", "NO_TRADE"))

    # Çapraz Kur & Kripto Göreli Değer Radarı
    regime_st = metrics.get("regime_state", {})
    cross_analysis = metrics.get("cross_pairs_analysis", {})
    cross_gates = cross_analysis.get("cross_gates", {}) or regime_st.get("cross_pair_gates", {}) or {}
    yield_spreads = cross_analysis.get("yield_spreads_bps", {})
    comm_rocs = cross_analysis.get("commodity_rocs", {})
    sol_info = cross_analysis.get("sol_btc_analysis", {})

    # Dolar Majörleri Kapıları (SMC Engine Entegrasyonu)
    usdjpy_gate = gate_badge(cross_gates.get("USDJPY", gates.get("USDJPY", "NO_TRADE")))
    gbpusd_gate = gate_badge(cross_gates.get("GBPUSD", gates.get("GBPUSD", "NO_TRADE")))
    usdcad_gate = gate_badge(cross_gates.get("USDCAD", gates.get("USDCAD", "NO_TRADE")))
    usdchf_gate = gate_badge(cross_gates.get("USDCHF", gates.get("USDCHF", "NO_TRADE")))
    audusd_gate = gate_badge(cross_gates.get("AUDUSD", gates.get("AUDUSD", "NO_TRADE")))
    nzdusd_gate = gate_badge(cross_gates.get("NZDUSD", gates.get("NZDUSD", "NO_TRADE")))

    # Çapraz Kur & Kripto Göreli Değer Radarı
    audcad_gate = gate_badge(cross_gates.get("AUDCAD", gates.get("AUDCAD", "NO_TRADE")))
    cadjpy_gate = gate_badge(cross_gates.get("CADJPY", gates.get("CADJPY", "NO_TRADE")))
    nzdcad_gate = gate_badge(cross_gates.get("NZDCAD", gates.get("NZDCAD", "NO_TRADE")))
    eurgbp_gate = gate_badge(cross_gates.get("EURGBP", gates.get("EURGBP", "NO_TRADE")))
    gbpjpy_gate = gate_badge(cross_gates.get("GBPJPY", gates.get("GBPJPY", "NO_TRADE")))
    sol_gate = gate_badge(cross_gates.get("SOL", gates.get("SOL", "NO_TRADE")))

    au_ca_spread = yield_spreads.get("AU_CA_2Y", regime_st.get("spread_au_ca_2y_bps", 0.0))
    brent_roc = comm_rocs.get("brent_roc_20d", regime_st.get("brent_roc_20d", 0.0))
    ca_spread_delta = yield_spreads.get("delta_CA_US_5d", regime_st.get("spread_ca_us_2y_delta_5d", 0.0))
    gb_spread_delta = yield_spreads.get("delta_GB_US_5d", regime_st.get("spread_gb_us_2y_delta_5d", 0.0))
    dairy_roc = comm_rocs.get("dairy_gdt_roc_20d", regime_st.get("dairy_gdt_roc_20d", 0.0))
    au_nz_delta = regime_st.get("spread_au_nz_2y_delta_5d", 0.0)
    sol_btc_roc = sol_info.get("sol_btc_roc_5d", regime_st.get("sol_btc_roc_5d", 0.0))
    sol_4h_broken = regime_st.get("sol_btc_4h_structure_broken", False)
    cross_data_quality = cross_analysis.get("data_quality", {})

    market_price_context = metrics.get("market_price_context", {})

    def price_snapshot(symbol: str, label: str, decimals: int = 2) -> str:
        data = market_price_context.get(symbol, {})
        value = data.get("value")
        source = data.get("source") or "VERİ KAYNAĞI YOK"
        if value is None:
            return f"  └ {label}: VERİ YOK"
        try:
            price_text = f"{float(value):,.{decimals}f}"
        except (TypeError, ValueError):
            price_text = html.escape(str(value))
        return f"  └ {label}: {price_text} | Kaynak: {html.escape(str(source))}"

    # NZDCAD radar notu (GDT bayat koruması devredeyse AU-NZ makasını göster)
    if cross_data_quality.get("status") == "UNAVAILABLE":
        nzdcad_subtext = "Relative-value verisi eksik; yönlü NZDCAD kapısı devre dışı."
    elif abs(dairy_roc) <= 0.01 and au_nz_delta != 0.0:
        nzdcad_subtext = f"GDT: Yatay | AU-NZ 2Y Δ: {au_nz_delta:+.1f} bps"
    else:
        nzdcad_subtext = f"GDT Süt İndeksi: %{dairy_roc:+.1f} | Petrol: %{brent_roc:+.1f}"

    # SOL radar notu (4H CHoCH kırılım uyarısı)
    if cross_data_quality.get("status") == "UNAVAILABLE":
        sol_subtext = "Relative-value verisi eksik; yönlü SOL kapısı devre dışı."
    elif sol_4h_broken:
        sol_subtext = f"SOL/BTC: %{sol_btc_roc:+.2f} | 🛑 4H Dip Kırıldı (Veto)"
    else:
        sol_subtext = f"SOL/BTC 5G İvme: %{sol_btc_roc:+.2f} | Kripto Yüksek Beta"

    # Red-Folder Event Freeze Durumu
    event_freeze_active = regime_st.get("event_freeze_active", False)
    active_event_info = regime_st.get("active_event_info", "")
    event_freeze_banner = ""
    if event_freeze_active:
        event_freeze_banner = f"\n🛑 <b>KIRMIZI BÜLTEN DEVRE KESİCİSİ (DEVREDE):</b>\n└ ⚠️ <i>{html.escape(str(active_event_info))}</i> nedeniyle tüm yeni girişler donduruldu (±15 dk haber koruması)!\n"

    # Rasyonel (Smart chunking devrede olduğundan metin tam ve eksiksiz korunur)
    raw_rat = sanitize_unverified_price_levels(strat.get("macro_rationale", "").strip())
    rationale = html.escape(raw_rat)

    # Haber Takvimi Bölümü
    news_lines = []
    if upcoming_events:
        for ev in upcoming_events[:4]:
            t_str = html.escape(str(ev.get("time", "")))
            title = html.escape(str(ev.get("title", "")))
            country = html.escape(str(ev.get("country", "")))
            impact = str(ev.get("impact", "")).upper()
            is_red = impact == "HIGH" or any(kw in title.upper() for kw in ["CPI", "NFP", "FOMC", "RATE", "PAYROLL"])
            badge = " <i>[±15 dk Koruma]</i>" if is_red else ""
            news_lines.append(f"  • <b>{t_str}</b> [{country}] {title}{badge}")
    
    news_block = "\n".join(news_lines) if news_lines else "  • <i>Bugün için yüksek etkili kritik veri bulunmuyor.</i>"

    # 3 Zaman Ufku Stratejisi
    horizon_strategy = build_three_horizon_strategy(
        strat,
        gates,
        risk_score,
        capital_pres,
        tot,
        risk_multiplier=risk_multiplier,
        metrics=metrics,
    )

    # Brent Petrol Fiyatı (Öncelik: İşlenmiş gerçek değer)
    brent_val = (
        metrics.get("brent_level")
        if metrics.get("brent_level") is not None
        else tot.get("brent_level")
        if tot.get("brent_level") is not None
        else (
            pipeline_result.get("raw_market", {}).get("BRENT", {}).get("value")
            if isinstance(pipeline_result.get("raw_market", {}).get("BRENT"), dict)
            else None
        )
    )

    # HTML Bülteni Derle
    msg = f"""🌺 <b>BEGONYA | GÜNLÜK SABAH MAKRO BÜLTENİ</b>
📅 <i>{now_str} (TSİ)</i>
━━━━━━━━━━━━━━━━━━━━━━━━━━{event_freeze_banner}
🏛️ <b>MAKRO PİYASA REJİMİ:</b>
• <b>Döngü Teşhisi:</b> {regime}
• <b>Sistemik Risk Seviyesi:</b> {risk_score:.2f} / 1.0 -> {risk_icon}
• <b>T-0 Anlık Piyasa Stresi:</b> {stress_status}
• <b>Önerilen İşlem Boyutu:</b> <b>{risk_multiplier}x Lot</b>

📊 <b>KURUMSAL MAKRO GÖSTERGELER & MATRİS:</b>
• <b>1. İktisadi Büyüme & Sanayi:</b>
  └ Bakır/Altın Rasyosu: {_fmt(cg.get('current_ratio'), '.3f')} (4 Haftalık İvme: %{_fmt(cg.get('delta_4w_pct'), '.2f')} -> {html.escape(str(cg.get('momentum_signal', 'VERİ YOK')))})
  └ İstihdam Piyasası: İşsizlik %{_fmt(cycle.get('unemployment_rate'), '.2f')} | NFP: {_fmt(cycle.get('nfp_value'), '.1f')}K | PAYEMS MoM: {_fmt(cycle.get('payroll_change_mom_k'), '.1f')}K | ICSA: {_fmt(claims.get('initial_claims_k'), '.1f')}K
• <b>2. Kredi & Şirket İflas Riski:</b>
  └ HY OAS Kredi Makası: %{_fmt(credit.get('hy_oas_spread_pct'), '.2f')} ({html.escape(str(credit.get('stress_level', 'VERİ YOK')))})
  └ HYG/LQD Canlı Oranı: {_fmt(t0_stress.get('hyg_lqd_ratio'), '.4f')} (ayrışma metriği)
  └ Chicago Fed Koşulları (NFCI): {_fmt(nfci.get('nfci_value'), '.2f')} ({html.escape(str(nfci.get('regime', 'VERİ YOK')))})
• <b>3. Reel Faizler, Para & Likidite:</b>
  └ Getiri Eğrisi: {yc_regime_tr} ({_fmt(yc.get('spread_bps'), '.1f')} bps)
  └ Transatlantik Faiz Üstünlüğü: +{_fmt(transatlantic.get('spread_bps'), '.1f')} bps
  └ 10Y TIPS Reel Getirisi: %{_fmt(ry.get('real_yield_pct'), '.2f')} ({html.escape(str(ry.get('pressure_on_gold', 'VERİ YOK')))})
  └ Fed Net Likiditesi: ${_fmt(liq_dyn.get('current_net_liquidity_billion'), ',.1f')}B (4H Değişim: ${_fmt(liq_dyn.get('delta_liquidity_billion'), '+,.1f')}B)
  └ Dolar Endeksi (DXY): {_fmt(dxy_t.get('level'), '.2f')} ({html.escape(str(dxy_t.get('momentum_regime', 'VERİ YOK')))})
• <b>4. Enerji Şoku & Dış Ticaret Hadleri:</b>
  └ Brent Petrol: ${_fmt(brent_val, '.1f')} (Euro Bölgesi Enerji Faturası Cezası: {'⚠️ AKTİF' if tot.get('eurusd_energy_penalty') else 'YOK'})
• <b>5. Enflasyon & Reel Aktivite:</b>
  └ CPI: %{_fmt(economic_panel.get("inflation_regime", {}).get("cpi_yoy_pct"), ".2f")} | Core CPI: %{_fmt(economic_panel.get("inflation_regime", {}).get("core_cpi_yoy_pct"), ".2f")} | PCE: %{_fmt(economic_panel.get("inflation_regime", {}).get("pce_yoy_pct"), ".2f")}
  └ Enflasyon Sinyali: {html.escape(str(economic_panel.get("inflation_regime", {}).get("signal", "VERİ YOK")))} | Büyüme: {html.escape(str(economic_panel.get("growth_regime", {}).get("signal", "VERİ YOK")))} | İşgücü: {html.escape(str(economic_panel.get("labor_regime", {}).get("signal", "VERİ YOK")))}
• <b>6. Politika Beklentileri:</b>
  └ DFF: %{_fmt(policy_panel.get("effective_policy_rate", {}).get("dff_pct"), ".2f")} | SOFR: %{_fmt(policy_panel.get("effective_policy_rate", {}).get("sofr_pct"), ".2f")}
  └ 2Y - DFF: {_fmt(economic_panel.get("rate_curve_regime", {}).get("two_year_minus_dff_bps"), ".1f")} bps | Rejim: {html.escape(str(economic_panel.get("policy_regime", {}).get("market_vs_policy", "VERİ YOK")))}


💵 <b>DOĞRULANMIŞ FİYAT SNAPSHOT:</b>
{price_snapshot("GOLD", "XAUUSD")}
{price_snapshot("BTC", "BTCUSD")}
{price_snapshot("DXY", "DXY")}
{price_snapshot("BRENT", "Brent")}
{price_snapshot("SPX", "SPX")}

🛡️ <b>GÜNÜN İŞLEM KAPILARI (EXECUTION GATES):</b>
└ Gate Kaynağı: <b>{html.escape(str(gate_source))}</b>
• <b>Altın (XAUUSD) :</b> {xau_gate}
• <b>Bitcoin (BTCUSD):</b> {btc_gate}
• <b>Euro (EURUSD)  :</b> {eur_gate}
• <b>Endeks (SPX/NAS):</b> {spx_gate}

💵 <b>GÜNÜN DOLAR MAJÖRLERİ RADARI (USD MAJORS):</b>
• <b>USDJPY :</b> {usdjpy_gate} <i>(Carry Çözülmesi vs US02Y Getirisi)</i>
• <b>GBPUSD :</b> {gbpusd_gate} <i>(BoE Faiz İndirimi & GB-US 2Y Δ: {gb_spread_delta:+.1f} bps)</i>
• <b>USDCAD :</b> {usdcad_gate} <i>(CA 2Y Δ: {ca_spread_delta:+.1f} bps vs Brent: %{brent_roc:+.1f})</i>
• <b>USDCHF :</b> {usdchf_gate} <i>(Dolar Pozitif Carry vs Güvenli Liman Sığınağı)</i>
• <b>AUDUSD :</b> {audusd_gate} <i>(Bakır/Demir İvmesi vs Dolar Getirisi)</i>
• <b>NZDUSD :</b> {nzdusd_gate} <i>(GDT Süt İhalesi: %{dairy_roc:+.1f} vs Dolar Getirisi)</i>

🌐 <b>GÜNÜN ÇAPRAZ KUR & KRİPTO RADARI (RELATIVE VALUE):</b>
• <b>AUDCAD :</b> {audcad_gate} <i>(AU-CA 2Y: {au_ca_spread:+.1f} bps | Bakır/Demir vs Petrol)</i>
• <b>CADJPY :</b> {cadjpy_gate} <i>(Brent 20G RoC: %{brent_roc:+.1f} | CA 2Y Δ: {ca_spread_delta:+.1f} bps)</i>
• <b>NZDCAD :</b> {nzdcad_gate} <i>({nzdcad_subtext})</i>
• <b>EURGBP :</b> {eurgbp_gate} <i>(Euro Enerji Faturası & Transatlantik Makas)</i>
• <b>GBPJPY :</b> {gbpjpy_gate} <i>(BoE Faiz Avantajı & Carry Trade)</i>
• <b>SOL/USD :</b> {sol_gate} <i>({sol_subtext})</i>

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

