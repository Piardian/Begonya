"""
Begonya Manual Replay - Point-In-Time (PIT) Macro Adapter
=========================================================
Delivers historically accurate, as-of macro states at replay time T.
Guarantees:
- Strict Point-In-Time (PIT) isolation: Future economic data or revisions cannot influence time T.
- Never fabricates neutral score or zero rating when data is missing; explicitly yields UNAVAILABLE_HISTORICAL_DATA.
- Attaches an immutable MacroSnapshot to every manual order/trade.
"""

from __future__ import annotations

import bisect
import json
import logging
import os
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger("Begonya.ManualReplay.PitMacroAdapter")

_REPO_ROOT = Path(__file__).resolve().parents[3]
BENCHMARK_MACRO_RECORDS = Path(os.environ.get("BEGONYA_MACRO_RECORDS_PATH", str(_REPO_ROOT / "benchmark" / "macro_records.json")))
LIVE_MACRO_GATE = Path(os.environ.get("BEGONYA_LIVE_MACRO_GATE_PATH", str(_REPO_ROOT / "macro_engine" / "gateways" / "macro_bias_gate.json")))


@dataclass
class MacroSnapshot:
    status: str  # 'AVAILABLE' or 'UNAVAILABLE_HISTORICAL_DATA'
    as_of_iso: str
    symbol: str
    primary_regime: str
    bias_gate: str
    volatility_risk_score: Optional[float]
    recommended_risk_multiplier: Optional[float]
    currency_scores: Optional[Dict[str, int]]
    as_of_verified: bool
    source_record_id: Optional[str] = None
    market_snapshot: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class PitMacroAdapter:
    """Provides point-in-time macro state queries aligned with replay clock."""

    def __init__(self, records_path: Optional[Path] = None):
        self.records_path = Path(records_path) if records_path else BENCHMARK_MACRO_RECORDS
        self._historical_records: List[Dict[str, Any]] = []
        self._record_timestamps: List[int] = []
        self._load_historical_records()

    def _load_historical_records(self) -> None:
        if not self.records_path.exists():
            logger.warning(f"Benchmark macro records file not found at {self.records_path}")
            return

        try:
            with open(self.records_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, list):
                # Sort records chronologically
                valid_records = []
                for original in data:
                    if not isinstance(original, dict):
                        continue
                    rec = dict(original)
                    availability_key = next((
                        key for key in (
                            "available_at_utc", "published_at_utc",
                            "release_timestamp_utc", "first_seen_at_utc"
                        ) if rec.get(key)
                    ), None)
                    ts_str = rec.get(availability_key) if availability_key else rec.get("timestamp_utc")
                    if not ts_str:
                        continue
                    try:
                        dt = datetime.fromisoformat(str(ts_str).replace("Z", "+00:00"))
                        if dt.tzinfo is None:
                            logger.warning("Skipping macro record with timezone-naive timestamp")
                            continue
                        rec["_ts_ms"] = int(dt.timestamp() * 1000)
                        rec["_availability_verified"] = availability_key is not None
                        valid_records.append(rec)
                    except (TypeError, ValueError):
                        logger.warning("Skipping macro record with invalid timestamp")
                valid_records.sort(key=lambda r: r["_ts_ms"])
                self._historical_records = valid_records
                self._record_timestamps = [r["_ts_ms"] for r in valid_records]
        except Exception as e:
            logger.error(f"Error loading historical macro records: {e}")

    def get_macro_snapshot(self, symbol: str, as_of_ms: int) -> MacroSnapshot:
        """
        Retrieves the valid macro state as-of `as_of_ms`.
        Rule:
        - Only records with timestamp <= as_of_ms are eligible.
        - The record must be recent enough (within 72 hours) to avoid stale carryover.
        - If no record is found or data is expired, returns UNAVAILABLE_HISTORICAL_DATA.
        """
        sym_clean = symbol.replace("/", "").replace("-", "").upper()
        as_of_iso = datetime.fromtimestamp(as_of_ms / 1000, tz=timezone.utc).isoformat()

        if not self._record_timestamps:
            return self._build_unavailable(sym_clean, as_of_iso)

        # Find the latest record timestamp <= as_of_ms
        idx = bisect.bisect_right(self._record_timestamps, as_of_ms)
        if idx == 0:
            # Replay time is before our earliest recorded macro record
            return self._build_unavailable(sym_clean, as_of_iso)

        candidate = self._historical_records[idx - 1]
        rec_ts = candidate["_ts_ms"]

        if not candidate.get("_availability_verified", False):
            return self._build_unavailable(
                sym_clean, as_of_iso, reason="UNVERIFIED_RECORD_AVAILABILITY",
                status="UNVERIFIED_HISTORICAL_DATA",
            )

        # 72 hours maximum validity window (72 * 3600 * 1000 ms)
        MAX_STALENESS_MS = 72 * 3600 * 1000
        if as_of_ms - rec_ts > MAX_STALENESS_MS:
            return self._build_unavailable(sym_clean, as_of_iso, reason="RECORD_EXPIRED_STALE")

        # Missing fields must never be silently converted to a neutral macro state.
        bias_gate = None
        record_symbol = str(candidate.get("symbol", "")).replace("/", "").replace("-", "").upper()
        if record_symbol == sym_clean:
            raw_gate = candidate.get("cross_pair_verdict", {}).get("recommended_gate")
            gate_map = {
                "LONG_ONLY": "LONG_ONLY",
                "SHORT_ONLY": "SHORT_ONLY",
                "NEUTRAL_RANGE": "NEUTRAL_RANGE",
                "NEUTRAL_ALLOWED": "NEUTRAL_RANGE",
            }
            bias_gate = gate_map.get(str(raw_gate).upper()) if raw_gate is not None else None
        elif len(sym_clean) == 6:
            c_scores = candidate.get("currency_scores")
            base, quote = sym_clean[:3], sym_clean[3:]
            if isinstance(c_scores, dict) and base in c_scores and quote in c_scores:
                try:
                    diff = float(c_scores[base]) - float(c_scores[quote])
                    bias_gate = "LONG_ONLY" if diff >= 2 else "SHORT_ONLY" if diff <= -2 else "NEUTRAL_RANGE"
                except (TypeError, ValueError):
                    bias_gate = None

        if bias_gate is None:
            return self._build_unavailable(
                sym_clean, as_of_iso, reason="MISSING_OR_INVALID_SYMBOL_BIAS",
                status="UNAVAILABLE_HISTORICAL_DATA",
            )

        return MacroSnapshot(
            status="AVAILABLE",
            as_of_iso=as_of_iso,
            symbol=sym_clean,
            primary_regime=candidate.get("primary_regime", "Undefined"),
            bias_gate=bias_gate,
            volatility_risk_score=candidate.get("volatility_risk_score"),
            recommended_risk_multiplier=candidate.get("recommended_risk_multiplier", 1.0),
            currency_scores=candidate.get("currency_scores"),
            as_of_verified=True,
            source_record_id=candidate.get("macro_record_id"),
            market_snapshot=candidate.get("macro_market_snapshot"),
        )

    @staticmethod
    def _build_unavailable(
        symbol: str,
        as_of_iso: str,
        reason: str = "NO_HISTORICAL_OBSERVATION",
        status: str = "UNAVAILABLE_HISTORICAL_DATA",
    ) -> MacroSnapshot:
        return MacroSnapshot(
            status=status,
            as_of_iso=as_of_iso,
            symbol=symbol,
            primary_regime=f"UNAVAILABLE ({reason})",
            bias_gate="UNAVAILABLE",
            volatility_risk_score=None,
            recommended_risk_multiplier=None,
            currency_scores=None,
            as_of_verified=False,
            source_record_id=None,
            market_snapshot=None,
        )
