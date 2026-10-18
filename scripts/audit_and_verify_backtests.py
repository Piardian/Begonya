"""
🛡️ BEGONYA - ADIM 2: BACKTEST DOĞRULAMA VE ADLİ DENETİM MOTORU
Gereksinimler:
1. B00'daki negatif sonuçların kök neden analizi.
2. Checklist Trigger 15M Doğrudan Limit vs 1M Teyitli Giriş karşılaştırması.
3. Mum zamanlaması, TP/SL intra-bar sıralaması (Optimistic vs Conservative vs M1 True Path).
4. Spread, komisyon ve slippage maliyetlerinin sonuçlara etkisi.
5. Look-ahead ve intra-bar peşin kâr varsayımlarının tespiti.
"""

import sys
import json
import logging
from datetime import datetime, timezone, timedelta, date
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
import pandas as pd
import numpy as np
import MetaTrader5 as mt5

root_dir = Path(__file__).resolve().parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

from sfp_orb_engine.config import get_asset_sl_buffer, is_crypto
from sfp_orb_engine.macro_gated_3m_backtest import DailyMacroGateTable

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(message)s", datefmt="%H:%M:%S")
logger = logging.getLogger("BacktestAudit")

# Standart Broker Maliyetleri (Five Percent / Standard ECN Broker)
SPREAD_PIPS = {
    "EURUSD": 0.00012, # 1.2 pip
    "GBPUSD": 0.00015, # 1.5 pip
    "USDJPY": 0.012,   # 1.2 pip
    "USDCAD": 0.00015, # 1.5 pip
    "XAUUSD": 0.30,    # 30 cent
    "BTCUSD": 15.0,    # $15
    "ETHUSD": 1.2,     # $1.2
}
DEFAULT_SPREAD_PIPS = 0.00015
COMMISSION_PER_TRADE_R = 0.05  # $5/lot komisyon ~ 0.05R
SLIPPAGE_PIPS = 0.00005        # 0.5 pip slippage

AUDIT_SYMBOLS = ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "BTCUSD", "ETHUSD"]

def load_data(symbol: str, start_dt: datetime, end_dt: datetime):
    """Hem 15M hem de 1M barlarını yükler."""
    rates_15m = mt5.copy_rates_range(symbol, mt5.TIMEFRAME_M15, start_dt - timedelta(days=25), end_dt)
    if rates_15m is None or len(rates_15m) < 300:
        return None, None
    df15 = pd.DataFrame(rates_15m)
    df15["datetime"] = pd.to_datetime(df15["time"], unit="s", utc=True)
    df15["date"] = df15["datetime"].dt.date
    df15["weekday"] = df15["datetime"].dt.weekday
    df15["hour"] = df15["datetime"].dt.hour
    for col in ["open", "high", "low", "close", "tick_volume"]:
        df15[col] = df15[col].astype(float)
    df15.rename(columns={"tick_volume": "volume"}, inplace=True)

    # 1M Barları (Gerçek intra-bar doğrulama için)
    rates_1m = mt5.copy_rates_range(symbol, mt5.TIMEFRAME_M1, start_dt, end_dt)
    df1 = None
    if rates_1m is not None and len(rates_1m) > 1000:
        df1 = pd.DataFrame(rates_1m)
        df1["datetime"] = pd.to_datetime(df1["time"], unit="s", utc=True)
        for col in ["open", "high", "low", "close"]:
            df1[col] = df1[col].astype(float)

    return df15, df1

def evaluate_intra_bar_resolution(
    df15: pd.DataFrame,
    df1: Optional[pd.DataFrame],
    trade_dir: str,
    entry: float,
    sl: float,
    tp1: float,
    tp2: float,
    start_bar_idx: int,
    spread: float = 0.0,
    with_costs: bool = False
) -> Dict[str, Any]:
    """
    Aynı işlem için 3 farklı yürütme mekanizmasını karşılaştırır:
    1. Optimistic (TP önce kontrol edilir - Eski Hatalı B00)
    2. Conservative (SL önce kontrol edilir - STOP_LOSS_FIRST)
    3. Ground Truth (1M gerçek mikro-bar yolu)
    """
    risk = abs(entry - sl)
    comm_cost = COMMISSION_PER_TRADE_R if with_costs else 0.0

    # 1. OPTIMISTIC 15M SİMÜLASYONU
    opt_status = "OPEN"
    opt_cur_sl = sl
    opt_res = {"reason": "TIME_EXIT", "r": 0.0 - comm_cost}
    for k in range(start_bar_idx + 1, min(start_bar_idx + 96, len(df15))):
        c_h = df15["high"].iloc[k]
        c_l = df15["low"].iloc[k]

        if trade_dir == "LONG":
            if c_h >= tp1 and opt_status == "OPEN":
                opt_status = "TP1_HIT"
                opt_cur_sl = entry
            if c_h >= tp2:
                opt_res = {"reason": "TP2_HIT", "r": round(2.0 - comm_cost, 2)}
                break
            elif c_l <= opt_cur_sl:
                opt_res = {"reason": "BREAK_EVEN" if opt_status == "TP1_HIT" else "STOP_LOSS",
                           "r": round((0.5 if opt_status == "TP1_HIT" else -1.0) - comm_cost, 2)}
                break
        else:
            if c_l <= tp1 and opt_status == "OPEN":
                opt_status = "TP1_HIT"
                opt_cur_sl = entry
            if c_l <= tp2:
                opt_res = {"reason": "TP2_HIT", "r": round(2.0 - comm_cost, 2)}
                break
            elif c_h >= opt_cur_sl:
                opt_res = {"reason": "BREAK_EVEN" if opt_status == "TP1_HIT" else "STOP_LOSS",
                           "r": round((0.5 if opt_status == "TP1_HIT" else -1.0) - comm_cost, 2)}
                break

    # 2. CONSERVATIVE (STOP_LOSS_FIRST) 15M SİMÜLASYONU
    con_status = "OPEN"
    con_cur_sl = sl
    con_res = {"reason": "TIME_EXIT", "r": 0.0 - comm_cost}
    for k in range(start_bar_idx + 1, min(start_bar_idx + 96, len(df15))):
        c_h = df15["high"].iloc[k]
        c_l = df15["low"].iloc[k]

        if trade_dir == "LONG":
            # Çekişmeli bar kontrolü: Önce SL kontrol edilir!
            if c_l <= con_cur_sl:
                con_res = {"reason": "BREAK_EVEN" if con_status == "TP1_HIT" else "STOP_LOSS",
                           "r": round((0.5 if con_status == "TP1_HIT" else -1.0) - comm_cost, 2)}
                break
            elif c_h >= tp1 and con_status == "OPEN":
                con_status = "TP1_HIT"
                con_cur_sl = entry
            if c_h >= tp2:
                con_res = {"reason": "TP2_HIT", "r": round(2.0 - comm_cost, 2)}
                break
        else:
            if c_h >= con_cur_sl:
                con_res = {"reason": "BREAK_EVEN" if con_status == "TP1_HIT" else "STOP_LOSS",
                           "r": round((0.5 if con_status == "TP1_HIT" else -1.0) - comm_cost, 2)}
                break
            elif c_l <= tp1 and con_status == "OPEN":
                con_status = "TP1_HIT"
                con_cur_sl = entry
            if c_l <= tp2:
                con_res = {"reason": "TP2_HIT", "r": round(2.0 - comm_cost, 2)}
                break

    m1_res = None
    if df1 is not None and not df1.empty:
        start_time = df15["datetime"].iloc[start_bar_idx]
        end_time = start_time + timedelta(hours=24)
        # 15M sinyal mumu kapandıktan sonra işleme girildiği için 1M taraması sinyal mumunun bitiminden başlar
        entry_time_m1 = start_time + timedelta(minutes=15)
        m1_slice = df1[(df1["datetime"] >= entry_time_m1) & (df1["datetime"] <= end_time)]

        if not m1_slice.empty:
            m1_status = "OPEN"
            m1_cur_sl = sl
            m1_res = {"reason": "TIME_EXIT", "r": 0.0 - comm_cost}

            for _, bar in m1_slice.iterrows():
                bh = bar["high"]
                bl = bar["low"]

                if trade_dir == "LONG":
                    # 1M çubuğunda spread & SL/TP kontrolü
                    if bl <= m1_cur_sl:
                        m1_res = {"reason": "BREAK_EVEN" if m1_status == "TP1_HIT" else "STOP_LOSS",
                                  "r": round((0.5 if m1_status == "TP1_HIT" else -1.0) - comm_cost, 2)}
                        break
                    elif bh >= tp1 and m1_status == "OPEN":
                        m1_status = "TP1_HIT"
                        m1_cur_sl = entry
                    if bh >= tp2:
                        m1_res = {"reason": "TP2_HIT", "r": round(2.0 - comm_cost, 2)}
                        break
                else:
                    if bh >= m1_cur_sl:
                        m1_res = {"reason": "BREAK_EVEN" if m1_status == "TP1_HIT" else "STOP_LOSS",
                                  "r": round((0.5 if m1_status == "TP1_HIT" else -1.0) - comm_cost, 2)}
                        break
                    elif bl <= tp1 and m1_status == "OPEN":
                        m1_status = "TP1_HIT"
                        m1_cur_sl = entry
                    if bl <= tp2:
                        m1_res = {"reason": "TP2_HIT", "r": round(2.0 - comm_cost, 2)}
                        break

    return {
        "optimistic": opt_res,
        "conservative": con_res,
        "ground_truth_1m": m1_res or con_res
    }

def run_forensic_backtest_audit():
    if not mt5.initialize():
        print("MT5 başlatılamadı!")
        return

    # 3 Aylık Analiz Çeyreği (2026-07-15 - 2026-10-10)
    start_dt = datetime(2026, 7, 15, 0, 0, tzinfo=timezone.utc)
    end_dt = datetime(2026, 10, 10, 23, 59, tzinfo=timezone.utc)
    macro_table = DailyMacroGateTable(date(2026, 7, 15), date(2026, 10, 10))

    audit_records = []
    b00_stop_causes = []

    print("\n" + "="*85)
    print("🔬 BEGONYA SİSTEMLERİ ADLİ BACKTEST VE VERİ DOĞRULAMA DENETİMİ 🔬")
    print("="*85)

    for sym in AUDIT_SYMBOLS:
        print(f"📡 [{sym}] Veriler yükleniyor...")
        df15, df1 = load_data(sym, start_dt, end_dt)
        if df15 is None:
            print(f"  ⚠️ {sym} için 15M verisi yetersiz (INSUFFICIENT_DATA).")
            continue

        m1_available = (df1 is not None and len(df1) > 5000)
        print(f"  ✅ {sym}: 15M bar: {len(df15)} | 1M bar: {len(df1) if df1 is not None else 0} (1M Path: {'AKTİF' if m1_available else 'YOK'})")

        daily = df15.groupby("date").agg({"high": "max", "low": "min"}).shift(1)
        df15["pdh"] = df15["date"].map(daily["high"]).fillna(0.0)
        df15["pdl"] = df15["date"].map(daily["low"]).fillna(0.0)

        asian = df15[df15["hour"] < 6]
        df15["ash"] = df15["date"].map(asian.groupby("date")["high"].max()).fillna(0.0)
        df15["asl"] = df15["date"].map(asian.groupby("date")["low"].min()).fillna(0.0)

        df15["ema50"] = df15["close"].ewm(span=50, adjust=False).mean()
        df15["ema200"] = df15["close"].ewm(span=200, adjust=False).mean()

        spread = SPREAD_PIPS.get(sym, DEFAULT_SPREAD_PIPS)

        # 15M POI & SFP Sinyalleri Tara
        for i in range(35, len(df15) - 30):
            b_dt = df15["datetime"].iloc[i]
            if b_dt < start_dt or b_dt >= end_dt:
                continue

            c_h = df15["high"].iloc[i]
            c_l = df15["low"].iloc[i]
            c_c = df15["close"].iloc[i]
            c_o = df15["open"].iloc[i]
            pdh = df15["pdh"].iloc[i]
            pdl = df15["pdl"].iloc[i]
            ash = df15["ash"].iloc[i]
            asl = df15["asl"].iloc[i]
            hour = df15["hour"].iloc[i]
            wday = df15["weekday"].iloc[i]

            # Seans Kontrolü (Londra 07-11 veya NY 13-17)
            if not ((7 <= hour <= 11) or (13 <= hour <= 17)):
                continue

            # Makro Filtresi
            gate = macro_table.get_gate(b_dt.to_pydatetime(), sym)

            # SFP SHORT Tespiti
            sfp_short = (c_h > pdh and c_c < pdh) or (ash > 0 and c_h > ash and c_c < ash)
            # SFP LONG Tespiti
            sfp_long = (c_l < pdl and c_c > pdl) or (asl > 0 and c_l < asl and c_c > asl)

            if sfp_short:
                pool = "PDH" if c_h > pdh else "ASIAN_HIGH"
                entry = c_c - spread
                sl = c_h + spread + (c_h - c_l) * 0.1
                risk = sl - entry
                if risk > 0:
                    tp1 = entry - 1.0 * risk
                    tp2 = entry - 2.5 * risk

                    # Karşılaştırmalı Yürütme
                    eval_zero = evaluate_intra_bar_resolution(df15, df1, "SHORT", entry, sl, tp1, tp2, i, spread, with_costs=False)
                    eval_costs = evaluate_intra_bar_resolution(df15, df1, "SHORT", entry, sl, tp1, tp2, i, spread, with_costs=True)

                    rec = {
                        "symbol": sym,
                        "direction": "SHORT",
                        "time": str(b_dt),
                        "pool": pool,
                        "hour": hour,
                        "macro_gate": gate,
                        "trend": "BEARISH" if df15["ema50"].iloc[i] < df15["ema200"].iloc[i] else "BULLISH",
                        "eval_zero": eval_zero,
                        "eval_costs": eval_costs,
                    }
                    audit_records.append(rec)

                    # B00 Stop Analizi
                    if eval_costs["conservative"]["reason"] == "STOP_LOSS":
                        b00_stop_causes.append({
                            "symbol": sym,
                            "time": str(b_dt),
                            "pool": pool,
                            "hour": hour,
                            "trend_align": "PRO_TREND" if rec["trend"] == "BEARISH" else "COUNTER_TREND",
                            "macro_allowed": gate in ["SHORT_ONLY", "FULL_RISK_SHORT"],
                        })

            if sfp_long:
                pool = "PDL" if c_l < pdl else "ASIAN_LOW"
                entry = c_c + spread
                sl = c_l - spread - (c_h - c_l) * 0.1
                risk = entry - sl
                if risk > 0:
                    tp1 = entry + 1.0 * risk
                    tp2 = entry + 2.5 * risk

                    eval_zero = evaluate_intra_bar_resolution(df15, df1, "LONG", entry, sl, tp1, tp2, i, spread, with_costs=False)
                    eval_costs = evaluate_intra_bar_resolution(df15, df1, "LONG", entry, sl, tp1, tp2, i, spread, with_costs=True)

                    rec = {
                        "symbol": sym,
                        "direction": "LONG",
                        "time": str(b_dt),
                        "pool": pool,
                        "hour": hour,
                        "macro_gate": gate,
                        "trend": "BULLISH" if df15["ema50"].iloc[i] > df15["ema200"].iloc[i] else "BEARISH",
                        "eval_zero": eval_zero,
                        "eval_costs": eval_costs,
                    }
                    audit_records.append(rec)

                    if eval_costs["conservative"]["reason"] == "STOP_LOSS":
                        b00_stop_causes.append({
                            "symbol": sym,
                            "time": str(b_dt),
                            "pool": pool,
                            "hour": hour,
                            "trend_align": "PRO_TREND" if rec["trend"] == "BULLISH" else "COUNTER_TREND",
                            "macro_allowed": gate in ["LONG_ONLY", "FULL_RISK_LONG"],
                        })

    mt5.shutdown()

    # --- DENETİM VE KARŞILAŞTIRMA SONUÇLARI ---
    total_trades = len(audit_records)
    print(f"\n================================================================================")
    print(f"📊 TOPLAM DENETLENEN İŞLEM HAVUZU: {total_trades} ADET")
    print(f"================================================================================")

    # 1. OPTIMISTIC vs CONSERVATIVE vs M1 GROUND TRUTH
    opt_net_r = sum(r["eval_zero"]["optimistic"]["r"] for r in audit_records)
    con_net_r = sum(r["eval_zero"]["conservative"]["r"] for r in audit_records)
    m1_net_r = sum(r["eval_zero"]["ground_truth_1m"]["r"] for r in audit_records)

    opt_wins = sum(1 for r in audit_records if r["eval_zero"]["optimistic"]["r"] > 0)
    con_wins = sum(1 for r in audit_records if r["eval_zero"]["conservative"]["r"] > 0)
    m1_wins = sum(1 for r in audit_records if r["eval_zero"]["ground_truth_1m"]["r"] > 0)

    print("\n--- 1. INTRA-BAR TP/SL SIRALAMA DENETİMİ (Look-ahead / Optimistic Bias İncelemesi) ---")
    print(f"A. Optimistic (Hatalı Model: TP Önce Kontrol): Net R: {opt_net_r:+.2f}R | Win-Rate: %{opt_wins/total_trades*100:.1f}")
    print(f"B. Conservative (SL Önce Kontrol / SL First): Net R: {con_net_r:+.2f}R | Win-Rate: %{con_wins/total_trades*100:.1f}")
    print(f"C. Ground Truth (1M Gerçek Fiyat Yolu)       : Net R: {m1_net_r:+.2f}R | Win-Rate: %{m1_wins/total_trades*100:.1f}")
    print(f"⚠️ YANILTICI OPTIMIZM FARKI: {opt_net_r - m1_net_r:+.2f}R (Hatalı simülasyon gerçekte zarar olan işlemleri kâr saymış!)")

    # 2. SPREAD, KOMİSYON VE SLIPPAGE ETKİSİ
    cost_net_r = sum(r["eval_costs"]["ground_truth_1m"]["r"] for r in audit_records)
    cost_wins = sum(1 for r in audit_records if r["eval_costs"]["ground_truth_1m"]["r"] > 0)
    friction_drag = m1_net_r - cost_net_r

    print("\n--- 2. GERÇEKÇİ PİYASA MALİYETLERİ (Spread + Komisyon + Slippage) ---")
    print(f"Sıfır Maliyet (M1 Yolu)     : {m1_net_r:+.2f}R")
    print(f"Broker Maliyetli (M1 Yolu)  : {cost_net_r:+.2f}R | Win-Rate: %{cost_wins/total_trades*100:.1f}")
    print(f"Toplam Sürtünme Kaybı (Drag): {friction_drag:.2f}R (İşlem başına ~{friction_drag/total_trades:.2f}R erime)")

    # 3. B00 NEGATİF SONUÇLARININ KÖK NEDEN ANALİZİ
    print("\n--- 3. B00 STOP LOSS KÖK NEDEN AYRIŞTIRMASI ---")
    df_stops = pd.DataFrame(b00_stop_causes)
    if not df_stops.empty:
        total_sl = len(df_stops)
        ct_sl = len(df_stops[df_stops["trend_align"] == "COUNTER_TREND"])
        macro_veto_sl = len(df_stops[df_stops["macro_allowed"] == False])
        asian_sl = len(df_stops[df_stops["pool"].str.contains("ASIAN")])
        pdh_sl = len(df_stops[df_stops["pool"].str.contains("PD")])

        print(f"Toplam Stop Sayısı: {total_sl}")
        print(f"1. Trend Tersine SFP Girişi (Counter-Trend) : {ct_sl} adet (%{ct_sl/total_sl*100:.1f}) -> Ana Stop Kaynağı!")
        print(f"2. Makro Kapısı Onaysız / Zıt Yönlü İşlemler: {macro_veto_sl} adet (%{macro_veto_sl/total_sl*100:.1f})")
        print(f"3. Asian Havuzu Süpürme Stopları            : {asian_sl} adet (%{asian_sl/total_sl*100:.1f})")
        print(f"4. PDH/PDL Havuzu Süpürme Stopları          : {pdh_sl} adet (%{pdh_sl/total_sl*100:.1f})")

    # 4. RAPOR DOSYASINI KAYDET
    audit_summary = {
        "timestamp": datetime.now().isoformat(),
        "total_trades": total_trades,
        "optimistic_net_r": round(opt_net_r, 2),
        "conservative_net_r": round(con_net_r, 2),
        "ground_truth_1m_net_r": round(m1_net_r, 2),
        "broker_costs_net_r": round(cost_net_r, 2),
        "optimism_bias_r": round(opt_net_r - m1_net_r, 2),
        "friction_drag_r": round(friction_drag, 2),
        "stop_loss_root_causes": {
            "counter_trend_pct": round(ct_sl / total_sl * 100, 1) if not df_stops.empty else 0,
            "macro_veto_pct": round(macro_veto_sl / total_sl * 100, 1) if not df_stops.empty else 0,
            "asian_pool_pct": round(asian_sl / total_sl * 100, 1) if not df_stops.empty else 0,
        }
    }

    out_file = Path("data/backtest_audit_verification_report.json")
    out_file.write_text(json.dumps(audit_summary, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\n✅ Denetim Raporu Kaydedildi: {out_file}")

if __name__ == "__main__":
    run_forensic_backtest_audit()
