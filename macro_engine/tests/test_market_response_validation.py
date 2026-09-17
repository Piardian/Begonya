import datetime as dt
import math
import tempfile
import unittest
from pathlib import Path

from calibration.market_response_validation import (
    calculate_usd_returns,
    classify_bucket,
    compute_bucket_metrics,
    rank_data,
    resolve_event_datetime,
    run_market_response_analysis,
    spearman_rank_ic,
)


class TestMarketResponseValidation(unittest.TestCase):
    def test_rank_data(self):
        # Empty and single
        self.assertEqual(rank_data([]), [])
        self.assertEqual(rank_data([42.0]), [1.0])

        # Strict ascending
        self.assertEqual(rank_data([10.0, 20.0, 30.0]), [1.0, 2.0, 3.0])

        # Strict descending
        self.assertEqual(rank_data([30.0, 20.0, 10.0]), [3.0, 2.0, 1.0])

        # With ties: values 10, 20, 20, 40
        # 10 is rank 1. 20, 20 occupy ranks 2 and 3 -> avg rank 2.5. 40 is rank 4.
        self.assertEqual(rank_data([10.0, 20.0, 20.0, 40.0]), [1.0, 2.5, 2.5, 4.0])

    def test_spearman_rank_ic(self):
        # Degenerate cases
        self.assertEqual(spearman_rank_ic([], []), 0.0)
        self.assertEqual(spearman_rank_ic([1.0], [2.0]), 0.0)

        # Perfect positive monotonic
        x = [1.0, 2.0, 3.0, 4.0, 5.0]
        y = [10.0, 25.0, 50.0, 80.0, 120.0]
        self.assertAlmostEqual(spearman_rank_ic(x, y), 1.0, places=4)

        # Perfect inverse monotonic
        y_rev = [120.0, 80.0, 50.0, 25.0, 10.0]
        self.assertAlmostEqual(spearman_rank_ic(x, y_rev), -1.0, places=4)

        # Flat / zero variance
        self.assertEqual(spearman_rank_ic([1.0, 2.0, 3.0], [5.0, 5.0, 5.0]), 0.0)

    def test_resolve_event_datetime(self):
        # Case 1: 19:30 UTC timestamp (midnight Iran placeholder) -> should advance date by 1 day
        row_nfp = {
            "indicator_type": "nfp",
            "date": "2024-02-01",
            "event_timestamp_utc": "2024-02-01T20:30:00+00:00",
        }
        edate, ehour = resolve_event_datetime(row_nfp)
        self.assertEqual(edate, dt.date(2024, 2, 2))
        self.assertEqual(ehour, 15)  # 8:30 AM US Eastern -> 15:30 broker time

        # Case 2: Direct UTC timestamp for PMI (10:00 AM US Eastern -> 17:00 broker time)
        row_pmi = {
            "indicator_type": "pmi",
            "date": "2024-02-01",
            "event_timestamp_utc": "2024-02-01T15:00:00+00:00",
        }
        edate, ehour = resolve_event_datetime(row_pmi)
        self.assertEqual(edate, dt.date(2024, 2, 1))
        self.assertEqual(ehour, 17)

    def test_calculate_usd_returns(self):
        # EURUSD: p0 = 1.1000, drops to 1.0900 (USD rally of 100 pips / ~90.9 bps)
        ret = calculate_usd_returns(1.1000, 1.0900)
        self.assertAlmostEqual(ret, (0.0100 / 1.1000) * 10000.0, places=3)
        self.assertGreater(ret, 0.0)

        # EURUSD: p0 = 1.1000, rises to 1.1100 (USD drops)
        ret_neg = calculate_usd_returns(1.1000, 1.1100)
        self.assertLess(ret_neg, 0.0)

    def test_classify_bucket(self):
        self.assertEqual(classify_bucket(-2.5), "1_strong_neg")
        self.assertEqual(classify_bucket(-1.5), "2_mod_neg")
        self.assertEqual(classify_bucket(0.0), "3_in_line")
        self.assertEqual(classify_bucket(1.5), "4_mod_pos")
        self.assertEqual(classify_bucket(2.5), "5_strong_pos")

    def test_run_market_response_analysis_with_mock_data(self):
        # Create synthetic observations and mock price bars
        csv_content = """date,event_timestamp_utc,indicator_type,event,country,actual,forecast,previous,revision,unit,importance,calendar_id,ticker,source,source_url,provider,provider_endpoint,point_in_time
2020-01-09,2020-01-09T20:30:00+00:00,nfp,Non-Farm Employment Change,United States,200000.0,150000.0,140000.0,,persons,High,,,,ForexFactory,,ForexFactory,,True
2020-02-06,2020-02-06T20:30:00+00:00,nfp,Non-Farm Employment Change,United States,100000.0,160000.0,150000.0,,persons,High,,,,ForexFactory,,ForexFactory,,True
2021-01-07,2021-01-07T20:30:00+00:00,nfp,Non-Farm Employment Change,United States,250000.0,150000.0,140000.0,,persons,High,,,,ForexFactory,,ForexFactory,,True
2021-02-04,2021-02-04T20:30:00+00:00,nfp,Non-Farm Employment Change,United States,80000.0,180000.0,150000.0,,persons,High,,,,ForexFactory,,ForexFactory,,True
"""
        with tempfile.TemporaryDirectory() as td:
            csv_path = Path(td) / "obs.csv"
            csv_path.write_text(csv_content, encoding="utf-8")

            # Mock bars for 2021-01-08 and 2021-02-05 (date + 1 day)
            # Positive surprise on 2021-01-08 -> EURUSD drops (USD rallies)
            # Negative surprise on 2021-02-05 -> EURUSD rises (USD drops)
            bar_map = {
                (dt.date(2021, 1, 8), 15): {"open": 1.2000, "high": 1.2010, "low": 1.1940, "close": 1.1950},
                (dt.date(2021, 1, 8), 16): {"open": 1.1950, "high": 1.1960, "low": 1.1930, "close": 1.1940},
                (dt.date(2021, 1, 8), 19): {"open": 1.1940, "high": 1.1950, "low": 1.1920, "close": 1.1930},
                (dt.date(2021, 2, 5), 15): {"open": 1.2000, "high": 1.2060, "low": 1.1990, "close": 1.2050},
                (dt.date(2021, 2, 5), 16): {"open": 1.2050, "high": 1.2070, "low": 1.2040, "close": 1.2060},
                (dt.date(2021, 2, 5), 19): {"open": 1.2060, "high": 1.2080, "low": 1.2050, "close": 1.2070},
            }

            res = run_market_response_analysis(
                csv_path,
                bar_map,
                test_years=(2021,),
                min_observations=2,
            )

            self.assertEqual(res["metadata"]["total_matched_events"], 2)
            ic_data = res["spearman_rank_ic"]["immediate_30m_1h"]
            # Since rank(Z) aligns with rank(return), IC should be positive
            self.assertGreater(ic_data["mad"], 0.0)
            self.assertGreater(ic_data["std"], 0.0)


if __name__ == "__main__":
    unittest.main()
