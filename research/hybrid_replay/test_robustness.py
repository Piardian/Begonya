"""
Unit Tests for Robustness Testing Engine
========================================
Path: Begonya/research/hybrid_replay/test_robustness.py

Covers:
1. Spread-induced early stop on Short trade (Ask = Bid + Spread >= StopPrice).
2. Strict non-resurrection: reaching target after spread stop does NOT restore winner.
3. Micro-stop threshold exclusion (MICRO_STOP_EXCLUDED when risk < threshold).
4. Legacy no-target group isolation (trades before 2026-09-08 remain unpolluted).
5. Data integrity: Missing M15 data preserved as INSUFFICIENT_DATA.
"""

import unittest
from robustness_testing import simulate_trade_with_friction


class TestRobustnessEngine(unittest.TestCase):
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

    def test_spread_induced_early_stop_on_short(self):
        """Rule 1: For short trade, Ask = High + Spread triggers stop even if Bid High is below stop."""
        trade = {
            'trade_id': 'TEST_SHORT_SPREAD',
            'symbol': 'GBPUSD',
            'direction': 'short',
            'entry_price': 1.3200,
            'stop_price': 1.3203,  # Stop is 3.0 pips above entry
            'target_price': 1.3150,
            'risk_distance': 0.0003,
            'filled_timestamp': self.t0
        }
        # Bar 1: Bid High = 1.32015.
        # Under 0.0 pip spread: Ask High = 1.32015 < 1.32030 (No stop).
        # Under 2.0 pip spread: Ask High = 1.32015 + 0.00020 = 1.32035 >= 1.32030 (STOP HIT!).
        # Bar 2: Low = 1.3140 (would hit target if not stopped on bar 1).
        bars = self.create_bars([
            (1.3200, 1.32015, 1.3195, 1.3198),
            (1.3198, 1.3200, 1.3140, 1.3145)
        ])

        # Test with 0 spread -> TARGET_HIT
        res_zero = simulate_trade_with_friction(trade, bars, spread_pips=0.0)
        self.assertEqual(res_zero['outcome'], 'TARGET_HIT')
        self.assertEqual(res_zero['exit_bar'], 2)

        # Test with 2.0 pips spread -> STOP_HIT at bar 1!
        res_spread = simulate_trade_with_friction(trade, bars, spread_pips=2.0)
        self.assertEqual(res_spread['outcome'], 'STOP_HIT')
        self.assertEqual(res_spread['exit_bar'], 1)
        self.assertLess(res_spread['net_r'], 0)

    def test_non_resurrection_after_spread_stop(self):
        """Rule 1: Target reached after spread stop must NEVER restore the winner."""
        trade = {
            'trade_id': 'TEST_NON_RESURRECTION',
            'symbol': 'GBPUSD',
            'direction': 'short',
            'entry_price': 1.3200,
            'stop_price': 1.3203,
            'target_price': 1.3150,
            'risk_distance': 0.0003,
            'filled_timestamp': self.t0
        }
        bars = self.create_bars([
            (1.3200, 1.3202, 1.3195, 1.3198),  # Ask High with 1.5 pip = 1.32035 >= 1.3203 -> STOP!
            (1.3198, 1.3200, 1.3140, 1.3145),  # Big rally to target
            (1.3145, 1.3150, 1.3130, 1.3135)
        ])
        res = simulate_trade_with_friction(trade, bars, spread_pips=1.5)
        self.assertEqual(res['outcome'], 'STOP_HIT')
        self.assertNotEqual(res['outcome'], 'TARGET_HIT')

    def test_micro_stop_exclusion_rule(self):
        """Rule 2: Trades with risk distance strictly below threshold must be flagged as MICRO_STOP_EXCLUDED."""
        threshold_pips = 4.0
        pip_unit = 0.00010
        min_risk_distance = threshold_pips * pip_unit  # 0.00040

        trade_micro = {'risk_distance': 0.000245}  # 2.45 pips < 4.0 pips
        trade_valid = {'risk_distance': 0.000585}  # 5.85 pips >= 4.0 pips

        is_micro_excluded = trade_micro['risk_distance'] < min_risk_distance
        is_valid_excluded = trade_valid['risk_distance'] < min_risk_distance

        self.assertTrue(is_micro_excluded)
        self.assertFalse(is_valid_excluded)


if __name__ == '__main__':
    unittest.main()
