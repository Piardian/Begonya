from __future__ import annotations

from typing import Any, Dict


class DataUnavailableError(RuntimeError):
    """Required macro input is unavailable; never substitute synthetic market data."""


# Core inputs required to produce execution-relevant macro gates.
REQUIRED_MARKET_FIELDS = {
    "DXY", "GOLD", "BRENT", "US10Y", "US02Y", "BTC", "COPPER", "VIX",
    "HYG", "LQD", "CA02Y", "DE02Y", "GB02Y", "AU02Y", "NZ02Y", "SOL",
}

# Optional cross-asset inputs. Missing values must be treated as unavailable/neutral,
# not as fabricated prices. The legacy calculator naturally gives these factors zero
# contribution when their change fields are absent.
OPTIONAL_MARKET_FIELDS = {"IRON_ORE", "DAIRY_GDT", "SPX", "WTI"}

REQUIRED_FRED_FIELDS = {
    "WALCL", "WALCL_4W_AGO", "RRPONTSYD", "RRPONTSYD_4W_AGO",
    "WTREGEN", "WTREGEN_4W_AGO", "T10YIE", "DFII10",
    "BAMLH0A0HYM2", "NFCI", "ICSA", "DE10Y", "DE10Y_4W_AGO",
}


def validate_market_payload(payload: Dict[str, Any]) -> None:
    missing = sorted(name for name in REQUIRED_MARKET_FIELDS if name not in payload)
    if missing:
        raise DataUnavailableError(
            "Required market data unavailable: " + ", ".join(missing)
        )
    for name in REQUIRED_MARKET_FIELDS:
        data = payload[name]
        if not isinstance(data, dict) or data.get("value") is None:
            raise DataUnavailableError(f"Invalid market payload for {name}")


def validate_fred_payload(payload: Dict[str, Any]) -> None:
    missing = sorted(name for name in REQUIRED_FRED_FIELDS if name not in payload)
    if missing:
        raise DataUnavailableError(
            "Required FRED data unavailable: " + ", ".join(missing)
        )
    for name in REQUIRED_FRED_FIELDS:
        value = payload[name]
        if value is None:
            raise DataUnavailableError(f"Invalid FRED payload for {name}")
