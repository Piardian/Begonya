import unittest
from datetime import date
from unittest.mock import patch

from data_quality import DataUnavailableError
from preprocessing.metrics import MacroMetricsCalculator


class DataIntegrityTests(unittest.TestCase):
    def test_negative_tips_is_direct_observation(self):
        result = MacroMetricsCalculator().calculate_real_yield(
            0.70, dfii10_tips=-0.15, breakeven_10y=0.85
        )
        self.assertEqual(result["real_yield_pct"], -0.15)
        self.assertIn("FRED DFII10", result["yield_source"])

    def test_missing_core_market_data_fails_closed(self):
        from ingestion.market_data import MarketDataIngestion
        ingestion = MarketDataIngestion()
        with patch.object(ingestion.mt5_feed, "fetch_symbol_bars", return_value=None), \
             patch("ingestion.market_data_legacy.yf.Ticker") as ticker:
            ticker.return_value.history.side_effect = RuntimeError("feed unavailable")
            with self.assertRaises(DataUnavailableError):
                ingestion.fetch_current_prices()

    def test_replay_clock_is_injected(self):
        calc = MacroMetricsCalculator()
        # Base payload is constructed from the deterministic test fixture helpers.
        from tests.test_deterministic_metrics import DeterministicMacroMetricsTests
        helper = DeterministicMacroMetricsTests("runTest")
        market = helper.base_market()
        fred = helper.base_fred()
        first = calc.process_all_macro_data(
            market,
            fred,
            [],
            as_of_datetime=__import__("datetime").datetime(2023, 9, 20, 12, 0),
        )
        second = calc.process_all_macro_data(
            market,
            fred,
            [],
            as_of_datetime=__import__("datetime").datetime(2023, 9, 20, 12, 0),
        )
        self.assertEqual(first, second)


if __name__ == "__main__":
    unittest.main(verbosity=2)
