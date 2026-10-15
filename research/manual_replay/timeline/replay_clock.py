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
        """Sets the clock to an integer Unix timestamp in ms, clamped to data bounds."""
        if not isinstance(timestamp_ms, int) or isinstance(timestamp_ms, bool):
            raise ValueError("timestamp_ms must be an integer")
        clamped = max(self.min_time, min(self.max_time, timestamp_ms))
        self.current_time = clamped
        return self.current_time

    def set_time_iso(self, iso_str: str) -> int:
        dt = datetime.fromisoformat(iso_str)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return self.set_time(int(dt.timestamp() * 1000))

    def step(self, timeframe: str = "1m", count: int = 1) -> int:
        """Steps forward by a positive number of bars of an available timeframe."""
        tf = timeframe.lower()
        if tf not in TIMEFRAME_INTERVALS_MS or tf not in self._candles:
            raise ValueError(f"Timeframe '{tf}' is not available for {self.symbol}")
        if not isinstance(count, int) or isinstance(count, bool) or count < 1:
            raise ValueError("count must be a positive integer")
        interval = TIMEFRAME_INTERVALS_MS[tf]
        return self.set_time(self.current_time + interval * count)

    def step_backward(self, timeframe: str = "1m", count: int = 1) -> int:
        """Moves the clock backward; ReplaySession must guard against trade-state rewinds."""
        tf = timeframe.lower()
        if tf not in TIMEFRAME_INTERVALS_MS or tf not in self._candles:
            raise ValueError(f"Timeframe '{tf}' is not available for {self.symbol}")
        if not isinstance(count, int) or isinstance(count, bool) or count < 1:
            raise ValueError("count must be a positive integer")
        return self.set_time(self.current_time - TIMEFRAME_INTERVALS_MS[tf] * count)

    def get_visible_candles(self, timeframe: str, include_forming: bool = False, limit: Optional[int] = None) -> List[Candle]:
        """Returns candles visible as-of replay time, with consistent M1-derived HTF bars.

        When forming bars are requested, aggregate the replay's M1 stream for every
        timeframe. Completed aggregates require every expected M1 open; partial bars
        use only M1 candles whose close time is at or before the replay clock.
        """
        tf = timeframe.lower()
        if tf not in self._candles:
            raise KeyError(f"Timeframe '{tf}' not loaded for symbol '{self.symbol}'")

        interval = TIMEFRAME_INTERVALS_MS.get(tf, 60 * 1000)
        if not include_forming or "1m" not in self._candles:
            candles = self._candles[tf]
            timestamps = self._timestamps[tf]
            closed_idx = bisect.bisect_right(timestamps, self.current_time - interval)
            start_idx = max(0, closed_idx - limit) if limit is not None else 0
            return candles[start_idx:closed_idx]

        m1_bars = self._candles["1m"]
        m1_times = self._timestamps["1m"]
        closed_m1_end = bisect.bisect_right(m1_times, self.current_time - 60_000)
        bars_per_bucket = interval // 60_000
        m1_start = max(0, closed_m1_end - ((limit + 2) * bars_per_bucket if limit is not None else closed_m1_end))
        known = m1_bars[m1_start:closed_m1_end]
        buckets: Dict[int, List[Candle]] = {}
        for bar in known:
            bucket_ts = (bar.timestamp // interval) * interval
            buckets.setdefault(bucket_ts, []).append(bar)

        result: List[Candle] = []
        for bucket_ts in sorted(buckets):
            bars = buckets[bucket_ts]
            expected = [bucket_ts + i * 60_000 for i in range(bars_per_bucket)]
            actual = [bar.timestamp for bar in bars]
            if actual == expected and bucket_ts + interval <= self.current_time:
                result.append(Candle(
                    timestamp=bucket_ts,
                    open=bars[0].open,
                    high=max(bar.high for bar in bars),
                    low=min(bar.low for bar in bars),
                    close=bars[-1].close,
                ))

        if self.current_time > self.min_time:
            bucket_ts = (self.current_time // interval) * interval
            forming_bars = [bar for bar in known if bucket_ts <= bar.timestamp < self.current_time]
            if forming_bars and forming_bars[0].timestamp == bucket_ts:
                result.append(Candle(
                    timestamp=bucket_ts,
                    open=forming_bars[0].open,
                    high=max(bar.high for bar in forming_bars),
                    low=min(bar.low for bar in forming_bars),
                    close=forming_bars[-1].close,
                ))

        if limit is not None:
            result = result[-limit:]
        return result

    def get_visible_candle_count(self, timeframe: str, include_forming: bool = False) -> int:
        """Counts visible candles without allocating the candle list."""
        tf = timeframe.lower()
        if tf not in self._candles:
            raise KeyError(f"Timeframe '{tf}' not loaded for symbol '{self.symbol}'")
        interval = TIMEFRAME_INTERVALS_MS[tf]
        closed_idx = bisect.bisect_right(self._timestamps[tf], self.current_time - interval)
        if not include_forming or "1m" not in self._candles:
            return closed_idx
        forming_idx = bisect.bisect_right(self._timestamps[tf], self.current_time) - 1
        if forming_idx >= 0 and self._timestamps[tf][forming_idx] + interval > self.current_time:
            return closed_idx + 1
        return closed_idx

    def get_latest_price(self) -> Optional[float]:
        """Returns the most recent known close without materializing the full visible history."""
        for tf in ["1m", "5m", "15m", "1h", "4h"]:
            if tf not in self._candles:
                continue
            interval = TIMEFRAME_INTERVALS_MS[tf]
            idx = bisect.bisect_right(self._timestamps[tf], self.current_time - interval) - 1
            if idx >= 0:
                return self._candles[tf][idx].close
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
