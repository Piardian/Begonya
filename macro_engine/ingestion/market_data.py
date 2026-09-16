from __future__ import annotations

from typing import Any, Dict

from data_quality import DataUnavailableError, validate_market_payload
from ingestion.market_data_legacy import MarketDataIngestion as _LegacyMarketDataIngestion


class MarketDataIngestion(_LegacyMarketDataIngestion):
    """Market ingestion that fails closed instead of substituting fixed prices."""

    def _get_fallback_price(self, name: str) -> Dict[str, Any]:
        raise DataUnavailableError(
            f"Market data unavailable for {name}; synthetic fallback is disabled."
        )

    def fetch_current_prices(self) -> Dict[str, Any]:
        results = super().fetch_current_prices()
        validate_market_payload(results)
        short_hist = sorted(
            f"{name}({len(data.get('history_close', []))})"
            for name, data in results.items()
            if isinstance(data, dict) and len(data.get("history_close", [])) < 6
        )
        if short_hist:
            raise DataUnavailableError(
                "Insufficient market history for deterministic deltas: " + ", ".join(short_hist)
            )
        return results
