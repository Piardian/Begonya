"""
🌺 Begonya 00 - 1M UNICORN (SFP + iFVG + Breaker Block) & 0.5 Fib Retest Sniper Engine
Mimari:
1) 15M HTF Kutu / POI:
   - 15M mumları takip edilir (Örn: 15M Swing High/Low, FVG veya PDH/PDL bölgesi).
   - 15 dakikalık kutuya fiyatın yaklaşımı ve 15M kapanış delinme kontrolü (veto).
2) 1M İçinde UNICORN Kurulumu:
   - Fiyat 15M POI kutusu içindeyken 1 DAKİKALIK grafikte:
     a) 1M SFP (Önceki tepe/dip likidite alımı / IDM sweep & ters kapanış)
     b) 1M iFVG (Tersine dönen Inversion FVG)
     c) 1M Breaker Block (MSS kırılımı ile oluşan Breaker)
     -> Bu üçlünün kesişimi: 1M UNICORN SETUP!
   - 1M CHoCH / MSS displacement teyidi.
3) Giriş ve Yürütme:
   - Dalganın tepesi ile dibi arasına dinamik 0.5 Fib çekilir (uzadıkça genişler).
   - 0.5 Fib seviyesine limit/piyasa retest emri.
   - %50 TP1 @ 1.0R -> Stop Başabaş (BE).
   - Kalan %50 TP2 @ 3.0R (Toplam +2.0R net).
"""

import sys
import json
import logging
from datetime import datetime, timezone, timedelta
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
    detect_ifvg_short,
    detect_ifvg_long,
    detect_structural_breaker_short,
    detect_structural_breaker_long,
)

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("Begonya.1MUnicornTester")


def calculate_atr(highs: np.ndarray, lows: np.ndarray, closes: np.ndarray, period: int = 14) -> np.ndarray:
    tr = np.zeros(len(highs))
    for i in range(1, len(highs)):
        tr[i] = max(
            highs[i] - lows[i],
            abs(highs[i] - closes[i - 1]),
            abs(lows[i] - closes[i - 1])
        )
    atr = np.zeros(len(highs))
    if len(highs) > period:
        atr[period] = np.mean(tr[1:period + 1])
        for i in range(period + 1, len(highs)):
            atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period
    return atr


class OneMinuteUnicornTester:
    def __init__(self, symbols: List[str] = None):
        if not mt5.initialize():
            logger.error("MT5 initialize failed")
        if symbols is None:
            self.symbols = ["EURUSD", "GBPUSD", "USDJPY", "BTCUSD", "ETHUSD", "SOLUSD", "XAUUSD"]
        else:
            self.symbols = symbols

    def fetch_rates(self, symbol: str, timeframe, start_dt: datetime, end_dt: datetime) -> Optional[pd.DataFrame]:
        rates = mt5.copy_rates_range(symbol, timeframe, start_dt, end_dt)
        if rates is None or len(rates) == 0:
            return None
        df = pd.DataFrame(rates)
        df["datetime"] = pd.to_datetime(df["time"], unit="s", utc=True)
        for col in ["open", "high", "low", "close"]:
            df[col] = df[col].astype(float)
        return df

    def run_backtest_for_symbol(
        self,
        symbol: str,
        start_dt: datetime,
        end_dt: datetime,
        ny_killzone_only: bool = True
    ) -> List[Dict[str, Any]]:
        # 1. 15M Barlarını Çek (15M POI Seviyeleri: Swing High/Low, PDH/PDL, 15M FVG/OB)
        df_15m = self.fetch_rates(symbol, mt5.TIMEFRAME_M15, start_dt - timedelta(days=5), end_dt)
        # 2. 1M Barlarını Çek
        df_1m = self.fetch_rates(symbol, mt5.TIMEFRAME_M1, start_dt, end_dt)

        if df_15m is None or len(df_15m) < 100 or df_1m is None or len(df_1m) < 1000:
            logger.warning(f"⚠️ {symbol} için yeterli veri alınamadı.")
            return []

        # 1M verilerini numpy array'e dök
        m1_times = df_1m["datetime"].values
        m1_opens = df_1m["open"].values
        m1_highs = df_1m["high"].values
        m1_lows = df_1m["low"].values
        m1_closes = df_1m["close"].values
        m1_hours = df_1m["datetime"].dt.hour.values
        m1_atrs = calculate_atr(m1_highs, m1_lows, m1_closes, 14)
        n_1m = len(df_1m)

        # Pip hesaplama
        pip = 0.01 if "JPY" in symbol else 0.1 if "XAU" in symbol or "LTC" in symbol else 1.0 if any(c in symbol for c in ["BTC", "ETH", "SOL", "NAS"]) else 0.0001

        # 15M POI (Kutu) Haritası Oluştur
        # 15M Swing High / Swing Low ve PDH/PDL seviyelerini çıkaralım
        m15_highs = df_15m["high"].values
        m15_lows = df_15m["low"].values
        m15_closes = df_15m["close"].values
        m15_times = df_15m["datetime"].values
        n_15m = len(df_15m)

        # 15M'de son 20 barın tepe/dipleri ve PDH/PDL/FVG kutuları
        boxes_15m = [] # list of (start_time, end_time, zone_low, zone_high, box_type, direction)
        for i in range(20, n_15m):
            t_curr = m15_times[i]
            # 15M Swing High / Low (5 bar sol, 5 bar sağ tepe)
            is_swing_high = all(m15_highs[i-5] >= m15_highs[i-5-k] for k in range(1, 6)) and all(m15_highs[i-5] >= m15_highs[i-5+k] for k in range(1, 6))
            is_swing_low = all(m15_lows[i-5] <= m15_lows[i-5-k] for k in range(1, 6)) and all(m15_lows[i-5] <= m15_lows[i-5+k] for k in range(1, 6))
            
            if is_swing_high:
                # Bearish POI Kutusu (Swing High tepesi ve fitil bölgesi)
                top = m15_highs[i-5]
                bot = max(m15_closes[i-5], m15_highs[i-5] - (top - m15_lows[i-5]) * 0.35)
                boxes_15m.append({
                    "time": t_curr,
                    "direction": "SHORT",
                    "zone_high": float(top),
                    "zone_low": float(bot),
                    "valid_until": t_curr + np.timedelta64(24, 'h')
                })
            elif is_swing_low:
                # Bullish POI Kutusu (Swing Low dibi ve fitil bölgesi)
                bot = m15_lows[i-5]
                top = min(m15_closes[i-5], m15_lows[i-5] + (m15_highs[i-5] - bot) * 0.35)
                boxes_15m.append({
                    "time": t_curr,
                    "direction": "LONG",
                    "zone_high": float(top),
                    "zone_low": float(bot),
                    "valid_until": t_curr + np.timedelta64(24, 'h')
                })

        trades = []
        last_trade_idx = -100

        # Şimdi 1 DAKİKALIK BARLARDA DOLAŞALIM:
        # Fiyat 15M kutusuna girdiğinde -> 1M'DE UNICORN (SFP + iFVG + Breaker) ve 0.5 Fib Retest Arayalım
        for idx in range(50, n_1m - 120):
            if idx < last_trade_idx + 60:
                continue

            cur_time = m1_times[idx]
            cur_hour = m1_hours[idx]

            # Seans Kontrolü (NY Killzone: 13:00 - 17:00 UTC)
            if ny_killzone_only and not (13 <= cur_hour < 17):
                continue

            c_o, c_h, c_l, c_c = m1_opens[idx], m1_highs[idx], m1_lows[idx], m1_closes[idx]
            c_atr = m1_atrs[idx]
            if c_atr <= 0:
                continue

            # Aktif 15M kutusu var mı ve fiyat kutunun içinde mi?
            # En taze kutuları ara
            matching_box = None
            for b in reversed(boxes_15m):
                if b["time"] <= cur_time <= b["valid_until"]:
                    if b["direction"] == "SHORT" and c_h >= b["zone_low"] and c_l <= b["zone_high"]:
                        matching_box = b
                        break
                    elif b["direction"] == "LONG" and c_l <= b["zone_high"] and c_h >= b["zone_low"]:
                        matching_box = b
                        break

            if matching_box is None:
                continue

            trade_dir = matching_box["direction"]

            # =========================================================================
            # 1 DAKİKALIK UNICORN TESPİTİ (1M SFP + 1M iFVG + 1M Breaker Block)
            # =========================================================================
            # 1) 1M SFP (IDM Sweep): Son 3-15 bar içinde önceki 1M tepesini/dibini süpüren mum var mı?
            unicorn_found = False
            sweep_bar = -1
            sweep_price = 0.0

            if trade_dir == "SHORT":
                # SHORT UNICORN:
                # a) 1M Sweep: j barı (idx-1 .. idx-5) önceki yerel tepeyi süpürüp altında kapattı
                for j in range(idx - 1, max(idx - 10, 15), -1):
                    # j'den önceki tepe
                    local_prev_high = np.max(m1_highs[j-5:j])
                    if m1_highs[j] > local_prev_high and m1_closes[j] < local_prev_high:
                        # Sweep gerçekleşti
                        sweep_bar = j
                        sweep_price = m1_highs[j]
                        break

                if sweep_bar == -1:
                    continue

                # b) 1M MSS / Breaker: idx barı sweep sonrası dibin (MSS) altına kırdı mı?
                mss_level = np.min(m1_lows[sweep_bar-2:sweep_bar+1])
                if not (m1_closes[idx] < mss_level):
                    continue

                # c) 1M Displacement kontrolü (gövde oranı >= 0.45)
                b_rng = max(m1_highs[idx] - m1_lows[idx], 1e-8)
                body = abs(m1_closes[idx] - m1_opens[idx])
                if body / b_rng < 0.40:
                    continue

                # d) 1M Breaker Block Kontrolü:
                has_breaker = detect_structural_breaker_short(sweep_bar, idx, m1_highs, m1_lows, m1_opens, m1_closes)
                
                # e) 1M Inversion FVG (iFVG) Kontrolü:
                ifvg_zone = detect_ifvg_short(idx, m1_highs, m1_lows, m1_closes, c_atr, lookback=20, min_atr_mult=0.05)
                
                # UNICORN Onayı: SFP + Breaker + iFVG (veya temiz FVG)
                if has_breaker and (ifvg_zone is not None):
                    unicorn_found = True

            else:
                # LONG UNICORN:
                # a) 1M Sweep: j barı önceki dibi süpürüp üzerinde kapattı
                for j in range(idx - 1, max(idx - 10, 15), -1):
                    local_prev_low = np.min(m1_lows[j-5:j])
                    if m1_lows[j] < local_prev_low and m1_closes[j] > local_prev_low:
                        sweep_bar = j
                        sweep_price = m1_lows[j]
                        break

                if sweep_bar == -1:
                    continue

                # b) 1M MSS / Breaker
                mss_level = np.max(m1_highs[sweep_bar-2:sweep_bar+1])
                if not (m1_closes[idx] > mss_level):
                    continue

                # c) 1M Displacement
                b_rng = max(m1_highs[idx] - m1_lows[idx], 1e-8)
                body = abs(m1_closes[idx] - m1_opens[idx])
                if body / b_rng < 0.40:
                    continue

                # d) 1M Breaker Block
                has_breaker = detect_structural_breaker_long(sweep_bar, idx, m1_highs, m1_lows, m1_opens, m1_closes)

                # e) 1M iFVG
                ifvg_zone = detect_ifvg_long(idx, m1_highs, m1_lows, m1_closes, c_atr, lookback=20, min_atr_mult=0.05)

                if has_breaker and (ifvg_zone is not None):
                    unicorn_found = True

            if not unicorn_found:
                continue

            # =========================================================================
            # 2. AŞAMA: DİNAMİK 0.5 FIB RETEST VE KADEMELİ TP SİMÜLASYONU
            # =========================================================================
            anchor_extreme = sweep_price
            anchor_impulse = m1_lows[idx] if trade_dir == "SHORT" else m1_highs[idx]

            filled_idx = -1
            entry_price = 0.0
            stop_loss = 0.0
            risk_dist = 0.0

            # Sonraki 60 bar (1 saat) içinde 0.5 Fib retesti bekle
            for m in range(idx + 1, min(n_1m, idx + 60)):
                m_h, m_l = m1_highs[m], m1_lows[m]
                if trade_dir == "SHORT":
                    # Fiyat düşmeye devam ederse Fib genişler
                    if m_l < anchor_impulse:
                        anchor_impulse = m_l
                    fib05 = anchor_impulse + (anchor_extreme - anchor_impulse) * 0.5
                    if m_h >= fib05:
                        filled_idx = m
                        entry_price = fib05
                        stop_loss = anchor_extreme + 1.5 * pip
                        risk_dist = abs(stop_loss - entry_price)
                        break
                else:
                    # Fiyat yükselmeye devam ederse Fib genişler
                    if m_h > anchor_impulse:
                        anchor_impulse = m_h
                    fib05 = anchor_extreme + (anchor_impulse - anchor_extreme) * 0.5
                    if m_l <= fib05:
                        filled_idx = m
                        entry_price = fib05
                        stop_loss = anchor_extreme - 1.5 * pip
                        risk_dist = abs(entry_price - stop_loss)
                        break

            if filled_idx == -1 or risk_dist <= 0:
                continue

            # Kademeli TP Çıkış Takibi (%50 TP1 @ 1.0R + BE, Kalan %50 TP2 @ 3.0R)
            tp1_target = entry_price - risk_dist * 1.0 if trade_dir == "SHORT" else entry_price + risk_dist * 1.0
            tp2_target = entry_price - risk_dist * 3.0 if trade_dir == "SHORT" else entry_price + risk_dist * 3.0

            tp1_hit = False
            max_mfe = 0.0
            closed = False
            final_res = {}

            for p in range(filled_idx + 1, min(n_1m, filled_idx + 180)):
                p_h, p_l = m1_highs[p], m1_lows[p]
                fav = (entry_price - p_l) if trade_dir == "SHORT" else (p_h - entry_price)
                mfe = fav / risk_dist
                if mfe > max_mfe:
                    max_mfe = mfe

                if not tp1_hit:
                    sl_hit = (p_h >= stop_loss) if trade_dir == "SHORT" else (p_l <= stop_loss)
                    tp1_reached = (p_l <= tp1_target) if trade_dir == "SHORT" else (p_h >= tp1_target)

                    if sl_hit:
                        final_res = {
                            "outcome": "SL",
                            "net_r": -1.0,
                            "reason": "1R öncesi SL vuruldu (-1.0R)",
                            "exit_idx": p
                        }
                        closed = True
                        break
                    if tp1_reached:
                        tp1_hit = True
                else:
                    # Stop artık Başabaş (entry_price)
                    be_hit = (p_h >= entry_price) if trade_dir == "SHORT" else (p_l <= entry_price)
                    tp2_reached = (p_l <= tp2_target) if trade_dir == "SHORT" else (p_h >= tp2_target)

                    if tp2_reached:
                        final_res = {
                            "outcome": "TP2",
                            "net_r": 2.0,
                            "reason": "🎯 Tam TP2 vuruldu (+2.0R Net)",
                            "exit_idx": p
                        }
                        closed = True
                        break
                    if be_hit:
                        final_res = {
                            "outcome": "BE",
                            "net_r": 0.5,
                            "reason": "🛡️ TP1 sonrası BE seviyesinde kapandı (+0.5R Net)",
                            "exit_idx": p
                        }
                        closed = True
                        break

            if not closed:
                final_res = {
                    "outcome": "BE" if tp1_hit else "TIME_EXIT",
                    "net_r": 0.5 if tp1_hit else 0.0,
                    "reason": "Süre dolumu",
                    "exit_idx": filled_idx + 180
                }

            trade_entry_time = str(df_1m["datetime"].iloc[filled_idx])
            trades.append({
                "symbol": symbol,
                "opened_at": trade_entry_time,
                "direction": trade_dir,
                "entry": entry_price,
                "sl": stop_loss,
                "risk_dist": risk_dist,
                "outcome": final_res["outcome"],
                "net_r": final_res["net_r"],
                "mfe": round(max_mfe, 2),
                "reason": final_res["reason"],
            })
            last_trade_idx = final_res.get("exit_idx", filled_idx + 30)

        return trades


def run_full_unicorn_1m_test():
    tester = OneMinuteUnicornTester(symbols=["EURUSD", "GBPUSD", "USDJPY", "BTCUSD", "ETHUSD", "SOLUSD", "XAUUSD"])
    
    # 2026 Test Periyodu: Son 1 Ay (2026-09-11 - 2026-10-11)
    start_dt = datetime(2026, 9, 11, tzinfo=timezone.utc)
    end_dt = datetime(2026, 10, 11, tzinfo=timezone.utc)

    print("\n" + "=" * 85)
    print("🌺 GERÇEK 1M UNICORN (SFP + iFVG + BREAKER BLOCK) SNIPER RETEST TESTİ 🌺")
    print("   Mimari:")
    print("   1) 15M POI Bölgesi (Swing Kutu / Kurumsal İlgi Alanı)")
    print("   2) 1M İçinde UNICORN: 1M SFP (IDM Sweep) + 1M iFVG + 1M Breaker Block (MSS)")
    print("   3) 1M Dinamik 0.5 Fib Retest Emri (Genişleyen Fib)")
    print("   4) %50 TP1 @ 1.0R (BE) + Kalan %50 TP2 @ 3.0R (Hedef Havuz)")
    print("   Evren: EURUSD, GBPUSD, USDJPY, BTCUSD, ETHUSD, SOLUSD, XAUUSD | NY Killzone (13:00 - 17:00 UTC)")
    print("=" * 85 + "\n")

    all_trades = []
    for sym in tester.symbols:
        trades = tester.run_backtest_for_symbol(sym, start_dt, end_dt, ny_killzone_only=True)
        all_trades.extend(trades)

    if not all_trades:
        print("⚠️ Verilen filtrelere uyan işlem bulunamadı.")
        return

    # Tabloyu Yazdır
    print("📋 TÜM 1M UNICORN İŞLEMLERİ:")
    print("-" * 85)
    for t in all_trades:
        print(
            f"{t['opened_at']} | {t['symbol']:<7} {t['direction']:<5} | "
            f"Entry: {t['entry']:.5f} | SL: {t['sl']:.5f} | "
            f"Sonuç: {t['outcome']:<4} ({t['net_r']:+.1f}R / MFE: +{t['mfe']}R) | {t['reason']}"
        )
    print("-" * 85 + "\n")

    # İstatistikler
    tp2_cnt = sum(1 for t in all_trades if t["outcome"] == "TP2")
    be_cnt = sum(1 for t in all_trades if t["outcome"] == "BE")
    sl_cnt = sum(1 for t in all_trades if t["outcome"] == "SL")
    total = len(all_trades)
    net_r = sum(t["net_r"] for t in all_trades)
    win_rate = ((tp2_cnt + be_cnt) / total * 100) if total > 0 else 0.0

    print("=" * 85)
    print("🏆 1M UNICORN SNIPER PERFORMANS TABLOSU:")
    print("-" * 85)
    print(f"Toplam İşlem Sayısı: {total}")
    print(f"🎯 Tam TP2 (+2.0R) : {tp2_cnt} adet")
    print(f"🛡️ TP1 + BE (+0.5R): {be_cnt} adet")
    print(f"🛑 Stop Loss (-1.0R): {sl_cnt} adet")
    print(f"🏆 Win Rate        : %{win_rate:.1f}")
    print(f"📈 NET R GETİRİSİ  : {net_r:+.1f} R")
    print("=" * 85 + "\n")


if __name__ == "__main__":
    run_full_unicorn_1m_test()
