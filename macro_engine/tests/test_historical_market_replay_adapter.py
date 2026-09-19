import datetime as dt
import unittest

from calibration.historical_market_replay import HistoricalMarketReplayIngestion
from data_quality import DataUnavailableError


class HistoricalMarketReplayAdapterTests(unittest.TestCase):
    def test_payload_uses_only_historical_closes(self):
        as_of = dt.datetime(2023, 10, 15, 12, tzinfo=dt.timezone.utc)
        payload = HistoricalMarketReplayIngestion._build_payload(
            "DXY",
            [100.0 + i for i in range(60)],
            as_of,
            "test",
        )
        self.assertEqual(payload["value"], 159.0)
        self.assertEqual(payload["prev"], 158.0)
        self.assertEqual(payload["snapshot_timestamp"], as_of.isoformat())
        self.assertEqual(payload["source"], "test")

    def test_payload_rejects_implausible_dxy(self):
        with self.assertRaises(ValueError):
            HistoricalMarketReplayIngestion._build_payload(
                "DXY",
                [10.0, 11.0],
                dt.datetime(2023, 10, 15, tzinfo=dt.timezone.utc),
                "test",
            )


if __name__ == "__main__":
    unittest.main()
