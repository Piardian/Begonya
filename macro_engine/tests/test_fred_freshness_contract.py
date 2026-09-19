import datetime as dt
import unittest

from core.deterministic_controls import DataUnavailableError
from preprocessing.metrics import MacroMetricsCalculator


class FredFreshnessContractTests(unittest.TestCase):
    def test_wtregen_accepts_normal_weekly_observation_gap(self):
        calculator = MacroMetricsCalculator(as_of_date=dt.date(2024, 10, 1))
        fred = {
            "data_quality": {
                "observation_dates": {
                    "WTREGEN": "2024-09-25",
                }
            }
        }

        freshness = calculator._validate_fred_freshness(fred, dt.date(2024, 10, 1))

        self.assertEqual(freshness["WTREGEN"], 6)

    def test_wtregen_still_rejects_excessive_weekly_staleness(self):
        calculator = MacroMetricsCalculator(as_of_date=dt.date(2024, 10, 1))
        fred = {
            "data_quality": {
                "observation_dates": {
                    "WTREGEN": "2024-09-20",
                }
            }
        }

        with self.assertRaises(DataUnavailableError):
            calculator._validate_fred_freshness(fred, dt.date(2024, 10, 1))


if __name__ == "__main__":
    unittest.main()
