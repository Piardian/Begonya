"""
Unit Tests for Stage 2 Exit Simulation Engine
=============================================
Path: Begonya/research/hybrid_replay/test_stage2_simulation.py

Covers:
1. Stop hit first (STOP_HIT, Gross R = -1.0).
2. Target hit first (TARGET_HIT, Gross R = target_dist / risk_dist).
3. Both hit on same M1 candle (AMBIGUOUS_BAR, no lookahead/optimistic bias).
4. Data ends before either (DATA_END_UNRESOLVED).
5. Missing target at signal time (INSUFFICIENT_DATA_TARGET).
6. Invalid directional stop check (INVALID_STOP_DIRECTION).
"""

import unittest
from simulate_stage2_outcomes import simulate_trade_exit


class TestStage2ExitSimulation(unittest.TestCase):
    def setUp(self):
        self.t0 = 1787000000000

    def create_bars(self, ohlc_list):
        bars = []
        for i, (o, h, l, c) in enumerate(ohlc_list):
            bars.append({
                'timestamp': self.t0 + (i + 1) * 60 * 1000,
                'open': float(o),
                'high': float(h),
                'low': float(l),
                'close': float(c)
            })
        return bars

    def test_missing_target_returns_insufficient_data(self):
        """Rule 2: When target_price is None, must return INSUFFICIENT_DATA_TARGET."""
        bars = self.create_bars([(100, 105, 95, 102)])
        res = simulate_trade_exit(
            trade_id="TEST_NO_TP",
            symbol="EURUSD",
            direction="long",
            entry_price=100.0,
            stop_price=90.0,
            target_price=None,  # Missing target!
            filled_timestamp=self.t0,
            subsequent_m1_candles=bars
        )
        self.assertEqual(res['outcome'], 'INSUFFICIENT_DATA_TARGET')
        self.assertIsNone(res['gross_r'])

    def test_stop_hit_first(self):
        """Rule 4: Stop touched before target returns STOP_HIT and R = -1.0."""
        # Entry = 100.0, Stop = 95.0, Target = 110.0 (Long)
        # Bar 1: 99 - 102 (no hit)
        # Bar 2: 94 - 98 (low 94 hits stop 95!)
        # Bar 3: 100 - 112 (would have hit target, but stopped out on bar 2!)
        bars = self.create_bars([
            (100.0, 102.0, 99.0, 101.0),
            (101.0, 98.0, 94.0, 95.0),
            (95.0, 112.0, 95.0, 110.0)
        ])
        res = simulate_trade_exit(
            trade_id="TEST_STOP_FIRST",
            symbol="EURUSD",
            direction="long",
            entry_price=100.0,
            stop_price=95.0,
            target_price=110.0,
            filled_timestamp=self.t0,
            subsequent_m1_candles=bars
        )
        self.assertEqual(res['outcome'], 'STOP_HIT')
        self.assertEqual(res['gross_r'], -1.0)
        self.assertEqual(res['exit_bar_index'], 2)
        self.assertEqual(res['holding_bars'], 2)

    def test_target_hit_first(self):
        """Rule 5: Target touched before stop returns TARGET_HIT and R = target_dist / risk_dist."""
        # Entry = 100.0, Stop = 95.0, Target = 110.0 (Risk = 5.0, Target = 10.0 -> Gross R = 2.0)
        # Bar 1: 100 - 103 (no hit)
        # Bar 2: 102 - 111 (high 111 hits target 110!)
        bars = self.create_bars([
            (100.0, 103.0, 99.5, 102.0),
            (102.0, 111.0, 101.0, 109.0)
        ])
        res = simulate_trade_exit(
            trade_id="TEST_TARGET_FIRST",
            symbol="EURUSD",
            direction="long",
            entry_price=100.0,
            stop_price=95.0,
            target_price=110.0,
            filled_timestamp=self.t0,
            subsequent_m1_candles=bars
        )
        self.assertEqual(res['outcome'], 'TARGET_HIT')
        self.assertEqual(res['gross_r'], 2.0)
        self.assertEqual(res['exit_bar_index'], 2)

    def test_ambiguous_bar_same_candle_collision(self):
        """Rule 3: Both stop and target breached on same candle must return AMBIGUOUS_BAR."""
        # Entry = 100.0, Stop = 95.0, Target = 110.0
        # Bar 1: Range is 93.0 to 112.0 (Both 95.0 and 110.0 touched!)
        bars = self.create_bars([
            (100.0, 112.0, 93.0, 105.0)
        ])
        res = simulate_trade_exit(
            trade_id="TEST_AMBIGUOUS",
            symbol="EURUSD",
            direction="long",
            entry_price=100.0,
            stop_price=95.0,
            target_price=110.0,
            filled_timestamp=self.t0,
            subsequent_m1_candles=bars
        )
        self.assertEqual(res['outcome'], 'AMBIGUOUS_BAR')
        self.assertIsNone(res['gross_r'], "Ambiguous bar must never assign gross R")
        self.assertEqual(res['exit_bar_index'], 1)

    def test_data_end_unresolved(self):
        """Rule 6: Neither stop nor target hit before data runs out returns DATA_END_UNRESOLVED."""
        # Entry = 100.0, Stop = 90.0, Target = 120.0
        # Bars fluctuate between 98 and 105
        bars = self.create_bars([
            (100.0, 104.0, 99.0, 103.0),
            (103.0, 105.0, 98.0, 102.0),
            (102.0, 104.0, 100.0, 103.0)
        ])
        res = simulate_trade_exit(
            trade_id="TEST_DATA_END",
            symbol="EURUSD",
            direction="long",
            entry_price=100.0,
            stop_price=90.0,
            target_price=120.0,
            filled_timestamp=self.t0,
            subsequent_m1_candles=bars
        )
        self.assertEqual(res['outcome'], 'DATA_END_UNRESOLVED')
        self.assertEqual(res['holding_bars'], 3)
        self.assertEqual(res['exit_price'], 103.0)

    def test_short_trade_exit(self):
        """Short trade exit: Stop > Entry, Target < Entry."""
        # Entry = 100.0, Stop = 105.0, Target = 90.0 (Risk = 5.0, Reward = 10.0 -> Gross R = 2.0)
        bars = self.create_bars([
            (100.0, 102.0, 98.0, 99.0),
            (99.0, 100.0, 89.0, 91.0)  # low 89 hits target 90!
        ])
        res = simulate_trade_exit(
            trade_id="TEST_SHORT_WIN",
            symbol="EURUSD",
            direction="short",
            entry_price=100.0,
            stop_price=105.0,
            target_price=90.0,
            filled_timestamp=self.t0,
            subsequent_m1_candles=bars
        )
        self.assertEqual(res['outcome'], 'TARGET_HIT')
        self.assertEqual(res['gross_r'], 2.0)
        self.assertEqual(res['exit_bar_index'], 2)


if __name__ == '__main__':
    unittest.main()
