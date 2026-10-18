import os
import sys

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

import json
from pathlib import Path
from datetime import datetime, timezone, timedelta, date
from typing import Dict, Any, List, Optional, Tuple
import pandas as pd
import numpy as np
import MetaTrader5 as mt5
import yfinance as yf

# Root path for importing
ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

from sfp_orb_engine.macro_gated_3m_backtest import DailyMacroGateTable

AUDIT_SYMBOLS = ["EURUSD", "GBPUSD", "XAUUSD", "BTCUSD", "USDCAD", "USDJPY"]
BROKER_COST_R = 0.05  # 0.05R spread + komisyon

def calculate_max_drawdown(r_series: List[float]) -> float:
    peak = 0.0
    running = 0.0
    max_dd = 0.0
    for r in r_series:
        running += r
        if running > peak:
            peak = running
        dd = peak - running
        if dd > max_dd:
            max_dd = dd
    return round(max_dd, 2)

def fetch_symbol_data_with_h4(symbol: str, start_dt: datetime, end_dt: datetime):
    """15M, 1M ve 4H verilerini eksiksiz çeker."""
    # 1. 15M Barlar
    rates_15m = mt5.copy_rates_range(symbol, mt5.TIMEFRAME_M15, start_dt, end_dt)
    if rates_15m is None or len(rates_15m) < 200:
        return None, None, None, f"Yetersiz 15M verisi ({symbol})"

    df15 = pd.DataFrame(rates_15m)
    df15["datetime"] = pd.to_datetime(df15["time"], unit="s", utc=True)
    for col in ["open", "high", "low", "close"]:
        df15[col] = df15[col].astype(float)

    df15["date"] = df15["datetime"].dt.date
    df15["hour"] = df15["datetime"].dt.hour
    df15["weekday"] = df15["datetime"].dt.weekday

    daily_high = df15.groupby("date")["high"].transform("max")
    daily_low = df15.groupby("date")["low"].transform("min")
    df15["pdh"] = daily_high.shift(96)
    df15["pdl"] = daily_low.shift(96)

    asian_mask = (df15["hour"] >= 0) & (df15["hour"] < 7)
    df_asian = df15[asian_mask]
    if not df_asian.empty:
        ash_map = df_asian.groupby("date")["high"].max().to_dict()
        asl_map = df_asian.groupby("date")["low"].min().to_dict()
        df15["ash"] = df15["date"].map(ash_map)
        df15["asl"] = df15["date"].map(asl_map)
    else:
        df15["ash"] = np.nan
        df15["asl"] = np.nan

    # 2. 4H Barlar (Isınma için 2026-01-01'den başla)
    h4_start = datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc)
    rates_4h = mt5.copy_rates_range(symbol, mt5.TIMEFRAME_H4, h4_start, end_dt)
    if rates_4h is None or len(rates_4h) < 200:
        return None, None, None, f"Yetersiz 4H verisi ({symbol})"

    df4 = pd.DataFrame(rates_4h)
    df4["datetime"] = pd.to_datetime(df4["time"], unit="s", utc=True)
    for col in ["open", "high", "low", "close"]:
        df4[col] = df4[col].astype(float)

    # 4H EMA50 ve EMA200
    df4["ema50"] = df4["close"].ewm(span=50, adjust=False).mean()
    df4["ema200"] = df4["close"].ewm(span=200, adjust=False).mean()
    # 4H Barının Kapanış Zamanı = Açılış Zamanı + 4 saat
    df4["close_time"] = df4["datetime"] + timedelta(hours=4)

    # 3. 1M Barlar (25 günlük parçalar halinde)
    all_m1_rates = []
    curr_start = start_dt
    while curr_start < end_dt:
        curr_end = min(end_dt, curr_start + timedelta(days=25))
        chunk = mt5.copy_rates_range(symbol, mt5.TIMEFRAME_M1, curr_start, curr_end)
        if chunk is not None and len(chunk) > 0:
            all_m1_rates.append(pd.DataFrame(chunk))
        curr_start = curr_end

    if not all_m1_rates:
        return df15, None, df4, f"Yetersiz 1M verisi ({symbol})"

    df1 = pd.concat(all_m1_rates, ignore_index=True)
    df1.drop_duplicates(subset=["time"], keep="last", inplace=True)
    df1.sort_values(by="time", inplace=True)
    df1.reset_index(drop=True, inplace=True)
    df1["datetime"] = pd.to_datetime(df1["time"], unit="s", utc=True)
    for col in ["open", "high", "low", "close"]:
        df1[col] = df1[col].astype(float)

    return df15, df1, df4, "OK"

def get_closed_4h_trend(df4: pd.DataFrame, sig_time: datetime) -> str:
    """Lookahead-free: Yalnızca sinyal zamanından önce KAPANMIŞ olan 4H barını kullanır."""
    closed_bars = df4[df4["close_time"] <= sig_time]
    if closed_bars.empty:
        return "NEUTRAL"
    last_4h = closed_bars.iloc[-1]
    c_close = last_4h["close"]
    ema50 = last_4h["ema50"]
    ema200 = last_4h["ema200"]

    if c_close > ema50 and ema50 > ema200:
        return "BULLISH"
    elif c_close < ema50 and ema50 < ema200:
        return "BEARISH"
    return "NEUTRAL"

def simulate_1m_outcome(df1: pd.DataFrame, sig_time: datetime, trade_dir: str, entry: float, sl: float, tp1: float, tp2: float) -> Dict[str, Any]:
    """Gerçek 1M mikro-bar kronolojisi ile işlem sonucunu hesaplar."""
    max_hold_time = sig_time + timedelta(hours=24)
    # 15M sinyal mumu kapandıktan sonra işleme girildiği için 1M taraması sinyal mumunun bitiminden başlar
    entry_time_m1 = sig_time + timedelta(minutes=15)
    m1_slice = df1[(df1["datetime"] >= entry_time_m1) & (df1["datetime"] <= max_hold_time)]
    if len(m1_slice) < 60:
        return {"status": "INSUFFICIENT_DATA", "outcome": "NONE", "r": 0.0}

    risk = abs(entry - sl)
    m1_status = "OPEN"
    m1_sl = sl

    for _, bar in m1_slice.iterrows():
        bh = bar["high"]
        bl = bar["low"]

        if trade_dir == "LONG":
            hit_sl = (bl <= m1_sl)
            hit_tp1 = (bh >= tp1 and m1_status == "OPEN")
            hit_tp2 = (bh >= tp2)

            if hit_sl and (hit_tp1 or hit_tp2):
                return {"status": "AMBIGUOUS", "outcome": "AMBIGUOUS", "r": round(-1.0 - BROKER_COST_R, 2)}
            if hit_sl:
                return {
                    "status": "OK",
                    "outcome": "BE" if m1_status == "TP1_HIT" else "SL",
                    "r": round((0.5 if m1_status == "TP1_HIT" else -1.0) - BROKER_COST_R, 2)
                }
            elif hit_tp1:
                m1_status = "TP1_HIT"
                m1_sl = entry
            if hit_tp2:
                return {"status": "OK", "outcome": "TP2", "r": round(2.5 - BROKER_COST_R, 2)}
        else:
            hit_sl = (bh >= m1_sl)
            hit_tp1 = (bl <= tp1 and m1_status == "OPEN")
            hit_tp2 = (bl <= tp2)

            if hit_sl and (hit_tp1 or hit_tp2):
                return {"status": "AMBIGUOUS", "outcome": "AMBIGUOUS", "r": round(-1.0 - BROKER_COST_R, 2)}
            if hit_sl:
                return {
                    "status": "OK",
                    "outcome": "BE" if m1_status == "TP1_HIT" else "SL",
                    "r": round((0.5 if m1_status == "TP1_HIT" else -1.0) - BROKER_COST_R, 2)
                }
            elif hit_tp1:
                m1_status = "TP1_HIT"
                m1_sl = entry
            if hit_tp2:
                return {"status": "OK", "outcome": "TP2", "r": round(2.5 - BROKER_COST_R, 2)}

    last_b = m1_slice.iloc[-1]
    end_price = last_b["close"]
    end_move = (end_price - entry) if trade_dir == "LONG" else (entry - end_price)
    end_r = round(max(-1.0, min(2.5, end_move / risk)) - BROKER_COST_R, 2)
    return {"status": "OK", "outcome": "TIME_EXIT", "r": end_r}

def run_filters_audit():
    print("=" * 85)
    print("🔬 BEGONYA 00: MAKRO VE 4H TREND FİLTRELERİ ADLİ ARAŞTIRMA VE HOLDOUT DOĞRULAMASI 🔬")
    print("=" * 85)

    if not mt5.initialize():
        print("❌ MT5 başlatılamadı!")
        return

    start_dt = datetime(2026, 7, 15, 0, 0, tzinfo=timezone.utc)
    end_dt = datetime(2026, 10, 14, 0, 0, tzinfo=timezone.utc)
    split_dt = datetime(2026, 9, 1, 0, 0, tzinfo=timezone.utc)

    print(f"\n📅 Tam Tarih Aralığı        : {start_dt.date()} — {end_dt.date()}")
    print(f"📊 Geliştirme (In-Sample)   : {start_dt.date()} — {split_dt.date()}")
    print(f"🎯 Doğrulama (Out-Of-Sample): {split_dt.date()} — {end_dt.date()} (Bağımsız Holdout)")

    # 1. Makro Kapı Tablosunu Oluştur
    print("\n📡 Tarihsel Makro Rejim Kapıları hesaplanıyor...")
    macro_table = DailyMacroGateTable(date(2026, 7, 15), date(2026, 10, 14))

    all_trade_records = []

    for sym in AUDIT_SYMBOLS:
        print(f"\n⏳ [{sym}] Veriler yükleniyor...")
        df15, df1, df4, status = fetch_symbol_data_with_h4(sym, start_dt, end_dt)
        if df15 is None or df1 is None or df4 is None:
            print(f"   ⚠️ {sym}: {status}")
            continue

        print(f"   ✅ {sym}: 15M={len(df15)} | 1M={len(df1)} | 4H={len(df4)}")

        for i in range(100, len(df15) - 96):
            c_h = df15["high"].iloc[i]
            c_l = df15["low"].iloc[i]
            c_c = df15["close"].iloc[i]
            c_o = df15["open"].iloc[i]
            pdh = df15["pdh"].iloc[i]
            pdl = df15["pdl"].iloc[i]
            ash = df15["ash"].iloc[i]
            asl = df15["asl"].iloc[i]
            hour = df15["hour"].iloc[i]
            b_dt = df15["datetime"].iloc[i]

            # Seans Filtresi (Londra 07:00-11:00 veya NY 13:00-17:00 UTC)
            if not ((7 <= hour <= 11) or (13 <= hour <= 17)):
                continue

            bar_range = max(c_h - c_l, 1e-8)
            sfp_short = (c_h > pdh and c_c < pdh) or (ash > 0 and c_h > ash and c_c < ash)
            sfp_long = (c_l < pdl and c_c > pdl) or (asl > 0 and c_l < asl and c_c > asl)

            signals = []
            if sfp_short:
                upper_wick = c_h - max(c_o, c_c)
                if upper_wick / bar_range >= 0.35:
                    entry = c_c
                    sl = c_h + bar_range * 0.15
                    risk = sl - entry
                    if risk > 0:
                        tp1 = entry - 1.0 * risk
                        tp2 = entry - 2.5 * risk
                        signals.append(("SHORT", entry, sl, tp1, tp2, "PDH" if c_h > pdh else "ASIAN_HIGH"))

            if sfp_long:
                lower_wick = min(c_o, c_c) - c_l
                if lower_wick / bar_range >= 0.35:
                    entry = c_c
                    sl = c_l - bar_range * 0.15
                    risk = entry - sl
                    if risk > 0:
                        tp1 = entry + 1.0 * risk
                        tp2 = entry + 2.5 * risk
                        signals.append(("LONG", entry, sl, tp1, tp2, "PDL" if c_l < pdl else "ASIAN_LOW"))

            for trade_dir, entry, sl, tp1, tp2, pool in signals:
                m1_res = simulate_1m_outcome(df1, b_dt, trade_dir, entry, sl, tp1, tp2)
                if m1_res["status"] == "INSUFFICIENT_DATA":
                    continue

                # 1. Makro Kapı Değeri
                m_gate = macro_table.get_gate(b_dt.to_pydatetime(), sym)
                # Makro Kuralı: Gate zıt yöndeyse veto!
                macro_allowed = True
                if trade_dir == "LONG" and m_gate in ["SHORT_ONLY", "FULL_RISK_SHORT"]:
                    macro_allowed = False
                elif trade_dir == "SHORT" and m_gate in ["LONG_ONLY", "FULL_RISK_LONG"]:
                    macro_allowed = False

                # 2. 4H Trend Filtresi Değeri (Lookahead-free)
                h4_trend = get_closed_4h_trend(df4, b_dt)
                trend_allowed = True
                if trade_dir == "LONG" and h4_trend == "BEARISH":
                    trend_allowed = False
                elif trade_dir == "SHORT" and h4_trend == "BULLISH":
                    trend_allowed = False

                # 3. İki Filtre Birlikte (Model D)
                both_allowed = macro_allowed and trend_allowed

                sample_type = "IN_SAMPLE" if b_dt < split_dt else "OUT_OF_SAMPLE"

                all_trade_records.append({
                    "symbol": sym,
                    "direction": trade_dir,
                    "datetime": str(b_dt),
                    "dt": b_dt,
                    "sample": sample_type,
                    "entry": entry,
                    "sl": sl,
                    "tp1": tp1,
                    "tp2": tp2,
                    "m1_outcome": m1_res["outcome"],
                    "m1_r": m1_res["r"],
                    "macro_gate": m_gate,
                    "macro_allowed": macro_allowed,
                    "h4_trend": h4_trend,
                    "trend_allowed": trend_allowed,
                    "both_allowed": both_allowed
                })

    mt5.shutdown()
    print(f"\n📊 Toplam Doğrulanan İşlem Sayısı: {len(all_trade_records)} adet")

    # =========================================================================
    # 4 MODELİN PERFORMANS ANALİZİ FONKSİYONU
    # =========================================================================
    def evaluate_model_performance(trades: List[Dict[str, Any]], filter_key: Optional[str]) -> Dict[str, Any]:
        """
        filter_key:
          - None: Model A (Mevcut B00 - Tüm işlemler)
          - 'macro_allowed': Model B (Yalnızca Makro)
          - 'trend_allowed': Model C (Yalnızca 4H Trend)
          - 'both_allowed': Model D (Her İki Filtre Birlikte)
        """
        if filter_key is None:
            active_trades = trades
            skipped_trades = []
        else:
            active_trades = [t for t in trades if t[filter_key]]
            skipped_trades = [t for t in trades if not t[filter_key]]

        n = len(active_trades)
        if n == 0:
            return {"count": 0, "wins": 0, "losses": 0, "win_rate": 0, "net_r": 0, "expectancy": 0, "mdd": 0, "skipped": len(skipped_trades)}

        r_list = [t["m1_r"] for t in active_trades]
        wins = sum(1 for r in r_list if r > 0)
        losses = sum(1 for r in r_list if r < 0)
        net_r = round(sum(r_list), 2)
        wr = round(wins / n * 100, 1)
        exp = round(net_r / n, 2)
        mdd = calculate_max_drawdown(r_list)

        # Filtreleme Adliyesi: Atlanan işlemlerden korunan zarar vs kaçırılan kâr
        avoided_sl = sum(1 for t in skipped_trades if t["m1_r"] < 0)
        missed_tp = sum(1 for t in skipped_trades if t["m1_r"] > 0)
        net_filter_alpha = round((avoided_sl * 1.05) - (missed_tp * 2.45), 2)

        return {
            "count": n,
            "skipped": len(skipped_trades),
            "wins": wins,
            "losses": losses,
            "win_rate": wr,
            "net_r": net_r,
            "expectancy": exp,
            "mdd": mdd,
            "avoided_sl": avoided_sl,
            "missed_tp": missed_tp,
            "net_filter_alpha": net_filter_alpha
        }

    # Tablo Yazdırma Yardımcısı
    def print_performance_table(title: str, sub_trades: List[Dict[str, Any]]):
        res_a = evaluate_model_performance(sub_trades, None)
        res_b = evaluate_model_performance(sub_trades, "macro_allowed")
        res_c = evaluate_model_performance(sub_trades, "trend_allowed")
        res_d = evaluate_model_performance(sub_trades, "both_allowed")

        print(f"\n{'='*105}")
        print(f"📊 {title} ({len(sub_trades)} Toplam İşlem Havuzu)")
        print(f"{'='*105}")
        print(f"{'Metrik':<24} | {'Model A (Mevcut B00)':<18} | {'Model B (Yalnız Makro)':<18} | {'Model C (Yalnız 4H Trend)':<18} | {'Model D (Makro + 4H Trend)':<18}")
        print("-" * 105)
        wl_a = f"{res_a['wins']} / {res_a['losses']}"
        wl_b = f"{res_b['wins']} / {res_b['losses']}"
        wl_c = f"{res_c['wins']} / {res_c['losses']}"
        wl_d = f"{res_d['wins']} / {res_d['losses']}"

        st_b = f"{res_b['avoided_sl']} / {res_b['missed_tp']}"
        st_c = f"{res_c['avoided_sl']} / {res_c['missed_tp']}"
        st_d = f"{res_d['avoided_sl']} / {res_d['missed_tp']}"

        print(f"{'İşlem Sayısı (Alınan)':<24} | {res_a['count']:<18} | {res_b['count']:<18} | {res_c['count']:<18} | {res_d['count']:<18}")
        print(f"{'Pas Geçilen (Skipped)':<24} | {res_a['skipped']:<18} | {res_b['skipped']:<18} | {res_c['skipped']:<18} | {res_d['skipped']:<18}")
        print(f"{'Kazanan / Kaybeden':<24} | {wl_a:<18} | {wl_b:<18} | {wl_c:<18} | {wl_d:<18}")
        print(f"{'Kazanma Oranı (Win Rate)':<24} | %{res_a['win_rate']:<17} | %{res_b['win_rate']:<17} | %{res_c['win_rate']:<17} | %{res_d['win_rate']:<17}")
        print(f"{'Net Kâr/Zarar (Net R)':<24} | {res_a['net_r']:<+18.2f} | {res_b['net_r']:<+18.2f} | {res_c['net_r']:<+18.2f} | {res_d['net_r']:<+18.2f}")
        print(f"{'İşlem Başına Beklenti':<24} | {res_a['expectancy']:<+18.2f} | {res_b['expectancy']:<+18.2f} | {res_c['expectancy']:<+18.2f} | {res_d['expectancy']:<+18.2f}")
        print(f"{'Maksimum Drawdown (MDD)':<24} | -{res_a['mdd']:<17.2f} | -{res_b['mdd']:<17.2f} | -{res_c['mdd']:<17.2f} | -{res_d['mdd']:<17.2f}")
        print(f"{'Önlenen Stop / Kaçan TP':<24} | {'0 / 0':<18} | {st_b:<18} | {st_c:<18} | {st_d:<18}")
        print(f"{'Net Filtre Alfası':<24} | {'0.00R':<18} | {res_b['net_filter_alpha']:<+18.2f} | {res_c['net_filter_alpha']:<+18.2f} | {res_d['net_filter_alpha']:<+18.2f}")

        return {"model_a": res_a, "model_b": res_b, "model_c": res_c, "model_d": res_d}

    in_sample_trades = [t for t in all_trade_records if t["sample"] == "IN_SAMPLE"]
    out_of_sample_trades = [t for t in all_trade_records if t["sample"] == "OUT_OF_SAMPLE"]

    res_in = print_performance_table("1. GELİŞTİRME ÖRNEKLEMİ (IN-SAMPLE: 15.07.2026 - 01.09.2026)", in_sample_trades)
    res_out = print_performance_table("2. BAĞIMSIZ DOĞRULAMA ÖRNEKLEMİ (OUT-OF-SAMPLE: 01.09.2026 - 14.10.2026)", out_of_sample_trades)
    res_full = print_performance_table("3. TAM DÖNEM BİRLEŞİK ÖRNEKLEM (FULL SAMPLE: 15.07.2026 - 14.10.2026)", all_trade_records)

    # Raporu Kaydet
    final_report = {
        "generatedAt": datetime.now().isoformat(),
        "totalTrades": len(all_trade_records),
        "inSampleCount": len(in_sample_trades),
        "outOfSampleCount": len(out_of_sample_trades),
        "inSample": res_in,
        "outOfSample": res_out,
        "fullSample": res_full,
        "sampleDivergentFilteredTrades": [
            {
                "symbol": t["symbol"],
                "direction": t["direction"],
                "datetime": t["datetime"],
                "sample": t["sample"],
                "m1_outcome": t["m1_outcome"],
                "m1_r": t["m1_r"],
                "macro_gate": t["macro_gate"],
                "macro_allowed": t["macro_allowed"],
                "h4_trend": t["h4_trend"],
                "trend_allowed": t["trend_allowed"],
                "both_allowed": t["both_allowed"],
            }
            for t in all_trade_records if not t["both_allowed"]
        ][:25]
    }

    out_path = ROOT_DIR / "data" / "b00_filters_research_report.json"
    out_path.write_text(json.dumps(final_report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\n✅ Filtre Araştırma Raporu Kaydedildi: {out_path}")

if __name__ == "__main__":
    run_filters_audit()
