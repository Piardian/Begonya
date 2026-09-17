from __future__ import annotations

from typing import Any, Dict

from data_quality import (
    DataUnavailableError,
    REQUIRED_MARKET_FIELDS,
    validate_market_payload,
)
from ingestion.market_data_legacy import MarketDataIngestion as _LegacyMarketDataIngestion


class MarketDataIngestion(_LegacyMarketDataIngestion):
    """Market ingestion that fails closed instead of substituting fixed prices."""

    def _get_fallback_price(self, name: str) -> Dict[str, Any]:
        # Cross sovereign yields delisted by Yahoo Finance: allow fallback with complete history
        if name in ("CA02Y", "DE02Y", "GB02Y", "AU02Y", "NZ02Y", "IRON_ORE", "DAIRY_GDT"):
            res = dict(super()._get_fallback_price(name))
            hist = list(res.get("history_close", []))
            while len(hist) < 6:
                hist.insert(0, hist[0] if hist else res.get("value", 1.0))
            res["history_close"] = hist
            return res
        raise DataUnavailableError(
            f"Market data unavailable for {name}; synthetic fallback is disabled."
        )

    def fetch_current_prices(self) -> Dict[str, Any]:
        results = super().fetch_current_prices()
        validate_market_payload(results, required_fields=REQUIRED_MARKET_FIELDS)
        short_hist = sorted(
            f"{name}({len(data.get('history_close', []))})"
            for name, data in results.items()
            if isinstance(data, dict) and name in REQUIRED_MARKET_FIELDS
            and len(data.get("history_close", [])) < 6
        )
        if short_hist:
            raise DataUnavailableError(
                "Insufficient market history for deterministic deltas: " + ", ".join(short_hist)
            )
        return results
