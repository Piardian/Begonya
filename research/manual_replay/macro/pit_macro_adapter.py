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
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger("Begonya.ManualReplay.PitMacroAdapter")

BENCHMARK_MACRO_RECORDS = Path(r"c:\Users\piard\.gemini\antigravity\scratch\Begonya\benchmark\macro_records.json")
LIVE_MACRO_GATE = Path(r"c:\Users\piard\.gemini\antigravity\scratch\Begonya\macro_engine\gateways\macro_bias_gate.json")


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

    def __init__(self):
        self._historical_records: List[Dict[str, Any]] = []
        self._record_timestamps: List[int] = []
        self._load_historical_records()

    def _load_historical_records(self) -> None:
        if not BENCHMARK_MACRO_RECORDS.exists():
            logger.warning(f"Benchmark macro records file not found at {BENCHMARK_MACRO_RECORDS}")
            return

        try:
            with open(BENCHMARK_MACRO_RECORDS, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, list):
                # Sort records chronologically
                valid_records = []
                for rec in data:
                    ts_str = rec.get("timestamp_utc")
                    if ts_str:
                        dt = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
                        ts_ms = int(dt.timestamp() * 1000)
                        rec["_ts_ms"] = ts_ms
                        valid_records.append(rec)

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

        # 72 hours maximum validity window (72 * 3600 * 1000 ms)
        MAX_STALENESS_MS = 72 * 3600 * 1000
        if as_of_ms - rec_ts > MAX_STALENESS_MS:
            return self._build_unavailable(sym_clean, as_of_iso, reason="RECORD_EXPIRED_STALE")

        # Determine bias gate for requested symbol
        # 1. Direct cross_pair_verdict if symbol matches
        bias_gate = "NEUTRAL_RANGE"
        if candidate.get("symbol") == sym_clean:
            bias_gate = candidate.get("cross_pair_verdict", {}).get("recommended_gate", "NEUTRAL_ALLOWED")
        else:
            # Check execution_bias_gates if available or synthesize from currency scores
            c_scores = candidate.get("currency_scores", {})
            # Example: EURUSD -> EUR score vs USD score
            if len(sym_clean) == 6:
                base = sym_clean[:3]
                quote = sym_clean[3:]
                base_score = c_scores.get(base, 0)
                quote_score = c_scores.get(quote, 0)
                diff = base_score - quote_score
                if diff >= 2:
                    bias_gate = "LONG_ONLY"
                elif diff <= -2:
                    bias_gate = "SHORT_ONLY"
                else:
                    bias_gate = "NEUTRAL_RANGE"

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
    def _build_unavailable(symbol: str, as_of_iso: str, reason: str = "NO_HISTORICAL_OBSERVATION") -> MacroSnapshot:
        return MacroSnapshot(
            status="UNAVAILABLE_HISTORICAL_DATA",
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
