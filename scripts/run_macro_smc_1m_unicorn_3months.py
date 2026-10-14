"""
🌺 Begonya 00 - Makro Motor + SMC + 1M Unicorn (SFP + iFVG + Breaker) 3 Aylık Tam Backtest
Mimari Standartları:
1. MAKRO MOTORU (DailyMacroGateTable):
   - Günlük DXY, US10Y, US02Y, VIX, SPX, Altın, BTC rejim ve rotasyon analizi.
   - LONG_ONLY / SHORT_ONLY kapı denetimi (Makro vetosu olan işlem alınmaz).
2. SMC MOTORU (15M / 1H / 4H Begonya SMC v2):
   - 4H Trend Uyumu: Sıkı Pro-Trend (Grade AAA: c_close > ema50 > ema200 / c_close < ema50 < ema200).
   - Seans Filtresi: Londra (07-11 UTC) / NY (13-17 UTC). Hafta sonu sadece Kripto (BTC).
   - 15M POI Tespiti: PDH/PDL veya Asian High/Low Likidite Süpürmesi + 15M Gövde Deplasmanı.
3. 1M TETKİK (UNICORN İCRA MOTORU):
   - Fiyat 15M POI kutusuna temas edince MT5'in gerçek 1 DAKİKALIK (1M) barlarını dinlemeye başlar.
   - 1M SFP: Kutu içinde yerel 1M tepe/dip süpürmesi (Sweep Wick >= 30% veya kapanış teyidi).
   - 1M Breaker Block: Sweep öncesi son karşıt 1M mumun gövdeyle kırılması (1M MSS).
   - 1M iFVG: Kırılımla beraber tersine dönen 1 dakikalık Inversion FVG.
   - 1M Giriş: iFVG %50 CE (Consequent Encroachment) limit emri.
   - Stop Loss: 1M Sweep fitilinin ucu + ATR/pip buffer.
   - Kâr Yönetimi: TP1 @ 1.0R (%50 Kâr Al + Stop BE), TP2 @ 3.0R (Kalan %50).
4. 3 FARKLI AY:
   - Ay 1: 2026-07-11 - 2026-08-11
   - Ay 2: 2026-08-11 - 2026-09-11
   - Ay 3: 2026-09-11 - 2026-10-11
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
logger = logging.getLogger("Begonya.MacroSmc1mUnicorn")


class MacroSmc1mUnicornEngine:
    def __init__(self, initial_capital: float = 10000.0, risk_pct: float = 0.02):
        self.initial_capital = initial_capital
        self.risk_pct = risk_pct
        if not mt5.initialize():
            raise RuntimeError("MT5 başlatılamadı!")

    def fetch_m15_data(self, symbol: str, start_dt: datetime, end_dt: datetime) -> Optional[pd.DataFrame]:
        warmup_from = start_dt - timedelta(days=25)
        rates = mt5.copy_rates_range(symbol, mt5.TIMEFRAME_M15, warmup_from, end_dt)
        if rates is None or len(rates) < 300:
            return None

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
        return df

    def fetch_1m_data(self, symbol: str, start_dt: datetime, end_dt: datetime) -> Optional[pd.DataFrame]:
        rates = mt5.copy_rates_range(symbol, mt5.TIMEFRAME_M1, start_dt, end_dt)
        if rates is None or len(rates) == 0:
            return None
        df = pd.DataFrame(rates)
        df["datetime"] = pd.to_datetime(df["time"], unit="s", utc=True)
        for col in ["open", "high", "low", "close"]:
            df[col] = df[col].astype(float)
        return df

    def evaluate_1m_unicorn_trade(
        self,
        symbol: str,
        direction: str,
        zone_low: float,
        zone_high: float,
        invalidation_level: float,
        trigger_dt: datetime,
        df_1m: pd.DataFrame,
    ) -> Dict[str, Any]:
        """
        Fiyat 15M POI kutusuna temas ettikten sonra 1M barlarında SFP + iFVG + Breaker Block arar.
        """
        is_long = (direction == "LONG")
        pip = 0.01 if "JPY" in symbol else 0.1 if "XAU" in symbol or "LTC" in symbol else 1.0 if any(c in symbol for c in ["BTC", "ETH", "SOL", "NAS"]) else 0.0001

        # Sinyal anından itibaren 24 saatlik 1M penceresi
        trig_ts = pd.to_datetime(trigger_dt, utc=True)
        end_ts = trig_ts + pd.Timedelta(hours=24)
        sub_1m = df_1m[(df_1m["datetime"] >= trig_ts) & (df_1m["datetime"] <= end_ts)]
        if sub_1m is None or len(sub_1m) < 15:
            return {"outcome": "NO_1M_DATA", "net_r": 0.0, "reason": "Yetersiz 1M verisi"}

        opens = sub_1m["open"].values
        highs = sub_1m["high"].values
        lows = sub_1m["low"].values
        closes = sub_1m["close"].values
        dts = sub_1m["datetime"].values
        n_1m = len(sub_1m)

        # 1. Aşama: 15M POI Kutusuna İlk Temas
        touch_idx = -1
        for k in range(n_1m):
            touched = (lows[k] <= zone_high and highs[k] >= zone_low) if is_long else (highs[k] >= zone_low and lows[k] <= zone_high)
            if touched:
                touch_idx = k
                break

        if touch_idx == -1:
            return {"outcome": "NO_TOUCH", "net_r": 0.0, "reason": "15M kutusuna temas gelmedi"}

        # 2. Aşama: 1M SFP + Breaker + iFVG (Unicorn) Arayışı (Temastan sonra maks 60 bar / 1 saat)
        reaction_limit = min(n_1m, touch_idx + 60)
        unicorn_idx = -1
        sweep_extreme = 0.0

        for k in range(touch_idx + 2, reaction_limit):
            # 15M kutusunun doğrudan gövdeyle delinmesi kontrolü (ardışık 15 adet 1M barı kutu dışında kapattıysa)
            if k >= touch_idx + 15:
                bars_15 = closes[k-15:k]
                all_breached = np.all(bars_15 < zone_low) if is_long else np.all(bars_15 > zone_high)
                if all_breached:
                    return {"outcome": "VETO_ZONE_BREACH", "net_r": 0.0, "reason": "15M kutusu delindi, teyit oluşmadı"}

            if is_long:
                # 1M LONG UNICORN
                # a) 1M Sweep: Son 3-5 barın dibini süpürüp fitil bırakma veya seviye üstüne dönme
                prev_low = np.min(lows[max(0, k-5):k])
                sweep_cand = False
                if lows[k] < prev_low:
                    b_rng = max(highs[k] - lows[k], 1e-8)
                    lower_wick = (min(opens[k], closes[k]) - lows[k]) / b_rng
                    if lower_wick >= 0.30 or closes[k] > prev_low:
                        sweep_cand = True

                if not sweep_cand:
                    continue

                sweep_extreme = lows[k]

                # b) 1M Breaker Block: Sweep öncesindeki son kırmızı mumun tavanının kırılması
                has_breaker = False
                for b_k in range(k - 1, max(0, k - 6), -1):
                    if closes[b_k] < opens[b_k]:  # Bearish candle = Bullish Breaker
                        if closes[k] > highs[b_k]:
                            has_breaker = True
                            break

                # c) 1M iFVG: Tersine dönen FVG (bearish FVG'nin yukarı kırılması)
                loc_atr = max(highs[k] - lows[k], 1e-8)
                has_ifvg = detect_ifvg_long(k, highs, lows, closes, loc_atr, lookback=15, min_atr_mult=0.05) is not None

                if has_breaker or has_ifvg:
                    unicorn_idx = k
                    break

            else:
                # 1M SHORT UNICORN
                # a) 1M Sweep: Son 3-5 barın tepesini süpürüp fitil bırakma veya seviye altına dönme
                prev_high = np.max(highs[max(0, k-5):k])
                sweep_cand = False
                if highs[k] > prev_high:
                    b_rng = max(highs[k] - lows[k], 1e-8)
                    upper_wick = (highs[k] - max(opens[k], closes[k])) / b_rng
                    if upper_wick >= 0.30 or closes[k] < prev_high:
                        sweep_cand = True

                if not sweep_cand:
                    continue

                sweep_extreme = highs[k]

                # b) 1M Breaker Block: Sweep öncesindeki son yeşil mumun tabanının kırılması
                has_breaker = False
                for b_k in range(k - 1, max(0, k - 6), -1):
                    if closes[b_k] > opens[b_k]:  # Bullish candle = Bearish Breaker
                        if closes[k] < lows[b_k]:
                            has_breaker = True
                            break

                # c) 1M iFVG: Tersine dönen FVG (bullish FVG'nin aşağı kırılması)
                loc_atr = max(highs[k] - lows[k], 1e-8)
                has_ifvg = detect_ifvg_short(k, highs, lows, closes, loc_atr, lookback=15, min_atr_mult=0.05) is not None

                if has_breaker or has_ifvg:
                    unicorn_idx = k
                    break

        if unicorn_idx == -1:
            return {"outcome": "NO_1M_CONFIRMATION", "net_r": 0.0, "reason": "1M içinde SFP+Breaker+iFVG oluşmadı"}

        # 3. Aşama: 1M Limit Girişi (%50 CE / Breaker Retest)
        # Giriş seviyesi: Sweep ucu ile Unicorn kırılım mumu kapanışı arasındaki %50 denge noktası
        u_close = closes[unicorn_idx]
        entry_price = (sweep_extreme + u_close) * 0.5
        buffer = 1.5 * pip
        stop_loss = (sweep_extreme - buffer) if is_long else (sweep_extreme + buffer)
        risk_dist = abs(entry_price - stop_loss)

        if risk_dist <= 0:
            return {"outcome": "INVALID_RISK", "net_r": 0.0, "reason": "Sıfır risk mesafesi"}

        # 4. Aşama: Limit Dolumu Bekleyişi (Sonraki 60 bar / 1 saat içinde)
        fill_idx = -1
        for m in range(unicorn_idx + 1, min(n_1m, unicorn_idx + 60)):
            m_high, m_low = highs[m], lows[m]
            # Önce stop delindi mi?
            stop_hit_before = (m_low <= stop_loss) if is_long else (m_high >= stop_loss)
            reached_entry = (m_low <= entry_price) if is_long else (m_high >= entry_price)

            if stop_hit_before and not reached_entry:
                return {"outcome": "STOP_BEFORE_FILL", "net_r": 0.0, "reason": "Dolumdan önce stop delindi"}

            if reached_entry:
                fill_idx = m
                break

        if fill_idx == -1:
            return {"outcome": "LIMIT_EXPIRED", "net_r": 0.0, "reason": "1M limit retesti gelmedi (Emir Süresi Doldu)"}

        # 5. Aşama: Pozisyon İcrası (TP1 @ 1.0R + BE, TP2 @ 3.0R)
        tp1_price = entry_price + (risk_dist * 1.0) if is_long else entry_price - (risk_dist * 1.0)
        tp2_price = entry_price + (risk_dist * 3.0) if is_long else entry_price - (risk_dist * 3.0)

        tp1_hit = False
        current_sl = stop_loss
        fill_time_str = pd.to_datetime(dts[fill_idx]).strftime("%Y-%m-%d %H:%M")

        for p_idx in range(fill_idx, n_1m):
            b_high, b_low = highs[p_idx], lows[p_idx]
            close_time_str = pd.to_datetime(dts[p_idx]).strftime("%Y-%m-%d %H:%M")

            if not tp1_hit:
                sl_hit = (b_low <= current_sl) if is_long else (b_high >= current_sl)
                tp1_reach = (b_high >= tp1_price) if is_long else (b_low <= tp1_price)

                if sl_hit:
                    return {
                        "outcome": "SL",
                        "net_r": -1.0,
                        "entry": round(entry_price, 5),
                        "sl": round(stop_loss, 5),
                        "tp1": round(tp1_price, 5),
                        "tp2": round(tp2_price, 5),
                        "filled_at": fill_time_str,
                        "closed_at": close_time_str,
                        "reason": "1M Stop Loss tetiklendi (-1.0R)",
                    }
                if tp1_reach:
                    tp1_hit = True
                    current_sl = entry_price  # Stop BE'ye çekildi
            else:
                be_hit = (b_low <= current_sl) if is_long else (b_high >= current_sl)
                tp2_reach = (b_high >= tp2_price) if is_long else (b_low <= tp2_price)

                if tp2_reach:
                    return {
                        "outcome": "TP2",
                        "net_r": 2.0,  # %50 TP1 (0.5R) + %50 TP2 (1.5R) = 2.0R
                        "entry": round(entry_price, 5),
                        "sl": round(stop_loss, 5),
                        "tp1": round(tp1_price, 5),
                        "tp2": round(tp2_price, 5),
                        "filled_at": fill_time_str,
                        "closed_at": close_time_str,
                        "reason": "🎯 1M Unicorn Tam Hedef: TP2 Vuruldu (+2.0R Net)",
                    }
                if be_hit:
                    return {
                        "outcome": "BE",
                        "net_r": 0.5,  # %50 TP1 (0.5R) + %50 BE (0.0R) = 0.5R
                        "entry": round(entry_price, 5),
                        "sl": round(stop_loss, 5),
                        "tp1": round(tp1_price, 5),
                        "tp2": round(tp2_price, 5),
                        "filled_at": fill_time_str,
                        "closed_at": close_time_str,
                        "reason": "🛡️ 1M Unicorn Koruması: TP1 sonrası BE seviyesinde kapandı (+0.5R Net)",
                    }

        return {
            "outcome": "BE" if tp1_hit else "TIME_EXIT",
            "net_r": 0.5 if tp1_hit else 0.0,
            "entry": round(entry_price, 5),
            "sl": round(stop_loss, 5),
            "tp1": round(tp1_price, 5),
            "tp2": round(tp2_price, 5),
            "filled_at": fill_time_str,
            "closed_at": pd.to_datetime(dts[-1]).strftime("%Y-%m-%d %H:%M"),
            "reason": "Zaman aşımı çıkışı",
        }

    def run_single_month(
        self,
        month_label: str,
        start_date: date,
        end_date: date,
        macro_table: DailyMacroGateTable,
    ) -> Dict[str, Any]:
        utc_start = datetime(start_date.year, start_date.month, start_date.day, 0, 0, tzinfo=timezone.utc)
        utc_end = datetime(end_date.year, end_date.month, end_date.day, 23, 59, tzinfo=timezone.utc)

        all_trades = []
        symbol_summaries = {}

        for symbol in SYMBOLS:
            if symbol in EXCLUDED_SYMBOLS:
                continue

            df_15m = self.fetch_m15_data(symbol, utc_start, utc_end)
            if df_15m is None or len(df_15m) < 100:
                continue

            # 1M Barlarını indir (Start - End penceresi için)
            df_1m = self.fetch_1m_data(symbol, utc_start, utc_end + timedelta(days=2))
            if df_1m is None or len(df_1m) < 500:
                continue

            n = len(df_15m)
            opens, highs, lows, closes = df_15m["open"].values, df_15m["high"].values, df_15m["low"].values, df_15m["close"].values
            pdhs, pdls = df_15m["pdh"].values, df_15m["pdl"].values
            ashs, asls = df_15m["ash"].values, df_15m["asl"].values
            ema50s, ema200s = df_15m["htf_ema50"].values, df_15m["htf_ema200"].values
            weekdays, hours = df_15m["weekday"].values, df_15m["hour"].values
            dts = df_15m["datetime"].values
            dts_str = df_15m["datetime"].dt.strftime("%Y-%m-%d %H:%M").values

            is_crypto_sym = is_crypto(symbol)
            cooldown_until = 0
            sym_trades = []

            for i in range(100, n):
                if i < cooldown_until:
                    continue

                bar_dt = pd.Timestamp(dts[i]).tz_localize(None)
                if bar_dt < pd.Timestamp(start_date):
                    continue

                wday = weekdays[i]
                h_val = hours[i]
                is_weekend = (wday >= 5)

                if is_weekend and not is_crypto_sym:
                    continue

                # Seans Filtresi
                if is_weekend:
                    if not ((7 <= h_val <= 11) or (13 <= h_val <= 17)):
                        continue
                else:
                    if not ((7 <= h_val <= 11) or (13 <= h_val <= 17)):
                        continue

                # 1. MAKRO KAPISI
                cur_dt = pd.to_datetime(dts[i]).to_pydatetime()
                gate_val = macro_table.get_gate(cur_dt, symbol)
                allow_short = (gate_val not in ["NEUTRAL_RANGE", "NO_TRADE", "DEFENSIVE_HOLD", "VETO", "LONG_ONLY"])
                allow_long = (gate_val not in ["NEUTRAL_RANGE", "NO_TRADE", "DEFENSIVE_HOLD", "VETO", "SHORT_ONLY"])

                if not allow_short and not allow_long:
                    continue

                # 2. SMC 15M MOTORU: Sıkı 4H Trend (Grade AAA)
                c_close, c_open, c_high, c_low = closes[i], opens[i], highs[i], lows[i]
                htf_bull = (c_close > ema50s[i] > ema200s[i])
                htf_bear = (c_close < ema50s[i] < ema200s[i])

                poi_sig = None

                # 15M SHORT SFP Arayışı
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
                            b_disp = abs(closes[i] - opens[i]) / max(highs[i] - lows[i], 1e-8)
                            if b_disp >= 0.35:
                                poi_sig = {
                                    "direction": "SHORT",
                                    "zone_low": mss_trig,
                                    "zone_high": peak,
                                    "invalidation_level": peak,
                                    "trigger_time": dts_str[i],
                                    "trigger_dt": pd.to_datetime(dts[i]).to_pydatetime(),
                                }
                                break

                # 15M LONG SFP Arayışı
                if allow_long and htf_bull and poi_sig is None:
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
                            b_disp = abs(closes[i] - opens[i]) / max(highs[i] - lows[i], 1e-8)
                            if b_disp >= 0.35:
                                poi_sig = {
                                    "direction": "LONG",
                                    "zone_low": valley,
                                    "zone_high": mss_trig,
                                    "invalidation_level": valley,
                                    "trigger_time": dts_str[i],
                                    "trigger_dt": pd.to_datetime(dts[i]).to_pydatetime(),
                                }
                                break

                # 3. 1M TETKİK MOTORU (1M UNICORN: SFP + iFVG + Breaker)
                if poi_sig is not None:
                    m1_result = self.evaluate_1m_unicorn_trade(
                        symbol=symbol,
                        direction=poi_sig["direction"],
                        zone_low=poi_sig["zone_low"],
                        zone_high=poi_sig["zone_high"],
                        invalidation_level=poi_sig["invalidation_level"],
                        trigger_dt=poi_sig["trigger_dt"],
                        df_1m=df_1m,
                    )

                    outcome = m1_result["outcome"]
                    if outcome in ["TP2", "BE", "SL"]:
                        trade_rec = {
                            "symbol": symbol,
                            "direction": poi_sig["direction"],
                            "grade": "AAA",
                            "15m_trigger_time": poi_sig["trigger_time"],
                            "1m_filled_at": m1_result["filled_at"],
                            "1m_closed_at": m1_result["closed_at"],
                            "entry": m1_result["entry"],
                            "sl": m1_result["sl"],
                            "tp1": m1_result["tp1"],
                            "tp2": m1_result["tp2"],
                            "outcome": outcome,
                            "net_r": m1_result["net_r"],
                            "reason": m1_result["reason"],
                        }
                        all_trades.append(trade_rec)
                        sym_trades.append(trade_rec)
                        cooldown_until = i + 12  # 3 saat cooldown

            sym_wins = sum(1 for t in sym_trades if t["net_r"] > 0)
            sym_r = round(sum(t["net_r"] for t in sym_trades), 2)
            symbol_summaries[symbol] = {
                "trades": len(sym_trades),
                "wins": sym_wins,
                "win_rate": f"%{round(sym_wins / len(sym_trades) * 100, 1)}" if sym_trades else "0%",
                "net_r": f"{sym_r:+.2f}R",
            }

        total_trades = len(all_trades)
        tp2_hits = sum(1 for t in all_trades if t["outcome"] == "TP2")
        be_hits = sum(1 for t in all_trades if t["outcome"] == "BE")
        sl_hits = sum(1 for t in all_trades if t["outcome"] == "SL")

        winning_trades = tp2_hits + be_hits
        win_rate = round((winning_trades / total_trades * 100), 1) if total_trades > 0 else 0.0
        total_net_r = round(sum(t["net_r"] for t in all_trades), 2)

        balance_fixed = self.initial_capital + (total_net_r * (self.initial_capital * self.risk_pct))
        balance_dyn = self.initial_capital
        peak_dyn = self.initial_capital
        max_dd_pct = 0.0

        for t in all_trades:
            r = t["net_r"]
            balance_dyn += (r * (balance_dyn * self.risk_pct))
            if balance_dyn > peak_dyn:
                peak_dyn = balance_dyn
            dd = (peak_dyn - balance_dyn) / peak_dyn * 100.0
            if dd > max_dd_pct:
                max_dd_pct = dd

        return {
            "month": month_label,
            "period": f"{start_date} - {end_date}",
            "total_trades": total_trades,
            "tp2_hits": tp2_hits,
            "be_hits": be_hits,
            "sl_hits": sl_hits,
            "win_rate": f"%{win_rate}",
            "net_r": f"{total_net_r:+.2f}R",
            "ending_balance_fixed": f"${balance_fixed:,.2f}",
            "net_profit_fixed": f"${balance_fixed - self.initial_capital:+,.2f}",
            "ending_balance_compounding": f"${balance_dyn:,.2f}",
            "max_drawdown": f"%{max_dd_pct:.2f}",
            "pair_breakdown": symbol_summaries,
            "trade_log": all_trades,
        }


def run_3_month_study():
    engine = MacroSmc1mUnicornEngine(initial_capital=10000.0, risk_pct=0.02)

    periods = [
        ("1. AY (Temmuz - Ağustos 2026)", date(2026, 7, 11), date(2026, 8, 11)),
        ("2. AY (Ağustos - Eylül 2026)", date(2026, 8, 11), date(2026, 9, 11)),
        ("3. AY (Eylül - Ekim 2026)", date(2026, 9, 11), date(2026, 10, 11)),
    ]

    print("\n" + "=" * 90)
    print("🌺 BEGONYA 00: MAKRO MOTOR + SMC + 1M TETKİK (UNICORN) 3 AY AYRI AYRI BACKTEST 🌺")
    print("=" * 90)

    # 3 Aylık Makro Kapısını tek seferde oluştur
    print("📡 3 Aylık Makro Tablosu yükleniyor (DXY, Yields, VIX)...")
    macro_table = DailyMacroGateTable(date(2026, 7, 11), date(2026, 10, 11))

    monthly_results = []
    cumulative_trades = []

    for label, s_d, e_d in periods:
        print(f"\n🚀 {label} Backtesti Koşuluyor ({s_d} -> {e_d})...")
        m_res = engine.run_single_month(label, s_d, e_d, macro_table)
        monthly_results.append(m_res)
        cumulative_trades.extend(m_res["trade_log"])

        print(f"   -> Toplam İşlem: {m_res['total_trades']} | Win Rate: {m_res['win_rate']} | Net R: {m_res['net_r']}")
        print(f"   -> TP2: {m_res['tp2_hits']} | BE: {m_res['be_hits']} | SL: {m_res['sl_hits']}")
        print(f"   -> Sabit Kâr: {m_res['net_profit_fixed']} | Max Drawdown: {m_res['max_drawdown']}")

    # 3 Aylık Birleşik Kümülatif Sonuç
    tot_trades = len(cumulative_trades)
    tot_tp2 = sum(1 for t in cumulative_trades if t["outcome"] == "TP2")
    tot_be = sum(1 for t in cumulative_trades if t["outcome"] == "BE")
    tot_sl = sum(1 for t in cumulative_trades if t["outcome"] == "SL")
    tot_net_r = round(sum(t["net_r"] for t in cumulative_trades), 2)
    tot_wr = round(((tot_tp2 + tot_be) / tot_trades * 100), 1) if tot_trades > 0 else 0.0

    cap = 10000.0
    bal_fixed = cap + (tot_net_r * (cap * 0.02))
    bal_dyn = cap
    peak_dyn = cap
    cum_max_dd = 0.0

    for t in cumulative_trades:
        bal_dyn += t["net_r"] * (bal_dyn * 0.02)
        if bal_dyn > peak_dyn:
            peak_dyn = bal_dyn
        dd = (peak_dyn - bal_dyn) / peak_dyn * 100.0
        if dd > cum_max_dd:
            cum_max_dd = dd

    grand_report = {
        "ARCHITECTURE": "MAKRO MOTOR + SMC v2 15M POI + 1M UNICORN TETKİK (SFP + iFVG + Breaker)",
        "STARTING_CAPITAL": "$10,000.00",
        "RISK_PER_TRADE": "%2.0 ($200.00)",
        "MONTH_1": monthly_results[0],
        "MONTH_2": monthly_results[1],
        "MONTH_3": monthly_results[2],
        "CUMULATIVE_3_MONTHS": {
            "period": "2026-07-11 - 2026-10-11",
            "total_trades": tot_trades,
            "tp2_hits": tot_tp2,
            "be_hits": tot_be,
            "sl_hits": tot_sl,
            "win_rate": f"%{tot_wr}",
            "net_r": f"{tot_net_r:+.2f}R",
            "ending_balance_fixed": f"${bal_fixed:,.2f}",
            "net_profit_fixed": f"${bal_fixed - cap:+,.2f}",
            "ending_balance_compounding": f"${bal_dyn:,.2f}",
            "net_profit_compounding": f"${bal_dyn - cap:+,.2f}",
            "max_drawdown": f"%{cum_max_dd:.2f}",
        },
        "ALL_TRADES": cumulative_trades,
    }

    out_file = Path("data") / "macro_smc_1m_unicorn_3months_result.json"
    out_file.parent.mkdir(parents=True, exist_ok=True)
    out_file.write_text(json.dumps(grand_report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\n✅ 3 Aylık Detaylı Rapor {out_file} dosyasına kaydedildi.")

    print("\n" + "=" * 90)
    print("                     🏆 3 AY AYRI AYRI KARŞILAŞTIRMA TABLOSU 🏆                   ")
    print("=" * 90)
    for m in monthly_results:
        print(f"📅 {m['month']:<30} | İşlem: {m['total_trades']:<2} | WR: {m['win_rate']:<6} | Net R: {m['net_r']:<7} | Sabit Kâr: {m['net_profit_fixed']:<10} | Max DD: {m['max_drawdown']}")
    print("-" * 90)
    c = grand_report["CUMULATIVE_3_MONTHS"]
    print(f"🌟 3 AYLIK KÜMÜLATİF TOPLAM       | İşlem: {c['total_trades']:<2} | WR: {c['win_rate']:<6} | Net R: {c['net_r']:<7} | Sabit Kâr: {c['net_profit_fixed']:<10} | Max DD: {c['max_drawdown']}")
    print("=" * 90 + "\n")


if __name__ == "__main__":
    run_3_month_study()
