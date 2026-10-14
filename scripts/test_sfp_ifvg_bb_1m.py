"""
🌺 Begonya 00 - SFP + iFVG + Breaker Block (BB) Gerçek 1M Teyitli Karşılaştırmalı Büyük Backtest
Bu script:
1) 15M barlarında SFP + iFVG + Breaker Block (Unicorn) kurulumlarını tespit eder.
2) Kutuya yaklaşım ve giriş teyidini MT5'in gerçek 1 DAKİKALIK (1M) barlarıyla simüle eder:
   - 1M IDM süpürmesi & BOS tespiti
   - 1M CHoCH teyidi (Orta halli displacement ile gövde kapanışı)
   - 1M 0.5 Fib retesti ile kurumsal limit dolumu
   - Kademeli kâr realizasyonu (%50 TP1 @ 1.0R + Stop BE, kalan %50 @ 3.0R)
3) 15M Standart Simülasyon ile Gerçek 1M Sniper İcraatını yan yana karşılaştırır.
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
from sfp_orb_engine.custom_1m_backtest import SYMBOLS, EXCLUDED_SYMBOLS, Custom1MBacktestRunner

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("Begonya.SfpIfvgBb1mTest")


class SfpIfvgBb1mTester:
    def __init__(self):
        self.runner = Custom1MBacktestRunner(
            initial_capital=10000.0,
            risk_pct=0.02,
            entry_model="midpoint",
            require_reaction=True,
            use_macro_gate=True,
            require_pro_trend=False,
            use_ifvg=True,
            require_breaker=True,
        )

    def fetch_1m_bars(self, symbol: str, start_dt: datetime, end_dt: datetime) -> Optional[pd.DataFrame]:
        rates = mt5.copy_rates_range(symbol, mt5.TIMEFRAME_M1, start_dt, end_dt)
        if rates is None or len(rates) == 0:
            return None
        df = pd.DataFrame(rates)
        df["datetime"] = pd.to_datetime(df["time"], unit="s", utc=True)
        for col in ["open", "high", "low", "close"]:
            df[col] = df[col].astype(float)
        return df

    def simulate_1m_sniper_confirmation(
        self,
        symbol: str,
        sig: Dict[str, Any],
        trigger_dt: datetime,
    ) -> Dict[str, Any]:
        """
        15M SFP+iFVG+BB sinyali oluştuktan sonra MT5'in 1M barlarında kullanıcının teyit mekanizmasını çalıştırır.
        """
        is_long = sig["direction"] == "LONG"
        zone_low = sig["zone_low"]
        zone_high = sig["zone_high"]
        pip = 0.01 if "JPY" in symbol else 0.1 if "XAU" in symbol or "LTC" in symbol else 1.0 if "BTC" in symbol or "ETH" in symbol or "NAS" in symbol else 0.0001

        # Sinyal tetiklendikten sonra 24 saatlik 1M penceresi
        end_window = trigger_dt + timedelta(hours=24)
        df_1m = self.fetch_1m_bars(symbol, trigger_dt, end_window)

        if df_1m is None or len(df_1m) < 15:
            return {"outcome": "NO_1M_DATA", "net_r": 0.0, "reason": "1M verisi yok"}

        opens = df_1m["open"].values
        highs = df_1m["high"].values
        lows = df_1m["low"].values
        closes = df_1m["close"].values
        dts = df_1m["datetime"].values
        n_1m = len(df_1m)

        # 1. Kural: 15M Kutuya Giriş Tespiti
        touch_idx = -1
        for k in range(n_1m):
            touched = (lows[k] <= zone_high and highs[k] >= zone_low) if is_long else (highs[k] >= zone_low and lows[k] <= zone_high)
            if touched:
                touch_idx = k
                break

        if touch_idx == -1:
            return {"outcome": "NO_TOUCH", "net_r": 0.0, "reason": "15M kutusuna temas gelmedi"}

        # 2. Kural: 15M Kapanışıyla Delinme Kontrolü (15 ardışık 1M barı kutunun dışında kapandıysa)
        # 1M IDM / BOS ve CHoCH Arayışı (Maks 60 bar / 1 saat reaksiyon penceresi)
        reaction_limit = min(n_1m, touch_idx + 60)
        idm_level = None
        bos_level = None
        choch_idx = -1

        for k in range(touch_idx + 1, reaction_limit):
            # 15M kapanış delinme kontrolü
            if k >= touch_idx + 15:
                bars_15 = closes[k-15:k]
                all_breached = np.all(bars_15 < zone_low) if is_long else np.all(bars_15 > zone_high)
                if all_breached:
                    return {"outcome": "VETO_15M_BREACH", "net_r": 0.0, "reason": "15M mumu kutuyu delip kapattı"}

            prev_low, prev_high = lows[k-1], highs[k-1]
            c_low, c_high, c_open, c_close = lows[k], highs[k], opens[k], closes[k]

            if is_long:
                # Önceki mumun dibini süpürmüş ve üzerinde kapatmış
                if c_low < prev_low and c_close > prev_high:
                    idm_level = c_low
                    bos_level = c_high

                if bos_level is not None and c_close > bos_level:
                    b_rng = max(c_high - c_low, 1e-8)
                    body = abs(c_close - c_open)
                    if body / b_rng >= 0.45:
                        choch_idx = k
                        break
            else:
                # Önceki mumun tepesini süpürmüş ve altında kapatmış
                if c_high > prev_high and c_close < prev_low:
                    idm_level = c_high
                    bos_level = c_low

                if bos_level is not None and c_close < bos_level:
                    b_rng = max(c_high - c_low, 1e-8)
                    body = abs(c_close - c_open)
                    if body / b_rng >= 0.45:
                        choch_idx = k
                        break

        if choch_idx == -1 or idm_level is None or bos_level is None:
            return {"outcome": "EXPIRED_CHOCH", "net_r": 0.0, "reason": "1M IDM/BOS & CHoCH onayı gelmedi"}

        # 3. Kural: Dinamik 0.5 Fib Retest Emri
        anchor_high = highs[choch_idx] if is_long else idm_level
        anchor_low = idm_level if is_long else lows[choch_idx]

        filled_idx = -1
        entry_price = 0.0
        stop_loss = 0.0
        risk_dist = 0.0

        for m in range(choch_idx + 1, min(n_1m, choch_idx + 60)):
            m_high, m_low = highs[m], lows[m]
            if is_long:
                if m_high > anchor_high:
                    anchor_high = m_high  # Fib genişler
                fib05 = anchor_low + (anchor_high - anchor_low) * 0.5
                if m_low <= fib05:
                    filled_idx = m
                    entry_price = fib05
                    stop_loss = anchor_low - 1.5 * pip
                    risk_dist = abs(entry_price - stop_loss)
                    break
            else:
                if m_low < anchor_low:
                    anchor_low = m_low  # Fib genişler
                fib05 = anchor_low + (anchor_high - anchor_low) * 0.5
                if m_high >= fib05:
                    filled_idx = m
                    entry_price = fib05
                    stop_loss = anchor_high + 1.5 * pip
                    risk_dist = abs(entry_price - stop_loss)
                    break

        if filled_idx == -1 or risk_dist <= 0:
            return {"outcome": "NO_FIB_RETEST", "net_r": 0.0, "reason": "0.5 Fib seviyesine retest gelmedi"}

        # 4. Kural: Kademeli TP (+1.0R'de %50 TP1 + BE, Kalan %50 @ 3.0R)
        tp1_price = entry_price + risk_dist * 1.0 if is_long else entry_price - risk_dist * 1.0
        tp2_price = entry_price + risk_dist * 3.0 if is_long else entry_price - risk_dist * 3.0

        tp1_hit = False
        max_mfe = 0.0

        for p_idx in range(filled_idx + 1, n_1m):
            b_high, b_low = highs[p_idx], lows[p_idx]
            fav = (b_high - entry_price) if is_long else (entry_price - b_low)
            mfe = fav / risk_dist
            if mfe > max_mfe:
                max_mfe = mfe

            if not tp1_hit:
                sl_hit = (b_low <= stop_loss) if is_long else (b_high >= stop_loss)
                tp1_reached = (b_high >= tp1_price) if is_long else (b_low <= tp1_price)

                if sl_hit:
                    return {
                        "outcome": "SL",
                        "net_r": -1.0,
                        "entry": entry_price,
                        "sl": stop_loss,
                        "tp2": tp2_price,
                        "mfe": round(max_mfe, 2),
                        "reason": "TP1 öncesi SL vuruldu (-1.0R)",
                    }
                if tp1_reached:
                    tp1_hit = True
            else:
                # Stop artık BE (entry_price)
                be_hit = (b_low <= entry_price) if is_long else (b_high >= entry_price)
                tp2_reached = (b_high >= tp2_price) if is_long else (b_low <= tp2_price)

                if tp2_reached:
                    # %50 1R (+0.5R) + %50 3R (+1.5R) = Toplam +2.0R Net!
                    return {
                        "outcome": "TP2",
                        "net_r": 2.0,
                        "entry": entry_price,
                        "sl": stop_loss,
                        "tp2": tp2_price,
                        "mfe": round(max_mfe, 2),
                        "reason": "🎯 Tam TP2 vuruldu (+2.0R Net)",
                    }
                if be_hit:
                    # %50 1R (+0.5R) + Kalan BE (0R) = Toplam +0.5R Net!
                    return {
                        "outcome": "BE",
                        "net_r": 0.5,
                        "entry": entry_price,
                        "sl": stop_loss,
                        "tp2": tp2_price,
                        "mfe": round(max_mfe, 2),
                        "reason": "🛡️ TP1 alındıktan sonra BE seviyesinde kapandı (+0.5R Net)",
                    }

        return {
            "outcome": "BE" if tp1_hit else "TIME_EXIT",
            "net_r": 0.5 if tp1_hit else 0.0,
            "entry": entry_price,
            "sl": stop_loss,
            "tp2": tp2_price,
            "mfe": round(max_mfe, 2),
            "reason": "Süre dolumu",
        }

    def run_benchmark(self):
        print("\n" + "=" * 80)
        print("🌺 BEGONYA & BEGONYA 00: SFP + iFVG + BREAKER (UNICORN) 1M TEYİTLİ BÜYÜK TEST 🌺")
        print("   Evren: MT5 Gerçek 1M & 15M Barları (EURUSD, GBPUSD, USDJPY, USDCAD, NZDUSD, EURGBP, XAUUSD, BTCUSD)")
        print("   Periyot: Son 1 Ay (2026-09-11 - 2026-10-11)")
        print("   Karşılaştırma: Standart 15M Limit İcrası VS. Kullanıcının 1M Sniper İcra Mekanizması")
        print("=" * 80 + "\n")

        all_base_trades = []
        m1_verified_trades = []

        for symbol in SYMBOLS:
            if symbol in EXCLUDED_SYMBOLS:
                continue

            df = self.runner.fetch_m15_data(symbol)
            if df is None or len(df) < 200:
                continue

            # 1. 15M seviyesindeki SFP + iFVG + Breaker işlemlerini al
            base_trades = self.runner.run_symbol(symbol, df)
            if not base_trades:
                continue

            for t in base_trades:
                all_base_trades.append(t)
                trig_dt = pd.to_datetime(t["opened_at"], utc=True).to_pydatetime()

                # 2. 1M Sniper Teyit Mekanizmasını Çalıştır
                m1_res = self.simulate_1m_sniper_confirmation(symbol, t, trig_dt)
                m1_verified_trades.append({
                    "symbol": symbol,
                    "opened_at": t["opened_at"],
                    "direction": t["direction"],
                    "base_outcome": t["close_reason"],
                    "base_r": t["r_result"],
                    "m1_outcome": m1_res["outcome"],
                    "m1_r": m1_res["net_r"],
                    "m1_mfe": m1_res.get("mfe", 0.0),
                    "m1_reason": m1_res["reason"],
                })

        # --- SONUÇLARI KARŞILAŞTIRMALI YAZDIR ---
        print("📋 TÜM İŞLEMLERİN 15M VS. 1M KARŞILAŞTIRMA TABLOSU:")
        print("-" * 80)
        for tr in m1_verified_trades:
            print(
                f"{tr['opened_at']} | {tr['symbol'].padEnd(6) if hasattr(tr['symbol'], 'padEnd') else tr['symbol']} {tr['direction']} | "
                f"15M Standart: {tr['base_outcome']} ({tr['base_r']:+.1f}R)  ->  "
                f"1M Sniper Teyitli: {tr['m1_outcome']} ({tr['m1_r']:+.1f}R / MFE: +{tr['m1_mfe']}R) | {tr['m1_reason']}"
            )
        print("-" * 80 + "\n")

        # Özet İstatistikler
        base_tp2 = sum(1 for t in all_base_trades if t["close_reason"] == "TP2_HIT")
        base_be = sum(1 for t in all_base_trades if t["close_reason"] == "BREAK_EVEN")
        base_sl = sum(1 for t in all_base_trades if t["close_reason"] == "STOP_LOSS")
        base_net_r = sum(t["r_result"] for t in all_base_trades)
        base_wr = ((base_tp2 + base_be) / len(all_base_trades) * 100) if all_base_trades else 0.0

        m1_tp2 = sum(1 for t in m1_verified_trades if t["m1_outcome"] == "TP2")
        m1_be = sum(1 for t in m1_verified_trades if t["m1_outcome"] == "BE")
        m1_sl = sum(1 for t in m1_verified_trades if t["m1_outcome"] == "SL")
        m1_filled = [t for t in m1_verified_trades if t["m1_outcome"] in ["TP2", "BE", "SL"]]
        m1_net_r = sum(t["m1_r"] for t in m1_verified_trades)
        m1_wr = ((m1_tp2 + m1_be) / len(m1_filled) * 100) if m1_filled else 0.0

        print("=" * 80)
        print("🏆 PERFORMANS KARŞILAŞTIRMA BİLANÇOSU:")
        print("-" * 80)
        print(f"1) 15M STANDART MODEL (Begon / Begonya 00 Baz):")
        print(f"   Toplam Sinyal : {len(all_base_trades)} İşlem")
        print(f"   TP2: {base_tp2} | BE: {base_be} | SL: {base_sl}")
        print(f"   Win Rate      : %{base_wr:.1f}")
        print(f"   NET R GETİRİSİ: {base_net_r:+.1f} R")
        print("-" * 80)
        print(f"2) 1M SNIPER TEYİTLİ MODEL (Kullanıcının 1M IDM/BOS + 0.5 Fib İcrası):")
        print(f"   1M İcrasına Dolan: {len(m1_filled)} İşlem (Onay vermeyen / temas etmeyen elendi)")
        print(f"   🎯 Tam TP2    : {m1_tp2} adet (+2.0R)")
        print(f"   🛡️ TP1 + BE   : {m1_be} adet (+0.5R)")
        print(f"   🛑 Stop Loss  : {m1_sl} adet (-1.0R)")
        print(f"   🏆 Win Rate   : %{m1_wr:.1f}")
        print(f"   📈 NET GETİRİ : {m1_net_r:+.1f} R")
        print("=" * 80 + "\n")


if __name__ == "__main__":
    tester = SfpIfvgBb1mTester()
    tester.run_benchmark()
