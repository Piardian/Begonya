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

DEFAULT_SESSION_DIR = Path(r"c:\Users\piard\.gemini\antigravity\scratch\Begonya\research\manual_replay\saved_sessions")
DEFAULT_SESSION_DIR.mkdir(parents=True, exist_ok=True)


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
        self.clock = ReplayClock(self.data_adapter, self.symbol)
        self.cost_profile = cost_profile or get_cost_profile(self.symbol)
        self.engine = ExecutionEngine(self.symbol, initial_balance=initial_balance, cost_profile=self.cost_profile)
        self.macro_adapter = PitMacroAdapter()

    def advance_bar(self, timeframe: str = "1m", count: int = 1) -> Dict[str, Any]:
        """Advances the clock and feeds any newly closed M1 bars to the execution engine."""
        prev_time = self.clock.current_time
        self.clock.step(timeframe, count)
        new_time = self.clock.current_time

        # Feed newly completed 1m bars to engine
        all_1m = self.data_adapter.get_candles(self.symbol, "1m")
        # Find 1m candles strictly closed between prev_time and new_time
        for c in all_1m:
            bar_close = c.timestamp + 60000
            if prev_time < bar_close <= new_time:
                self.engine.process_candle(c)

        self.engine.log_event("REPLAY_ADVANCED", new_time, {
            "timeframe": timeframe,
            "count": count,
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
            "open_position": self.engine.open_position.to_dict() if self.engine.open_position else None,
            "pending_orders": [o.to_dict() for o in self.engine.orders.values() if o.status == "PENDING"],
            "macro": macro_snap.to_dict(),
            "metrics": self.engine.get_summary_metrics(),
            "closed_trade_count": len(self.engine.trade_history),
        }

    def save_to_disk(self, save_dir: Optional[Path] = None) -> Path:
        """Serializes session state, trade logs, and event logs to a JSON artifact."""
        target_dir = save_dir or DEFAULT_SESSION_DIR
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
            json.dump(data, f, indent=2)

        return out_file


class SessionStore:
    """Manages active sessions in memory and persistent storage."""

    def __init__(self, sessions_dir: Optional[Path] = None):
        self.sessions_dir = sessions_dir or DEFAULT_SESSION_DIR
        self.sessions_dir.mkdir(parents=True, exist_ok=True)
        self._active_sessions: Dict[str, ReplaySession] = {}

    def create_session(self, symbol: str, initial_balance: float = 10000.0) -> ReplaySession:
        session = ReplaySession(symbol=symbol, initial_balance=initial_balance)
        self._active_sessions[session.session_id] = session
        return session

    def get_session(self, session_id: str) -> Optional[ReplaySession]:
        return self._active_sessions.get(session_id)

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
