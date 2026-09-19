import tempfile
import unittest
from pathlib import Path

from build_factor_dataset import add_forward_returns, validate


class FactorDatasetBuilderTests(unittest.TestCase):
    def test_forward_returns_are_pair_local(self):
        rows = [
            {"date": "2024-01-01", "pair": "EURUSD", "fx_close": "1.00"},
            {"date": "2024-01-02", "pair": "EURUSD", "fx_close": "1.01"},
            {"date": "2024-01-03", "pair": "EURUSD", "fx_close": "1.02"},
            {"date": "2024-01-01", "pair": "USDJPY", "fx_close": "150"},
            {"date": "2024-01-02", "pair": "USDJPY", "fx_close": "151"},
        ]
        out = add_forward_returns(rows)
        eur = [r for r in out if r["pair"] == "EURUSD"][0]
        self.assertEqual(eur["ret_1d"], "1.00000000")
        self.assertEqual(eur["ret_3d"], "")

    def test_rejects_unexpected_pairs(self):
        with self.assertRaises(ValueError):
            validate([{"date": "2024-01-01", "pair": "BTCUSD", "fx_close": "1"}])


if __name__ == "__main__":
    unittest.main()
