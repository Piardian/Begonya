import datetime as dt
import unittest

from preprocessing.economic_regimes import build_economic_regime_snapshot


class EconomicRegimeTests(unittest.TestCase):
    def base_fred(self):
        values = {
            "CPI_YOY": 3.0,
            "CORE_CPI_YOY": 3.2,
            "PCE_YOY": 2.6,
            "CORE_PCE_YOY": 2.8,
            "PAYEMS": 158000.0,
            "UNRATE": 4.0,
            "AHE_YOY": 3.6,
            "GDP_QOQ_SAAR": 2.4,
            "INDPRO": 102.0,
            "RSAFS": 105.0,
            "DGS3MO": 5.0,
            "DGS2": 4.5,
            "DGS5": 4.2,
            "DGS10": 4.0,
            "DGS30": 4.2,
            "T10Y2Y": -0.50,
            "T10Y3M": -1.00,
        }
        prior = {
            "CPI_YOY": 3.1,
            "CORE_CPI_YOY": 3.3,
            "PCE_YOY": 2.7,
            "CORE_PCE_YOY": 2.9,
            "PAYEMS": 157950.0,
            "UNRATE": 4.0,
            "AHE_YOY": 3.7,
            "GDP_QOQ_SAAR": 2.4,
            "INDPRO": 101.5,
            "RSAFS": 104.0,
            "DGS3MO": 5.1,
            "DGS2": 4.6,
            "DGS5": 4.3,
            "DGS10": 3.8,
            "DGS30": 4.0,
            "T10Y2Y": -0.80,
            "T10Y3M": -1.30,
        }
        fred = dict(values)
        for key, value in prior.items():
            fred[f"{key}_4W_AGO"] = value
        fred["ICSA"] = 220.0
        fred["ICSA_4W_AGO"] = 228.0
        fred["DFF"] = 4.33
        fred["data_quality"] = {
            "vintage_end": "2024-03-31",
            "economic_observation_dates": {
                key: ("2024-03-29" if key.startswith("DG") or key.startswith("T10") else "2024-03-01")
                for key in values
            },
        }
        fred["data_quality"]["economic_observation_dates"]["GDP_QOQ_SAAR"] = "2024-03-29"
        fred["data_quality"]["economic_observation_dates"]["ICSA"] = "2024-03-29"
        return fred

    def test_complete_panel_is_deterministic_and_split_by_dimension(self):
        fred = self.base_fred()
        first = build_economic_regime_snapshot(fred, as_of=dt.date(2024, 3, 31))
        second = build_economic_regime_snapshot(fred, as_of=dt.date(2024, 3, 31))
        self.assertEqual(first, second)
        self.assertEqual(first["status"], "COMPLETE")
        self.assertEqual(first["inflation_regime"]["signal"], "FALLING")
        self.assertEqual(first["labor_regime"]["signal"], "RESILIENT")
        self.assertEqual(first["growth_regime"]["signal"], "EXPANDING")
        self.assertTrue(first["rate_curve_regime"]["two_ten_inverted"])
        self.assertEqual(first["rate_curve_regime"]["curve_move"], "STEEPENING")
        self.assertFalse(first["interpretation_guardrails"]["no_composite_score"] is False)

    def test_missing_fields_withhold_economic_narrative(self):
        result = build_economic_regime_snapshot({})
        self.assertEqual(result["status"], "UNAVAILABLE")
        self.assertIn("CPI_YOY", result["missing_fields"])
        self.assertNotIn("inflation_regime", result)


if __name__ == "__main__":
    unittest.main(verbosity=2)
