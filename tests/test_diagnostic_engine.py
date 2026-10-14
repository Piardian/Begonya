import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from research.diagnostic_engine import DiagnosticEngine


class DiagnosticEngineTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / "benchmark").mkdir()
        (self.root / "data").mkdir()
        self.ledger = [
            {
                "record_id": "closed-win",
                "timestamp_utc": "2026-10-10T12:00:00Z",
                "post_trade_audit": {
                    "actual_outcome": "WIN",
                    "realized_pnl_usd": 120,
                    "realized_r": 1.2,
                },
            },
            {
                "record_id": "no-entry",
                "timestamp_utc": "2026-10-09T12:00:00Z",
                "post_trade_audit": {
                    "actual_outcome": "INVALID_NO_ENTRY",
                    "realized_pnl_usd": 0,
                    "realized_r": 0,
                },
            },
            {
                "record_id": "open",
                "timestamp_utc": "2026-10-03T12:00:00Z",
                "post_trade_audit": {"actual_outcome": "ACTIVE"},
            },
            {
                "record_id": "old-loss",
                "timestamp_utc": "2026-09-20T12:00:00Z",
                "post_trade_audit": {
                    "actual_outcome": "LOSS",
                    "realized_pnl_usd": -80,
                    "realized_r": -0.8,
                },
            },
        ]
        (self.root / "benchmark" / "benchmark_records.json").write_text(
            json.dumps(self.ledger), encoding="utf-8"
        )
        (self.root / "data" / "active_poi_watchlist.json").write_text(
            json.dumps([{"status": "ACTIVE"}, {"status": "INVALIDATED"}]), encoding="utf-8"
        )
        self.engine = DiagnosticEngine(
            project_root=self.root,
            data_root=self.root / "data",
            report_path=self.root / "diagnostics" / "report.md",
        )

    def tearDown(self):
        self.temp.cleanup()

    def test_separates_current_and_previous_seven_day_windows(self):
        metrics = self.engine.calculate_metrics(
            as_of=datetime(2026, 10, 14, 12, tzinfo=timezone.utc)
        )
        self.assertEqual(metrics["last_7_days"]["records"], 2)
        self.assertEqual(metrics["last_7_days"]["realized_pnl_usd_sum"], 120)
        self.assertEqual(metrics["last_7_days"]["no_entry_records"], 1)
        self.assertEqual(metrics["previous_7_days"]["records"], 1)
        self.assertEqual(metrics["previous_7_days"]["open_or_runner_records"], 1)

    def test_missing_ledger_fails_loudly(self):
        self.engine.benchmark_path = self.root / "missing.json"
        with self.assertRaises(FileNotFoundError):
            self.engine.calculate_metrics()

    def test_report_does_not_claim_unmeasured_filter_rate(self):
        metrics = self.engine.calculate_metrics(
            as_of=datetime(2026, 10, 14, 12, tzinfo=timezone.utc)
        )
        report = self.engine.generate_markdown_report(metrics)
        self.assertIn("UNAVAILABLE", report)
        self.assertNotIn("75.0%", report)

    def test_run_can_be_non_writing(self):
        self.engine.run_diagnostic(
            as_of=datetime(2026, 10, 14, 12, tzinfo=timezone.utc),
            write_report=False,
        )
        self.assertFalse(self.engine.report_path.exists())


if __name__ == "__main__":
    unittest.main()
