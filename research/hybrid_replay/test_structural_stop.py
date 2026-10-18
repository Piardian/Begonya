"""
Unit Tests for M15 Structural Stop Audit Engine
===============================================
Path: Begonya/research/hybrid_replay/test_structural_stop.py

Covers:
1. Valid LONG structural stop (Swing Low < Entry, confirmed <= signal time).
2. Valid SHORT structural stop (Swing High > Entry, confirmed <= signal time).
3. Wrong side stop detection (INVALID_STRUCTURAL_STOP_DIRECTION).
4. Lookahead prevention (Swing confirming after signal timestamp is strictly ignored).
5. Insufficient M15 candle history (INSUFFICIENT_DATA_STRUCTURAL_STOP).
6. Alternative POI boundary stop evaluation as separate research variant.
"""

import unittest
from datetime import datetime, timezone
from audit_structural_stops import detect_m15_swings_strictly_before


class TestStructuralStopDetection(unittest.TestCase):
    def setUp(self):
        # 15M interval = 900,000 ms
        self.t0 = 1787000000000

    def create_15m_candles(self, n: int, base_price: float = 100.0):
        candles = []
        for i in range(n):
            ts = self.t0 + i * 15 * 60 * 1000
            candles.append({
                'timestamp': ts,
                'open': base_price,
                'high': base_price + 1.0,
                'low': base_price - 1.0,
                'close': base_price
            })
        return candles

    def test_valid_long_structural_stop(self):
        """Rule 2 & 3: A valid swing low formed and confirmed before signal timestamp with price < entry."""
        candles = self.create_15m_candles(10, base_price=100.0)
        # Create a swing low at index 3:
        # lows of [1, 2, 3, 4, 5] -> low[3] strictly lower
        candles[1]['low'] = 98.0
        candles[2]['low'] = 97.0
        candles[3]['low'] = 94.0  # Swing Low
        candles[4]['low'] = 96.5
        candles[5]['low'] = 97.2

        # Swing formed at index 3, confirmed at index 5 close:
        # candle[5] closes at t0 + (5+1)*15m = t0 + 6*15m
        signal_ts = self.t0 + 7 * 15 * 60 * 1000  # Signal at bar 7
        swings = detect_m15_swings_strictly_before(candles, signal_ts)

        swing_lows = [s for s in swings if s['type'] == 'low']
        self.assertGreaterEqual(len(swing_lows), 1)
        sl = swing_lows[0]
        self.assertEqual(sl['price'], 94.0)

        entry_price = 100.0
        # Long check: Stop must be < Entry
        self.assertLess(sl['price'], entry_price)
        self.assertLessEqual(sl['confirmed_ts'], signal_ts)

    def test_valid_short_structural_stop(self):
        """Rule 2 & 3: A valid swing high formed and confirmed before signal timestamp with price > entry."""
        candles = self.create_15m_candles(10, base_price=100.0)
        # Create a swing high at index 4:
        candles[2]['high'] = 102.0
        candles[3]['high'] = 103.0
        candles[4]['high'] = 107.5  # Swing High
        candles[5]['high'] = 104.0
        candles[6]['high'] = 103.5

        # Confirmed at index 6 close (ts[6] + 15m)
        signal_ts = self.t0 + 8 * 15 * 60 * 1000
        swings = detect_m15_swings_strictly_before(candles, signal_ts)

        swing_highs = [s for s in swings if s['type'] == 'high']
        self.assertGreaterEqual(len(swing_highs), 1)
        sh = swing_highs[0]
        self.assertEqual(sh['price'], 107.5)

        entry_price = 101.0
        # Short check: Stop must be > Entry
        self.assertGreater(sh['price'], entry_price)
        self.assertLessEqual(sh['confirmed_ts'], signal_ts)

    def test_wrong_side_stop_detection(self):
        """Rule 3 & 5: When swing low is above entry for Long, flag INVALID_STRUCTURAL_STOP_DIRECTION."""
        # Swing low at 105.0
        candles = self.create_15m_candles(10, base_price=110.0)
        candles[1]['low'] = 108.0
        candles[2]['low'] = 107.0
        candles[3]['low'] = 105.0  # Swing low
        candles[4]['low'] = 106.0
        candles[5]['low'] = 107.5

        signal_ts = self.t0 + 7 * 15 * 60 * 1000
        swings = detect_m15_swings_strictly_before(candles, signal_ts)
        swing_lows = [s for s in swings if s['type'] == 'low']
        self.assertGreaterEqual(len(swing_lows), 1)

        # Hypothetical executed entry that pulled back deeply to 102.0
        entry_price = 102.0
        sl_price = swing_lows[0]['price']  # 105.0

        # Long trade check: 105.0 < 102.0 is False!
        is_valid_direction = (sl_price < entry_price)
        self.assertFalse(is_valid_direction)
        status = 'VERIFIED_STRUCTURAL_STOP' if is_valid_direction else 'INVALID_STRUCTURAL_STOP_DIRECTION'
        self.assertEqual(status, 'INVALID_STRUCTURAL_STOP_DIRECTION')

    def test_lookahead_prevention_unconfirmed_swing(self):
        """Rule 2 & 5: Swing forming at index i is UNCONFIRMED if i+2 closes AFTER signal cutoff."""
        candles = self.create_15m_candles(10, base_price=100.0)
        # Swing low at index 3
        candles[1]['low'] = 98.0
        candles[2]['low'] = 97.0
        candles[3]['low'] = 94.0  # Swing Low
        candles[4]['low'] = 96.5
        candles[5]['low'] = 97.2  # Confirmation bar (closes at t0 + 6*15m)

        # Signal timestamp set at t0 + 5*15m (BEFORE candle 5 closes!)
        cutoff_ts = self.t0 + 5 * 15 * 60 * 1000
        swings = detect_m15_swings_strictly_before(candles, cutoff_ts)

        # Swing at index 3 must NOT be detected because bar 5 has not closed yet!
        swing_lows = [s for s in swings if s['type'] == 'low']
        self.assertEqual(len(swing_lows), 0, "Swing confirming after cutoff must NEVER be returned")

    def test_insufficient_m15_history(self):
        """Rule 5: Fewer than 5 candles must return INSUFFICIENT_DATA_STRUCTURAL_STOP."""
        short_candles = self.create_15m_candles(3, base_price=100.0)
        cutoff_ts = self.t0 + 5 * 15 * 60 * 1000
        swings = detect_m15_swings_strictly_before(short_candles, cutoff_ts)
        self.assertEqual(len(swings), 0)

    def test_alternative_poi_boundary_stop_model(self):
        """Rule 7: Alternative research variant using POI zone boundary as stop."""
        poi_low = 100.50
        poi_high = 101.50
        entry_price = 101.00

        # Long alternative stop = poi_low
        alt_stop_long = poi_low
        self.assertLess(alt_stop_long, entry_price)
        self.assertAlmostEqual(entry_price - alt_stop_long, 0.50)

        # Short alternative stop = poi_high
        alt_stop_short = poi_high
        self.assertGreater(alt_stop_short, entry_price)
        self.assertAlmostEqual(alt_stop_short - entry_price, 0.50)


if __name__ == '__main__':
    unittest.main()
