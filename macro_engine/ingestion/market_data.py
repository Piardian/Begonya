import logging
from typing import Dict, Any, Optional
import yfinance as yf
from config import MARKET_SYMBOLS
from ingestion.mt5_market_data import MT5MarketDataIngestion

logger = logging.getLogger("MarketDataIngestion")

class MarketDataIngestion:
    """
    MT5 broker doğrudan veri akışı ve yfinance hibrit köprüsü üzerinden
    saatlik/günlük makro piyasa verilerini çeker.
    """
    def __init__(self):
        self.symbols = MARKET_SYMBOLS
        self.mt5_feed = MT5MarketDataIngestion()

    def fetch_current_prices(self) -> Dict[str, Any]:
        """
        DXY, US10Y, US02Y, Altın, Petrol, BTC ve Bakır verilerini çeker (MT5 öncelikli, yf yedekli).
        """
        results = {}
        logger.info("📡 Piyasa verileri çekiliyor (MT5 Doğrudan Broker Feed + yfinance Yedekli)...")

        for name, ticker in self.symbols.items():
            # 1. Öncelik: Yerel MT5 Broker Feed
            mt5_data = self.mt5_feed.fetch_symbol_bars(name, n_bars=60)
            if mt5_data:
                results[name] = mt5_data
                continue

            # 2. Öncelik: yfinance Web Verisi
            try:
                t = yf.Ticker(ticker)
                # 3 aylık günlük veriyi al (60 günlük dinamik yüzdelik dilim ve trend için)
                hist = t.history(period="3mo", interval="1d")
                if not hist.empty and len(hist) >= 1:
                    current_val = float(hist['Close'].iloc[-1])
                    prev_val = float(hist['Close'].iloc[-2]) if len(hist) > 1 else current_val
                    val_5d_ago = float(hist['Close'].iloc[-6]) if len(hist) >= 6 else float(hist['Close'].iloc[0])
                    month_ago_val = float(hist['Close'].iloc[-21]) if len(hist) >= 21 else float(hist['Close'].iloc[0])
                    pct_change_daily = round(((current_val - prev_val) / prev_val) * 100, 2) if prev_val else 0.0
                    pct_change_5d = round(((current_val - val_5d_ago) / val_5d_ago) * 100, 2) if val_5d_ago else 0.0
                    pct_change_4w = round(((current_val - month_ago_val) / month_ago_val) * 100, 2) if month_ago_val else 0.0
                    
                    # 60 Günlük Yuvarlanan Yüzdelik Dilim (Rolling 60D Percentile Rank)
                    window_60d = hist['Close'].tail(60).tolist()
                    pct_rank_60d = round((sum(1 for x in window_60d if x <= current_val) / len(window_60d)) * 100, 1)

                    results[name] = {
                        "value": round(current_val, 4),
                        "prev": round(prev_val, 4),
                        "val_5d_ago": round(val_5d_ago, 4),
                        "month_ago": round(month_ago_val, 4),
                        "change_pct": pct_change_daily,
                        "change_pct_5d": pct_change_5d,
                        "change_pct_4w": pct_change_4w,
                        "pct_rank_60d": pct_rank_60d,
                        "history_close": hist['Close'].tolist()
                    }
                else:
                    results[name] = self._get_fallback_price(name)
            except Exception as e:
                logger.warning(f"{name} ({ticker}) verisi çekilemedi: {e}. Yedek değer kullanılıyor.")
                results[name] = self._get_fallback_price(name)

        return results

    def _get_fallback_price(self, name: str) -> Dict[str, Any]:
        """Piyasa kapalıyken veya veri çekilemediğinde güvenli referans değerler."""
        fallbacks = {
            "DXY": {"value": 104.20, "prev": 104.10, "val_5d_ago": 103.90, "month_ago": 103.50, "change_pct": 0.10, "change_pct_5d": 0.29, "change_pct_4w": 0.68, "history_close": [103.9, 104.0, 104.1, 104.2]},
            "GOLD": {"value": 2480.50, "prev": 2470.00, "val_5d_ago": 2450.00, "month_ago": 2400.00, "change_pct": 0.42, "change_pct_5d": 1.24, "change_pct_4w": 3.35, "history_close": [2450.0, 2460.0, 2470.0, 2480.5]},
            "BRENT": {"value": 78.40, "prev": 79.10, "val_5d_ago": 80.00, "month_ago": 82.00, "change_pct": -0.88, "change_pct_5d": -2.00, "change_pct_4w": -4.39, "history_close": [80.0, 79.5, 79.1, 78.4]},
            "WTI": {"value": 74.20, "prev": 74.90, "val_5d_ago": 75.50, "month_ago": 77.00, "change_pct": -0.93, "change_pct_5d": -1.72, "change_pct_4w": -3.64, "history_close": [75.5, 75.1, 74.9, 74.2]},
            "US10Y": {"value": 3.88, "prev": 3.92, "val_5d_ago": 3.95, "month_ago": 4.05, "change_pct": -1.02, "change_pct_5d": -1.77, "change_pct_4w": -4.20, "history_close": [3.95, 3.94, 3.92, 3.88]},
            "US02Y": {"value": 3.94, "prev": 3.96, "val_5d_ago": 4.00, "month_ago": 4.15, "change_pct": -0.51, "change_pct_5d": -1.50, "change_pct_4w": -5.06, "history_close": [4.00, 3.98, 3.96, 3.94]},
            "BTC": {"value": 58500.0, "prev": 57800.0, "val_5d_ago": 56500.0, "month_ago": 60000.0, "change_pct": 1.21, "change_pct_5d": 3.54, "change_pct_4w": -2.50, "history_close": [56500.0, 57000.0, 57800.0, 58500.0]},
            "SPX": {"value": 5580.0, "prev": 5550.0, "val_5d_ago": 5500.0, "month_ago": 5450.0, "change_pct": 0.54, "change_pct_5d": 1.45, "change_pct_4w": 2.38, "history_close": [5500.0, 5520.0, 5550.0, 5580.0]},
            "COPPER": {"value": 4.15, "prev": 4.12, "val_5d_ago": 4.08, "month_ago": 4.25, "change_pct": 0.73, "change_pct_5d": 1.72, "change_pct_4w": -2.35, "history_close": [4.08, 4.10, 4.12, 4.15]},
            "VIX": {"value": 14.50, "prev": 14.80, "val_5d_ago": 15.20, "month_ago": 16.00, "change_pct": -2.03, "change_pct_5d": -4.61, "change_pct_4w": -9.38, "history_close": [15.2, 15.0, 14.8, 14.5]},
            "HYG": {"value": 79.20, "prev": 79.15, "val_5d_ago": 79.10, "month_ago": 78.80, "change_pct": 0.06, "change_pct_5d": 0.13, "change_pct_4w": 0.51, "history_close": [79.1, 79.12, 79.15, 79.20]},
            "LQD": {"value": 105.50, "prev": 105.40, "val_5d_ago": 105.30, "month_ago": 104.80, "change_pct": 0.09, "change_pct_5d": 0.19, "change_pct_4w": 0.67, "history_close": [105.3, 105.35, 105.4, 105.5]},
            "EUR_BOND": {"value": 181.00, "prev": 180.80, "val_5d_ago": 180.50, "month_ago": 179.80, "change_pct": 0.11, "change_pct_5d": 0.28, "change_pct_4w": 0.67, "history_close": [180.5, 180.6, 180.8, 181.0]}
        }
        return fallbacks.get(name, {"value": 100.0, "prev": 100.0, "val_5d_ago": 100.0, "month_ago": 100.0, "change_pct": 0.0, "change_pct_5d": 0.0, "change_pct_4w": 0.0, "history_close": [100.0, 100.0]})
