import datetime as dt
import unittest

from core.deterministic_controls import (
    chronological_split,
    event_freeze_status,
    fit_surprise_sigmas,
    parse_numeric,
    resolve_execution_gate,
    resolve_hysteresis,
    return_correlation,
    signed_surprise_zscore,
    validate_freshness,
    validate_numeric_range,
)
from data_quality import DataUnavailableError


class DeterministicControlsTests(unittest.TestCase):
    def test_hysteresis_uses_explicit_previous_state(self):
        active = resolve_hysteresis(83.0, True, {"energy_penalty_active": True})
        inactive = resolve_hysteresis(83.0, True, {"energy_penalty_active": False})
        self.assertTrue(active["energy_penalty_active"])
        self.assertFalse(inactive["energy_penalty_active"])

    def test_event_freeze_is_deterministic_and_boundary_inclusive(self):
        now = dt.datetime(2026, 1, 1, 12, 0, tzinfo=dt.timezone.utc)
        event = [{"title": "CPI", "impact": "High", "time": "2026-01-01T12:15:00+00:00"}]
        self.assertTrue(event_freeze_status(event, now)["active"])
        event[0]["time"] = "2026-01-01T11:45:00+00:00"
        self.assertTrue(event_freeze_status(event, now)["active"])
        event[0]["time"] = "2026-01-01T11:44:00+00:00"
        self.assertFalse(event_freeze_status(event, now)["active"])

    def test_stale_data_fails_closed(self):
        with self.assertRaises(DataUnavailableError):
            validate_freshness("DE10Y", dt.date(2026, 1, 1), dt.date(2026, 3, 1), "monthly")

    def test_range_validation_rejects_corrupt_values(self):
        with self.assertRaises(DataUnavailableError):
            validate_numeric_range("VIX", -1, 0, 200)
        with self.assertRaises(DataUnavailableError):
            validate_numeric_range("BTC", float("nan"), 0, 1_000_000)
        self.assertEqual(validate_numeric_range("gold", 2000, 0, 100_000), 2000.0)

    def test_calendar_numeric_parser_handles_common_units(self):
        self.assertEqual(parse_numeric("450K"), 450_000.0)
        self.assertEqual(parse_numeric("1.2M"), 1_200_000.0)
        self.assertEqual(parse_numeric("0.3%"), 0.3)
        self.assertEqual(parse_numeric("-25K"), -25_000.0)

    def test_unemployment_surprise_direction_is_inverted(self):
        z = signed_surprise_zscore("unemployment", 3.5, 3.7, 0.1)
        self.assertEqual(z, 2.0)

    def test_return_correlation_is_not_price_level_correlation(self):
        self.assertAlmostEqual(return_correlation([100, 101, 102, 104], [50, 51, 52, 54]), 0.9939, places=3)

    def test_calibration_requires_real_observations(self):
        rows = [
            {"indicator_type": "nfp", "actual": 100 + i, "forecast": 90, "date": f"2025-01-{(i % 28) + 1:02d}"}
            for i in range(30)
        ]
        fitted = fit_surprise_sigmas(rows, min_observations=30)
        self.assertIn("nfp", fitted)
        self.assertGreater(fitted["nfp"], 0)

    def test_chronological_split_prevents_overlap(self):
        rows = [
            {"date": "2024-12-31", "x": 1},
            {"date": "2025-01-01", "x": 2},
            {"date": "2025-06-01", "x": 3},
        ]
        split = chronological_split(rows, dt.date(2024, 12, 31), dt.date(2025, 3, 31))
        self.assertEqual([r["x"] for r in split["calibration"]], [1])
        self.assertEqual([r["x"] for r in split["validation"]], [2])
        self.assertEqual([r["x"] for r in split["out_of_sample"]], [3])

    def test_gate_precedence_is_deterministic(self):
        result = resolve_execution_gate(
            "LONG_ONLY", event_freeze=True, systemic_stress=False, risk_score=0.2
        )
        self.assertEqual(result["gate"], "NO_TRADE")
        result = resolve_execution_gate(
            "LONG_ONLY", event_freeze=False, systemic_stress=True, risk_score=0.2
        )
        self.assertEqual(result["gate"], "DEFENSIVE_HOLD")
        result = resolve_execution_gate("LONG_ONLY")
        self.assertEqual(result["gate"], "LONG_ONLY")


if __name__ == "__main__":
    unittest.main(verbosity=2)
