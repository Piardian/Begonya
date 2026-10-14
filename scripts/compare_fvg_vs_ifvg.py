"""
🌺 Begonya - FVG vs iFVG (Inversion Fair Value Gap) Karşılaştırmalı 1 Aylık Backtest
Bu script, aynı 1 aylık veri seti ve aynı risk parametreleri altında:
1) Standart FVG Giriş Modeli
2) iFVG (Inversion FVG) Giriş Modeli
arasındaki farkları (İşlem Sayısı, Win Rate, Net R, Max Drawdown, TP/BE/SL oranları) doğrudan test eder.
"""

import sys
import json
import logging
from datetime import datetime, timezone, timedelta, date
from pathlib import Path
root_dir = Path(__file__).resolve().parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

from typing import Dict, Any, List, Optional, Tuple
import pandas as pd
import numpy as np
import MetaTrader5 as mt5

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

from sfp_orb_engine.config import get_asset_sl_buffer, is_crypto
from sfp_orb_engine.entry_mechanics import calculate_ce_entry, is_slice_through_candle
from sfp_orb_engine.macro_gated_3m_backtest import DailyMacroGateTable
from sfp_orb_engine.custom_1m_backtest import SYMBOLS, FOREX_SYMBOLS, EXCLUDED_SYMBOLS, Custom1MBacktestRunner

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("Begonya.FvgVsIfvgComparison")


def detect_ifvg_short(i: int, highs: np.ndarray, lows: np.ndarray, closes: np.ndarray, c_atr: float, lookback: int = 25) -> Optional[Tuple[float, float]]:
    """
    Ayı Yönlü iFVG Tespiti (Bearish Inversion FVG):
    Daha önce oluşmuş Boğa FVG'sinin (Bullish FVG: lows[k] > highs[k-2])
    fiyat tarafından aşağı yönlü kırılması (closes[i] < highs[k-2]).
    Kırılan bölge artık AYI DİRENCİ (iFVG) olarak çalışır: (tavan: lows[k], taban: highs[k-2])
    """
    for k in range(i - 1, max(2, i - lookback), -1):
        if lows[k] > highs[k - 2]:
            gap_size = lows[k] - highs[k - 2]
            if gap_size >= c_atr * 0.08:
                fvg_top = lows[k]
                fvg_bot = highs[k - 2]
                # Bar i veya i-1 bu boşluğun altına sarkıp kapattı mı?
                if closes[i] < fvg_bot and closes[k] >= fvg_bot:
                    return (fvg_top, fvg_bot)
    return None


def detect_ifvg_long(i: int, highs: np.ndarray, lows: np.ndarray, closes: np.ndarray, c_atr: float, lookback: int = 25) -> Optional[Tuple[float, float]]:
    """
    Boğa Yönlü iFVG Tespiti (Bullish Inversion FVG):
    Daha önce oluşmuş Ayı FVG'sinin (Bearish FVG: lows[k-2] > highs[k])
    fiyat tarafından yukarı yönlü kırılması (closes[i] > lows[k-2]).
    Kırılan bölge artık BOĞA DESTEĞİ (iFVG) olarak çalışır: (taban: highs[k], tavan: lows[k-2])
    """
    for k in range(i - 1, max(2, i - lookback), -1):
        if lows[k - 2] > highs[k]:
            gap_size = lows[k - 2] - highs[k]
            if gap_size >= c_atr * 0.08:
                fvg_top = lows[k - 2]
                fvg_bot = highs[k]
                if closes[i] > fvg_top and closes[k] <= fvg_top:
                    return (fvg_bot, fvg_top)
    return None


def run_single_simulation(
    mode: str = "FVG",  # "FVG" veya "IFVG"
    entry_model: str = "midpoint",
    require_reaction: bool = True,
    use_macro_gate: bool = True
) -> Dict[str, Any]:
    runner = Custom1MBacktestRunner(
        initial_capital=10000.0,
        risk_pct=0.02,
        entry_model=entry_model,
        require_reaction=require_reaction,
        use_macro_gate=use_macro_gate,
    )

    all_trades: List[Dict[str, Any]] = []
    start_ts = pd.Timestamp(runner.utc_from).tz_localize(None)

    for symbol in SYMBOLS:
        if symbol in EXCLUDED_SYMBOLS:
            continue

        df = runner.fetch_m15_data(symbol)
        if df is None or len(df) < 200:
            continue

        n = len(df)
        opens, highs, lows, closes = df["open"].values, df["high"].values, df["low"].values, df["close"].values
        volumes = df["volume"].values
        atrs = df["atr"].values
        pdhs, pdls = df["pdh"].values, df["pdl"].values
        ashs, asls = df["ash"].values, df["asl"].values
        vol_mas = df["vol_sma"].values
        ema50s, ema200s = df["htf_ema50"].values, df["htf_ema200"].values
        weekdays = df["weekday"].values
        hours = df["hour"].values
        minutes = df["minute"].values
        dts = df["datetime"].dt.strftime("%Y-%m-%d %H:%M").values
        dates_raw = df["datetime"].values

        sl_buffer_atr = get_asset_sl_buffer(symbol)
        crypto_sym = is_crypto(symbol)

        active_position = None
        cooldown_until = 0

        for i in range(100, n):
            c_open, c_high, c_low, c_close = opens[i], highs[i], lows[i], closes[i]
            c_atr = atrs[i]
            bar_rng = max(c_high - c_low, 1e-8)
            h_val = hours[i]
            wday = weekdays[i]

            # 1. Aktif Pozisyon Takibi
            if active_position is not None:
                p = active_position
                entry, sl, tp1, tp2 = p["entry"], p["current_sl"], p["tp1"], p["tp2"]
                p_dir = p["direction"]
                status = p["status"]

                if status == "PENDING_LIMIT":
                    p["bars_waiting"] += 1
                    if p["bars_waiting"] >= 32:
                        active_position = None
                        continue

                    is_long = (p_dir == "LONG")
                    stop_hit = (c_low <= sl) if is_long else (c_high >= sl)
                    reach_entry = (c_low <= entry) if is_long else (c_high >= entry)

                    if stop_hit and not reach_entry:
                        active_position = None
                        continue

                    if reach_entry:
                        if runner.require_reaction:
                            zone_l = p.get("zone_low", entry)
                            zone_h = p.get("zone_high", entry)
                            if is_slice_through_candle(p_dir, c_open, c_high, c_low, c_close, zone_l, zone_h):
                                active_position = None
                                continue

                        p["status"] = "OPEN"
                        status = "OPEN"
                    else:
                        continue

                p["bars_held"] += 1
                closed = False
                r_res = 0.0

                if p_dir == "LONG":
                    if c_high >= tp1 and status == "OPEN":
                        p["status"] = "TP1_HIT"
                        p["current_sl"] = entry
                        sl = entry

                    if c_high >= tp2:
                        closed = True
                        reason = "TP2_HIT"
                        r_res = 2.0
                    elif c_low <= sl:
                        closed = True
                        reason = "BREAK_EVEN" if status == "TP1_HIT" else "STOP_LOSS"
                        r_res = 0.5 if status == "TP1_HIT" else -1.0
                    elif p["bars_held"] >= 192:
                        closed = True
                        reason = "TIME_EXIT"
                        r_res = (c_close - entry) / max(entry - p["original_sl"], 1e-8)

                else:  # SHORT
                    if c_low <= tp1 and status == "OPEN":
                        p["status"] = "TP1_HIT"
                        p["current_sl"] = entry
                        sl = entry

                    if c_low <= tp2:
                        closed = True
                        reason = "TP2_HIT"
                        r_res = 2.0
                    elif c_high >= sl:
                        closed = True
                        reason = "BREAK_EVEN" if status == "TP1_HIT" else "STOP_LOSS"
                        r_res = 0.5 if status == "TP1_HIT" else -1.0
                    elif p["bars_held"] >= 192:
                        closed = True
                        reason = "TIME_EXIT"
                        r_res = (entry - c_close) / max(p["original_sl"] - entry, 1e-8)

                if closed:
                    p["closed_at"] = dts[i]
                    p["close_reason"] = reason
                    p["r_result"] = round(r_res, 2)
                    all_trades.append(p)
                    active_position = None
                    cooldown_until = i + 3
                continue

            bar_dt = pd.Timestamp(dates_raw[i]).tz_localize(None)
            if bar_dt < start_ts:
                continue
            if i < cooldown_until:
                continue

            is_weekend = (wday >= 5)
            if is_weekend and not crypto_sym:
                continue

            allow_long, allow_short = True, True
            if runner.use_macro_gate and runner.macro_table:
                cur_dt = pd.to_datetime(dates_raw[i]).to_pydatetime()
                gate_val = runner.macro_table.get_gate(cur_dt, symbol)
                if gate_val in ["NEUTRAL_RANGE", "NO_TRADE", "DEFENSIVE_HOLD", "VETO"]:
                    allow_short = False
                    allow_long = False
                elif gate_val == "SHORT_ONLY":
                    allow_long = False
                elif gate_val == "LONG_ONLY":
                    allow_short = False

            if not allow_long and not allow_short:
                continue

            # Seans Kontrolü
            sfp_session_active = False
            if is_weekend:
                if crypto_sym and ((7 <= h_val <= 11) or (13 <= h_val <= 17)):
                    sfp_session_active = True
            else:
                if (7 <= h_val <= 11) or (13 <= h_val <= 17):
                    sfp_session_active = True

            htf_bull = (c_close > ema50s[i] > ema200s[i])
            htf_bear = (c_close < ema50s[i] < ema200s[i])

            # A. SFP ARAMA
            sfp_sig = None
            if sfp_session_active:
                if allow_short:
                    for j in [i-1, i-2, i-3]:
                        if j < 10:
                            continue
                        j_rng = max(highs[j] - lows[j], 1e-8)
                        j_u_wick = (highs[j] - max(opens[j], closes[j])) / j_rng
                        if j_u_wick < 0.45:
                            continue

                        j_pdh = pdhs[j]
                        j_ash = ashs[j]
                        sw_hi = False
                        p_name = ""
                        if highs[j] > j_pdh and closes[j] < j_pdh:
                            sw_hi = True
                            p_name = "PDH"
                        elif (7 <= hours[j] <= 11) and j_ash > 0.0 and highs[j] > j_ash and closes[j] < j_ash:
                            sw_hi = True
                            p_name = "ASIAN_HIGH"

                        if not sw_hi:
                            continue

                        peak = highs[j]
                        if any(highs[m] > peak for m in range(j+1, i+1)):
                            continue

                        mss_trig = min(lows[j], lows[j-1])
                        if any(closes[m] < mss_trig for m in range(j+1, i)):
                            continue

                        if closes[i] < mss_trig:
                            b_disp = abs(closes[i] - opens[i]) / bar_rng
                            if b_disp >= 0.35:
                                # Mode bazlı FVG vs IFVG Tespiti
                                target_zone = None
                                if mode == "FVG":
                                    has_fvg = (lows[i-2] > highs[i]) and ((lows[i-2] - highs[i]) >= c_atr * 0.10)
                                    target_zone = (lows[i-2], highs[i]) if has_fvg else None
                                    grade = "AAA" if (htf_bear and has_fvg) else ("A+" if (htf_bear or has_fvg) else "A")
                                else:  # IFVG
                                    ifvg_r = detect_ifvg_short(i, highs, lows, closes, c_atr)
                                    target_zone = ifvg_r
                                    has_ifvg = (ifvg_r is not None)
                                    grade = "AAA" if (htf_bear and has_ifvg) else ("A+" if (htf_bear or has_ifvg) else "A")

                                if grade in ["AAA", "A+"]:
                                    ce_calc = calculate_ce_entry(
                                        direction="SHORT",
                                        peak_or_valley=peak,
                                        trigger_price=mss_trig,
                                        close_price=closes[i],
                                        fvg_range=target_zone,
                                        atr=c_atr,
                                        sl_buffer_atr=sl_buffer_atr,
                                        entry_model=runner.entry_model,
                                        tp1_r=1.0,
                                        tp2_r=3.0,
                                    )
                                    sfp_sig = {
                                        "strategy": f"SFP_{mode}",
                                        "direction": "SHORT",
                                        "grade": grade,
                                        "entry": ce_calc["entry_price"],
                                        "sl": ce_calc["stop_loss"],
                                        "tp1": ce_calc["tp1"],
                                        "tp2": ce_calc["tp2"],
                                        "risk": ce_calc["risk_distance"],
                                        "zone_low": ce_calc["zone_low"],
                                        "zone_high": ce_calc["zone_high"],
                                        "is_limit": ce_calc["is_limit"],
                                        "pool": p_name,
                                        "trigger_time": dts[i],
                                    }
                                    break

                if allow_long and sfp_sig is None:
                    for j in [i-1, i-2, i-3]:
                        if j < 10:
                            continue
                        j_rng = max(highs[j] - lows[j], 1e-8)
                        j_l_wick = (min(opens[j], closes[j]) - lows[j]) / j_rng
                        if j_l_wick < 0.45:
                            continue

                        j_pdl = pdls[j]
                        j_asl = asls[j]
                        sw_lo = False
                        p_name = ""
                        if lows[j] < j_pdl and closes[j] > j_pdl:
                            sw_lo = True
                            p_name = "PDL"
                        elif (7 <= hours[j] <= 11) and j_asl > 0.0 and lows[j] < j_asl and closes[j] > j_asl:
                            sw_lo = True
                            p_name = "ASIAN_LOW"

                        if not sw_lo:
                            continue

                        valley = lows[j]
                        if any(lows[m] < valley for m in range(j+1, i+1)):
                            continue

                        mss_trig = max(highs[j], highs[j-1])
                        if any(closes[m] > mss_trig for m in range(j+1, i)):
                            continue

                        if closes[i] > mss_trig:
                            b_disp = abs(closes[i] - opens[i]) / bar_rng
                            if b_disp >= 0.35:
                                target_zone = None
                                if mode == "FVG":
                                    has_fvg = (lows[i] > highs[i-2]) and ((lows[i] - highs[i-2]) >= c_atr * 0.10)
                                    target_zone = (lows[i], highs[i-2]) if has_fvg else None
                                    grade = "AAA" if (htf_bull and has_fvg) else ("A+" if (htf_bull or has_fvg) else "A")
                                else:  # IFVG
                                    ifvg_r = detect_ifvg_long(i, highs, lows, closes, c_atr)
                                    target_zone = ifvg_r
                                    has_ifvg = (ifvg_r is not None)
                                    grade = "AAA" if (htf_bull and has_ifvg) else ("A+" if (htf_bull or has_ifvg) else "A")

                                if grade in ["AAA", "A+"]:
                                    ce_calc = calculate_ce_entry(
                                        direction="LONG",
                                        peak_or_valley=valley,
                                        trigger_price=mss_trig,
                                        close_price=closes[i],
                                        fvg_range=target_zone,
                                        atr=c_atr,
                                        sl_buffer_atr=sl_buffer_atr,
                                        entry_model=runner.entry_model,
                                        tp1_r=1.0,
                                        tp2_r=3.0,
                                    )
                                    sfp_sig = {
                                        "strategy": f"SFP_{mode}",
                                        "direction": "LONG",
                                        "grade": grade,
                                        "entry": ce_calc["entry_price"],
                                        "sl": ce_calc["stop_loss"],
                                        "tp1": ce_calc["tp1"],
                                        "tp2": ce_calc["tp2"],
                                        "risk": ce_calc["risk_distance"],
                                        "zone_low": ce_calc["zone_low"],
                                        "zone_high": ce_calc["zone_high"],
                                        "is_limit": ce_calc["is_limit"],
                                        "pool": p_name,
                                        "trigger_time": dts[i],
                                    }
                                    break

            chosen_sig = sfp_sig

            if chosen_sig is not None:
                ent_price = chosen_sig["entry"]
                sl_price = chosen_sig["sl"]
                is_l = (chosen_sig["direction"] == "LONG")

                risk_val = (ent_price - sl_price) if is_l else (sl_price - ent_price)
                if risk_val > 1e-6:
                    active_position = {
                        "symbol": symbol,
                        "direction": chosen_sig["direction"],
                        "strategy": chosen_sig["strategy"],
                        "grade": chosen_sig["grade"],
                        "opened_at": dts[i],
                        "entry": ent_price,
                        "original_sl": sl_price,
                        "current_sl": sl_price,
                        "tp1": chosen_sig["tp1"],
                        "tp2": chosen_sig["tp2"],
                        "risk_dist": risk_val,
                        "zone_low": chosen_sig.get("zone_low", ent_price),
                        "zone_high": chosen_sig.get("zone_high", ent_price),
                        "status": "PENDING_LIMIT" if chosen_sig["is_limit"] else "OPEN",
                        "bars_waiting": 0,
                        "bars_held": 0,
                    }

    # Sonuçların Hesaplanması
    total_trades = len(all_trades)
    tp2_hits = sum(1 for t in all_trades if t["close_reason"] == "TP2_HIT")
    be_hits = sum(1 for t in all_trades if t["close_reason"] == "BREAK_EVEN")
    sl_hits = sum(1 for t in all_trades if t["close_reason"] == "STOP_LOSS")
    time_exits = sum(1 for t in all_trades if t["close_reason"] == "TIME_EXIT")

    winning_trades = tp2_hits + be_hits + sum(1 for t in all_trades if t["close_reason"] == "TIME_EXIT" and t["r_result"] > 0)
    win_rate = round((winning_trades / total_trades * 100), 1) if total_trades > 0 else 0.0
    total_net_r = round(sum(t["r_result"] for t in all_trades), 2)

    balance_fixed = runner.initial_capital
    risk_dollar = runner.initial_capital * runner.risk_pct
    balance_dyn = runner.initial_capital
    peak_dyn = runner.initial_capital
    max_dd_pct = 0.0

    for t in all_trades:
        r = t["r_result"]
        balance_fixed += (r * risk_dollar)
        trade_risk = balance_dyn * runner.risk_pct
        balance_dyn += (r * trade_risk)
        if balance_dyn > peak_dyn:
            peak_dyn = balance_dyn
        dd = (peak_dyn - balance_dyn) / peak_dyn * 100.0
        if dd > max_dd_pct:
            max_dd_pct = dd

    return {
        "mode": mode,
        "entry_model": entry_model,
        "total_trades": total_trades,
        "tp2_hits": tp2_hits,
        "be_hits": be_hits,
        "sl_hits": sl_hits,
        "time_exits": time_exits,
        "win_rate": f"%{win_rate}",
        "total_net_r": f"{total_net_r}R",
        "ending_balance_fixed": f"${balance_fixed:,.2f}",
        "ending_balance_compounding": f"${balance_dyn:,.2f}",
        "max_drawdown_pct": f"%{max_dd_pct:.2f}",
        "trades": all_trades
    }


if __name__ == "__main__":
    print("\n================================================================================")
    print("      🌺 BEGONYA FVG vs iFVG (INVERSION FVG) 1 AYLIK KARŞILAŞTIRMA TESTİ 🌺     ")
    print("================================================================================\n")

    # 1. Close Modeli ile FVG vs iFVG
    print("⏳ Model 1: Close (Kapanış Teyidi) ile FVG test ediliyor...")
    res_fvg_close = run_single_simulation(mode="FVG", entry_model="close")

    print("⏳ Model 1: Close (Kapanış Teyidi) ile iFVG test ediliyor...")
    res_ifvg_close = run_single_simulation(mode="IFVG", entry_model="close")

    # 2. Midpoint Modeli ile FVG vs iFVG
    print("⏳ Model 2: Midpoint (%50 CE) ile FVG test ediliyor...")
    res_fvg_mid = run_single_simulation(mode="FVG", entry_model="midpoint")

    print("⏳ Model 2: Midpoint (%50 CE) ile iFVG test ediliyor...")
    res_ifvg_mid = run_single_simulation(mode="IFVG", entry_model="midpoint")

    comparison = {
        "CLOSE_MODEL": {
            "STANDARD_FVG": {
                "trades": res_fvg_close["total_trades"],
                "win_rate": res_fvg_close["win_rate"],
                "tp2": res_fvg_close["tp2_hits"],
                "be": res_fvg_close["be_hits"],
                "sl": res_fvg_close["sl_hits"],
                "net_r": res_fvg_close["total_net_r"],
                "ending_balance": res_fvg_close["ending_balance_fixed"],
                "max_dd": res_fvg_close["max_drawdown_pct"],
            },
            "INVERSION_FVG": {
                "trades": res_ifvg_close["total_trades"],
                "win_rate": res_ifvg_close["win_rate"],
                "tp2": res_ifvg_close["tp2_hits"],
                "be": res_ifvg_close["be_hits"],
                "sl": res_ifvg_close["sl_hits"],
                "net_r": res_ifvg_close["total_net_r"],
                "ending_balance": res_ifvg_close["ending_balance_fixed"],
                "max_dd": res_ifvg_close["max_drawdown_pct"],
            }
        },
        "MIDPOINT_MODEL": {
            "STANDARD_FVG": {
                "trades": res_fvg_mid["total_trades"],
                "win_rate": res_fvg_mid["win_rate"],
                "tp2": res_fvg_mid["tp2_hits"],
                "be": res_fvg_mid["be_hits"],
                "sl": res_fvg_mid["sl_hits"],
                "net_r": res_fvg_mid["total_net_r"],
                "ending_balance": res_fvg_mid["ending_balance_fixed"],
                "max_dd": res_fvg_mid["max_drawdown_pct"],
            },
            "INVERSION_FVG": {
                "trades": res_ifvg_mid["total_trades"],
                "win_rate": res_ifvg_mid["win_rate"],
                "tp2": res_ifvg_mid["tp2_hits"],
                "be": res_ifvg_mid["be_hits"],
                "sl": res_ifvg_mid["sl_hits"],
                "net_r": res_ifvg_mid["total_net_r"],
                "ending_balance": res_ifvg_mid["ending_balance_fixed"],
                "max_dd": res_ifvg_mid["max_drawdown_pct"],
            }
        }
    }

    print("\n================================================================================")
    print("                     📊 KARŞILAŞTIRMALI TEST SONUÇLARI 📊                       ")
    print("================================================================================")
    print(json.dumps(comparison, indent=2, ensure_ascii=False))

    out_file = Path("data") / "fvg_vs_ifvg_comparison.json"
    out_file.parent.mkdir(parents=True, exist_ok=True)
    out_file.write_text(json.dumps(comparison, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\n✅ Sonuçlar {out_file} dosyasına kaydedildi.")
