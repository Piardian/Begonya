"""
Begonya Manual Replay - Historical Data Adapter
===============================================
Research-only adapter to discover, validate, resample, and serve historical OHLCV data.
Guarantees:
- Strict read-only access (no writes to original data repositories)
- Deterministic M5 resampling from M1 bars
- Comprehensive data integrity checks (missing bars, invalid OHLC, timestamps)
- M1, M5, M15, H1, H4 multi-timeframe alignment
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("Begonya.ManualReplay.DataAdapter")

# Data paths are configurable so the research tool is portable. Explicit paths
# in BEGONYA_REPLAY_DATA_PATHS take precedence, followed by repository-local
# Begonya data, then legacy local paths for backwards compatibility.
_REPO_ROOT = Path(__file__).resolve().parents[3]
_ENV_DATA_PATHS = [
    Path(p).expanduser()
    for p in os.environ.get("BEGONYA_REPLAY_DATA_PATHS", "").split(os.pathsep)
    if p.strip()
]
DEFAULT_DATA_SEARCH_PATHS = _ENV_DATA_PATHS + [
    _REPO_ROOT / "smc_engine" / "data" / "1m_backtest",
    _REPO_ROOT / "smc_engine" / "data",
    Path.home() / "Begonya" / "smc_engine" / "data" / "1m_backtest",
    Path.home() / "Begonya" / "smc_engine" / "data",
    Path(r"c:\Users\piard\.gemini\antigravity\scratch\Begonya\smc_engine\data\1m_backtest"),
    Path(r"c:\Users\piard\.gemini\antigravity\scratch\Begonya\smc_engine\data"),
    Path(r"c:\Users\piard\.gemini\antigravity\scratch\swing-bos-core\data\replay_1year"),
    Path(r"c:\Users\piard\.gemini\antigravity\scratch\swing-bos-core\data"),
]


@dataclass
class Candle:
    timestamp: int  # Milliseconds since UNIX epoch (Bar Open)
    open: float
    high: float
    low: float
    close: float

    def to_dict(self) -> Dict[str, Any]:
        return {
            "timestamp": self.timestamp,
            "open": self.open,
            "high": self.high,
            "low": self.low,
            "close": self.close,
        }


@dataclass
class DatasetManifest:
    manifest_id: str
    symbol: str
    timeframes: List[str]
    start_time: str
    end_time: str
    bar_counts: Dict[str, int]
    file_sources: Dict[str, str]
    checksum_sha256: Dict[str, str]
    quality_audit: Dict[str, Any]

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class HistoricalDataAdapter:
    """Discovers, validates, and serves historical market data across multiple timeframes."""

    def __init__(self, search_paths: Optional[List[Path]] = None):
        self.search_paths = [p for p in (search_paths or DEFAULT_DATA_SEARCH_PATHS) if p.exists()]
        self._cache: Dict[str, Dict[str, List[Candle]]] = {}
        self._manifests: Dict[str, DatasetManifest] = {}

    def discover_files(self, symbol: str) -> Dict[str, Path]:
        """Discovers the best available data files for the requested symbol across timeframes."""
        symbol_upper = symbol.replace("/", "").replace("-", "").upper()
        found: Dict[str, Tuple[int, Path]] = {}  # tf -> (depth_score, Path)

        # Standard suffixes to inspect
        target_tfs = ["1m", "15m", "1h", "4h"]

        for base_path in self.search_paths:
            for tf in target_tfs:
                # Do not let a large file from a lower-priority directory override
                # the explicitly preferred data source. Choose depth only within
                # the first directory that contains this timeframe.
                if tf in found:
                    continue
                candidates = [
                    base_path / f"{symbol_upper}_{tf}_1y.json",
                    base_path / f"{symbol_upper}_{tf}.json",
                    base_path / f"{symbol_upper}_{tf}_30d.json",
                ]
                available = [p for p in candidates if p.is_file()]
                if available:
                    chosen = max(available, key=lambda p: p.stat().st_size)
                    found[tf] = (chosen.stat().st_size, chosen)

        return {tf: path for tf, (_, path) in found.items()}

    def load_candles_from_file(self, file_path: Path) -> List[Candle]:
        """Reads and parses a candle JSON file, returning sorted Candle objects."""
        with open(file_path, "r", encoding="utf-8") as f:
            raw_data = json.load(f)

        if not isinstance(raw_data, list):
            raise ValueError(f"Invalid candle file structure in {file_path}: expected JSON list")

        candles: List[Candle] = []
        for row_number, item in enumerate(raw_data, start=1):
            if not isinstance(item, dict):
                raise ValueError(f"Invalid candle row {row_number} in {file_path}: expected object")
            try:
                ts = int(item.get("timestamp", 0))
                o, h, l, close = (float(item[k]) for k in ("open", "high", "low", "close"))
            except (KeyError, TypeError, ValueError) as exc:
                raise ValueError(f"Invalid OHLC/timestamp at row {row_number} in {file_path}") from exc
            if ts <= 0 or any(not __import__("math").isfinite(v) or v <= 0 for v in (o, h, l, close)):
                raise ValueError(f"Non-positive or non-finite candle value at row {row_number} in {file_path}")
            if l > min(o, close) or h < max(o, close) or l > h:
                raise ValueError(f"Invalid OHLC relationship at row {row_number} in {file_path}")
            candles.append(Candle(timestamp=ts, open=o, high=h, low=l, close=close))

        candles.sort(key=lambda candle: candle.timestamp)
        duplicate_times = [
            candles[i].timestamp for i in range(1, len(candles))
            if candles[i].timestamp == candles[i - 1].timestamp
        ]
        if duplicate_times:
            raise ValueError(
                f"Duplicate candle timestamps in {file_path}: {len(duplicate_times)} duplicate row(s)"
            )
        if not candles:
            raise ValueError(f"No valid candles found in {file_path}")
        return candles

    @staticmethod
    def calculate_file_checksum(file_path: Path) -> str:
        sha256 = hashlib.sha256()
        with open(file_path, "rb") as f:
            while chunk := f.read(65536):
                sha256.update(chunk)
        return sha256.hexdigest()

    @staticmethod
    def audit_candle_stream(candles: List[Candle], expected_interval_ms: int) -> Dict[str, Any]:
        """Audits a candle stream for gaps, duplicates, and OHLC violations."""
        if not candles:
            return {"status": "EMPTY", "count": 0, "gaps": 0, "duplicates": 0, "anomalies": 0}

        duplicates = 0
        gaps = 0
        anomalies = 0
        prev_ts = candles[0].timestamp

        for i, c in enumerate(candles):
            # OHLC validity
            if c.low > c.high or c.open > c.high or c.close > c.high or c.open < c.low or c.close < c.low:
                anomalies += 1

            if i > 0:
                delta = c.timestamp - prev_ts
                if delta == 0:
                    duplicates += 1
                elif delta < 0:
                    anomalies += 1
                elif delta > expected_interval_ms * 1.5:
                    # weekend gaps are expected for FX, so this is tracked as a data gap count
                    gaps += 1
                prev_ts = c.timestamp

        return {
            "status": "VALID" if anomalies == 0 and duplicates == 0 else "CORRUPTED",
            "count": len(candles),
            "duplicates": duplicates,
            "gaps": gaps,
            "anomalies": anomalies,
        }

    @staticmethod
    def resample_m1_to_m5(m1_candles: List[Candle]) -> List[Candle]:
        """
        Deterministically resamples M1 candles into completed M5 candles.
        Bucket alignment: 5 minutes = 300,000 ms.
        Each bar timestamp represents the OPEN of the 5-minute bar.
        Only completed 5-minute bars (having full span or subsequent bar) are output.
        """
        if not m1_candles:
            return []

        interval_ms = 5 * 60 * 1000
        buckets: Dict[int, List[Candle]] = {}

        for c in m1_candles:
            bucket_ts = (c.timestamp // interval_ms) * interval_ms
            if bucket_ts not in buckets:
                buckets[bucket_ts] = []
            buckets[bucket_ts].append(c)

        m5_candles: List[Candle] = []
        sorted_bucket_keys = sorted(buckets.keys())

        for ts in sorted_bucket_keys:
            bars = sorted(buckets[ts], key=lambda candle: candle.timestamp)
            # A completed M5 bar requires all five unique, consecutive M1 opens.
            # Partial buckets would expose a forming/partially missing candle as final.
            expected = [ts + i * 60_000 for i in range(5)]
            actual = [bar.timestamp for bar in bars]
            if actual != expected:
                continue
            o = bars[0].open
            h = max(b.high for b in bars)
            l = min(b.low for b in bars)
            close = bars[-1].close
            m5_candles.append(Candle(timestamp=ts, open=o, high=h, low=l, close=close))

        return m5_candles

    def prepare_dataset(self, symbol: str) -> DatasetManifest:
        """
        Discovers, validates, and loads all available timeframes (1M, 5M, 15M, 1H, 4H)
        for the given symbol and returns a frozen DatasetManifest.
        """
        symbol_upper = symbol.replace("/", "").replace("-", "").upper()
        files = self.discover_files(symbol_upper)

        if not files:
            raise FileNotFoundError(f"No historical candle files found for symbol '{symbol_upper}'")

        timeframe_data: Dict[str, List[Candle]] = {}
        checksums: Dict[str, str] = {}
        audits: Dict[str, Any] = {}
        sources: Dict[str, str] = {}

        interval_map = {
            "1m": 60 * 1000,
            "5m": 5 * 60 * 1000,
            "15m": 15 * 60 * 1000,
            "1h": 60 * 60 * 1000,
            "4h": 4 * 60 * 60 * 1000,
        }

        # Load raw timeframes
        for tf, path in files.items():
            candles = self.load_candles_from_file(path)
            timeframe_data[tf] = candles
            checksums[tf] = self.calculate_file_checksum(path)
            audits[tf] = self.audit_candle_stream(candles, interval_map.get(tf, 60000))
            sources[tf] = str(path)

        # Synthesize M5 if M1 is available
        if "1m" in timeframe_data:
            m5_candles = self.resample_m1_to_m5(timeframe_data["1m"])
            timeframe_data["5m"] = m5_candles
            checksums["5m"] = hashlib.sha256(json.dumps([c.to_dict() for c in m5_candles], separators=(",", ":"), sort_keys=True).encode()).hexdigest()
            audits["5m"] = self.audit_candle_stream(m5_candles, interval_map["5m"])
            sources["5m"] = "SYNTHESIZED_FROM_M1"

        # Determine overall start and end across available timeframes
        all_starts = [candles[0].timestamp for candles in timeframe_data.values() if candles]
        all_ends = [candles[-1].timestamp for candles in timeframe_data.values() if candles]

        start_time_iso = (
            datetime.fromtimestamp(min(all_starts) / 1000, tz=timezone.utc).isoformat()
            if all_starts
            else "UNKNOWN"
        )
        end_time_iso = (
            datetime.fromtimestamp(max(all_ends) / 1000, tz=timezone.utc).isoformat()
            if all_ends
            else "UNKNOWN"
        )

        manifest_id = f"manifest_{symbol_upper}_{int(datetime.now(timezone.utc).timestamp())}"
        bar_counts = {tf: len(cdl) for tf, cdl in timeframe_data.items()}

        manifest = DatasetManifest(
            manifest_id=manifest_id,
            symbol=symbol_upper,
            timeframes=list(timeframe_data.keys()),
            start_time=start_time_iso,
            end_time=end_time_iso,
            bar_counts=bar_counts,
            file_sources=sources,
            checksum_sha256=checksums,
            quality_audit=audits,
        )

        self._cache[symbol_upper] = timeframe_data
        self._manifests[symbol_upper] = manifest
        return manifest

    def get_candles(self, symbol: str, timeframe: str) -> List[Candle]:
        """Returns loaded candles for a symbol and timeframe. Prepares dataset if not cached."""
        symbol_upper = symbol.replace("/", "").replace("-", "").upper()
        if symbol_upper not in self._cache:
            self.prepare_dataset(symbol_upper)
        tf = timeframe.lower()
        if tf not in self._cache[symbol_upper]:
            raise KeyError(f"Timeframe '{tf}' not available for symbol '{symbol_upper}'")
        return self._cache[symbol_upper][tf]

    def get_manifest(self, symbol: str) -> Optional[DatasetManifest]:
        symbol_upper = symbol.replace("/", "").replace("-", "").upper()
        return self._manifests.get(symbol_upper)
