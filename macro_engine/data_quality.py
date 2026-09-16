from __future__ import annotations

from typing import Any, Dict, Iterable, Optional


class DataUnavailableError(RuntimeError):
    """Required macro input is unavailable; never substitute synthetic market data."""


# Complete input set required before the live macro pipeline can be executed.
REQUIRED_MARKET_FIELDS = {
    "DXY", "GOLD", "BRENT", "US10Y", "US02Y", "BTC", "COPPER", "VIX",
    "HYG", "LQD", "CA02Y", "DE02Y", "GB02Y", "AU02Y", "NZ02Y", "SOL",
}

# Optional cross-asset inputs. Missing values must be treated as unavailable/neutral,
# not as fabricated prices.
OPTIONAL_MARKET_FIELDS = {"IRON_ORE", "DAIRY_GDT", "SPX", "WTI"}

REQUIRED_FRED_FIELDS = {
    "WALCL", "WALCL_4W_AGO", "RRPONTSYD", "RRPONTSYD_4W_AGO",
    "WTREGEN", "WTREGEN_4W_AGO", "T10YIE", "DFII10",
    "BAMLH0A0HYM2", "NFCI", "ICSA", "DE10Y", "DE10Y_4W_AGO",
}


def _validate_present_market_fields(payload: Dict[str, Any]) -> None:
    for name, data in payload.items():
        if name in OPTIONAL_MARKET_FIELDS or name in REQUIRED_MARKET_FIELDS:
            if not isinstance(data, dict) or data.get("value") is None:
                raise DataUnavailableError(f"Invalid market payload for {name}")


def _validate_present_fred_fields(payload: Dict[str, Any]) -> None:
    for name, value in payload.items():
        if name in REQUIRED_FRED_FIELDS and value is None:
            raise DataUnavailableError(f"Invalid FRED payload for {name}")


def validate_market_payload(
    payload: Dict[str, Any],
    required_fields: Optional[Iterable[str]] = None,
) -> None:
    """Validate present structure, optionally enforcing a complete runtime field set."""
    if not isinstance(payload, dict):
        raise DataUnavailableError("Market payload must be a dictionary")

    _validate_present_market_fields(payload)

    if required_fields is None:
        return

    required = set(required_fields)
    missing = sorted(name for name in required if name not in payload)
    if missing:
        raise DataUnavailableError(
            "Required market data unavailable: " + ", ".join(missing)
        )
    for name in required:
        data = payload[name]
        if not isinstance(data, dict) or data.get("value") is None:
            raise DataUnavailableError(f"Invalid market payload for {name}")


def validate_fred_payload(
    payload: Dict[str, Any],
    required_fields: Optional[Iterable[str]] = None,
) -> None:
    """Validate present structure, optionally enforcing a complete runtime field set."""
    if not isinstance(payload, dict):
        raise DataUnavailableError("FRED payload must be a dictionary")

    _validate_present_fred_fields(payload)

    if required_fields is None:
        return

    required = set(required_fields)
    missing = sorted(name for name in required if name not in payload)
    if missing:
        raise DataUnavailableError(
            "Required FRED data unavailable: " + ", ".join(missing)
        )
    for name in required:
        value = payload[name]
        if value is None:
            raise DataUnavailableError(f"Invalid FRED payload for {name}")
