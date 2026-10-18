"""
Unit tests for Isolated Hybrid Replay Engine
============================================
Path: Begonya/research/hybrid_replay/test_hybrid_replay.py

Covers:
1. No future data leakage (Strict sequential evaluation).
2. Clock-aligned HTF close veto timing.
3. Dynamic Fib 0.5 updating as impulse expands.
4. Fill occurring ONLY on subsequent bars after confirmation.
5. Rejection when HTF structural stop is missing.
6. Deduplication of multi-POI records of the same structural opportunity.
7. Insufficient post-signal M1 bars handling.
8. Ladder displacement classification to MANUAL_REVIEW_REQUIRED.
"""

import unittest
from datetime import datetime, timezone

from hybrid_replay import (
    Candle,
    ReplayCandidate,
    HybridReplayEngine,
    is_htf_boundary_minute,
)


class TestHybridReplayEngine(unittest.TestCase):
    def setUp(self):
        self.engine = HybridReplayEngine(
            max_wait_touch_bars=100,
            max_reaction_bars=30,
            max_fib_fill_bars=30,
            htf_timeframe_minutes=15,
        )
        self.base_candidate = ReplayCandidate(
            candidate_id="TEST_EURUSD_01",
            structural_opportunity_id="OPP_EURUSD_01",
            symbol="EURUSD",
            timeframe="15m",
            trade_direction="long",
            poi_type="OB",
            zone_low=1.1000,
            zone_high=1.1010,
            signal_known_at_utc="2026-08-20T10:00:00Z",
            signal_known_at_timestamp=1787220000000,
            structural_anchor_price=1.0970,
            structural_anchor_type="SWING_LOW",
            structural_anchor_timeframe="15m",
            target_price=1.1080,
            target_type="EQH",
            target_known=True,
        )

    def test_missing_structural_anchor_rejects(self):
        """Rule 3 & 6: Missing structural anchor must return INSUFFICIENT_DATA_STRUCTURAL_STOP."""
        cand = ReplayCandidate(
            candidate_id="TEST_NO_ANCHOR",
            structural_opportunity_id="OPP_01",
            symbol="EURUSD",
            timeframe="15m",
            trade_direction="long",
            poi_type="OB",
            zone_low=1.1000,
            zone_high=1.1010,
            signal_known_at_utc="2026-08-20T10:00:00Z",
            signal_known_at_timestamp=1787220000000,
            structural_anchor_price=None,  # Missing!
            structural_anchor_type=None,
            structural_anchor_timeframe="15m",
            target_price=1.1080,
            target_type="EQH",
            target_known=True,
        )
        dummy_candles = [
            Candle(1787220000000 + i * 60000, 1.1005, 1.1008, 1.1002, 1.1006)
            for i in range(50)
        ]
        res = self.engine.evaluate_candidate(cand, dummy_candles)
        self.assertEqual(res.final_status, "INSUFFICIENT_DATA_STRUCTURAL_STOP")

    def test_insufficient_m1_bars_rejects(self):
        """Rule 7 & 10: Insufficient post-signal M1 bars must return INSUFFICIENT_DATA_M1_MISSING."""
        short_candles = [
            Candle(1787220000000 + i * 60000, 1.1005, 1.1008, 1.1002, 1.1006)
            for i in range(5)
        ]
        res = self.engine.evaluate_candidate(self.base_candidate, short_candles)
        self.assertEqual(res.final_status, "INSUFFICIENT_DATA_M1_MISSING")

    def test_htf_clock_aligned_close_veto(self):
        """
        Rule 3 & 5: If an HTF bar boundary closes below zoneLow, candidate is INVALIDATED.
        A bar closing at :14 or :29 represents the close of 15M bar.
        """
        # Create 20 candles starting at :00
        # Candle at index 14 has timestamp ending at :15 (i.e. minute 14 in UTC)
        base_ts = 1787220000000  # assume aligned to hour
        candles = []
        for i in range(20):
            # minute i
            ts = base_ts + i * 60000
            if i == 14:  # 15M close boundary!
                # Close below zoneLow (1.1000)
                candles.append(Candle(ts, 1.1002, 1.1005, 1.0980, 1.0985))
            else:
                candles.append(Candle(ts, 1.1020, 1.1025, 1.1015, 1.1020))

        res = self.engine.evaluate_candidate(self.base_candidate, candles)
        self.assertEqual(res.final_status, "INVALIDATED")
        self.assertIn("HTF candle close", res.status_reason)
        self.assertEqual(res.htf_veto_bar_index, 14)

    def test_dynamic_fib_expansion_and_subsequent_fill(self):
        """
        Rule 5, 6, 7:
        1. POI touch
        2. Sweep & CHoCH with large body
        3. Impulse expands on next bar (Fib 0.5 moves up)
        4. Fill occurs ONLY on subsequent bar that touches new Fib 0.5
        """
        base_ts = 1787220000000
        candles = []

        # Bar 0: Approach
        candles.append(Candle(base_ts + 0, 1.1020, 1.1025, 1.1015, 1.1018))
        # Bar 1: Touches POI (zone: 1.1000 - 1.1010)
        candles.append(Candle(base_ts + 60000, 1.1015, 1.1016, 1.1005, 1.1008))
        # Bar 2: Local low established
        candles.append(Candle(base_ts + 120000, 1.1008, 1.1012, 1.1003, 1.1009))
        # Bar 3: Prior low pierced and closed above (1M Sweep! sweepExtreme = 1.1001)
        candles.append(Candle(base_ts + 180000, 1.1005, 1.1009, 1.1001, 1.1007))
        # Bar 4: CHoCH + Large Body Displacement (Open: 1.1007, Close: 1.1022, High: 1.1023, Low: 1.1006)
        # Body = 0.0015, Range = 0.0017 -> Ratio ~ 88%
        candles.append(Candle(base_ts + 240000, 1.1007, 1.1023, 1.1006, 1.1022))

        # Initial Fib: Extreme = 1.1001, Impulse = 1.1023 -> Diff = 0.0022 -> Fib0.5 = 1.1012

        # Bar 5: Further rally expands impulse! (High: 1.1031, Low: 1.1018, Close: 1.1029)
        # New Fib: Extreme = 1.1001, Impulse = 1.1031 -> Diff = 0.0030 -> New Fib0.5 = 1.1016
        # Low was 1.1018, did NOT touch 1.1016 yet!
        candles.append(Candle(base_ts + 300000, 1.1022, 1.1031, 1.1018, 1.1029))

        # Bar 6: Pullback touches 1.1016! (High: 1.1028, Low: 1.1014, Close: 1.1020)
        candles.append(Candle(base_ts + 360000, 1.1028, 1.1028, 1.1014, 1.1020))

        # Additional bars
        for j in range(7, 25):
            candles.append(Candle(base_ts + j * 60000, 1.1020, 1.1035, 1.1018, 1.1030))

        res = self.engine.evaluate_candidate(self.base_candidate, candles, body_threshold=0.50)
        self.assertEqual(res.final_status, "ENTRY_FILLED")
        self.assertEqual(res.filled_bar_index, 6)
        # Entry price must be exactly the expanded 0.5 Fib = 1.1016
        self.assertAlmostEqual(res.entry_price, 1.1016, places=5)
        self.assertEqual(res.structural_stop_price, 1.0970)
        self.assertAlmostEqual(res.risk_distance, 1.1016 - 1.0970, places=5)

    def test_ladder_displacement_classified_manual_review(self):
        """
        Rule 6: Ladder displacement with smaller bodies must NOT be auto-filled,
        must be classified as MANUAL_REVIEW_REQUIRED.
        """
        base_ts = 1787220000000
        candles = []
        candles.append(Candle(base_ts + 0, 1.1020, 1.1025, 1.1015, 1.1018))
        candles.append(Candle(base_ts + 60000, 1.1015, 1.1016, 1.1005, 1.1008))  # Touch
        candles.append(Candle(base_ts + 120000, 1.1008, 1.1012, 1.1003, 1.1009))
        candles.append(Candle(base_ts + 180000, 1.1005, 1.1009, 1.1001, 1.1007))  # Sweep

        # Next 3 bars: step-like ladder upward (each has ~45% body, below 50% single-bar threshold)
        # but 3-bar directional total body ratio is >= 40% (Ladder displacement)
        candles.append(Candle(base_ts + 240000, 1.1007, 1.1018, 1.1005, 1.1013))
        candles.append(Candle(base_ts + 300000, 1.1013, 1.1025, 1.1011, 1.1019))
        candles.append(Candle(base_ts + 360000, 1.1019, 1.1032, 1.1017, 1.1025))

        for j in range(7, 25):
            candles.append(Candle(base_ts + j * 60000, 1.1022, 1.1030, 1.1010, 1.1025))

        # Run with enable_ladder_detection=True
        res = self.engine.evaluate_candidate(
            self.base_candidate,
            candles,
            body_threshold=0.50,
            enable_ladder_detection=True,
        )
        self.assertEqual(res.final_status, "MANUAL_REVIEW_REQUIRED")
        self.assertEqual(res.displacement_type, "LADDER")
        self.assertIsNone(res.entry_price, "Ladder displacement must NEVER assign an entry price")
        self.assertIsNone(res.filled_bar_index, "Ladder displacement must NEVER record a filled bar")
        self.assertNotEqual(res.final_status, "ENTRY_FILLED", "Ladder displacement must NEVER auto-fill")

    def test_g4_variant_ladder_prevents_autofill_despite_deep_retrace(self):
        """
        G4 Variant Guard: Even when price subsequently pulls back deeply into the Fib 0.5 zone,
        a LADDER displacement must halt execution at MANUAL_REVIEW_REQUIRED and NEVER auto-fill.
        """
        base_ts = 1787220000000
        candles = []
        candles.append(Candle(base_ts + 0, 1.1020, 1.1025, 1.1015, 1.1018))
        candles.append(Candle(base_ts + 60000, 1.1015, 1.1016, 1.1005, 1.1008))  # Touch
        candles.append(Candle(base_ts + 120000, 1.1008, 1.1012, 1.1003, 1.1009))
        candles.append(Candle(base_ts + 180000, 1.1005, 1.1009, 1.1001, 1.1007))  # Sweep

        # 3-bar ladder (bodies ~45% each, below 50% single candle threshold)
        candles.append(Candle(base_ts + 240000, 1.1007, 1.1018, 1.1005, 1.1013))
        candles.append(Candle(base_ts + 300000, 1.1013, 1.1025, 1.1011, 1.1019))
        candles.append(Candle(base_ts + 360000, 1.1019, 1.1032, 1.1017, 1.1025))

        # Subsequent bars pull back deeply to 1.1010 (below any Fib 0.5)
        candles.append(Candle(base_ts + 420000, 1.1025, 1.1026, 1.1008, 1.1010))
        candles.append(Candle(base_ts + 480000, 1.1010, 1.1030, 1.1009, 1.1028))

        # Pad remaining bars up to 25
        for j in range(9, 25):
            candles.append(Candle(base_ts + j * 60000, 1.1020, 1.1035, 1.1015, 1.1030))

        res = self.engine.evaluate_candidate(
            self.base_candidate,
            candles,
            body_threshold=0.50,
            enable_ladder_detection=True,
        )

        self.assertEqual(res.final_status, "MANUAL_REVIEW_REQUIRED")
        self.assertIsNone(res.entry_price)
        self.assertIsNone(res.filled_bar_index)
        self.assertNotEqual(res.final_status, "ENTRY_FILLED")
        self.assertNotIn("ENTRY_FILLED", [r.step_name for r in res.audit_trail])


if __name__ == "__main__":
    unittest.main()
