"""
🌺 Begonya 00 - Mart, Nisan, Mayıs 2026 (İlkbahar Çeyreği) Tam Kapsamlı Backtest
Mimari Standartları:
1. MAKRO MOTORU (DailyMacroGateTable):
   - Mart, Nisan, Mayıs 2026 için günlük DXY, US10Y, US02Y, VIX, SPX rejimleri.
   - Sadece makro onaylı yönlere işlem açılır (VETO ve Zıt yönler filtrelenir).
2. SMC 15M MOTORU (Begonya SMC v2):
   - 4H EMA Trend (Grade AAA Sıkı Uyum).
   - Seans Pencereleri: Londra (07-11 UTC) / New York (13-17 UTC).
   - 15M POI: Asya Seansı / PDH / PDL Likidite Süpürmesi + 15M Deplasman.
3. TETKİK & İCRAAT KATMANI:
   - A) 15M Model A: Saf %50 CE (Consequent Encroachment) Limit + Dinamik Buffer
   - B) LTF Unicorn Teyit Modeli: POI Kutusuna Giriş + Sweep (SFP) + Breaker Block + iFVG
4. PERİYOTLAR:
   - 1. Ay (Mart 2026): 2026-03-01 - 2026-04-01
   - 2. Ay (Nisan 2026): 2026-04-01 - 2026-05-01
   - 3. Ay (Mayıs 2026): 2026-05-01 - 2026-06-01
   - Kümülatif 3 Aylık İlkbahar Karnesi
"""

import sys
import json
import logging
from datetime import datetime, timezone, timedelta, date
from pathlib import Path
from typing import Dict, Any, List, Optional
import pandas as pd
import numpy as np
import MetaTrader5 as mt5

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

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

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("Begonya.SpringBacktest")


def load_quarter_data(utc_from: datetime, utc_to: datetime) -> Dict[str, pd.DataFrame]:
    if not mt5.initialize():
        raise RuntimeError("MT5 başlatılamadı!")

    warmup_from = utc_from - timedelta(days=25)
    cache: Dict[str, pd.DataFrame] = {}

    for symbol in SYMBOLS:
        if symbol in EXCLUDED_SYMBOLS:
            continue
        rates = mt5.copy_rates_range(symbol, mt5.TIMEFRAME_M15, warmup_from, utc_to)
        if rates is None or len(rates) < 300:
            continue

        df = pd.DataFrame(rates)
        df["datetime"] = pd.to_datetime(df["time"], unit="s", utc=True)
        df.rename(columns={"tick_volume": "volume"}, inplace=True)
        for col in ["open", "high", "low", "close", "volume"]:
            df[col] = df[col].astype(float)

        df["date"] = df["datetime"].dt.date
        df["weekday"] = df["datetime"].dt.weekday
        df["hour"] = df["datetime"].dt.hour
        df["minute"] = df["datetime"].dt.minute

        daily = df.groupby("date").agg({"high": "max", "low": "min"}).shift(1)
        df["pdh"] = df["date"].map(daily["high"]).fillna(0.0)
        df["pdl"] = df["date"].map(daily["low"]).fillna(0.0)

        asian_bars = df[df["hour"] < 6]
        ash_map = asian_bars.groupby("date")["high"].max()
        asl_map = asian_bars.groupby("date")["low"].min()
        df["ash"] = df["date"].map(ash_map).fillna(0.0)
        df["asl"] = df["date"].map(asl_map).fillna(0.0)

        df["htf_ema50"] = df["close"].ewm(span=200, adjust=False).mean()
        df["htf_ema200"] = df["close"].ewm(span=800, adjust=False).mean()

        tr = np.maximum(
            df["high"] - df["low"],
            np.maximum(
                np.abs(df["high"] - df["close"].shift(1)),
                np.abs(df["low"] - df["close"].shift(1))
            )
        )
        df["atr"] = tr.rolling(14).mean().fillna(df["high"] - df["low"])
        cache[symbol] = df

    return cache


def run_month_simulation(
    cache: Dict[str, pd.DataFrame],
    macro_table: DailyMacroGateTable,
    m_label: str,
    start_dt: datetime,
    end_dt: datetime,
    initial_capital: float = 10000.0,
    risk_pct: float = 0.02,
) -> Dict[str, Any]:
    all_trades = []
    symbol_summaries = {}

    start_ts = pd.Timestamp(start_dt).tz_localize(None)
    end_ts = pd.Timestamp(end_dt).tz_localize(None)

    for symbol, df in cache.items():
        n = len(df)
        opens, highs, lows, closes = df["open"].values, df["high"].values, df["low"].values, df["close"].values
        atrs = df["atr"].values
        pdhs, pdls = df["pdh"].values, df["pdl"].values
        ashs, asls = df["ash"].values, df["asl"].values
        ema50s, ema200s = df["htf_ema50"].values, df["htf_ema200"].values
        weekdays = df["weekday"].values
        hours = df["hour"].values
        dts = df["datetime"].dt.strftime("%Y-%m-%d %H:%M").values
        dates_raw = df["datetime"].values

        sl_buffer_atr = get_asset_sl_buffer(symbol)
        crypto_sym = is_crypto(symbol)

        active_position = None
        cooldown_until = 0
        sym_trades = []

        for i in range(100, n):
            c_open, c_high, c_low, c_close = opens[i], highs[i], lows[i], closes[i]
            c_atr = atrs[i]
            bar_rng = max(c_high - c_low, 1e-8)
            h_val = hours[i]
            wday = weekdays[i]

            # 1. Mevcut Pozisyon Takibi
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
                    sym_trades.append(p)
                    active_position = None
                    cooldown_until = i + 3
                continue

            bar_dt = pd.Timestamp(dates_raw[i]).tz_localize(None)
            if bar_dt < start_ts or bar_dt >= end_ts:
                continue
            if i < cooldown_until:
                continue

            is_weekend = (wday >= 5)
            if is_weekend and not crypto_sym:
                continue

            # Seans Kontrolü
            sfp_session_active = False
            if is_weekend:
                if crypto_sym and ((7 <= h_val <= 11) or (13 <= h_val <= 17)):
                    sfp_session_active = True
            else:
                if (7 <= h_val <= 11) or (13 <= h_val <= 17):
                    sfp_session_active = True

            if not sfp_session_active:
                continue

            # 2. MAKRO KAPISI DENETİMİ
            allow_long, allow_short = True, True
            cur_dt = pd.to_datetime(dates_raw[i]).to_pydatetime()
            gate_val = macro_table.get_gate(cur_dt, symbol)
            if gate_val in ["NEUTRAL_RANGE", "NO_TRADE", "DEFENSIVE_HOLD", "VETO"]:
                allow_short = False
                allow_long = False
            elif gate_val == "SHORT_ONLY":
                allow_long = False
            elif gate_val == "LONG_ONLY":
                allow_short = False

            if not allow_long and not allow_short:
                continue

            # 3. SMC 15M MOTORU (Sıkı Pro-Trend Grade AAA)
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
                            if not detect_structural_breaker_short(j, i, highs, lows, opens, closes):
                                continue

                            target_zone = detect_ifvg_short(i, highs, lows, closes, c_atr)
                            if target_zone is not None:
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
                                    "grade": "AAA",
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
                            if not detect_structural_breaker_long(j, i, highs, lows, opens, closes):
                                continue

                            target_zone = detect_ifvg_long(i, highs, lows, closes, c_atr)
                            if target_zone is not None:
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
                                    "grade": "AAA",
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
                ent_price = chosen_sig["entry"]
                sl_price = chosen_sig["sl"]
                is_l = (chosen_sig["direction"] == "LONG")
                risk_val = (ent_price - sl_price) if is_l else (sl_price - ent_price)
                if risk_val > 1e-6:
                    active_position = {
                        "symbol": symbol,
                        "direction": chosen_sig["direction"],
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

        sym_wins = sum(1 for t in sym_trades if t["r_result"] > 0)
        sym_r = round(sum(t["r_result"] for t in sym_trades), 2)
        symbol_summaries[symbol] = {
            "trades": len(sym_trades),
            "wins": sym_wins,
            "win_rate": f"%{round(sym_wins / len(sym_trades) * 100, 1)}" if sym_trades else "0%",
            "net_r": f"{sym_r:+.2f}R",
        }

    total_trades = len(all_trades)
    tp2_hits = sum(1 for t in all_trades if t["close_reason"] == "TP2_HIT")
    be_hits = sum(1 for t in all_trades if t["close_reason"] == "BREAK_EVEN")
    sl_hits = sum(1 for t in all_trades if t["close_reason"] == "STOP_LOSS")
    winning_trades = tp2_hits + be_hits
    win_rate = round((winning_trades / total_trades * 100), 1) if total_trades > 0 else 0.0
    total_net_r = round(sum(t["r_result"] for t in all_trades), 2)

    balance_fixed = initial_capital + (total_net_r * (initial_capital * risk_pct))
    balance_dyn = initial_capital
    peak_dyn = initial_capital
    max_dd_pct = 0.0

    for t in all_trades:
        r = t["r_result"]
        balance_dyn += (r * (balance_dyn * risk_pct))
        if balance_dyn > peak_dyn:
            peak_dyn = balance_dyn
        dd = (peak_dyn - balance_dyn) / peak_dyn * 100.0
        if dd > max_dd_pct:
            max_dd_pct = dd

    return {
        "month": m_label,
        "period": f"{start_dt.strftime('%Y-%m-%d')} - {end_dt.strftime('%Y-%m-%d')}",
        "total_trades": total_trades,
        "tp2_hits": tp2_hits,
        "be_hits": be_hits,
        "sl_hits": sl_hits,
        "win_rate": f"%{win_rate}",
        "net_r": f"{total_net_r:+.2f}R",
        "ending_balance_fixed": f"${balance_fixed:,.2f}",
        "net_profit_fixed": f"${balance_fixed - initial_capital:+,.2f}",
        "ending_balance_compounding": f"${balance_dyn:,.2f}",
        "max_drawdown": f"%{max_dd_pct:.2f}",
        "pair_breakdown": symbol_summaries,
        "trade_log": [
            f"{t['symbol']} {t['direction']} [{t['grade']}] ({t['opened_at']} -> {t['closed_at']}): {t['close_reason']} ({t['r_result']:+.1f}R)"
            for t in all_trades
        ],
    }


def main():
    s_d = date(2026, 3, 1)
    e_d = date(2026, 5, 31)

    print("\n" + "=" * 90)
    print("🌺 BEGONYA 00: MART - NİSAN - MAYIS 2026 TAM KAPSAMLI KURUMSAL BACKTEST 🌺")
    print("=" * 90)

    print("📡 1/3: Mart - Mayıs Makro Tablosu İndiriliyor (DXY, Yields, VIX)...")
    macro_table = DailyMacroGateTable(s_d, e_d)

    print("📡 2/3: MT5 15M Verileri Önbelleğe Alınıyor (Tier-1 Kurumsal Evren)...")
    utc_from = datetime(2026, 3, 1, 0, 0, tzinfo=timezone.utc)
    utc_to = datetime(2026, 6, 1, 23, 59, tzinfo=timezone.utc)
    cache = load_quarter_data(utc_from, utc_to)
    print(f"   • Yüklenen Çekirdek Pariteler ({len(cache)}): {list(cache.keys())}")

    months = [
        ("1. AY (Mart 2026)", datetime(2026, 3, 1, tzinfo=timezone.utc), datetime(2026, 4, 1, tzinfo=timezone.utc)),
        ("2. AY (Nisan 2026)", datetime(2026, 4, 1, tzinfo=timezone.utc), datetime(2026, 5, 1, tzinfo=timezone.utc)),
        ("3. AY (Mayıs 2026)", datetime(2026, 5, 1, tzinfo=timezone.utc), datetime(2026, 6, 1, tzinfo=timezone.utc)),
    ]

    print("\n🚀 3/3: Aylar Ayrı Ayrı Simüle Ediliyor...")
    m_results = []
    all_trade_logs = []

    for label, s_dt, e_dt in months:
        res = run_month_simulation(cache, macro_table, label, s_dt, e_dt)
        m_results.append(res)
        all_trade_logs.extend(res["trade_log"])
        print(f"\n📅 {label}:")
        print(f"   -> İşlem: {res['total_trades']} | Win Rate: {res['win_rate']} | Net R: {res['net_r']}")
        print(f"   -> TP2: {res['tp2_hits']} | BE: {res['be_hits']} | SL: {res['sl_hits']}")
        print(f"   -> Sabit Kâr: {res['net_profit_fixed']} | Max Drawdown: {res['max_drawdown']}")

    # 3 Aylık Birleşik Toplam
    tot_trades = sum(m["total_trades"] for m in m_results)
    tot_tp2 = sum(m["tp2_hits"] for m in m_results)
    tot_be = sum(m["be_hits"] for m in m_results)
    tot_sl = sum(m["sl_hits"] for m in m_results)
    tot_wr = round(((tot_tp2 + tot_be) / tot_trades * 100), 1) if tot_trades > 0 else 0.0

    r_vals = [float(m["net_r"].replace("R", "")) for m in m_results]
    tot_net_r = round(sum(r_vals), 2)

    bal_fixed = 10000.0 + (tot_net_r * 200.0)

    report = {
        "TITLE": "BEGONYA 00 - MART, NİSAN, MAYIS 2026 KURUMSAL PERFORMANS RAPORU",
        "STARTING_CAPITAL": "$10,000.00",
        "RISK_PER_TRADE": "%2.0 ($200.00)",
        "MONTHS": m_results,
        "CUMULATIVE_SPRING_QUARTER": {
            "period": "2026-03-01 - 2026-05-31 (3 Ay)",
            "total_trades": tot_trades,
            "tp2_hits": tot_tp2,
            "be_hits": tot_be,
            "sl_hits": tot_sl,
            "win_rate": f"%{tot_wr}",
            "net_r": f"{tot_net_r:+.2f}R",
            "ending_balance_fixed": f"${bal_fixed:,.2f}",
            "net_profit_fixed": f"${bal_fixed - 10000.0:+,.2f}",
        },
        "ALL_TRADES": all_trade_logs,
    }

    out_file = Path("data") / "spring_2026_march_april_may_result.json"
    out_file.parent.mkdir(parents=True, exist_ok=True)
    out_file.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\n✅ Sonuçlar {out_file} dosyasına kaydedildi.")

    print("\n" + "=" * 90)
    print("                 🏆 MART - NİSAN - MAYIS 2026 ÖZET KARŞILAŞTIRMA KARNESİ 🏆               ")
    print("=" * 90)
    for m in m_results:
        print(f"📅 {m['month']:<24} | İşlem: {m['total_trades']:<2} | WR: {m['win_rate']:<6} | Net R: {m['net_r']:<7} | Sabit Kâr: {m['net_profit_fixed']:<10} | Max DD: {m['max_drawdown']}")
    print("-" * 90)
    c = report["CUMULATIVE_SPRING_QUARTER"]
    print(f"🌟 3 AYLIK İLKBAHAR TOPLAMI   | İşlem: {c['total_trades']:<2} | WR: {c['win_rate']:<6} | Net R: {c['net_r']:<7} | Sabit Kâr: {c['net_profit_fixed']:<10}")
    print("=" * 90 + "\n")


if __name__ == "__main__":
    main()
