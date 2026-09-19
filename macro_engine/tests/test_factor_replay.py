import unittest

from factor_replay import analyze, split_rows


class FactorReplayTests(unittest.TestCase):
    """Replay cohorts must exclude mixed/neutral states from full alignment."""

    def setUp(self):
        self.rows = [
            {"timestamp": "2024-01-01", "pair": "EURUSD", "rate_level": 1, "rate_momentum": 1, "ret_1d": 0.20, "ret_3d": 0.40},
            {"timestamp": "2024-01-02", "pair": "EURUSD", "rate_level": -1, "rate_momentum": -1, "ret_1d": -0.10, "ret_3d": -0.30},
            {"timestamp": "2024-01-03", "pair": "GBPUSD", "rate_level": 1, "rate_momentum": 0, "ret_1d": -0.20, "ret_3d": 0.10},
            {"timestamp": "2024-01-04", "pair": "GBPUSD", "rate_level": "", "rate_momentum": 1, "ret_1d": 0.30, "ret_3d": 0.50},
        ]

    def test_factor_metrics_ignore_unavailable_values(self):
        report = analyze(self.rows, ["rate_level", "rate_momentum"], ["ret_1d", "ret_3d"])
        self.assertEqual(report["factors"]["rate_level"]["ret_1d"]["observations"], 3)
        self.assertEqual(report["factors"]["rate_level"]["ret_1d"]["directional_observations"], 3)
        self.assertEqual(report["factors"]["rate_momentum"]["ret_1d"]["observations"], 4)

    def test_alignment_requires_full_available_alignment(self):
        report = analyze(self.rows, ["rate_level", "rate_momentum"], ["ret_1d"])
        self.assertEqual(report["alignment"]["ret_1d"]["observations"], 2)
        self.assertEqual(report["alignment"]["ret_1d"]["directional_observations"], 2)

    def test_cutoff_is_strict_and_point_in_time(self):
        train, test = split_rows(self.rows, "2024-01-03")
        self.assertEqual(len(train), 2)
        self.assertEqual(len(test), 2)
        self.assertLess(max(r["timestamp"] for r in train), min(r["timestamp"] for r in test))


if __name__ == "__main__":
    unittest.main()
