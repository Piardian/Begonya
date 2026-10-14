import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from research.diagnostic_engine import DiagnosticEngine


class TestDiagnosticEngine(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.test_dir.name)
        (self.root / "benchmark").mkdir()
        (self.root / "data").mkdir()
        self.engine = DiagnosticEngine(
            data_root=self.root / "data",
            project_root=self.root,
            report_path=self.root / "diagnostics" / "report.md",
        )

    def tearDown(self):
        self.test_dir.cleanup()

    def test_load_notified_pois_empty(self):
        self.assertEqual(self.engine.load_notified_pois(), [])

    def test_load_notified_pois_with_data(self):
        mock_data = [{"id": "test_1", "symbol": "BTCUSD"}]
        with (self.root / "data" / "notified_pois.json").open("w", encoding="utf-8") as handle:
            json.dump(mock_data, handle)
        pois = self.engine.load_notified_pois()
        self.assertEqual(len(pois), 1)
        self.assertEqual(pois[0]["id"], "test_1")

    def test_calculate_metrics_uses_ledger_and_date_windows(self):
        ledger = [{
            "record_id": "test-1",
            "timestamp_utc": "2026-10-13T10:00:00Z",
            "post_trade_audit": {
                "actual_outcome": "WIN",
                "realized_pnl_usd": 100,
                "realized_r": 1.0,
            },
        }]
        with (self.root / "benchmark" / "benchmark_records.json").open("w", encoding="utf-8") as handle:
            json.dump(ledger, handle)
        metrics = self.engine.calculate_metrics(
            datetime(2026, 10, 14, 10, tzinfo=timezone.utc)
        )
        self.assertEqual(metrics["last_7_days"]["records"], 1)
        self.assertEqual(metrics["last_7_days"]["realized_pnl_usd_sum"], 100)
        self.assertEqual(metrics["filter_pass_reject_metrics"]["status"], "UNAVAILABLE")

    def test_generate_markdown_report(self):
        ledger = [{
            "record_id": "test-1",
            "timestamp_utc": "2026-10-13T10:00:00Z",
            "post_trade_audit": {
                "actual_outcome": "WIN",
                "realized_pnl_usd": 100,
                "realized_r": 1.0,
            },
        }]
        with (self.root / "benchmark" / "benchmark_records.json").open("w", encoding="utf-8") as handle:
            json.dump(ledger, handle)
        metrics = self.engine.calculate_metrics(
            datetime(2026, 10, 14, 10, tzinfo=timezone.utc)
        )
        report = self.engine.generate_markdown_report(metrics)
        self.assertIn("# Begonya Signal Diagnostics", report)
        self.assertIn("Realized PnL sum (USD): 100.0", report)
        self.assertIn("UNAVAILABLE", report)


if __name__ == "__main__":
    unittest.main()
