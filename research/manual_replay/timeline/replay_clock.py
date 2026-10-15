"""
Begonya Manual Replay - Replay Clock / Timeline Engine
======================================================
Coordinates global replay time across all modules.
Enforces strict point-in-time boundaries and prevents lookahead leakage:
- At replay time T, higher-timeframe bars are NOT treated as completed until their official close time.
- Decision engines and charts receive only data visible as-of T.
"""

from __future__ import annotations

import bisect
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from manual_replay.adapter.historical_data_adapter import Candle, HistoricalDataAdapter

TIMEFRAME_INTERVALS_MS = {
    "1m": 60 * 1000,
    "5m": 5 * 60 * 1000,
    "15m": 15 * 60 * 1000,
    "1h": 60 * 60 * 1000,
    "4h": 4 * 60 * 60 * 1000,
}


class ReplayClock:
    """Master clock controlling timeline progression and candle visibility without lookahead."""

    def __init__(self, data_adapter: HistoricalDataAdapter, symbol: str):
        self.data_adapter = data_adapter
        self.symbol = symbol.replace("/", "").replace("-", "").upper()
        self.manifest = self.data_adapter.get_manifest(self.symbol) or self.data_adapter.prepare_dataset(self.symbol)

        # Preload and index timestamps for binary search
        self._candles: Dict[str, List[Candle]] = {}
        self._timestamps: Dict[str, List[int]] = {}

        for tf in self.manifest.timeframes:
            cdls = self.data_adapter.get_candles(self.symbol, tf)
            self._candles[tf] = cdls
            self._timestamps[tf] = [c.timestamp for c in cdls]

        # Initialize clock at the start of the lowest timeframe with adequate history (1m if present)
        base_tf = "1m" if "1m" in self._candles else self.manifest.timeframes[0]
        # Allow starting at least 100 bars in so context is visible
        initial_idx = min(100, len(self._candles[base_tf]) - 1)
        self.min_time = self._candles[base_tf][0].timestamp
        self.max_time = self._candles[base_tf][-1].timestamp + TIMEFRAME_INTERVALS_MS.get(base_tf, 60000)
        self.current_time = self._candles[base_tf][initial_idx].timestamp + TIMEFRAME_INTERVALS_MS.get(base_tf, 60000)

        self.is_playing = False
        self.playback_speed = 1.0  # multiplier

    @property
    def current_time_iso(self) -> str:
        return datetime.fromtimestamp(self.current_time / 1000, tz=timezone.utc).isoformat()

    def set_time(self, timestamp_ms: int) -> int:
        """Sets the clock directly to a specific timestamp in ms, clamped to data bounds."""
        clamped = max(self.min_time, min(self.max_time, timestamp_ms))
        self.current_time = clamped
        return self.current_time

    def set_time_iso(self, iso_str: str) -> int:
        dt = datetime.fromisoformat(iso_str)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return self.set_time(int(dt.timestamp() * 1000))

    def step(self, timeframe: str = "1m", count: int = 1) -> int:
        """Steps forward by `count` bars of the specified timeframe."""
        tf = timeframe.lower()
        interval = TIMEFRAME_INTERVALS_MS.get(tf, 60 * 1000)
        return self.set_time(self.current_time + (interval * count))

    def step_backward(self, timeframe: str = "1m", count: int = 1) -> int:
        """Steps backward by `count` bars of the specified timeframe."""
        tf = timeframe.lower()
        interval = TIMEFRAME_INTERVALS_MS.get(tf, 60 * 1000)
        return self.set_time(self.current_time - (interval * count))

    def get_visible_candles(self, timeframe: str, include_forming: bool = False) -> List[Candle]:
        """
        Returns candles visible strictly as-of `current_time`.
        - include_forming=False: Only closed bars (bar_open + interval <= current_time).
        - include_forming=True: Includes the currently open bar if its open <= current_time,
          but will NOT reveal future price action.
        """
        tf = timeframe.lower()
        if tf not in self._candles:
            raise KeyError(f"Timeframe '{tf}' not loaded for symbol '{self.symbol}'")

        interval = TIMEFRAME_INTERVALS_MS.get(tf, 60 * 1000)
        candles = self._candles[tf]
        timestamps = self._timestamps[tf]

        # Find the index of the last bar that opened <= current_time
        idx = bisect.bisect_right(timestamps, self.current_time)

        if not include_forming:
            # Only include bars whose close (open + interval) <= current_time
            # Bisect for open <= current_time - interval
            closed_idx = bisect.bisect_right(timestamps, self.current_time - interval)
            return candles[:closed_idx]
        else:
            return candles[:idx]

    def get_latest_price(self) -> Optional[float]:
        """Returns the most recent known close price at current_time from the fastest available timeframe."""
        for tf in ["1m", "5m", "15m", "1h", "4h"]:
            if tf in self._candles:
                visible = self.get_visible_candles(tf, include_forming=False)
                if visible:
                    return visible[-1].close
        return None

    def get_state(self) -> Dict[str, Any]:
        return {
            "symbol": self.symbol,
            "current_time": self.current_time,
            "current_time_iso": self.current_time_iso,
            "min_time": self.min_time,
            "max_time": self.max_time,
            "is_playing": self.is_playing,
            "playback_speed": self.playback_speed,
            "latest_price": self.get_latest_price(),
        }
