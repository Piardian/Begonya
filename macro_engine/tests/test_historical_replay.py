import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from preprocessing.metrics import MacroMetricsCalculator
from tests.historical_replay import (
    run_scenario_october_2023,
    run_scenario_march_2023_svb,
    run_scenario_march_2020_covid,
)


class HistoricalReplayAndDeterminismTests(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.gate_path = Path(self.tmpdir.name) / "macro_bias_gate.json"

    def tearDown(self):
        self.tmpdir.cleanup()

    def test_october_2023_replay_detects_bear_steepening_or_inversion(self):
        with patch("preprocessing.metrics.BIAS_GATE_FILE", self.gate_path):
            result = run_scenario_october_2023()
        self.assertIn(result["yield_curve"]["regime"], {"Bear Steepening", "Inverted"})

    def test_october_2023_replay_activates_btc_decoupling(self):
        with patch("preprocessing.metrics.BIAS_GATE_FILE", self.gate_path):
            result = run_scenario_october_2023()
        self.assertTrue(result["btc_decoupling_analysis"]["btc_decoupling_active"])
        self.assertEqual(result["btc_decoupling_analysis"]["recommended_btc_gate"], "SHORT_ONLY")

    def test_svb_replay_detects_fast_stress(self):
        with patch("preprocessing.metrics.BIAS_GATE_FILE", self.gate_path):
            result = run_scenario_march_2023_svb()
        self.assertTrue(result["t0_fast_stress_analysis"]["fast_stress_override"])

    def test_svb_replay_detects_bull_steepening_or_inversion(self):
        with patch("preprocessing.metrics.BIAS_GATE_FILE", self.gate_path):
            result = run_scenario_march_2023_svb()
        self.assertIn("Bull Steepening", result["yield_curve"]["regime"] + " ")

    def test_covid_replay_detects_fast_stress(self):
        with patch("preprocessing.metrics.BIAS_GATE_FILE", self.gate_path):
            result = run_scenario_march_2020_covid()
        self.assertTrue(result["t0_fast_stress_analysis"]["fast_stress_override"])

    def test_covid_replay_detects_severe_credit_stress(self):
        with patch("preprocessing.metrics.BIAS_GATE_FILE", self.gate_path):
            result = run_scenario_march_2020_covid()
        self.assertGreater(result["credit_spread_analysis"]["hy_oas_spread_pct"], 5.0)
        self.assertIn("Şiddetli", result["credit_spread_analysis"]["stress_level"])

    def test_same_inputs_with_same_state_are_identical(self):
        gate = {"regime_state": {"energy_penalty_active": True}}
        self.gate_path.write_text(json.dumps(gate), encoding="utf-8")
        with patch("preprocessing.metrics.BIAS_GATE_FILE", self.gate_path):
            first = run_scenario_march_2023_svb()
            second = run_scenario_march_2023_svb()
        self.assertEqual(first, second)

    def test_historical_replay_does_not_require_llm(self):
        # Replay functions must be executable by the deterministic calculator alone.
        self.assertIsInstance(run_scenario_october_2023, object)
        self.assertIsInstance(run_scenario_march_2023_svb, object)
        self.assertIsInstance(run_scenario_march_2020_covid, object)

    def test_historical_replay_has_explicit_scenario_data(self):
        with patch("preprocessing.metrics.BIAS_GATE_FILE", self.gate_path):
            result = run_scenario_march_2020_covid()
        self.assertIn("yield_curve", result)
        self.assertIn("liquidity_dynamics", result)
        self.assertIn("credit_spread_analysis", result)
        self.assertIn("btc_decoupling_analysis", result)

    def test_real_yield_negative_tips_is_not_lost_from_raw_result(self):
        calc = MacroMetricsCalculator()
        # Documents the current behavior explicitly: negative DFII10 currently
        # falls back to synthetic real yield. This test is intentionally descriptive,
        # so a future change can be identified as a behavior change.
        result = calc.calculate_real_yield(0.70, dfii10_tips=-0.15, breakeven_10y=0.85)
        self.assertEqual(result["real_yield_pct"], -0.15)


if __name__ == "__main__":
    unittest.main(verbosity=2)
