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
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional, Tuple
import pandas as pd
import numpy as np
import MetaTrader5 as mt5

AUDIT_SYMBOLS = ["EURUSD", "GBPUSD", "XAUUSD", "BTCUSD", "USDCAD", "USDJPY"]
BROKER_COST_R = 0.05  # Spread + komisyon maliyeti

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

def fetch_symbol_data(symbol: str, start_dt: datetime, end_dt: datetime) -> Tuple[Optional[pd.DataFrame], Optional[pd.DataFrame], str]:
    """MT5'ten 15M ve 1M barlarını eksiksiz olarak çeker ve doğrular."""
    rates_15m = mt5.copy_rates_range(symbol, mt5.TIMEFRAME_M15, start_dt, end_dt)
    if rates_15m is None or len(rates_15m) < 200:
        return None, None, f"INSUFFICIENT_DATA: {symbol} için 15M verisi yetersiz (<200 bar)"

    df15 = pd.DataFrame(rates_15m)
    df15["datetime"] = pd.to_datetime(df15["time"], unit="s", utc=True)
    for col in ["open", "high", "low", "close"]:
        df15[col] = df15[col].astype(float)

    # İndikatörler: PDH, PDL, Asian High/Low, EMA50, EMA200
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

    df15["ema50"] = df15["close"].ewm(span=50, adjust=False).mean()
    df15["ema200"] = df15["close"].ewm(span=200, adjust=False).mean()

    # 1M Barlarını 25 günlük parçalar halinde çek (MT5 query limit koruması)
    all_m1_rates = []
    curr_start = start_dt
    while curr_start < end_dt:
        curr_end = min(end_dt, curr_start + timedelta(days=25))
        chunk = mt5.copy_rates_range(symbol, mt5.TIMEFRAME_M1, curr_start, curr_end)
        if chunk is not None and len(chunk) > 0:
            all_m1_rates.append(pd.DataFrame(chunk))
        curr_start = curr_end

    if not all_m1_rates:
        return df15, None, f"INSUFFICIENT_DATA: {symbol} için 1M mikro-bar verisi eksik/yetersiz"

    df1 = pd.concat(all_m1_rates, ignore_index=True)
    df1.drop_duplicates(subset=["time"], keep="last", inplace=True)
    df1.sort_values(by="time", inplace=True)
    df1.reset_index(drop=True, inplace=True)

    df1["datetime"] = pd.to_datetime(df1["time"], unit="s", utc=True)
    for col in ["open", "high", "low", "close"]:
        df1[col] = df1[col].astype(float)

    if len(df1) < 1000:
        return df15, None, f"INSUFFICIENT_DATA: {symbol} için toplam 1M bar < 1000 ({len(df1)})"

    return df15, df1, "OK"

def evaluate_models_for_trade(
    df15: pd.DataFrame,
    df1: Optional[pd.DataFrame],
    trade_dir: str,
    entry: float,
    sl: float,
    tp1: float,
    tp2: float,
    start_bar_idx: int,
) -> Dict[str, Any]:
    """
    Tek bir işlem için 3 modeli çalıştırır:
    1. TP_FIRST (15M barında TP SL'den önce kontrol edilir)
    2. STOP_LOSS_FIRST (15M barında SL TP'den önce kontrol edilir)
    3. 1M_MICROBAR_REPLAY (Gerçek 1M çubuk kronolojisi; aynı dakikada çakışma varsa AMBIGUOUS_SAME_M1_BAR)
    """
    risk = abs(entry - sl)
    sig_time = df15["datetime"].iloc[start_bar_idx]
    max_hold_time = sig_time + timedelta(hours=24)

    # -------------------------------------------------------------
    # MODEL 1: TP_FIRST (Optimistic 15M)
    # -------------------------------------------------------------
    opt_status = "OPEN"
    opt_sl = sl
    opt_res = {"outcome": "TIME_EXIT", "r": 0.0 - BROKER_COST_R, "bars": 96}
    for k in range(start_bar_idx + 1, min(start_bar_idx + 96, len(df15))):
        c_h = df15["high"].iloc[k]
        c_l = df15["low"].iloc[k]

        if trade_dir == "LONG":
            if c_h >= tp1 and opt_status == "OPEN":
                opt_status = "TP1_HIT"
                opt_sl = entry
            if c_h >= tp2:
                opt_res = {"outcome": "TP2", "r": round(2.5 - BROKER_COST_R, 2), "bars": k - start_bar_idx}
                break
            elif c_l <= opt_sl:
                opt_res = {"outcome": "BE" if opt_status == "TP1_HIT" else "SL",
                           "r": round((0.5 if opt_status == "TP1_HIT" else -1.0) - BROKER_COST_R, 2),
                           "bars": k - start_bar_idx}
                break
        else:
            if c_l <= tp1 and opt_status == "OPEN":
                opt_status = "TP1_HIT"
                opt_sl = entry
            if c_l <= tp2:
                opt_res = {"outcome": "TP2", "r": round(2.5 - BROKER_COST_R, 2), "bars": k - start_bar_idx}
                break
            elif c_h >= opt_sl:
                opt_res = {"outcome": "BE" if opt_status == "TP1_HIT" else "SL",
                           "r": round((0.5 if opt_status == "TP1_HIT" else -1.0) - BROKER_COST_R, 2),
                           "bars": k - start_bar_idx}
                break

    # -------------------------------------------------------------
    # MODEL 2: STOP_LOSS_FIRST (Conservative 15M)
    # -------------------------------------------------------------
    con_status = "OPEN"
    con_sl = sl
    con_res = {"outcome": "TIME_EXIT", "r": 0.0 - BROKER_COST_R, "bars": 96}
    for k in range(start_bar_idx + 1, min(start_bar_idx + 96, len(df15))):
        c_h = df15["high"].iloc[k]
        c_l = df15["low"].iloc[k]

        if trade_dir == "LONG":
            if c_l <= con_sl:
                con_res = {"outcome": "BE" if con_status == "TP1_HIT" else "SL",
                           "r": round((0.5 if con_status == "TP1_HIT" else -1.0) - BROKER_COST_R, 2),
                           "bars": k - start_bar_idx}
                break
            elif c_h >= tp1 and con_status == "OPEN":
                con_status = "TP1_HIT"
                con_sl = entry
            if c_h >= tp2:
                con_res = {"outcome": "TP2", "r": round(2.5 - BROKER_COST_R, 2), "bars": k - start_bar_idx}
                break
        else:
            if c_h >= con_sl:
                con_res = {"outcome": "BE" if con_status == "TP1_HIT" else "SL",
                           "r": round((0.5 if con_status == "TP1_HIT" else -1.0) - BROKER_COST_R, 2),
                           "bars": k - start_bar_idx}
                break
            elif c_l <= tp1 and con_status == "OPEN":
                con_status = "TP1_HIT"
                con_sl = entry
            if c_l <= tp2:
                con_res = {"outcome": "TP2", "r": round(2.5 - BROKER_COST_R, 2), "bars": k - start_bar_idx}
                break

    m1_res = {"status": "INSUFFICIENT_DATA", "outcome": "NONE", "r": 0.0, "is_ambiguous": False}
    if df1 is not None and not df1.empty:
        # 15M sinyal mumu kapandıktan sonra işleme girildiği için 1M taraması sinyal mumunun bitiminden başlar
        entry_time_m1 = sig_time + timedelta(minutes=15)
        m1_slice = df1[(df1["datetime"] >= entry_time_m1) & (df1["datetime"] <= max_hold_time)]
        # Veri sürekliliği kontrolü
        if len(m1_slice) < 60:
            m1_res = {"status": "INSUFFICIENT_DATA", "reason": "Sinyal sonrasi 1M bar sayisi <60"}
        else:
            m1_status = "OPEN"
            m1_sl = sl
            resolved = False
            is_ambiguous = False

            for idx, bar in m1_slice.iterrows():
                bh = bar["high"]
                bl = bar["low"]

                if trade_dir == "LONG":
                    hit_sl = (bl <= m1_sl)
                    hit_tp1 = (bh >= tp1 and m1_status == "OPEN")
                    hit_tp2 = (bh >= tp2)

                    # AYNI 1 DAKİKALIK BARDA ÇAKIŞMA KONTROLÜ
                    if hit_sl and (hit_tp1 or hit_tp2):
                        # 1M barında da aynı dakika içinde hem tepe hem dip görülmüş!
                        # Tick verisi olmadan varsayım yapılmaz; belirsizlik korunur.
                        is_ambiguous = True
                        m1_res = {
                            "status": "AMBIGUOUS_SAME_M1_BAR",
                            "outcome": "AMBIGUOUS",
                            "r": round(-1.0 - BROKER_COST_R, 2),  # Güvenlik için SL baz alınır ama flag açık kalır
                            "bar_time": str(bar["datetime"]),
                            "is_ambiguous": True
                        }
                        resolved = True
                        break

                    if hit_sl:
                        m1_res = {
                            "status": "OK",
                            "outcome": "BE" if m1_status == "TP1_HIT" else "SL",
                            "r": round((0.5 if m1_status == "TP1_HIT" else -1.0) - BROKER_COST_R, 2),
                            "bar_time": str(bar["datetime"]),
                            "is_ambiguous": False
                        }
                        resolved = True
                        break
                    elif hit_tp1:
                        m1_status = "TP1_HIT"
                        m1_sl = entry
                    if hit_tp2:
                        m1_res = {
                            "status": "OK",
                            "outcome": "TP2",
                            "r": round(2.5 - BROKER_COST_R, 2),
                            "bar_time": str(bar["datetime"]),
                            "is_ambiguous": False
                        }
                        resolved = True
                        break

                else:  # SHORT
                    hit_sl = (bh >= m1_sl)
                    hit_tp1 = (bl <= tp1 and m1_status == "OPEN")
                    hit_tp2 = (bl <= tp2)

                    if hit_sl and (hit_tp1 or hit_tp2):
                        is_ambiguous = True
                        m1_res = {
                            "status": "AMBIGUOUS_SAME_M1_BAR",
                            "outcome": "AMBIGUOUS",
                            "r": round(-1.0 - BROKER_COST_R, 2),
                            "bar_time": str(bar["datetime"]),
                            "is_ambiguous": True
                        }
                        resolved = True
                        break

                    if hit_sl:
                        m1_res = {
                            "status": "OK",
                            "outcome": "BE" if m1_status == "TP1_HIT" else "SL",
                            "r": round((0.5 if m1_status == "TP1_HIT" else -1.0) - BROKER_COST_R, 2),
                            "bar_time": str(bar["datetime"]),
                            "is_ambiguous": False
                        }
                        resolved = True
                        break
                    elif hit_tp1:
                        m1_status = "TP1_HIT"
                        m1_sl = entry
                    if hit_tp2:
                        m1_res = {
                            "status": "OK",
                            "outcome": "TP2",
                            "r": round(2.5 - BROKER_COST_R, 2),
                            "bar_time": str(bar["datetime"]),
                            "is_ambiguous": False
                        }
                        resolved = True
                        break

            if not resolved:
                # 24 saat içinde sonuçlanmayan işlem
                last_b = m1_slice.iloc[-1]
                end_price = last_b["close"]
                end_move = (end_price - entry) if trade_dir == "LONG" else (entry - end_price)
                end_r = round(max(-1.0, min(2.5, end_move / risk)) - BROKER_COST_R, 2)
                m1_res = {
                    "status": "OK",
                    "outcome": "TIME_EXIT",
                    "r": end_r,
                    "bar_time": str(last_b["datetime"]),
                    "is_ambiguous": False
                }

    return {
        "tp_first": opt_res,
        "stop_loss_first": con_res,
        "microbar_1m": m1_res
    }

def run_comprehensive_b00_audit():
    print("=" * 85)
    print("🔬 BEGONYA 00 (B00) 1M MİKRO-BAR KARŞILAŞTIRMALI ADLİ DENETİMİ 🔬")
    print("=" * 85)

    if not mt5.initialize():
        print("❌ MT5 başlatılamadı!")
        return

    # 3 Aylık Analiz Penceresi: 2026-07-15 - 2026-10-14
    start_dt = datetime(2026, 7, 15, 0, 0, tzinfo=timezone.utc)
    end_dt = datetime(2026, 10, 14, 0, 0, tzinfo=timezone.utc)

    print(f"\n📅 Denetim Tarih Aralığı: {start_dt.date()} — {end_dt.date()} (3 Aylık Kapsam)")
    print(f"📡 İncelenecek Enstrümanlar: {AUDIT_SYMBOLS}")

    all_trades: List[Dict[str, Any]] = []
    insufficient_data_trades: List[Dict[str, Any]] = []

    for sym in AUDIT_SYMBOLS:
        print(f"\n⏳ [{sym}] Veriler yükleniyor...")
        df15, df1, data_status = fetch_symbol_data(sym, start_dt, end_dt)
        if df15 is None:
            print(f"   ⚠️ {sym}: {data_status}")
            continue

        m1_count = len(df1) if df1 is not None else 0
        print(f"   ✅ {sym}: 15M Bar={len(df15)} | 1M Bar={m1_count}")

        # SFP Strateji Taraması
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
            # SFP Short
            sfp_short = (c_h > pdh and c_c < pdh) or (ash > 0 and c_h > ash and c_c < ash)
            # SFP Long
            sfp_long = (c_l < pdl and c_c > pdl) or (asl > 0 and c_l < asl and c_c > asl)

            # Minimum Fitil Oranı Kontrolü (%40 red fitili)
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
                res = evaluate_models_for_trade(df15, df1, trade_dir, entry, sl, tp1, tp2, i)

                trade_record = {
                    "symbol": sym,
                    "direction": trade_dir,
                    "datetime": str(b_dt),
                    "pool": pool,
                    "entry": round(entry, 5),
                    "sl": round(sl, 5),
                    "tp1": round(tp1, 5),
                    "tp2": round(tp2, 5),
                    "models": res
                }

                if res["microbar_1m"]["status"] == "INSUFFICIENT_DATA":
                    insufficient_data_trades.append(trade_record)
                else:
                    all_trades.append(trade_record)

    mt5.shutdown()

    # =========================================================================
    # PERFORMANS RAPORLAMASI VE MODEL KARŞILAŞTIRMASI
    # =========================================================================
    total_valid = len(all_trades)
    total_insufficient = len(insufficient_data_trades)
    print("\n" + "=" * 85)
    print(f"📊 TOPLAM DOĞRULANAN İŞLEM HAVUZU: {total_valid} ADET ({total_insufficient} işlem INSUFFICIENT_DATA)")
    print("=" * 85)

    if total_valid == 0:
        print("Doğrulanabilecek geçerli işlem bulunamadı!")
        return

    # Model Serileri
    tp_first_r = [t["models"]["tp_first"]["r"] for t in all_trades]
    sl_first_r = [t["models"]["stop_loss_first"]["r"] for t in all_trades]
    m1_r = [t["models"]["microbar_1m"]["r"] for t in all_trades]

    # Metrik Hesaplamaları
    def calc_metrics(r_list: List[float], outcomes: List[str]):
        wins = sum(1 for r in r_list if r > 0)
        losses = sum(1 for r in r_list if r < 0)
        be = sum(1 for r in r_list if r == 0)
        net_r = round(sum(r_list), 2)
        wr = round(wins / len(r_list) * 100, 1) if r_list else 0
        exp = round(net_r / len(r_list), 2) if r_list else 0
        mdd = calculate_max_drawdown(r_list)
        return {"wins": wins, "losses": losses, "be": be, "win_rate": wr, "net_r": net_r, "expectancy": exp, "mdd": mdd}

    m1_outcomes = [t["models"]["microbar_1m"]["outcome"] for t in all_trades]
    opt_outcomes = [t["models"]["tp_first"]["outcome"] for t in all_trades]
    con_outcomes = [t["models"]["stop_loss_first"]["outcome"] for t in all_trades]

    stat_opt = calc_metrics(tp_first_r, opt_outcomes)
    stat_con = calc_metrics(sl_first_r, con_outcomes)
    stat_m1 = calc_metrics(m1_r, m1_outcomes)

    # 1 Dakikalık Barda Çift Taraflı İğne (Ambiguity) Sayısı
    ambiguous_trades = [t for t in all_trades if t["models"]["microbar_1m"].get("is_ambiguous", False)]

    # Ayrışma Analizi
    divergent_trades = []
    for t in all_trades:
        r_opt = t["models"]["tp_first"]["r"]
        r_con = t["models"]["stop_loss_first"]["r"]
        r_m1 = t["models"]["microbar_1m"]["r"]
        if r_opt != r_con:
            divergent_trades.append({
                "trade": t,
                "opt_r": r_opt,
                "con_r": r_con,
                "m1_r": r_m1,
                "m1_matches": "STOP_LOSS_FIRST" if r_m1 == r_con else ("TP_FIRST" if r_m1 == r_opt else "NEITHER")
            })

    div_count = len(divergent_trades)
    same_count = total_valid - div_count

    print("\n--- 1. ÜÇ MODELİN PERFORMANS KARŞILAŞTIRMASI ---")
    print(f"{'Metrik':<25} | {'Model 1: TP_FIRST':<20} | {'Model 2: STOP_LOSS_FIRST':<24} | {'Model 3: 1M MICROBAR (Gerçek)':<25}")
    print("-" * 105)
    print(f"{'Toplam İşlem':<25} | {total_valid:<20} | {total_valid:<24} | {total_valid:<25}")
    print(f"{'Kazanan İşlem (TP)':<25} | {stat_opt['wins']:<20} | {stat_con['wins']:<24} | {stat_m1['wins']:<25}")
    print(f"{'Kaybeden İşlem (SL)':<25} | {stat_opt['losses']:<20} | {stat_con['losses']:<24} | {stat_m1['losses']:<25}")
    print(f"{'Kazanma Oranı (Win Rate)':<25} | %{stat_opt['win_rate']:<19} | %{stat_con['win_rate']:<23} | %{stat_m1['win_rate']:<24}")
    print(f"{'Net Kâr/Zarar (Net R)':<25} | {stat_opt['net_r']:<+20.2f} | {stat_con['net_r']:<+24.2f} | {stat_m1['net_r']:<+25.2f}")
    print(f"{'İşlem Başına Beklenti':<25} | {stat_opt['expectancy']:<+20.2f} | {stat_con['expectancy']:<+24.2f} | {stat_m1['expectancy']:<+25.2f}")
    print(f"{'Maksimum Drawdown (MDD)':<25} | -{stat_opt['mdd']:<19.2f} | -{stat_con['mdd']:<23.2f} | -{stat_m1['mdd']:<24.2f}")

    print("\n--- 2. AYRIŞMA VE DOĞRULUK ANALİZİ ---")
    print(f"Üç Modelde Birebir Aynı Kapanan İşlemler: {same_count} adet (%{same_count/total_valid*100:.1f})")
    print(f"Modeller Arasında Ayrışan İşlemler     : {div_count} adet (%{div_count/total_valid*100:.1f})")
    
    matches_con = sum(1 for d in divergent_trades if d["m1_matches"] == "STOP_LOSS_FIRST")
    matches_opt = sum(1 for d in divergent_trades if d["m1_matches"] == "TP_FIRST")
    matches_neither = sum(1 for d in divergent_trades if d["m1_matches"] == "NEITHER")

    print(f"\nAyrışan {div_count} işlemde 1M Gerçek Fiyat Yolunun Doğruladığı Model:")
    print(f"  • STOP_LOSS_FIRST ile Eşleşen: {matches_con} adet (%{matches_con/div_count*100:.1f} doğruluk)")
    print(f"  • TP_FIRST ile Eşleşen        : {matches_opt} adet (%{matches_opt/div_count*100:.1f} doğruluk)")
    print(f"  • Farklı Bir Seviye/Zamanlama : {matches_neither} adet (%{matches_neither/div_count*100:.1f})")

    print(f"\n⚠️ 1M Mumunda Aynı Dakikada Çift Seviye Görülen Belirsiz İşlemler (AMBIGUOUS_SAME_M1_BAR): {len(ambiguous_trades)} adet")

    # İlk 5 Ayrışan İşlemin Detayı
    print("\n--- 3. İŞLEM BAZINDA ADLİ ÖRNEKLER (İlk 5 Ayrışan İşlem) ---")
    for idx, d in enumerate(divergent_trades[:5]):
        tr = d["trade"]
        print(f"\n[{idx+1}] {tr['symbol']} {tr['direction']} @ {tr['datetime']}")
        print(f"    Giriş: {tr['entry']} | SL: {tr['sl']} | TP1: {tr['tp1']} | TP2: {tr['tp2']}")
        print(f"    TP_FIRST Sonucu        : {tr['models']['tp_first']['outcome']} -> {d['opt_r']:+.2f}R")
        print(f"    STOP_LOSS_FIRST Sonucu : {tr['models']['stop_loss_first']['outcome']} -> {d['con_r']:+.2f}R")
        print(f"    1M MICROBAR Sonucu     : {tr['models']['microbar_1m']['outcome']} -> {d['m1_r']:+.2f}R (Eşleşme: {d['m1_matches']})")

    # Raporu Kaydet
    audit_report = {
        "generatedAt": datetime.now().isoformat(),
        "dateRange": f"{start_dt.date()} to {end_dt.date()}",
        "totalEvaluated": total_valid,
        "insufficientDataCount": total_insufficient,
        "ambiguousSameM1BarCount": len(ambiguous_trades),
        "identicalCount": same_count,
        "divergentCount": div_count,
        "divergenceBreakdown": {
            "slFirstMatches": matches_con,
            "tpFirstMatches": matches_opt,
            "neitherMatches": matches_neither,
            "slFirstAccuracyPct": round(matches_con / div_count * 100, 1) if div_count else 0,
            "tpFirstAccuracyPct": round(matches_opt / div_count * 100, 1) if div_count else 0,
        },
        "performanceComparison": {
            "tpFirst": stat_opt,
            "stopLossFirst": stat_con,
            "microbar1M": stat_m1
        },
        "sampleDivergentTrades": [
            {
                "symbol": d["trade"]["symbol"],
                "direction": d["trade"]["direction"],
                "datetime": d["trade"]["datetime"],
                "entry": d["trade"]["entry"],
                "sl": d["trade"]["sl"],
                "tp1": d["trade"]["tp1"],
                "tp2": d["trade"]["tp2"],
                "tpFirstR": d["opt_r"],
                "slFirstR": d["con_r"],
                "microbar1MR": d["m1_r"],
                "winnerModel": d["m1_matches"]
            }
            for d in divergent_trades[:20]
        ]
    }

    out_file = Path("data/b00_microbar_audit_report.json")
    out_file.write_text(json.dumps(audit_report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\n✅ B00 Mikro-Bar Denetim Raporu Kaydedildi: {out_file}")

if __name__ == "__main__":
    run_comprehensive_b00_audit()
