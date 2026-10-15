"""Deterministic, filesystem-isolated tests for Begonya Manual Replay."""

import json
from pathlib import Path

import pytest

from manual_replay.adapter.historical_data_adapter import Candle, DatasetManifest, HistoricalDataAdapter
from manual_replay.timeline.replay_clock import ReplayClock
from manual_replay.simulator.cost_profile import CostProfile
from manual_replay.simulator.execution_engine import ExecutionEngine
from manual_replay.macro.pit_macro_adapter import PitMacroAdapter
from manual_replay.session.session_store import ReplaySession, SessionStore


BASE_TS = 1_699_992_000_000  # aligned to 4h / 5m boundaries


class InMemoryAdapter:
    """Small deterministic OHLC fixture; tests never depend on a developer's local files."""

    def __init__(self, count=300):
        self.data = {"1m": []}
        for i in range(count):
            open_price = 1.10000 + i * 0.00001
            close_price = open_price + 0.000005
            self.data["1m"].append(Candle(
                timestamp=BASE_TS + i * 60_000,
                open=open_price,
                high=close_price + 0.00001,
                low=open_price - 0.00001,
                close=close_price,
            ))
        for tf, span in (("5m", 5), ("15m", 15), ("1h", 60), ("4h", 240)):
            rows = []
            for start in range(0, len(self.data["1m"]) - span + 1, span):
                group = self.data["1m"][start:start + span]
                rows.append(Candle(
                    timestamp=group[0].timestamp,
                    open=group[0].open,
                    high=max(c.high for c in group),
                    low=min(c.low for c in group),
                    close=group[-1].close,
                ))
            self.data[tf] = rows
        self.manifest = DatasetManifest(
            manifest_id="fixture",
            symbol="EURUSD",
            timeframes=["1m", "5m", "15m", "1h", "4h"],
            start_time="fixture-start",
            end_time="fixture-end",
            bar_counts={tf: len(rows) for tf, rows in self.data.items()},
            file_sources={tf: "IN_MEMORY_FIXTURE" for tf in self.data},
            checksum_sha256={tf: f"checksum-{tf}" for tf in self.data},
            quality_audit={tf: {"status": "VALID"} for tf in self.data},
        )

    def prepare_dataset(self, symbol):
        if symbol != "EURUSD":
            raise FileNotFoundError(f"No fixture data for {symbol}")
        return self.manifest

    def get_manifest(self, symbol):
        return self.manifest if symbol == "EURUSD" else None

    def get_candles(self, symbol, timeframe):
        if symbol != "EURUSD" or timeframe not in self.data:
            raise KeyError(f"No fixture candles for {symbol}/{timeframe}")
        return self.data[timeframe]


class TestHistoricalDataAdapter:
    def test_m5_resampling_only_returns_complete_buckets(self):
        bars = [
            Candle(BASE_TS + i * 60_000, 1.0, 1.02, 0.99, 1.01)
            for i in range(6)
        ]
        m5 = HistoricalDataAdapter.resample_m1_to_m5(bars)
        assert len(m5) == 1
        assert m5[0].timestamp == BASE_TS
        assert m5[0].close == bars[4].close

    def test_m5_resampling_aggregates_ohlc_correctly(self):
        bars = [
            Candle(BASE_TS + i * 60_000, 1.0 + i * .001, 1.02 + i * .001, .99 + i * .001, 1.01 + i * .001)
            for i in range(10)
        ]
        m5 = HistoricalDataAdapter.resample_m1_to_m5(bars)
        assert len(m5) == 2
        assert m5[0].open == bars[0].open
        assert m5[0].high == max(b.high for b in bars[:5])
        assert m5[0].low == min(b.low for b in bars[:5])
        assert m5[0].close == bars[4].close

    def test_weekend_candles_are_reported_without_assuming_all_symbols_are_fx(self):
        # 2023-11-18 00:00 UTC is Saturday; this metric is diagnostic, not corruption.
        saturday = 1_700_265_600_000
        candle = Candle(saturday, 1.1, 1.2, 1.0, 1.15)
        audit = HistoricalDataAdapter.audit_candle_stream([candle], 60_000)
        assert audit["weekend_candles_utc"] == 1
        assert audit["status"] == "VALID"
    def test_duplicate_timestamps_mark_stream_corrupted(self):
        bar = Candle(BASE_TS, 1.1, 1.2, 1.0, 1.15)
        audit = HistoricalDataAdapter.audit_candle_stream([bar, bar], 60_000)
        assert audit["duplicates"] == 1
        assert audit["status"] == "CORRUPTED"

    def test_loader_rejects_second_based_timestamps(self, tmp_path):
        path = tmp_path / "seconds.json"
        path.write_text(json.dumps([{
            "timestamp": 1_700_000_000, "open": 1.1, "high": 1.2, "low": 1.0, "close": 1.15
        }]), encoding="utf-8")
        with pytest.raises(ValueError, match="Unix milliseconds"):
            HistoricalDataAdapter(search_paths=[]).load_candles_from_file(path)

    def test_loader_rejects_invalid_ohlc(self, tmp_path):
        path = tmp_path / "bad.json"
        path.write_text(json.dumps([{
            "timestamp": BASE_TS, "open": 1.1, "high": 1.0, "low": 1.2, "close": 1.15
        }]), encoding="utf-8")
        with pytest.raises(ValueError, match="Invalid OHLC"):
            HistoricalDataAdapter(search_paths=[]).load_candles_from_file(path)


class TestReplayClockLookaheadIsolation:
    def test_future_closed_bars_are_hidden(self):
        adapter = InMemoryAdapter()
        clock = ReplayClock(adapter, "EURUSD")
        test_time = BASE_TS + 120 * 60_000
        clock.set_time(test_time)
        for tf, interval in (("1m", 60_000), ("5m", 300_000), ("15m", 900_000), ("1h", 3_600_000), ("4h", 14_400_000)):
            for candle in clock.get_visible_candles(tf, include_forming=False):
                assert candle.timestamp + interval <= test_time

    def test_forming_candle_does_not_reveal_future_high_low_close(self):
        adapter = InMemoryAdapter()
        clock = ReplayClock(adapter, "EURUSD")
        clock.set_time(BASE_TS + 7 * 60_000)
        visible = clock.get_visible_candles("15m", include_forming=True)
        forming = visible[-1]
        assert forming.timestamp == BASE_TS
        known_m1 = adapter.data["1m"][:7]
        assert forming.high == max(adapter.data["15m"][0].open, *(c.high for c in known_m1))
        assert forming.close == known_m1[-1].close
        assert forming.high < adapter.data["15m"][0].high or forming.high == max(c.high for c in known_m1)


class TestExecutionEngine:
    @staticmethod
    def profile():
        return CostProfile(
            symbol="TEST", spread_pips=1.0, pip_size=0.0001,
            commission_per_lot_usd=7.0, slippage_pips=0.2, lot_size=100_000,
        )

    def test_market_fill_models_spread_and_slippage(self):
        engine = ExecutionEngine("TEST", cost_profile=self.profile())
        engine.place_order("MARKET", "BUY", 1.2, 1.195, 1.21, 1_000, volume_lots=1.0)
        assert engine.open_position is not None
        assert engine.open_position.entry_price == pytest.approx(1.20007)

    def test_invalid_directional_levels_are_rejected(self):
        engine = ExecutionEngine("TEST", cost_profile=self.profile())
        with pytest.raises(ValueError, match="BUY orders"):
            engine.place_order("MARKET", "BUY", 1.2, 1.195, 1.19, 1_000, volume_lots=1.0)
        with pytest.raises(ValueError, match="direction"):
            engine.place_order("MARKET", "LONGISH", 1.2, 1.195, 1.21, 1_000, volume_lots=1.0)

    def test_auto_sizing_includes_costs_and_floors_lot_step(self):
        engine = ExecutionEngine("TEST", initial_balance=10_000, cost_profile=self.profile())
        lots = engine.calculate_lots_from_risk("BUY", 1.2, 1.198, 1.0)
        assert lots == pytest.approx(0.45)
        assert lots * 100 == int(lots * 100)

    @pytest.mark.parametrize("tf,span", [("15m", 15), ("1h", 60), ("4h", 240)])
    def test_higher_timeframe_forming_candle_tracks_m1_clock(self, tf, span):
        adapter = InMemoryAdapter(count=600)
        clock = ReplayClock(adapter, "EURUSD")
        clock.set_time(BASE_TS + (span + 5) * 60_000)
        visible = clock.get_visible_candles(tf, include_forming=True)
        forming = visible[-1]
        assert forming.timestamp == ((clock.current_time // (span * 60_000)) * (span * 60_000))
        expected_index = (clock.current_time - BASE_TS) // 60_000 - 1
        assert forming.close == adapter.data["1m"][expected_index].close

    def test_limit_order_must_be_on_correct_side_of_current_market(self):
        session = ReplaySession("EURUSD", data_adapter=InMemoryAdapter())
        current = session.clock.get_latest_price()
        with pytest.raises(ValueError, match="BUY LIMIT.*below current market"):
            session.place_manual_order("LIMIT", "BUY", current + 0.0001, current - 0.001, current + 0.001, volume_lots=0.01)
        with pytest.raises(ValueError, match="SELL LIMIT.*above current market"):
            session.place_manual_order("LIMIT", "SELL", current - 0.0001, current + 0.001, current - 0.001, volume_lots=0.01)

    def test_limit_gap_fill_gets_price_improvement(self):
        engine = ExecutionEngine("TEST", cost_profile=self.profile())
        order = engine.place_order("LIMIT", "BUY", 1.1, 1.095, 1.11, 1_000, volume_lots=1.0)
        engine.process_candle(Candle(BASE_TS, 1.098, 1.101, 1.097, 1.099))
        assert engine.open_position is not None
        assert engine.open_position.mid_entry_price == pytest.approx(1.098)
        assert engine.open_position.mid_entry_price <= order.requested_price

    def test_pending_limit_order_can_be_amended_and_event_logged(self):
        session = ReplaySession("EURUSD", data_adapter=InMemoryAdapter())
        market = session.clock.get_latest_price()
        placed = session.place_manual_order("LIMIT", "SELL", market + 0.0010, market + 0.0020, market - 0.0020, volume_lots=0.1)
        order_id = placed["order"]["order_id"]
        amended = session.amend_pending_order(order_id, market + 0.0015, market + 0.0025, market - 0.0025)
        assert amended["order"]["requested_price"] == pytest.approx(market + 0.0015)
        assert amended["order"]["stop_loss"] == pytest.approx(market + 0.0025)
        assert amended["order"]["take_profit"] == pytest.approx(market - 0.0025)
        assert amended["snapshot"]["pending_orders"][0]["requested_price"] == pytest.approx(market + 0.0015)
        assert session.engine.event_log[-1]["type"] == "ORDER_AMENDED"

    def test_invalid_pending_order_amendment_is_atomic(self):
        session = ReplaySession("EURUSD", data_adapter=InMemoryAdapter())
        market = session.clock.get_latest_price()
        placed = session.place_manual_order("LIMIT", "SELL", market + 0.0010, market + 0.0020, market - 0.0020, volume_lots=0.1)
        order_id = placed["order"]["order_id"]
        before = dict(session.engine.orders[order_id].to_dict())
        with pytest.raises(ValueError, match="SELL LIMIT.*above current market"):
            session.amend_pending_order(order_id, market - 0.0010, market + 0.0025, market - 0.0025)
        assert session.engine.orders[order_id].to_dict() == before

    def test_pending_order_can_be_cancelled_once(self):
        engine = ExecutionEngine("TEST", cost_profile=self.profile())
        order = engine.place_order("LIMIT", "BUY", 1.2, 1.195, 1.21, 1_000, volume_lots=1.0)
        cancelled = engine.cancel_pending_order(order.order_id, 2_000)
        assert cancelled.status == "CANCELLED"
        with pytest.raises(ValueError, match="not pending"):
            engine.cancel_pending_order(order.order_id, 3_000)

    def test_limit_fill_bar_cannot_also_trigger_tp_or_sl(self):
        engine = ExecutionEngine("TEST", cost_profile=self.profile())
        order = engine.place_order("LIMIT", "BUY", 1.1, 1.095, 1.11, 1_000, volume_lots=1.0)
        extreme = Candle(BASE_TS, 1.1, 1.12, 1.09, 1.105)
        engine.process_candle(extreme)
        assert engine.open_position is not None
        assert engine.open_position.entry_price == pytest.approx(order.requested_price)
        assert engine.open_position.entry_ts == BASE_TS + 60_000
        assert engine.trade_history == []

    def test_same_bar_sl_tp_conflict_is_conservatively_sl_first(self):
        engine = ExecutionEngine("TEST", cost_profile=self.profile())
        engine.place_order("MARKET", "BUY", 1.1, 1.095, 1.11, 1_000, volume_lots=1.0)
        engine.process_candle(Candle(BASE_TS, 1.1, 1.12, 1.09, 1.105))
        trade = engine.trade_history[0]
        assert trade.exit_reason == "SL"
        assert trade.conservative_ambiguity_applied is True
        assert trade.net_pnl_usd < 0

    def test_pnl_separates_gross_spread_slippage_and_commission(self):
        engine = ExecutionEngine("TEST", cost_profile=self.profile())
        engine.place_order("MARKET", "BUY", 1.2, 1.195, 1.21, 1_000, volume_lots=1.0)
        trade = engine.close_position_manually(1.205, 2_000)
        assert trade.gross_pnl_usd == pytest.approx(500.0)
        assert trade.spread_cost_usd == pytest.approx(10.0)
        assert trade.slippage_cost_usd == pytest.approx(4.0)
        assert trade.commission_usd == pytest.approx(7.0)
        assert trade.net_pnl_usd == pytest.approx(479.0)
        assert trade.realized_r == pytest.approx(0.96)


class TestPitMacroAdapter:
    def test_missing_file_returns_unavailable(self, tmp_path):
        adapter = PitMacroAdapter(records_path=tmp_path / "missing.json")
        snap = adapter.get_macro_snapshot("EURUSD", as_of_ms=BASE_TS)
        assert snap.status == "UNAVAILABLE_HISTORICAL_DATA"
        assert snap.bias_gate == "UNAVAILABLE"
        assert snap.as_of_verified is False

    def test_timestamp_without_availability_metadata_is_not_pit_verified(self, tmp_path):
        path = tmp_path / "macro.json"
        path.write_text(json.dumps([{
            "timestamp_utc": "2023-11-14T20:00:00+00:00",
            "symbol": "EURUSD",
            "cross_pair_verdict": {"recommended_gate": "LONG_ONLY"},
        }]), encoding="utf-8")
        adapter = PitMacroAdapter(records_path=path)
        snap = adapter.get_macro_snapshot("EURUSD", as_of_ms=BASE_TS + 60_000)
        assert snap.status == "UNVERIFIED_HISTORICAL_DATA"
        assert snap.bias_gate == "UNAVAILABLE"
        assert snap.as_of_verified is False

    def test_verified_record_is_selected_only_after_availability_time(self, tmp_path):
        path = tmp_path / "macro.json"
        path.write_text(json.dumps([{
            "available_at_utc": "2023-11-14T20:00:00+00:00",
            "timestamp_utc": "2023-11-14T20:00:00+00:00",
            "symbol": "EURUSD",
            "cross_pair_verdict": {"recommended_gate": "LONG_ONLY"},
            "primary_regime": "TREND",
            "volatility_risk_score": 2,
            "recommended_risk_multiplier": 0.5,
            "currency_scores": {"EUR": 3, "USD": 0},
            "macro_record_id": "record-1",
        }]), encoding="utf-8")
        adapter = PitMacroAdapter(records_path=path)
        too_early = adapter.get_macro_snapshot("EURUSD", as_of_ms=BASE_TS - 60_000)
        valid = adapter.get_macro_snapshot("EURUSD", as_of_ms=BASE_TS + 60_000)
        assert too_early.status == "UNAVAILABLE_HISTORICAL_DATA"
        assert valid.status == "AVAILABLE"
        assert valid.as_of_verified is True
        assert valid.bias_gate == "LONG_ONLY"


class TestSessionState:
    def test_jump_processes_intervening_m1_bars(self):
        adapter = InMemoryAdapter()
        session = ReplaySession("EURUSD", data_adapter=adapter)
        current = session.clock.current_time
        latest = session.clock.get_latest_price()
        session.place_manual_order(
            "MARKET", "BUY", latest, latest - 0.1, latest + 0.00005, volume_lots=0.01
        )
        session.advance_to(current + 10 * 60_000)
        assert session.engine.trade_history, "Forward jump should process intervening candles and close the TP"
        assert session.engine.trade_history[0].exit_reason == "TP"

    def test_backward_jump_is_blocked_after_order_activity(self):
        session = ReplaySession("EURUSD", data_adapter=InMemoryAdapter())
        current = session.clock.current_time
        latest = session.clock.get_latest_price()
        session.place_manual_order("MARKET", "BUY", latest, latest - 0.1, latest + 1.0, volume_lots=0.01)
        with pytest.raises(ValueError, match="Cannot rewind"):
            session.advance_to(current - 60_000)

    def test_save_and_restore_preserves_position_and_clock(self, tmp_path):
        adapter = InMemoryAdapter()
        session = ReplaySession("EURUSD", data_adapter=adapter)
        session.advance_bar("1m", 5)
        latest = session.clock.get_latest_price()
        session.place_manual_order("MARKET", "BUY", latest, latest - 0.1, latest + 1.0, volume_lots=0.01)
        session.save_to_disk(tmp_path)

        store = SessionStore(sessions_dir=tmp_path, data_adapter=adapter)
        restored = store.load_saved_session(session.session_id)
        assert restored.clock.current_time == session.clock.current_time
        assert restored.engine.balance == session.engine.balance
        assert restored.engine.open_position is not None
        assert restored.engine.open_position.order_id == session.engine.open_position.order_id
