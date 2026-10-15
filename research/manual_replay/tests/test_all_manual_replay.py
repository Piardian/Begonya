"""
Begonya Manual Replay - Comprehensive Verification Test Suite
=============================================================
Covers:
- Data Adapter & M5 Resampling Integrity
- Replay Clock Lookahead Isolation (Anti-peeking)
- Execution Engine (Market, Limit, SL/TP, Costs, Ambiguity Rule)
- PIT Macro Adapter (As-of isolation, UNAVAILABLE handling)
- End-to-End Session Determinism
"""

import pytest
from datetime import datetime, timezone

from manual_replay.adapter.historical_data_adapter import Candle, HistoricalDataAdapter
from manual_replay.timeline.replay_clock import ReplayClock
from manual_replay.simulator.cost_profile import CostProfile, get_cost_profile
from manual_replay.simulator.execution_engine import ExecutionEngine
from manual_replay.macro.pit_macro_adapter import PitMacroAdapter
from manual_replay.session.session_store import SessionStore, ReplaySession


class TestHistoricalDataAdapter:
    def test_m5_resampling_math(self):
        # 10 1-minute bars spanning two 5-minute buckets (0-4 and 5-9)
        m1_bars = [
            Candle(timestamp=i * 60000, open=1.0 + i * 0.001, high=1.0 + i * 0.002, low=0.99, close=1.0 + i * 0.0015)
            for i in range(10)
        ]
        m5_bars = HistoricalDataAdapter.resample_m1_to_m5(m1_bars)
        assert len(m5_bars) == 2, "Expected exactly two 5-minute bars"

        # First M5 bar
        b0 = m5_bars[0]
        assert b0.timestamp == 0
        assert b0.open == m1_bars[0].open
        assert b0.high == max(b.high for b in m1_bars[:5])
        assert b0.low == min(b.low for b in m1_bars[:5])
        assert b0.close == m1_bars[4].close

        # Second M5 bar
        b1 = m5_bars[1]
        assert b1.timestamp == 300000
        assert b1.open == m1_bars[5].open
        assert b1.close == m1_bars[9].close

    def test_stream_audit_validity(self):
        valid_bars = [
            Candle(timestamp=i * 60000, open=1.10, high=1.12, low=1.08, close=1.11)
            for i in range(5)
        ]
        audit = HistoricalDataAdapter.audit_candle_stream(valid_bars, expected_interval_ms=60000)
        assert audit["status"] == "VALID"
        assert audit["anomalies"] == 0

        # Anomaly bar (low > high)
        bad_bars = [Candle(timestamp=0, open=1.10, high=1.05, low=1.12, close=1.08)]
        bad_audit = HistoricalDataAdapter.audit_candle_stream(bad_bars, expected_interval_ms=60000)
        assert bad_audit["status"] == "CORRUPTED"
        assert bad_audit["anomalies"] == 1


class TestReplayClockLookaheadIsolation:
    def test_future_bars_strictly_hidden(self):
        adapter = HistoricalDataAdapter()
        clock = ReplayClock(adapter, "EURUSD")

        # Set clock to specific time
        test_time = clock.min_time + (24 * 3600 * 1000)  # 24 hours into dataset
        clock.set_time(test_time)

        # Check all visible timeframes
        for tf, interval_ms in [("1m", 60000), ("5m", 300000), ("15m", 900000), ("1h", 3600000), ("4h", 14400000)]:
            visible = clock.get_visible_candles(tf, include_forming=False)
            for c in visible:
                close_time = c.timestamp + interval_ms
                assert close_time <= test_time, f"Future {tf} bar leaked! Close {close_time} > clock {test_time}"


class TestExecutionEngine:
    def test_market_buy_spread_and_slippage(self):
        profile = CostProfile(symbol="TEST", spread_pips=1.0, pip_size=0.0001, commission_per_lot_usd=7.0, slippage_pips=0.2)
        engine = ExecutionEngine("TEST", initial_balance=10000.0, cost_profile=profile)

        # Mid price 1.2000
        # Expected Ask with spread (0.00005) + slippage (0.00002) = 1.20007
        order = engine.place_order("MARKET", "BUY", price=1.2000, stop_loss=1.1950, take_profit=1.2100, current_time_ms=1000, volume_lots=1.0)
        assert engine.open_position is not None
        assert abs(engine.open_position.entry_price - 1.20007) < 1e-6

    def test_conservative_ambiguity_rule(self):
        """When both SL and TP are touched in the same bar, SL MUST trigger."""
        engine = ExecutionEngine("EURUSD", initial_balance=10000.0)
        engine.place_order("MARKET", "BUY", price=1.1000, stop_loss=1.0950, take_profit=1.1100, current_time_ms=1000, volume_lots=1.0)

        # Extreme bar that spans below SL and above TP
        extreme_candle = Candle(timestamp=2000, open=1.1000, high=1.1200, low=1.0900, close=1.1050)
        engine.process_candle(extreme_candle)

        assert engine.open_position is None
        assert len(engine.trade_history) == 1
        trade = engine.trade_history[0]
        assert trade.exit_reason == "SL"
        assert trade.conservative_ambiguity_applied is True
        assert trade.net_pnl_usd < 0


class TestPitMacroAdapter:
    def test_missing_data_not_neutralized(self):
        adapter = PitMacroAdapter()
        # Historical date prior to dataset
        snap = adapter.get_macro_snapshot("EURUSD", as_of_ms=1000000)
        assert snap.status == "UNAVAILABLE_HISTORICAL_DATA"
        assert snap.bias_gate == "UNAVAILABLE"
        assert snap.as_of_verified is False
        assert snap.volatility_risk_score is None


class TestSessionDeterminism:
    def test_replay_determinism(self):
        """Running the same series of actions produces identical metrics and balances."""
        def run_simulation():
            session = ReplaySession("EURUSD", initial_balance=10000.0)
            session.advance_bar("1m", 15)
            session.place_manual_order(
                order_type="MARKET",
                direction="BUY",
                price=session.clock.get_latest_price(),
                stop_loss=session.clock.get_latest_price() - 0.0020,
                take_profit=session.clock.get_latest_price() + 0.0040,
                volume_lots=1.0,
            )
            session.advance_bar("1m", 30)
            session.close_open_position()
            return session.engine.balance, session.engine.trade_history[0].net_pnl_usd

        bal1, pnl1 = run_simulation()
        bal2, pnl2 = run_simulation()

        assert bal1 == bal2, f"Determinism failure: {bal1} != {bal2}"
        assert pnl1 == pnl2, f"Trade PnL mismatch: {pnl1} != {pnl2}"
