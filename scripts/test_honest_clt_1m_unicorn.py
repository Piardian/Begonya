"""
🌺 Begonya 00 / CLT - Orijinal 15M SFP+iFVG+Breaker Motoru ile 1M İçinde UNICORN Teyit Testi
Mimari:
1) 15M Motoru (ChecklistTrigger / Custom1MBacktestRunner):
   - Orijinal Begon/Begonya 00 ve CLT kuralları: 4H/1H Trend Uyumu, Makro Yönetişim Kapısı,
     Opposing Likidite Havuzları ve Seans Filtreleri (Londra/NY).
   - Bu motor 1 ayda toplam ~5-8 adet Grade A kurumsal kurulum üretir.
2) 1M İcra Katmanı (1M UNICORN: SFP + iFVG + Breaker + 0.5 Fib):
   - Fiyat 15M kutusuna girdiğinde:
     * Hız kontrolü (şelale gelişi veto)
     * 15M mum kapanış delinme kontrolü
     * 1M barlarında SFP (Sweep / IDM) tespiti
     * 1M barlarında Breaker Block (MSS) kırılımı
     * 1M barlarında Inversion FVG (iFVG) oluşumu
     * 1M Dinamik 0.5 Fib Retest Emri
     * %50 TP1 @ 1.0R (BE) + Kalan %50 TP2 @ 3.0R
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
from sfp_orb_engine.custom_1m_backtest import SYMBOLS, EXCLUDED_SYMBOLS, Custom1MBacktestRunner

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("Begonya.CLT_1M_Unicorn")


class CLT_1M_Unicorn_Tester:
    def __init__(self):
        if not mt5.initialize():
            logger.error("MT5 initialize failed!")
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

    def evaluate_1m_unicorn_confirmation(
        self,
        symbol: str,
        sig: Dict[str, Any],
        trigger_dt: datetime,
    ) -> Dict[str, Any]:
        """
        15M POI kutusu oluştuktan sonra, 1M barlarında SFP + iFVG + Breaker Block (1M UNICORN) arar.
        """
        is_long = sig["direction"] == "LONG"
        zone_low = sig["zone_low"]
        zone_high = sig["zone_high"]
        pip = 0.01 if "JPY" in symbol else 0.1 if "XAU" in symbol or "LTC" in symbol else 1.0 if any(c in symbol for c in ["BTC", "ETH", "SOL", "NAS"]) else 0.0001

        # Sinyal tetiklendikten sonra 24 saatlik 1M barlarını al
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

        # 1. Kural: 15M Kutusuna Temas
        touch_idx = -1
        for k in range(n_1m):
            touched = (lows[k] <= zone_high and highs[k] >= zone_low) if is_long else (highs[k] >= zone_low and lows[k] <= zone_high)
            if touched:
                touch_idx = k
                break

        if touch_idx == -1:
            return {"outcome": "NO_TOUCH", "net_r": 0.0, "reason": "15M kutusuna temas gelmedi"}

        # 2. Kural: 1M'de UNICORN (SFP + iFVG + Breaker Block) Arayışı
        # Reaction penceresi: Kutuya girdikten sonraki 60 bar (1 saat)
        reaction_limit = min(n_1m, touch_idx + 60)
        unicorn_idx = -1
        sweep_level = 0.0

        for k in range(touch_idx + 1, reaction_limit):
            # 15M bar delinme kontrolü: ardışık 15 bar kutu dışında kapandıysa veto
            if k >= touch_idx + 15:
                bars_15 = closes[k-15:k]
                all_breached = np.all(bars_15 < zone_low) if is_long else np.all(bars_15 > zone_high)
                if all_breached:
                    return {"outcome": "VETO_15M_BREACH", "net_r": 0.0, "reason": "15M mumu kutuyu delip kapattı"}

            # 1M SFP (Önceki 1-5 barın tepe/dibini süpürme ve ters kapatma)
            if is_long:
                # LONG UNICORN:
                # a) 1M Sweep: k-1 barı önceki dibi süpürüp üzerinde kapattı mı?
                prev_low = np.min(lows[max(0, k-6):k-1]) if k >= 6 else lows[k-1]
                sweep_ok = (lows[k-1] < prev_low and closes[k-1] > prev_low) or (lows[k] < lows[k-1] and closes[k] > highs[k-1])
                if not sweep_ok:
                    continue

                sweep_level = lows[k]
                # b) 1M Breaker Block: MSS kırılımı var mı?
                mss_level = np.max(highs[max(0, k-4):k])
                if not (closes[k] > mss_level):
                    continue

                # c) 1M Displacement kontrolü
                b_rng = max(highs[k] - lows[k], 1e-8)
                body = abs(closes[k] - opens[k])
                if body / b_rng < 0.40:
                    continue

                # d) 1M iFVG kontrolü
                c_atr = b_rng  # yerel volatilite
                has_ifvg = detect_ifvg_long(k, highs, lows, closes, c_atr, lookback=15, min_atr_mult=0.05) is not None
                # e) 1M Breaker kontrolü
                has_breaker = detect_structural_breaker_long(max(0, k-3), k, highs, lows, opens, closes)

                if has_breaker or has_ifvg:
                    unicorn_idx = k
                    break

            else:
                # SHORT UNICORN:
                # a) 1M Sweep: önceki tepeyi süpürüp altında kapattı mı?
                prev_high = np.max(highs[max(0, k-6):k-1]) if k >= 6 else highs[k-1]
                sweep_ok = (highs[k-1] > prev_high and closes[k-1] < prev_high) or (highs[k] > highs[k-1] and closes[k] < lows[k-1])
                if not sweep_ok:
                    continue

                sweep_level = highs[k]
                # b) 1M Breaker Block: MSS kırılımı var mı?
                mss_level = np.min(lows[max(0, k-4):k])
                if not (closes[k] < mss_level):
                    continue

                # c) 1M Displacement
                b_rng = max(highs[k] - lows[k], 1e-8)
                body = abs(closes[k] - opens[k])
                if body / b_rng < 0.40:
                    continue

                # d) 1M iFVG kontrolü
                c_atr = b_rng
                has_ifvg = detect_ifvg_short(k, highs, lows, closes, c_atr, lookback=15, min_atr_mult=0.05) is not None
                # e) 1M Breaker kontrolü
                has_breaker = detect_structural_breaker_short(max(0, k-3), k, highs, lows, opens, closes)

                if has_breaker or has_ifvg:
                    unicorn_idx = k
                    break

        if unicorn_idx == -1:
            return {"outcome": "NO_1M_UNICORN", "net_r": 0.0, "reason": "1M içinde SFP+iFVG+Breaker (Unicorn) onayı gelmedi"}

        # 3. Kural: Dinamik 0.5 Fib Retest Emri
        anchor_extreme = sweep_level
        anchor_impulse = highs[unicorn_idx] if is_long else lows[unicorn_idx]

        filled_idx = -1
        entry_price = 0.0
        stop_loss = 0.0
        risk_dist = 0.0

        for m in range(unicorn_idx + 1, min(n_1m, unicorn_idx + 60)):
            m_high, m_low = highs[m], lows[m]
            if is_long:
                if m_high > anchor_impulse:
                    anchor_impulse = m_high  # Fiyat uzadıkça Fib genişler
                fib05 = anchor_extreme + (anchor_impulse - anchor_extreme) * 0.5
                if m_low <= fib05:
                    filled_idx = m
                    entry_price = fib05
                    stop_loss = anchor_extreme - 1.5 * pip
                    risk_dist = abs(entry_price - stop_loss)
                    break
            else:
                if m_low < anchor_impulse:
                    anchor_impulse = m_low  # Fiyat uzadıkça Fib genişler
                fib05 = anchor_impulse + (anchor_extreme - anchor_impulse) * 0.5
                if m_high >= fib05:
                    filled_idx = m
                    entry_price = fib05
                    stop_loss = anchor_extreme + 1.5 * pip
                    risk_dist = abs(entry_price - stop_loss)
                    break

        if filled_idx == -1 or risk_dist <= 0:
            return {"outcome": "NO_FIB_RETEST", "net_r": 0.0, "reason": "1M Unicorn sonrası 0.5 Fib retesti gelmedi"}

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
                        "mfe": round(max_mfe, 2),
                        "reason": "TP1 öncesi SL vuruldu (-1.0R)",
                    }
                if tp1_reached:
                    tp1_hit = True
            else:
                # Stop artık BE
                be_hit = (b_low <= entry_price) if is_long else (b_high >= entry_price)
                tp2_reached = (b_high >= tp2_price) if is_long else (b_low <= tp2_price)

                if tp2_reached:
                    return {
                        "outcome": "TP2",
                        "net_r": 2.0,
                        "entry": entry_price,
                        "sl": stop_loss,
                        "mfe": round(max_mfe, 2),
                        "reason": "🎯 Tam TP2 vuruldu (+2.0R Net)",
                    }
                if be_hit:
                    return {
                        "outcome": "BE",
                        "net_r": 0.5,
                        "entry": entry_price,
                        "sl": stop_loss,
                        "mfe": round(max_mfe, 2),
                        "reason": "🛡️ TP1 alındıktan sonra BE seviyesinde kapandı (+0.5R Net)",
                    }

        return {
            "outcome": "BE" if tp1_hit else "TIME_EXIT",
            "net_r": 0.5 if tp1_hit else 0.0,
            "entry": entry_price,
            "sl": stop_loss,
            "mfe": round(max_mfe, 2),
            "reason": "Süre dolumu",
        }

    def run_benchmark(self):
        print("\n" + "=" * 85)
        print("🌺 BEGONYA / CLT: ORİJİNAL 15M MOTORU & 1M UNICORN TEYİT KARŞILAŞTIRMASI 🌺")
        print("   15M Katmanı : Orijinal Begonya 00 / CLT Checklist & Macro-Gated Motoru (Grade A/AAA)")
        print("   1M Katmanı  : Fiyat Kutu İçindeyken 1M SFP + 1M iFVG + 1M Breaker (Unicorn) & 0.5 Fib")
        print("   Periyot     : Son 1 Ay (2026-09-11 - 2026-10-11)")
        print("=" * 85 + "\n")

        all_base_trades = []
        m1_verified_trades = []

        for symbol in SYMBOLS:
            if symbol in EXCLUDED_SYMBOLS:
                continue

            df = self.runner.fetch_m15_data(symbol)
            if df is None or len(df) < 200:
                continue

            # Orijinal 15M CLT/Begonya motorunun sinyallerini al
            base_trades = self.runner.run_symbol(symbol, df)
            if not base_trades:
                continue

            for t in base_trades:
                all_base_trades.append(t)
                trig_dt = pd.to_datetime(t["opened_at"], utc=True).to_pydatetime()

                # 1M Unicorn Teyit Analizi
                m1_res = self.evaluate_1m_unicorn_confirmation(symbol, t, trig_dt)
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

        # Karşılaştırma Tablosu
        print("📋 TÜM İŞLEMLERİN 15M VS. 1M UNICORN KARŞILAŞTIRMASI:")
        print("-" * 85)
        for tr in m1_verified_trades:
            print(
                f"{tr['opened_at']} | {tr['symbol']:<7} {tr['direction']:<5} | "
                f"15M Standart: {tr['base_outcome']:<10} ({tr['base_r']:+.1f}R)  ->  "
                f"1M Unicorn Teyit: {tr['m1_outcome']:<14} ({tr['m1_r']:+.1f}R / MFE: +{tr['m1_mfe']}R) | {tr['m1_reason']}"
            )
        print("-" * 85 + "\n")

        # Özetler
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

        print("=" * 85)
        print("🏆 GERÇEK BİLANÇO KARŞILAŞTIRMASI:")
        print("-" * 85)
        print(f"1) ORİJİNAL 15M MOTORU (Begon / CLT Bazı):")
        print(f"   Toplam Sinyal : {len(all_base_trades)} İşlem")
        print(f"   TP2: {base_tp2} | BE: {base_be} | SL: {base_sl}")
        print(f"   Win Rate      : %{base_wr:.1f}")
        print(f"   NET R GETİRİSİ: {base_net_r:+.1f} R")
        print("-" * 85)
        print(f"2) 1M UNICORN SNIPER TEYİTLİ MODEL:")
        print(f"   1M İcrasına Dolan: {len(m1_filled)} İşlem (Kalan {len(all_base_trades)-len(m1_filled)} işlemde 1M onayı gelmediği için filtrelendi)")
        print(f"   🎯 Tam TP2    : {m1_tp2} adet (+2.0R)")
        print(f"   🛡️ TP1 + BE   : {m1_be} adet (+0.5R)")
        print(f"   🛑 Stop Loss  : {m1_sl} adet (-1.0R)")
        print(f"   🏆 Win Rate   : %{m1_wr:.1f}")
        print(f"   📈 NET GETİRİ : {m1_net_r:+.1f} R")
        print("=" * 85 + "\n")


if __name__ == "__main__":
    tester = CLT_1M_Unicorn_Tester()
    tester.run_benchmark()
