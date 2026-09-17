import datetime as dt
import tempfile
import unittest
from pathlib import Path

from calibration.replay import validate_replay_dataset, chronological_rows
from calibration.surprise_sigma import calibrate_from_csv, load_observations_csv
from data_quality import DataUnavailableError


class ReplayAndCalibrationContractTests(unittest.TestCase):
    def test_replay_rejects_future_market_snapshot(self):
        rows = [{
            "timestamp": "2023-03-13T12:00:00+00:00",
            "market": {"timestamp": "2023-03-13T12:01:00+00:00"},
            "fred": {"timestamp": "2023-03-13T11:59:00+00:00"},
        }]
        with self.assertRaises(DataUnavailableError):
            validate_replay_dataset(rows)

    def test_replay_keeps_scheduled_future_event_without_actual(self):
        rows = [{
            "timestamp": "2023-03-13T12:00:00+00:00",
            "market": {"timestamp": "2023-03-13T11:59:00+00:00"},
            "fred": {"timestamp": "2023-03-13T11:59:00+00:00"},
            "calendar_events": [{
                "title": "CPI",
                "event_time_utc": "2023-03-13T12:15:00+00:00",
                "actual": "",
            }],
        }]
        self.assertEqual(len(validate_replay_dataset(rows)), 1)

    def test_chronological_rows_validates_before_sorting(self):
        rows = [
            {"timestamp": "2023-03-14T12:00:00+00:00", "market": {"timestamp": "2023-03-14T11:59:00+00:00"}, "fred": {"timestamp": "2023-03-14T11:59:00+00:00"}},
            {"timestamp": "2023-03-13T12:00:00+00:00", "market": {"timestamp": "2023-03-13T11:59:00+00:00"}, "fred": {"timestamp": "2023-03-13T11:59:00+00:00"}},
        ]
        ordered = chronological_rows(rows)
        self.assertEqual(ordered[0]["timestamp"], "2023-03-13T12:00:00+00:00")

    def test_empty_calibration_dataset_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "observations.csv"
            path.write_text("date,indicator_type,actual,forecast,source\n", encoding="utf-8")
            with self.assertRaises(ValueError):
                load_observations_csv(path)

    def test_calibration_fails_when_required_indicator_has_insufficient_samples(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "observations.csv"
            rows = ["date,indicator_type,actual,forecast,source"]
            for i in range(10):
                date = dt.date(2024, 1, 1) + dt.timedelta(days=i)
                rows.append(f"{date.isoformat()},cpi,{0.2 + i/100:.4f},0.2,test")
            path.write_text("\n".join(rows) + "\n", encoding="utf-8")
            with self.assertRaises(ValueError):
                calibrate_from_csv(
                    path,
                    calibration_end=dt.date(2024, 12, 31),
                    validation_end=dt.date(2025, 6, 30),
                    min_observations=30,
                    required_indicators=("cpi",),
                )


if __name__ == "__main__":
    unittest.main(verbosity=2)
