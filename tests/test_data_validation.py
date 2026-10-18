import sys
import unittest
from pathlib import Path
import pandas as pd
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "begonya_convexity_engine"))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sfp_orb_engine.data_provider import MarketDataProvider
from data.market_loader import MarketLoader

class TestDataValidation(unittest.TestCase):
    def setUp(self):
        self.provider = MarketDataProvider()
        self.loader = MarketLoader()

    def test_sfp_validate_candles_empty(self):
        valid, reason = self.provider.validate_candles(None)
        self.assertFalse(valid)
        self.assertIn("INSUFFICIENT_DATA", reason)

        valid, reason = self.provider.validate_candles(pd.DataFrame())
        self.assertFalse(valid)
        self.assertIn("INSUFFICIENT_DATA", reason)

    def test_sfp_validate_candles_insufficient_bars(self):
        df = pd.DataFrame({
            "open": [1.0] * 10,
            "high": [1.1] * 10,
            "low": [0.9] * 10,
            "close": [1.05] * 10
        })
        valid, reason = self.provider.validate_candles(df, min_bars=25)
        self.assertFalse(valid)
        self.assertIn("INSUFFICIENT_DATA", reason)

    def test_sfp_validate_candles_corrupt_prices(self):
        df = pd.DataFrame({
            "open": [1.0] * 30,
            "high": [1.1] * 30,
            "low": [-0.5] * 30,
            "close": [1.05] * 30
        })
        valid, reason = self.provider.validate_candles(df, min_bars=25)
        self.assertFalse(valid)
        self.assertIn("INSUFFICIENT_DATA", reason)

    def test_sfp_validate_candles_valid(self):
        df = pd.DataFrame({
            "open": [1.0] * 30,
            "high": [1.1] * 30,
            "low": [0.9] * 30,
            "close": [1.05] * 30
        })
        valid, reason = self.provider.validate_candles(df, min_bars=25)
        self.assertTrue(valid)
        self.assertEqual(reason, "OK")

    def test_convexity_validate_symbol_data(self):
        valid, reason = self.loader.validate_symbol_data(None)
        self.assertFalse(valid)
        self.assertIn("INSUFFICIENT_DATA", reason)

        df = pd.DataFrame({
            "open": [100.0] * 60,
            "high": [105.0] * 60,
            "low": [95.0] * 60,
            "close": [102.0] * 60
        })
        valid, reason = self.loader.validate_symbol_data(df, min_bars=50)
        self.assertTrue(valid)
        self.assertEqual(reason, "OK")

if __name__ == "__main__":
    unittest.main()
