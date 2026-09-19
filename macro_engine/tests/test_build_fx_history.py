import datetime as dt
import unittest

from build_fx_history import FX_SERIES, build


class FakeFred:
    def __init__(self):
        self.calls = []

    def _get_observations(self, series_id, start, end):
        self.calls.append((series_id, start, end))
        return [(dt.date(2024, 1, 2), 2.0)]


class FxHistoryTests(unittest.TestCase):
    def test_expected_fred_series_and_orientation(self):
        rows = build(dt.date(2024, 1, 1), dt.date(2024, 1, 3), "dummy")
        self.assertEqual({r["pair"] for r in rows}, set(FX_SERIES))
        self.assertEqual(len(rows), 7)
        self.assertEqual(rows[0]["fx_close"], "2.0000000000")


if __name__ == "__main__":
    unittest.main()
