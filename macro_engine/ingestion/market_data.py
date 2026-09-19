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
        raise DataUnavailableError(
            f"Market data unavailable for {name}; synthetic fallback is disabled."
        )
