"""
Tests for Comprehensive Hypothesis Engine
=========================================
Path: Begonya/research/hybrid_replay/test_comprehensive_hypothesis_engine.py
"""

import pytest
from research.hybrid_replay.comprehensive_hypothesis_engine import (
    Candle,
    SwingPoint,
    detect_confirmed_m15_swings,
    generate_deterministic_target,
    run_trade_simulation,
    compute_metrics,
    get_pip_size,
    detect_asset_class
)


class TestComprehensiveHypothesisEngine:

    def test_asset_class_and_pip_size(self):
        assert detect_asset_class('EURUSD') == 'FX'
        assert detect_asset_class('XAUUSD') == 'COMMODITY'
        assert detect_asset_class('BTCUSDT') == 'CRYPTO'
        assert get_pip_size('EURUSD') == 0.0001
        assert get_pip_size('USDJPY') == 0.01
        assert get_pip_size('XAUUSD') == 0.10

    def test_deterministic_swing_detection_no_lookahead(self):
        # 10 candles: index 0 to 9
        # Peak at candle 4 (high = 100), confirmed at close of candle 6 (ts + 15m)
        candles = [
            Candle(timestamp=i * 900000, open=50, high=55 if i != 4 else 100, low=45, close=50)
            for i in range(10)
        ]
        # If cutoff is before confirmation of bar 4 (before bar 6 close = 6*900000 + 900000 = 6300000)
        swings_before = detect_confirmed_m15_swings(candles, up_to_timestamp=5400000)
        assert len(swings_before) == 0

        # If cutoff is at or after confirmation
        swings_after = detect_confirmed_m15_swings(candles, up_to_timestamp=7200000)
        assert len(swings_after) == 1
        assert swings_after[0].type == 'high'
        assert swings_after[0].price == 100.0

    def test_deterministic_target_generation_eqh(self):
        swings = [
            SwingPoint(timestamp=1000, price=1.1050, type='high', confirmed_at_bar=4, confirmed_at_timestamp=2000),
            SwingPoint(timestamp=3000, price=1.1052, type='high', confirmed_at_bar=6, confirmed_at_timestamp=4000),
        ]
        tgt = generate_deterministic_target(swings, entry_price=1.1000, direction='long', symbol='EURUSD')
        assert tgt is not None
        assert 'EQH_CLUSTER' in tgt[1]
        assert abs(tgt[0] - 1.1051) < 0.0001

    def test_trade_simulation_spread_stop(self):
        # Short trade: Entry at 1.3000, Stop at 1.3010, Target at 1.2950
        # Spread = 2 pips = 0.0002
        # Bar with high = 1.3009 -> Ask high = 1.3011 >= 1.3010 -> Stop hit!
        bars = [
            Candle(timestamp=1000, open=1.3000, high=1.3009, low=1.2990, close=1.2995)
        ]
        sim = run_trade_simulation(
            entry_price=1.3000,
            stop_price=1.3010,
            target_price=1.2950,
            direction='short',
            forward_m1_bars=bars,
            spread_pips=2.0,
            symbol='GBPUSD'
        )
        assert sim['exit_status'] == 'STOP_HIT'
        assert sim['realized_r'] == -1.0
