import pytest
from datetime import datetime, timezone
from macro_gate import Candle as MacroCandle, evaluate_htf_macro_bias, check_macro_gate
from session_targets import Candle as SessionCandle, compute_fixed_r_target, detect_intraday_session_liquidity_target
from ultimate_replay_engine import Candle, run_trade_simulation, compute_metrics, detect_session, detect_asset_class


class TestUltimateValidationSuite:

    def test_macro_gate_no_lookahead_and_veto(self):
        # 15 4H candles with downtrend: prices falling from 100 to 50
        # Candle timestamp interval = 4h = 14400000 ms
        candles = [
            MacroCandle(timestamp=i * 14400000, open=100 - i * 3, high=102 - i * 3, low=97 - i * 3, close=98 - i * 3)
            for i in range(15)
        ]
        # Signal timestamp at candle 12 open + 1h
        sig_ts = (12 * 14400000) + 3600000

        # Evaluating Long trade during Downtrend -> should be VETOED
        long_check = check_macro_gate('long', candles, sig_ts)
        assert long_check['permitted'] is False
        assert long_check['gate_action'] == 'VETO_MACRO_COUNTER_TREND'

        # Evaluating Short trade during Downtrend -> should be PERMITTED
        short_check = check_macro_gate('short', candles, sig_ts)
        assert short_check['permitted'] is True
        assert short_check['gate_action'] == 'PERMITTED_TREND_ALIGNED'

    def test_session_target_capping(self):
        # Entry at 100, Stop at 90 (Risk = 10)
        # Target for Long:
        # If session high is 180 (Reward = 80 = 8R), should be CAPPED at 5R = 150
        bars = [
            SessionCandle(timestamp=i * 60000, open=95, high=180 if i == 5 else 105, low=92, close=98)
            for i in range(20)
        ]
        tgt, tag = detect_intraday_session_liquidity_target(
            entry_price=100.0,
            stop_price=90.0,
            direction='long',
            signal_timestamp=20 * 60000,
            recent_m1_candles=bars,
            max_r=5.0
        )
        assert tgt == 150.0  # Capped at 5R
        assert 'CAPPED_5.0R' in tag

    def test_fixed_r_target_math(self):
        tgt_long_3r = compute_fixed_r_target(entry_price=1.3000, stop_price=1.2950, direction='long', target_r_multiplier=3.0)
        assert abs(tgt_long_3r - 1.3150) < 0.00001

        tgt_short_3r = compute_fixed_r_target(entry_price=1.3000, stop_price=1.3050, direction='short', target_r_multiplier=3.0)
        assert abs(tgt_short_3r - 1.2850) < 0.00001

    def test_trade_simulation_max_holding_bars(self):
        # Trade that never reaches stop or target within 5 bars
        bars = [
            Candle(timestamp=i * 60000, open=1.3000, high=1.3005, low=1.2995, close=1.3002)
            for i in range(10)
        ]
        sim = run_trade_simulation(
            entry_price=1.3000,
            stop_price=1.2900,
            target_price=1.3200,
            direction='long',
            forward_m1_bars=bars,
            spread_pips=1.0,
            symbol='GBPUSD',
            max_holding_bars=5
        )
        assert sim['exit_status'] == 'TIME_OR_DATA_END'
        assert sim['exit_bar'] == 5

    def test_session_detection(self):
        # 08:30 UTC -> London
        ts_london = datetime(2026, 9, 15, 8, 30, tzinfo=timezone.utc).timestamp() * 1000
        assert detect_session(int(ts_london)) == 'LONDON'

        # 14:30 UTC -> New York
        ts_ny = datetime(2026, 9, 15, 14, 30, tzinfo=timezone.utc).timestamp() * 1000
        assert detect_session(int(ts_ny)) == 'NEW_YORK'

        # 02:30 UTC -> Asia
        ts_asia = datetime(2026, 9, 15, 2, 30, tzinfo=timezone.utc).timestamp() * 1000
        assert detect_session(int(ts_asia)) == 'ASIA'
