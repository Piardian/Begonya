import os
import sys
from datetime import datetime, timezone, timedelta, date
from typing import Dict, Any, List, Optional
import pandas as pd
import numpy as np
import MetaTrader5 as mt5

AUDIT_SYMBOLS = ["EURUSD", "GBPUSD", "XAUUSD", "BTCUSD", "USDCAD", "USDJPY"]

def load_m15_and_m1(symbol: str, start_dt: datetime, end_dt: datetime):
    rates_15m = mt5.copy_rates_range(symbol, mt5.TIMEFRAME_M15, start_dt, end_dt)
    if rates_15m is None or len(rates_15m) < 100:
        return None, None
    df15 = pd.DataFrame(rates_15m)
    df15["datetime"] = pd.to_datetime(df15["time"], unit="s", utc=True)
    for col in ["open", "high", "low", "close"]:
        df15[col] = df15[col].astype(float)

    # Calculate indicators
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

    rates_1m = mt5.copy_rates_range(symbol, mt5.TIMEFRAME_M1, start_dt, end_dt)
    df1 = None
    if rates_1m is not None and len(rates_1m) > 1000:
        df1 = pd.DataFrame(rates_1m)
        df1["datetime"] = pd.to_datetime(df1["time"], unit="s", utc=True)
        for col in ["open", "high", "low", "close"]:
            df1[col] = df1[col].astype(float)

    return df15, df1

def analyze_b00_divergent_trades():
    if not mt5.initialize():
        print("MT5 başlatılamadı!")
        return

    # M1 barlarının terminalde gerçekte bulunduğu aralık (2026-08-27 - 2026-10-14)
    start_dt = datetime(2026, 8, 27, 0, 0, tzinfo=timezone.utc)
    end_dt = datetime(2026, 10, 14, 0, 0, tzinfo=timezone.utc)

    divergent_trades = []
    total_evaluated = 0
    identical_count = 0

    print("Analiz ediliyor...")
    for sym in AUDIT_SYMBOLS:
        df15, df1 = load_m15_and_m1(sym, start_dt, end_dt)
        if df15 is None:
            continue

        for i in range(100, len(df15) - 96):
            c_h = df15["high"].iloc[i]
            c_l = df15["low"].iloc[i]
            c_c = df15["close"].iloc[i]
            pdh = df15["pdh"].iloc[i]
            pdl = df15["pdl"].iloc[i]
            ash = df15["ash"].iloc[i]
            asl = df15["asl"].iloc[i]
            hour = df15["hour"].iloc[i]
            b_dt = df15["datetime"].iloc[i]

            if not ((7 <= hour <= 11) or (13 <= hour <= 17)):
                continue

            sfp_short = (c_h > pdh and c_c < pdh) or (ash > 0 and c_h > ash and c_c < ash)
            sfp_long = (c_l < pdl and c_c > pdl) or (asl > 0 and c_l < asl and c_c > asl)

            signals = []
            if sfp_short:
                entry = c_c
                sl = c_h + (c_h - c_l) * 0.1
                risk = sl - entry
                if risk > 0:
                    tp1 = entry - 1.0 * risk
                    tp2 = entry - 2.5 * risk
                    signals.append(("SHORT", entry, sl, tp1, tp2))

            if sfp_long:
                entry = c_c
                sl = c_l - (c_h - c_l) * 0.1
                risk = entry - sl
                if risk > 0:
                    tp1 = entry + 1.0 * risk
                    tp2 = entry + 2.5 * risk
                    signals.append(("LONG", entry, sl, tp1, tp2))

            for trade_dir, entry, sl, tp1, tp2 in signals:
                total_evaluated += 1

                # 1. OPTIMISTIC
                opt_res = None
                opt_status = "OPEN"
                opt_cur_sl = sl
                for k in range(i + 1, min(i + 96, len(df15))):
                    bh = df15["high"].iloc[k]
                    bl = df15["low"].iloc[k]
                    if trade_dir == "LONG":
                        if bh >= tp1 and opt_status == "OPEN":
                            opt_status = "TP1_HIT"
                            opt_cur_sl = entry
                        if bh >= tp2:
                            opt_res = {"reason": "TP2", "r": 2.5, "bar_idx": k, "bar_time": str(df15["datetime"].iloc[k])}
                            break
                        elif bl <= opt_cur_sl:
                            opt_res = {"reason": "BE" if opt_status == "TP1_HIT" else "SL", "r": 0.5 if opt_status == "TP1_HIT" else -1.0, "bar_idx": k, "bar_time": str(df15["datetime"].iloc[k])}
                            break
                    else:
                        if bl <= tp1 and opt_status == "OPEN":
                            opt_status = "TP1_HIT"
                            opt_cur_sl = entry
                        if bl <= tp2:
                            opt_res = {"reason": "TP2", "r": 2.5, "bar_idx": k, "bar_time": str(df15["datetime"].iloc[k])}
                            break
                        elif bh >= opt_cur_sl:
                            opt_res = {"reason": "BE" if opt_status == "TP1_HIT" else "SL", "r": 0.5 if opt_status == "TP1_HIT" else -1.0, "bar_idx": k, "bar_time": str(df15["datetime"].iloc[k])}
                            break
                if not opt_res:
                    opt_res = {"reason": "TIME_EXIT", "r": 0.0, "bar_idx": i+96, "bar_time": ""}

                # 2. CONSERVATIVE (STOP_LOSS_FIRST)
                con_res = None
                con_status = "OPEN"
                con_cur_sl = sl
                for k in range(i + 1, min(i + 96, len(df15))):
                    bh = df15["high"].iloc[k]
                    bl = df15["low"].iloc[k]
                    if trade_dir == "LONG":
                        if bl <= con_cur_sl:
                            con_res = {"reason": "BE" if con_status == "TP1_HIT" else "SL", "r": 0.5 if con_status == "TP1_HIT" else -1.0, "bar_idx": k, "bar_time": str(df15["datetime"].iloc[k])}
                            break
                        elif bh >= tp1 and con_status == "OPEN":
                            con_status = "TP1_HIT"
                            con_cur_sl = entry
                        if bh >= tp2:
                            con_res = {"reason": "TP2", "r": 2.5, "bar_idx": k, "bar_time": str(df15["datetime"].iloc[k])}
                            break
                    else:
                        if bh >= con_cur_sl:
                            con_res = {"reason": "BE" if con_status == "TP1_HIT" else "SL", "r": 0.5 if con_status == "TP1_HIT" else -1.0, "bar_idx": k, "bar_time": str(df15["datetime"].iloc[k])}
                            break
                        elif bl <= tp1 and con_status == "OPEN":
                            con_status = "TP1_HIT"
                            con_cur_sl = entry
                        if bl <= tp2:
                            con_res = {"reason": "TP2", "r": 2.5, "bar_idx": k, "bar_time": str(df15["datetime"].iloc[k])}
                            break
                if not con_res:
                    con_res = {"reason": "TIME_EXIT", "r": 0.0, "bar_idx": i+96, "bar_time": ""}

                # 3. 1M GROUND TRUTH (IF AVAILABLE)
                m1_res = None
                if df1 is not None:
                    t_start = df15["datetime"].iloc[i]
                    t_end = t_start + timedelta(hours=24)
                    sub_m1 = df1[(df1["datetime"] >= t_start) & (df1["datetime"] <= t_end)]
                    if not sub_m1.empty:
                        m1_status = "OPEN"
                        m1_cur_sl = sl
                        for _, m1_bar in sub_m1.iterrows():
                            mbh = m1_bar["high"]
                            mbl = m1_bar["low"]
                            if trade_dir == "LONG":
                                if mbl <= m1_cur_sl:
                                    m1_res = {"reason": "BE" if m1_status == "TP1_HIT" else "SL", "r": 0.5 if m1_status == "TP1_HIT" else -1.0, "time": str(m1_bar["datetime"])}
                                    break
                                elif mbh >= tp1 and m1_status == "OPEN":
                                    m1_status = "TP1_HIT"
                                    m1_cur_sl = entry
                                if mbh >= tp2:
                                    m1_res = {"reason": "TP2", "r": 2.5, "time": str(m1_bar["datetime"])}
                                    break
                            else:
                                if mbh >= m1_cur_sl:
                                    m1_res = {"reason": "BE" if m1_status == "TP1_HIT" else "SL", "r": 0.5 if m1_status == "TP1_HIT" else -1.0, "time": str(m1_bar["datetime"])}
                                    break
                                elif mbl <= tp1 and m1_status == "OPEN":
                                    m1_status = "TP1_HIT"
                                    m1_cur_sl = entry
                                if mbl <= tp2:
                                    m1_res = {"reason": "TP2", "r": 2.5, "time": str(m1_bar["datetime"])}
                                    break

                if opt_res["r"] != con_res["r"]:
                    divergent_trades.append({
                        "symbol": sym,
                        "time": str(b_dt),
                        "direction": trade_dir,
                        "entry": round(entry, 5),
                        "sl": round(sl, 5),
                        "tp1": round(tp1, 5),
                        "tp2": round(tp2, 5),
                        "optimistic": opt_res,
                        "conservative": con_res,
                        "ground_truth_1m": m1_res,
                        "delta_r": round(opt_res["r"] - con_res["r"], 2)
                    })
                else:
                    identical_count += 1

    mt5.shutdown()
    print(f"\nToplam İncelenen İşlem: {total_evaluated}")
    print(f"Birebir Aynı Sonuç Veren İşlemler: {identical_count} (%{identical_count/total_evaluated*100:.1f})")
    print(f"Ayrışan (Divergent) İşlemler: {len(divergent_trades)} (%{len(divergent_trades)/total_evaluated*100:.1f})")

    df_div = pd.DataFrame(divergent_trades)
    if not df_div.empty:
        net_delta = df_div["delta_r"].sum()
        print(f"\nNet Ayrışma R Toplamı (Optimistic - Conservative): {net_delta:+.2f}R")
        
        # 1M Gerçek Sonuçla Eşleşme Analizi
        matches_con = 0
        matches_opt = 0
        total_with_1m = 0
        for dt in divergent_trades:
            if dt["ground_truth_1m"]:
                total_with_1m += 1
                if dt["ground_truth_1m"]["r"] == dt["conservative"]["r"]:
                    matches_con += 1
                elif dt["ground_truth_1m"]["r"] == dt["optimistic"]["r"]:
                    matches_opt += 1

        print(f"\n1M Gerçek Veri ile Karşılaştırma ({total_with_1m} ayrışan işlemde):")
        if total_with_1m > 0:
            print(f"Conservative (SL First) ile Eşleşen: {matches_con} adet (%{matches_con/total_with_1m*100:.1f} doğruluk)")
            print(f"Optimistic (TP First) ile Eşleşen  : {matches_opt} adet (%{matches_opt/total_with_1m*100:.1f} doğruluk)")
        else:
            print("1M verisi ayrışan işlemler için bulunamadı.")

        # İlk 5 ayrışan işlemin detay dökümü
        print("\n--- ÖRNEK AYRIŞAN İŞLEM DÖKÜMÜ (İlk 5 İşlem) ---")
        for idx, row in df_div.head(5).iterrows():
            print(f"\n[{idx+1}] {row['symbol']} {row['direction']} @ {row['time']}")
            print(f"    Giriş: {row['entry']} | SL: {row['sl']} | TP1: {row['tp1']} | TP2: {row['tp2']}")
            print(f"    Optimistic Sonuç   : {row['optimistic']['reason']} -> {row['optimistic']['r']}R (Bar: {row['optimistic']['bar_time']})")
            print(f"    Conservative Sonuç : {row['conservative']['reason']} -> {row['conservative']['r']}R (Bar: {row['conservative']['bar_time']})")
            if row['ground_truth_1m']:
                print(f"    1M Ground Truth    : {row['ground_truth_1m']['reason']} -> {row['ground_truth_1m']['r']}R (Time: {row['ground_truth_1m']['time']})")
            print(f"    Fark (Opt - Con)   : {row['delta_r']:+.2f}R")

if __name__ == "__main__":
    analyze_b00_divergent_trades()
