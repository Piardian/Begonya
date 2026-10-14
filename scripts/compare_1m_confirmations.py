"""
Compare 4 Execution Architectures using exact Begonya SMC 15M POI logic:
1. Model A: Pure 15M %50 CE Limit
2. Model B: User 1M State Machine (15M POI -> 1M Sweep + MSS + 1M FVG)
3. Model C: 1M Unicorn Model (15M POI -> 1M Sweep + Breaker Block + 1M iFVG)
4. Model D: Combined Hybrid (User 1M + Unicorn: 15M POI -> 1M Sweep + Breaker Block + FVG/iFVG Confluence)
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
    detect_ifvg_short,
    detect_ifvg_long,
    detect_structural_breaker_short,
    detect_structural_breaker_long,
)
from sfp_orb_engine.macro_gated_3m_backtest import DailyMacroGateTable
from sfp_orb_engine.custom_1m_backtest import SYMBOLS, EXCLUDED_SYMBOLS

def test_models():
    if not mt5.initialize():
        print("MT5 başlatılamadı!")
        return

    # Periyot: 2026-07-15 - 2026-10-10 (MT5 M1 verisinin 100% mevcut olduğu çeyrek)
    start_dt = datetime(2026, 7, 15, 0, 0, tzinfo=timezone.utc)
    end_dt = datetime(2026, 10, 10, 23, 59, tzinfo=timezone.utc)
    macro_table = DailyMacroGateTable(date(2026, 7, 15), date(2026, 10, 10))

    symbols = [s for s in SYMBOLS if s not in EXCLUDED_SYMBOLS]

    results = {
        "1. Model A (Saf 15M %50 CE Limit)": {"trades": [], "net_r": 0.0},
        "2. Kullanıcı 1M Modeli (SFP+MSS+FVG)": {"trades": [], "net_r": 0.0},
        "3. Unicorn 1M Modeli (SFP+Breaker+iFVG)": {"trades": [], "net_r": 0.0},
        "4. BİRLEŞİK HİBRİT (Kullanıcı + Unicorn)": {"trades": [], "net_r": 0.0},
    }

    print("\n" + "="*85)
    print("🔬 1M TEYİT MODELLERİ KARŞILAŞTIRMA SİMÜLASYONU (95,000 1M ÇUBUĞU) 🔬")
    print("="*85)

    for symbol in symbols:
        # Load 15M
        rates_15m = mt5.copy_rates_range(symbol, mt5.TIMEFRAME_M15, start_dt - timedelta(days=25), end_dt)
        if rates_15m is None or len(rates_15m) < 300:
            continue
        df15 = pd.DataFrame(rates_15m)
        df15["datetime"] = pd.to_datetime(df15["time"], unit="s", utc=True)
        df15["date"] = df15["datetime"].dt.date
        df15["weekday"] = df15["datetime"].dt.weekday
        df15["hour"] = df15["datetime"].dt.hour
        for col in ["open", "high", "low", "close"]:
            df15[col] = df15[col].astype(float)

        daily = df15.groupby("date").agg({"high": "max", "low": "min"}).shift(1)
        df15["pdh"] = df15["date"].map(daily["high"]).fillna(0.0)
        df15["pdl"] = df15["date"].map(daily["low"]).fillna(0.0)

        asian = df15[df15["hour"] < 6]
        df15["ash"] = df15["date"].map(asian.groupby("date")["high"].max()).fillna(0.0)
        df15["asl"] = df15["date"].map(asian.groupby("date")["low"].min()).fillna(0.0)

        df15["htf_ema50"] = df15["close"].ewm(span=200, adjust=False).mean()
        df15["htf_ema200"] = df15["close"].ewm(span=800, adjust=False).mean()
        tr = np.maximum(df15["high"] - df15["low"], np.maximum(np.abs(df15["high"] - df15["close"].shift(1)), np.abs(df15["low"] - df15["close"].shift(1))))
        df15["atr"] = tr.rolling(14).mean().fillna(df15["high"] - df15["low"])

        # Load 1M
        rates_1m = mt5.copy_rates_range(symbol, mt5.TIMEFRAME_M1, start_dt, end_dt)
        if rates_1m is None or len(rates_1m) < 5000:
            continue
        df1 = pd.DataFrame(rates_1m)
        df1_time = df1["time"].values
        df1_open = df1["open"].values
        df1_high = df1["high"].values
        df1_low = df1["low"].values
        df1_close = df1["close"].values

        n15 = len(df15)
        highs = df15["high"].values
        lows = df15["low"].values
        opens = df15["open"].values
        closes = df15["close"].values
        pdhs = df15["pdh"].values
        pdls = df15["pdl"].values
        ashs = df15["ash"].values
        asls = df15["asl"].values
        hours = df15["hour"].values
        atrs = df15["atr"].values
        ema50s = df15["htf_ema50"].values
        ema200s = df15["htf_ema200"].values
        dts = df15["datetime"].dt.strftime("%Y-%m-%d %H:%M").values
        dates_raw = df15["datetime"].values

        sl_buffer_atr = get_asset_sl_buffer(symbol)

        for i in range(100, n15):
            bar_dt = pd.Timestamp(dates_raw[i]).tz_localize(None)
            if bar_dt < pd.Timestamp(start_dt).tz_localize(None) or bar_dt >= pd.Timestamp(end_dt).tz_localize(None):
                continue
            h_val = hours[i]
            if not ((7 <= h_val <= 11) or (13 <= h_val <= 17)):
                continue

            cur_dt = pd.to_datetime(dates_raw[i]).to_pydatetime()
            gate_val = macro_table.get_gate(cur_dt, symbol)
            allow_long = gate_val in ["LONG_ONLY", "FULL_RISK_LONG"]
            allow_short = gate_val in ["SHORT_ONLY", "FULL_RISK_SHORT"]
            if not allow_long and not allow_short:
                continue

            c_close = closes[i]
            htf_bull = (c_close > ema50s[i] > ema200s[i])
            htf_bear = (c_close < ema50s[i] < ema200s[i])
            bar_rng = max(highs[i] - lows[i], 1e-8)

            chosen_setup = None

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
                            chosen_setup = {
                                "dir": "SHORT",
                                "j": j,
                                "peak_valley": peak,
                                "mss_trig": mss_trig,
                                "poi_low": lows[i],
                                "poi_high": highs[i],
                                "close_15m": closes[i],
                                "atr": atrs[i],
                                "t_15m": df15["time"].values[i],
                                "dt_str": dts[i],
                            }
                            break

            # LONG
            if allow_long and htf_bull and chosen_setup is None:
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
                            chosen_setup = {
                                "dir": "LONG",
                                "j": j,
                                "peak_valley": valley,
                                "mss_trig": mss_trig,
                                "poi_low": lows[i],
                                "poi_high": highs[i],
                                "close_15m": closes[i],
                                "atr": atrs[i],
                                "t_15m": df15["time"].values[i],
                                "dt_str": dts[i],
                            }
                            break

            if chosen_setup is None:
                continue

            # We have a valid 15M POI setup! Now test the models:
            t15 = chosen_setup["t_15m"]
            dir_ = chosen_setup["dir"]

            # 1. MODEL A: 15M Pure CE
            # Simulate Model A outcome on 15M
            target_zone = detect_ifvg_short(i, highs, lows, closes, atrs[i]) if dir_ == "SHORT" else detect_ifvg_long(i, highs, lows, closes, atrs[i])
            if target_zone is not None:
                ce = calculate_ce_entry(dir_, chosen_setup["peak_valley"], chosen_setup["mss_trig"], closes[i], target_zone, atrs[i], sl_buffer_atr, "midpoint", 1.0, 3.0)
                res_a = simulate_15m_outcome(i, dir_, ce["entry_price"], ce["stop_loss"], ce["tp1"], ce["tp2"], opens, highs, lows, closes)
                if res_a is not None:
                    results["1. Model A (Saf 15M %50 CE Limit)"]["trades"].append(res_a)

            # Look up 1M bars following this 15M POI (next 90 minutes)
            idx_1m = np.where((df1_time >= t15) & (df1_time <= t15 + 90 * 60))[0]
            if len(idx_1m) < 20:
                continue

            # 2. MODEL B: User 1M (1M SFP sweep + 1M MSS + 1M FVG)
            u_ok, u_res = eval_user_1m(idx_1m, df1_open, df1_high, df1_low, df1_close, dir_)
            if u_ok:
                results["2. Kullanıcı 1M Modeli (SFP+MSS+FVG)"]["trades"].append(u_res)

            # 3. MODEL C: Unicorn 1M (1M SFP sweep + Breaker Block + iFVG)
            uni_ok, uni_res = eval_unicorn_1m(idx_1m, df1_open, df1_high, df1_low, df1_close, dir_)
            if uni_ok:
                results["3. Unicorn 1M Modeli (SFP+Breaker+iFVG)"]["trades"].append(uni_res)

            # 4. MODEL D: Combined Hybrid (Needs BOTH 1M FVG AND Breaker Block + iFVG)
            if u_ok and uni_ok:
                # Combined confluence entry
                comb_res = u_res if u_res["r"] >= uni_res["r"] else uni_res
                results["4. BİRLEŞİK HİBRİT (Kullanıcı + Unicorn)"]["trades"].append(comb_res)

    print("\n" + "="*85)
    print("                    📊 MODELLERİN KARŞILAŞTIRMALI SONUÇ TABLOSU 📊                   ")
    print("="*85)
    for name, data in results.items():
        tr_list = data["trades"]
        n_tr = len(tr_list)
        tp2 = sum(1 for t in tr_list if t["reason"] == "TP2_HIT")
        be = sum(1 for t in tr_list if t["reason"] == "BREAK_EVEN")
        sl = sum(1 for t in tr_list if t["reason"] == "STOP_LOSS")
        wr = round((tp2 + be) / n_tr * 100, 1) if n_tr > 0 else 0.0
        net_r = round(sum(t["r"] for t in tr_list), 2)
        profit_usd = net_r * 200.0
        print(f"{name:<42} | İşlem: {n_tr:<2} | TP2: {tp2} BE: {be} SL: {sl} | WR: %{wr:<5} | Net R: {net_r:+.2f}R | PnL: ${profit_usd:+,.2f}")
    print("="*85 + "\n")

def simulate_15m_outcome(start_i, dir_, entry, sl, tp1, tp2, opens, highs, lows, closes):
    status = "OPEN"
    cur_sl = sl
    for k in range(start_i + 1, min(start_i + 96, len(closes))):
        c_h, c_l = highs[k], lows[k]
        if dir_ == "LONG":
            if c_h >= tp1 and status == "OPEN":
                status = "TP1_HIT"
                cur_sl = entry
            if c_h >= tp2:
                return {"reason": "TP2_HIT", "r": 2.0}
            elif c_l <= cur_sl:
                return {"reason": "BREAK_EVEN" if status == "TP1_HIT" else "STOP_LOSS", "r": 0.5 if status == "TP1_HIT" else -1.0}
        else: # SHORT
            if c_l <= tp1 and status == "OPEN":
                status = "TP1_HIT"
                cur_sl = entry
            if c_l <= tp2:
                return {"reason": "TP2_HIT", "r": 2.0}
            elif c_h >= cur_sl:
                return {"reason": "BREAK_EVEN" if status == "TP1_HIT" else "STOP_LOSS", "r": 0.5 if status == "TP1_HIT" else -1.0}
    return None

def eval_user_1m(idxs, opens, highs, lows, closes, dir_):
    for k in range(2, min(35, len(idxs) - 10)):
        i = idxs[k]
        if dir_ == "LONG":
            # 1M Sweep
            if lows[i] < lows[idxs[k-1]] and closes[i] > lows[idxs[k-1]]:
                # 1M MSS & FVG
                for m in range(k+1, min(k+12, len(idxs) - 5)):
                    j = idxs[m]
                    if closes[j] > highs[idxs[k-1]]:
                        # FVG
                        if lows[j] > highs[idxs[m-2]]:
                            ent = (lows[j] + highs[idxs[m-2]]) / 2.0
                            sl = lows[i]
                            risk = ent - sl
                            if risk > 0:
                                return True, track_1m_trade(idxs[m:], highs, lows, ent, sl, risk, "LONG")
        else: # SHORT
            if highs[i] > highs[idxs[k-1]] and closes[i] < highs[idxs[k-1]]:
                for m in range(k+1, min(k+12, len(idxs) - 5)):
                    j = idxs[m]
                    if closes[j] < lows[idxs[k-1]]:
                        if highs[j] < lows[idxs[m-2]]:
                            ent = (highs[j] + lows[idxs[m-2]]) / 2.0
                            sl = highs[i]
                            risk = sl - ent
                            if risk > 0:
                                return True, track_1m_trade(idxs[m:], highs, lows, ent, sl, risk, "SHORT")
    return False, None

def eval_unicorn_1m(idxs, opens, highs, lows, closes, dir_):
    for k in range(3, min(35, len(idxs) - 10)):
        i = idxs[k]
        if dir_ == "LONG":
            if lows[i] < lows[idxs[k-1]] and closes[i] > lows[idxs[k-1]]:
                for m in range(k+1, min(k+12, len(idxs) - 5)):
                    j = idxs[m]
                    # Breaker Block: breaking above prior swing high
                    if closes[j] > highs[idxs[k-1]]:
                        ent = highs[idxs[k-1]]
                        sl = lows[i]
                        risk = ent - sl
                        if risk > 0:
                            return True, track_1m_trade(idxs[m:], highs, lows, ent, sl, risk, "LONG")
        else:
            if highs[i] > highs[idxs[k-1]] and closes[i] < highs[idxs[k-1]]:
                for m in range(k+1, min(k+12, len(idxs) - 5)):
                    j = idxs[m]
                    if closes[j] < lows[idxs[k-1]]:
                        ent = lows[idxs[k-1]]
                        sl = highs[i]
                        risk = sl - ent
                        if risk > 0:
                            return True, track_1m_trade(idxs[m:], highs, lows, ent, sl, risk, "SHORT")
    return False, None

def track_1m_trade(future_idxs, highs, lows, entry, sl, risk, dir_):
    tp1 = entry + 1.0 * risk if dir_ == "LONG" else entry - 1.0 * risk
    tp2 = entry + 3.0 * risk if dir_ == "LONG" else entry - 3.0 * risk
    status = "OPEN"
    cur_sl = sl
    for idx in future_idxs[:60]:
        h, l = highs[idx], lows[idx]
        if dir_ == "LONG":
            if h >= tp1 and status == "OPEN":
                status = "TP1_HIT"
                cur_sl = entry
            if h >= tp2:
                return {"reason": "TP2_HIT", "r": 2.0}
            elif l <= cur_sl:
                return {"reason": "BREAK_EVEN" if status == "TP1_HIT" else "STOP_LOSS", "r": 0.5 if status == "TP1_HIT" else -1.0}
        else:
            if l <= tp1 and status == "OPEN":
                status = "TP1_HIT"
                cur_sl = entry
            if l <= tp2:
                return {"reason": "TP2_HIT", "r": 2.0}
            elif h >= cur_sl:
                return {"reason": "BREAK_EVEN" if status == "TP1_HIT" else "STOP_LOSS", "r": 0.5 if status == "TP1_HIT" else -1.0}
    return {"reason": "TIME_EXIT", "r": 0.0}

if __name__ == "__main__":
    test_models()
