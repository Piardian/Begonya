"""
Begonya Manual Replay - Session Store and Event Log
===================================================
Manages complete manual replay sessions, persistence, and deterministic verification.
Guarantees:
- Every user and clock action is appended to an immutable event log.
- Full session state can be serialized to disk and reloaded.
- Replaying the event sequence over the same dataset produces 100% deterministic results.
"""

from __future__ import annotations

import json
import logging
import math
import os
import uuid
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from manual_replay.adapter.historical_data_adapter import HistoricalDataAdapter, DatasetManifest
from manual_replay.timeline.replay_clock import ReplayClock
from manual_replay.simulator.execution_engine import ExecutionEngine, ManualOrder, TradeRecord
from manual_replay.simulator.cost_profile import CostProfile, get_cost_profile
from manual_replay.macro.pit_macro_adapter import PitMacroAdapter, MacroSnapshot

logger = logging.getLogger("Begonya.ManualReplay.SessionStore")

DEFAULT_SESSION_DIR = Path(os.environ.get("BEGONYA_REPLAY_SESSION_DIR", str(Path.home() / ".begonya" / "manual_replay" / "saved_sessions")))


class ReplaySession:
    """An active or saved manual replay session."""

    def __init__(
        self,
        symbol: str,
        initial_balance: float = 10000.0,
        session_id: Optional[str] = None,
        data_adapter: Optional[HistoricalDataAdapter] = None,
        cost_profile: Optional[CostProfile] = None,
    ):
        self.session_id = session_id or f"session_{symbol}_{uuid.uuid4().hex[:8]}"
        self.symbol = symbol.replace("/", "").replace("-", "").upper()
        self.initial_balance = initial_balance
        self.created_at_iso = datetime.now(timezone.utc).isoformat()

        self.data_adapter = data_adapter or HistoricalDataAdapter()
        self.manifest = self.data_adapter.prepare_dataset(self.symbol)
        if "1m" not in self.manifest.timeframes:
            raise ValueError(f"M1 historical data is required for manual order execution on {self.symbol}")
        self.clock = ReplayClock(self.data_adapter, self.symbol)
        self.cost_profile = cost_profile or get_cost_profile(self.symbol)
        self.engine = ExecutionEngine(self.symbol, initial_balance=initial_balance, cost_profile=self.cost_profile)
        self.macro_adapter = PitMacroAdapter()

    def advance_bar(self, timeframe: str = "1m", count: int = 1) -> Dict[str, Any]:
        """Advances chronologically and processes every M1 bar that closes in the interval."""
        timeframe = timeframe.lower()
        if timeframe not in self.clock._candles:
            raise ValueError(f"Timeframe '{timeframe}' is not available for {self.symbol}")
        if not isinstance(count, int) or isinstance(count, bool) or count < 1:
            raise ValueError("count must be a positive integer")
        from manual_replay.timeline.replay_clock import TIMEFRAME_INTERVALS_MS
        target_time = self.clock.current_time + TIMEFRAME_INTERVALS_MS[timeframe] * count
        return self.advance_to(target_time, reason={"timeframe": timeframe, "count": count})

    def advance_to(self, timestamp_ms: int, reason: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Moves to a timestamp while processing all intervening closed M1 bars in order."""
        if not isinstance(timestamp_ms, int) or isinstance(timestamp_ms, bool):
            raise ValueError("timestamp_ms must be an integer Unix timestamp in milliseconds")
        prev_time = self.clock.current_time
        new_time = max(self.clock.min_time, min(self.clock.max_time, timestamp_ms))
        if new_time < prev_time and (self.engine.orders or self.engine.trade_history or self.engine.open_position):
            raise ValueError("Cannot rewind a session after any order/trade activity; start a new session instead")

        if new_time > prev_time:
            try:
                all_1m = self.data_adapter.get_candles(self.symbol, "1m")
            except KeyError as exc:
                raise ValueError(f"M1 data is required for order execution on {self.symbol}") from exc
            # Candle timestamps represent bar opens; process bars only once their
            # close falls strictly after the old clock and at/before the target.
            for candle in all_1m:
                bar_close = candle.timestamp + 60_000
                if prev_time < bar_close <= new_time:
                    self.engine.process_candle(candle)

        self.clock.set_time(new_time)
        self.engine.log_event("REPLAY_ADVANCED", new_time, {
            "reason": reason or {"type": "jump"},
            "prev_time": prev_time,
            "new_time": new_time,
        })
        return self.get_snapshot()

    def place_manual_order(
        self,
        order_type: str,
        direction: str,
        price: float,
        stop_loss: float,
        take_profit: float,
        volume_lots: Optional[float] = None,
        risk_percent: float = 1.0,
        reason_tag: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Places a manual order, embedding an as-of PIT MacroSnapshot."""
        macro_snap = self.macro_adapter.get_macro_snapshot(self.symbol, self.clock.current_time)

        order = self.engine.place_order(
            order_type=order_type,
            direction=direction,
            price=price,
            stop_loss=stop_loss,
            take_profit=take_profit,
            current_time_ms=self.clock.current_time,
            volume_lots=volume_lots,
            risk_percent=risk_percent,
            reason_tag=reason_tag,
            macro_snapshot=macro_snap.to_dict(),
        )
        return {
            "order": order.to_dict(),
            "macro_snapshot": macro_snap.to_dict(),
            "snapshot": self.get_snapshot(),
        }

    def close_open_position(self) -> Dict[str, Any]:
        """Closes the current position manually."""
        latest_price = self.clock.get_latest_price()
        if latest_price is None:
            raise RuntimeError("Cannot close position: current market price unavailable")

        trade = self.engine.close_position_manually(latest_price, self.clock.current_time)
        return {
            "closed_trade": trade.to_dict(),
            "snapshot": self.get_snapshot(),
        }

    def get_snapshot(self) -> Dict[str, Any]:
        """Current live session snapshot for the UI and state inspection."""
        macro_snap = self.macro_adapter.get_macro_snapshot(self.symbol, self.clock.current_time)
        return {
            "session_id": self.session_id,
            "symbol": self.symbol,
            "created_at_iso": self.created_at_iso,
            "clock": self.clock.get_state(),
            "balance": round(self.engine.balance, 2),
            "cost_profile": asdict(self.cost_profile),
            "open_position": self.engine.open_position.to_dict() if self.engine.open_position else None,
            "pending_orders": [o.to_dict() for o in self.engine.orders.values() if o.status == "PENDING"],
            "orders": [o.to_dict() for o in self.engine.orders.values()],
            "trades": [t.to_dict() for t in self.engine.trade_history],
            "macro": macro_snap.to_dict(),
            "metrics": self.engine.get_summary_metrics(),
            "closed_trade_count": len(self.engine.trade_history),
        }

    def save_to_disk(self, save_dir: Optional[Path] = None) -> Path:
        """Serializes session state, trade logs, and event logs to a JSON artifact."""
        target_dir = save_dir or DEFAULT_SESSION_DIR
        target_dir.mkdir(parents=True, exist_ok=True)
        out_file = target_dir / f"{self.session_id}.json"

        data = {
            "session_id": self.session_id,
            "symbol": self.symbol,
            "created_at_iso": self.created_at_iso,
            "saved_at_iso": datetime.now(timezone.utc).isoformat(),
            "initial_balance": self.initial_balance,
            "current_balance": round(self.engine.balance, 2),
            "current_clock_time": self.clock.current_time,
            "current_clock_iso": self.clock.current_time_iso,
            "manifest": self.manifest.to_dict(),
            "cost_profile": asdict(self.cost_profile),
            "metrics": self.engine.get_summary_metrics(),
            "orders": [o.to_dict() for o in self.engine.orders.values()],
            "trades": [t.to_dict() for t in self.engine.trade_history],
            "open_position": self.engine.open_position.to_dict() if self.engine.open_position else None,
            "events": self.engine.event_log,
        }

        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, sort_keys=True)

        return out_file


class SessionStore:
    """Manages active sessions in memory and persistent storage."""

    def __init__(
        self,
        sessions_dir: Optional[Path] = None,
        data_adapter: Optional[HistoricalDataAdapter] = None,
    ):
        self.sessions_dir = sessions_dir or DEFAULT_SESSION_DIR
        self.sessions_dir.mkdir(parents=True, exist_ok=True)
        self.data_adapter = data_adapter
        self._active_sessions: Dict[str, ReplaySession] = {}

    def create_session(self, symbol: str, initial_balance: float = 10000.0) -> ReplaySession:
        if not isinstance(initial_balance, (int, float)) or not math.isfinite(float(initial_balance)) or initial_balance <= 0:
            raise ValueError("initial_balance must be a finite number greater than zero")
        session = ReplaySession(
            symbol=symbol,
            initial_balance=float(initial_balance),
            data_adapter=self.data_adapter,
        )
        self._active_sessions[session.session_id] = session
        return session

    def get_session(self, session_id: str) -> Optional[ReplaySession]:
        return self._active_sessions.get(session_id)

    def load_saved_session(self, session_id: str) -> ReplaySession:
        """Restores a saved session only when its source dataset checksum still matches."""
        if (
            not session_id
            or session_id in {".", ".."}
            or "/" in session_id
            or "\\" in session_id
        ):
            raise ValueError("Invalid session id")
        filename = session_id if session_id.endswith(".json") else f"{session_id}.json"
        saved_path = self.sessions_dir / filename
        if not saved_path.is_file():
            raise FileNotFoundError(f"Saved session '{session_id}' was not found")
        with open(saved_path, "r", encoding="utf-8") as handle:
            data = json.load(handle)

        session = ReplaySession(
            symbol=data["symbol"],
            initial_balance=float(data["initial_balance"]),
            session_id=data["session_id"],
            data_adapter=self.data_adapter,
            cost_profile=CostProfile(**data["cost_profile"]),
        )
        saved_checksums = data.get("manifest", {}).get("checksum_sha256", {})
        current_checksums = session.manifest.checksum_sha256
        if saved_checksums != current_checksums:
            raise ValueError("Saved session dataset checksum differs from current local data; refusing non-reproducible resume")

        session.created_at_iso = data.get("created_at_iso", session.created_at_iso)
        session.clock.set_time(int(data["current_clock_time"]))
        session.engine.balance = float(data["current_balance"])
        session.engine.orders = {
            item["order_id"]: ManualOrder(**item) for item in data.get("orders", [])
        }
        session.engine.trade_history = [
            TradeRecord(**item) for item in data.get("trades", [])
        ]
        open_position = data.get("open_position")
        session.engine.open_position = TradeRecord(**open_position) if open_position else None
        session.engine.event_log = data.get("events", [])
        self._active_sessions[session.session_id] = session
        return session

    def list_saved_sessions(self) -> List[Dict[str, Any]]:
        saved = []
        for p in self.sessions_dir.glob("*.json"):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    meta = json.load(f)
                saved.append({
                    "session_id": meta.get("session_id"),
                    "symbol": meta.get("symbol"),
                    "created_at": meta.get("created_at_iso"),
                    "saved_at": meta.get("saved_at_iso"),
                    "balance": meta.get("current_balance"),
                    "total_trades": meta.get("metrics", {}).get("total_trades", 0),
                    "file_path": str(p),
                })
            except Exception:
                pass
        return saved
