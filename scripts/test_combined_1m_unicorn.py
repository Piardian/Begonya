"""
Test and compare:
Option 1: User's Original 1M Confirmation (SFP + MSS + Classical FVG)
Option 2: Unicorn 1M Confirmation (SFP + Breaker Block + iFVG)
Option 3: Combined Hybrid Confirmation (SFP + Breaker Block + Both FVG and iFVG Confluence)
"""

import sys
import json
from datetime import datetime, timezone, timedelta, date
from pathlib import Path
import pandas as pd
import numpy as np
import MetaTrader5 as mt5

root_dir = Path(__file__).resolve().parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

from sfp_orb_engine.config import get_asset_sl_buffer, is_crypto
from sfp_orb_engine.entry_mechanics import (
    calculate_ce_entry,
    is_slice_through_candle,
    detect_ifvg_short,
    detect_ifvg_long,
    detect_structural_breaker_short,
    detect_structural_breaker_long,
)
from sfp_orb_engine.macro_gated_3m_backtest import DailyMacroGateTable
from sfp_orb_engine.custom_1m_backtest import SYMBOLS, EXCLUDED_SYMBOLS

def run_comparison(period_label: str, utc_from: datetime, utc_to: datetime):
    if not mt5.initialize():
        print("MT5 başlatılamadı!")
        return

    macro_table = DailyMacroGateTable(utc_from.date(), utc_to.date())
    symbols = [s for s in SYMBOLS if s not in EXCLUDED_SYMBOLS]

    # Model 1: User Classical FVG (no breaker, no ifvg)
    # Model 2: Unicorn (Breaker + iFVG)
    # Model 3: Combined (Breaker + BOTH Classical FVG & iFVG)

    results = {
        "1. Kullanıcı 1M (SFP + MSS + Klasik FVG)": {"trades": []},
        "2. Unicorn 1M (SFP + Breaker + iFVG)": {"trades": []},
        "3. Birleşik Kurgu (SFP + Breaker + Klasik FVG + iFVG)": {"trades": []},
    }

    warmup_from = utc_from - timedelta(days=25)
    cache = {}

    for sym in symbols:
        rates = mt5.copy_rates_range(sym, mt5.TIMEFRAME_M15, warmup_from, utc_to)
        if rates is None or len(rates) < 300:
            continue
        df = pd.DataFrame(rates)
        df["datetime"] = pd.to_datetime(df["time"], unit="s", utc=True)
        for col in ["open", "high", "low", "close"]:
            df[col] = df[col].astype(float)
        df["date"] = df["datetime"].dt.date
        df["weekday"] = df["datetime"].dt.weekday
        df["hour"] = df["datetime"].dt.hour
        daily = df.groupby("date").agg({"high": "max", "low": "min"}).shift(1)
        df["pdh"] = df["date"].map(daily["high"]).fillna(0.0)
        df["pdl"] = df["date"].map(daily["low"]).fillna(0.0)
        asian = df[df["hour"] < 6]
        df["ash"] = df["date"].map(asian.groupby("date")["high"].max()).fillna(0.0)
        df["asl"] = df["date"].map(asian.groupby("date")["low"].min()).fillna(0.0)
        df["htf_ema50"] = df["close"].ewm(span=200, adjust=False).mean()
        df["htf_ema200"] = df["close"].ewm(span=800, adjust=False).mean()
        tr = np.maximum(df["high"] - df["low"], np.maximum(np.abs(df["high"] - df["close"].shift(1)), np.abs(df["low"] - df["close"].shift(1))))
        df["atr"] = tr.rolling(14).mean().fillna(df["high"] - df["low"])
        cache[sym] = df

    for model_name, model_mode in [
        ("1. Kullanıcı 1M (SFP + MSS + Klasik FVG)", "user_fvg"),
        ("2. Unicorn 1M (SFP + Breaker + iFVG)", "unicorn"),
        ("3. Birleşik Kurgu (SFP + Breaker + Klasik FVG + iFVG)", "combined"),
    ]:
        all_tr = []
        for sym, df in cache.items():
            tr_list = simulate_symbol(sym, df, macro_table, utc_from, utc_to, model_mode)
            all_tr.extend(tr_list)
        results[model_name]["trades"] = all_tr

    print("\n" + "="*95)
    print(f"📊 {period_label.upper()} SONUÇLARI ({utc_from.strftime('%Y-%m-%d')} - {utc_to.strftime('%Y-%m-%d')}) 📊")
    print("="*95)
    for name, data in results.items():
        tr_list = data["trades"]
        n_tr = len(tr_list)
        tp2 = sum(1 for t in tr_list if t["close_reason"] == "TP2_HIT")
        be = sum(1 for t in tr_list if t["close_reason"] == "BREAK_EVEN")
        sl = sum(1 for t in tr_list if t["close_reason"] == "STOP_LOSS")
        wr = round((tp2 + be) / n_tr * 100, 1) if n_tr > 0 else 0.0
        net_r = round(sum(t["r_result"] for t in tr_list), 2)
        profit_usd = net_r * 200.0
        print(f"{name:<52} | İşlem: {n_tr:<2} | TP2: {tp2:<2} BE: {be:<2} SL: {sl:<2} | WR: %{wr:<5} | Net R: {net_r:+.2f}R | PnL: ${profit_usd:+,.2f}")
    print("="*95)

    return results

def simulate_symbol(symbol: str, df: pd.DataFrame, macro_table: DailyMacroGateTable, utc_from: datetime, utc_to: datetime, model_mode: str):
    n = len(df)
    opens = df["open"].values
    highs = df["high"].values
    lows = df["low"].values
    closes = df["close"].values
    pdhs = df["pdh"].values
    pdls = df["pdl"].values
    ashs = df["ash"].values
    asls = df["asl"].values
    atrs = df["atr"].values
    ema50s = df["htf_ema50"].values
    ema200s = df["htf_ema200"].values
    weekdays = df["weekday"].values
    hours = df["hour"].values
    dts = df["datetime"].dt.strftime("%Y-%m-%d %H:%M").values
    dates_raw = df["datetime"].values

    start_ts = pd.Timestamp(utc_from).tz_localize(None)
    end_ts = pd.Timestamp(utc_to).tz_localize(None)

    sl_buffer_atr = get_asset_sl_buffer(symbol)
    crypto_sym = is_crypto(symbol)

    trades = []
    active_position = None
    cooldown_until = 0

    for i in range(100, n):
        c_open, c_high, c_low, c_close = opens[i], highs[i], lows[i], closes[i]
        c_atr = atrs[i]
        bar_rng = max(c_high - c_low, 1e-8)
        h_val = hours[i]
        wday = weekdays[i]

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
            else:
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
                trades.append(p)
                active_position = None
                cooldown_until = i + 3
            continue

        bar_dt = pd.Timestamp(dates_raw[i]).tz_localize(None)
        if bar_dt < start_ts or bar_dt >= end_ts or i < cooldown_until:
            continue

        is_weekend = (wday >= 5)
        if is_weekend and not crypto_sym:
            continue
        if not ((7 <= h_val <= 11) or (13 <= h_val <= 17)):
            continue

        cur_dt = pd.to_datetime(dates_raw[i]).to_pydatetime()
        gate_val = macro_table.get_gate(cur_dt, symbol)
        allow_long = gate_val in ["LONG_ONLY", "FULL_RISK_LONG"]
        allow_short = gate_val in ["SHORT_ONLY", "FULL_RISK_SHORT"]
        if not allow_long and not allow_short:
            continue

        htf_bull = (c_close > ema50s[i] > ema200s[i])
        htf_bear = (c_close < ema50s[i] < ema200s[i])

        chosen_sig = None

        # SHORT
        if allow_short and htf_bear:
            for j in [i-1, i-2, i-3]:
                if j < 25:
                    continue
                j_rng = max(highs[j] - lows[j], 1e-8)
                j_u_wick = (highs[j] - max(opens[j], closes[j])) / j_rng
                if j_u_wick < 0.45:
                    continue
                j_pdh, j_ash = pdhs[j], ashs[j]
                sw_hi = (highs[j] > j_pdh and closes[j] < j_pdh) or ((7 <= hours[j] <= 11) and j_ash > 0.0 and highs[j] > j_ash and closes[j] < j_ash)
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
                        # Conditions depending on model:
                        has_classical_fvg = (lows[i-2] > highs[i]) and ((lows[i-2] - highs[i]) >= c_atr * 0.08)
                        has_breaker = detect_structural_breaker_short(j, i, highs, lows, opens, closes)
                        ifvg_zone = detect_ifvg_short(i, highs, lows, closes, c_atr)
                        has_ifvg = ifvg_zone is not None

                        target_zone = None
                        qualifies = False

                        if model_mode == "user_fvg":
                            if has_classical_fvg:
                                qualifies = True
                                target_zone = (float(lows[i-2]), float(highs[i]))
                        elif model_mode == "unicorn":
                            if has_breaker and has_ifvg:
                                qualifies = True
                                target_zone = ifvg_zone
                        elif model_mode == "combined":
                            # Combined: Must have Breaker AND (Classical FVG OR iFVG)
                            # Even stricter: Breaker AND BOTH Classical FVG AND iFVG!
                            if has_breaker and has_ifvg and has_classical_fvg:
                                qualifies = True
                                # Overlap zone
                                target_zone = (min(float(lows[i-2]), ifvg_zone[0]), max(float(highs[i]), ifvg_zone[1]))

                        if qualifies and target_zone is not None:
                            ce_calc = calculate_ce_entry(
                                direction="SHORT",
                                peak_or_valley=peak,
                                trigger_price=mss_trig,
                                close_price=closes[i],
                                fvg_range=target_zone,
                                atr=c_atr,
                                sl_buffer_atr=sl_buffer_atr,
                                entry_model="midpoint",
                                tp1_r=1.0,
                                tp2_r=3.0,
                            )
                            chosen_sig = {
                                "direction": "SHORT",
                                "entry": ce_calc["entry_price"],
                                "sl": ce_calc["stop_loss"],
                                "tp1": ce_calc["tp1"],
                                "tp2": ce_calc["tp2"],
                                "zone_low": ce_calc["zone_low"],
                                "zone_high": ce_calc["zone_high"],
                                "is_limit": ce_calc["is_limit"],
                            }
                            break

        # LONG
        if allow_long and htf_bull and chosen_sig is None:
            for j in [i-1, i-2, i-3]:
                if j < 25:
                    continue
                j_rng = max(highs[j] - lows[j], 1e-8)
                j_l_wick = (min(opens[j], closes[j]) - lows[j]) / j_rng
                if j_l_wick < 0.45:
                    continue
                j_pdl, j_asl = pdls[j], asls[j]
                sw_lo = (lows[j] < j_pdl and closes[j] > j_pdl) or ((7 <= hours[j] <= 11) and j_asl > 0.0 and lows[j] < j_asl and closes[j] > j_asl)
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
                        has_classical_fvg = (highs[i-2] < lows[i]) and ((lows[i] - highs[i-2]) >= c_atr * 0.08)
                        has_breaker = detect_structural_breaker_long(j, i, highs, lows, opens, closes)
                        ifvg_zone = detect_ifvg_long(i, highs, lows, closes, c_atr)
                        has_ifvg = ifvg_zone is not None

                        target_zone = None
                        qualifies = False

                        if model_mode == "user_fvg":
                            if has_classical_fvg:
                                qualifies = True
                                target_zone = (float(highs[i-2]), float(lows[i]))
                        elif model_mode == "unicorn":
                            if has_breaker and has_ifvg:
                                qualifies = True
                                target_zone = ifvg_zone
                        elif model_mode == "combined":
                            if has_breaker and has_ifvg and has_classical_fvg:
                                qualifies = True
                                target_zone = (max(float(highs[i-2]), ifvg_zone[0]), min(float(lows[i]), ifvg_zone[1]))

                        if qualifies and target_zone is not None:
                            ce_calc = calculate_ce_entry(
                                direction="LONG",
                                peak_or_valley=valley,
                                trigger_price=mss_trig,
                                close_price=closes[i],
                                fvg_range=target_zone,
                                atr=c_atr,
                                sl_buffer_atr=sl_buffer_atr,
                                entry_model="midpoint",
                                tp1_r=1.0,
                                tp2_r=3.0,
                            )
                            chosen_sig = {
                                "direction": "LONG",
                                "entry": ce_calc["entry_price"],
                                "sl": ce_calc["stop_loss"],
                                "tp1": ce_calc["tp1"],
                                "tp2": ce_calc["tp2"],
                                "zone_low": ce_calc["zone_low"],
                                "zone_high": ce_calc["zone_high"],
                                "is_limit": ce_calc["is_limit"],
                            }
                            break

        if chosen_sig is not None:
            active_position = {
                "symbol": symbol,
                "direction": chosen_sig["direction"],
                "opened_at": dts[i],
                "entry": chosen_sig["entry"],
                "original_sl": chosen_sig["sl"],
                "current_sl": chosen_sig["sl"],
                "tp1": chosen_sig["tp1"],
                "tp2": chosen_sig["tp2"],
                "zone_low": chosen_sig["zone_low"],
                "zone_high": chosen_sig["zone_high"],
                "status": "PENDING_LIMIT" if chosen_sig["is_limit"] else "OPEN",
                "bars_waiting": 0,
                "bars_held": 0,
            }

    return trades

if __name__ == "__main__":
    # Test on 1-Month (Sept 11 - Oct 11, 2026)
    run_comparison("Son 1 Ay", datetime(2026, 9, 11, 0, 0, tzinfo=timezone.utc), datetime(2026, 10, 11, 23, 59, tzinfo=timezone.utc))
    
    # Test on 3-Month (July 11 - Oct 11, 2026)
    run_comparison("Son 3 Ay (Yaz-Sonbahar)", datetime(2026, 7, 11, 0, 0, tzinfo=timezone.utc), datetime(2026, 10, 11, 23, 59, tzinfo=timezone.utc))

    # Test on Spring 3-Month (March 1 - May 31, 2026)
    run_comparison("İlkbahar 3 Ay (Mart-Mayıs)", datetime(2026, 3, 1, 0, 0, tzinfo=timezone.utc), datetime(2026, 5, 31, 23, 59, tzinfo=timezone.utc))
