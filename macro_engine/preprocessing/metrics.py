from __future__ import annotations

import datetime as dt
import json
import tempfile
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional

from core.deterministic_controls import (
    event_freeze_status,
    normalize_calendar_event,
    signed_surprise_zscore,
    validate_freshness,
    validate_numeric_range,
)
from data_quality import DataUnavailableError, validate_fred_payload, validate_market_payload
from preprocessing.metrics_legacy import MacroMetricsCalculator as _LegacyMacroMetricsCalculator


@contextmanager
def _fixed_legacy_state(
    as_of_date: Optional[dt.date],
    as_of_datetime: Optional[dt.datetime],
    state: Optional[Mapping[str, Any]],
):
    """Make legacy date/state reads deterministic for replay and tests."""
    if as_of_date is None and as_of_datetime is None and state is None:
        yield
        return
    legacy = __import__("preprocessing.metrics_legacy", fromlist=["datetime"])
    original_date = legacy.datetime.date
    original_datetime = legacy.datetime.datetime
    original_gate_file = legacy.BIAS_GATE_FILE
    effective_date = as_of_date or (as_of_datetime.date() if as_of_datetime else dt.date.today())
    effective_datetime = as_of_datetime or dt.datetime.combine(effective_date, dt.time.min, tzinfo=dt.timezone.utc)

    class FixedDate(original_date):
        @classmethod
        def today(cls):
            return effective_date

    class FixedDateTime(original_datetime):
        @classmethod
        def now(cls, tz=None):
            value = effective_datetime
            if tz is not None:
                value = value.astimezone(tz)
            return value.replace(tzinfo=None) if tz is None else value

    with tempfile.TemporaryDirectory(prefix="begonya_macro_state_") as tmp:
        gate = Path(tmp) / "previous_regime_state.json"
        gate.write_text(json.dumps({"regime_state": dict(state or {})}), encoding="utf-8")
        legacy.BIAS_GATE_FILE = gate
        legacy.datetime.date = FixedDate
        legacy.datetime.datetime = FixedDateTime
        try:
            yield
        finally:
            legacy.datetime.date = original_date
            legacy.datetime.datetime = original_datetime
            legacy.BIAS_GATE_FILE = original_gate_file


class MacroMetricsCalculator(_LegacyMacroMetricsCalculator):
    """Deterministic facade that preserves legacy metrics while enforcing explicit inputs."""

    DEFAULT_SURPRISE_SIGMAS = {
        "cpi": 0.12,
        "core_cpi": 0.10,
        "nfp": 50_000.0,
        "unemployment": 0.15,
        "pmi": 1.5,
        "gdp": 0.50,
        "retail_sales": 0.40,
        "generic": 1.0,
    }
    FRED_FREQUENCIES = {
        "WALCL": "weekly", "RRPONTSYD": "daily", "WTREGEN": "daily",
        "T10YIE": "daily", "DFII10": "daily", "DFF": "daily",
        "BAMLH0A0HYM2": "daily", "NFCI": "weekly", "ICSA": "weekly",
        "M2SL": "monthly", "DE10Y": "monthly",
    }

    def __init__(self, as_of_date: Optional[dt.date] = None, surprise_sigmas: Optional[Mapping[str, float]] = None):
        super().__init__()
        self.as_of_date = as_of_date
        self.surprise_sigmas = dict(surprise_sigmas or self.DEFAULT_SURPRISE_SIGMAS)

    @classmethod
    def from_calibration_profile(cls, profile_path: Optional[Path] = None, allow_default_fallback: bool = False, **kwargs: Any):
        path = profile_path or Path(__file__).resolve().parent.parent / "calibration" / "surprise_sigma_profile.json"
        if not path.exists():
            if allow_default_fallback:
                return cls(**kwargs)
            raise DataUnavailableError(f"Calibration profile unavailable: {path}")
        from calibration.surprise_sigma import load_calibration_profile
        return cls(surprise_sigmas=load_calibration_profile(path), **kwargs)

    def calculate_surprise_zscore(self, indicator_type: str, actual: float, forecast: float) -> float:
        sigma = float(self.surprise_sigmas.get(indicator_type.lower(), self.surprise_sigmas.get("generic", 1.0)))
        # Direct legacy calls historically use NFP in thousands; canonical calendar data uses persons.
        if indicator_type.lower() == "nfp" and max(abs(float(actual)), abs(float(forecast))) < 10_000:
            sigma /= 1_000.0
        return signed_surprise_zscore(indicator_type, actual, forecast, sigma)

    @staticmethod
    def calculate_real_yield(us10y: float, dfii10_tips: Optional[float] = None, breakeven_10y: Optional[float] = None) -> Dict[str, Any]:
        if dfii10_tips is not None:
            real_yield = round(dfii10_tips, 3)
            source = "FRED DFII10 (Doğrudan 10Y TIPS Reel Getirisi)"
        else:
            if breakeven_10y is None:
                raise ValueError("DFII10 unavailable and no breakeven fallback supplied")
            real_yield = round(us10y - breakeven_10y, 3)
            source = f"Sentetik (US10Y {us10y}% - Breakeven {breakeven_10y}%)"
        pressure = "High Fırsat Maliyeti (Reel Faiz >= %1.90; Yeni Long Kısıtlanır)" if real_yield >= 1.90 else "Low (Destekleyici; Negatif/Düşük Reel Faiz)" if real_yield < 1.0 else "Moderate (Dengeli)"
        return {"real_yield_pct": real_yield, "yield_source": source, "pressure_on_gold": pressure, "description": f"10Y Reel Getiri: %{real_yield} [{source}] (Altın baskısı: {pressure})"}

    @staticmethod
    def calculate_fed_forward_path(us02y: float, dff: Optional[float], us02y_5d: Optional[float] = None) -> Dict[str, Any]:
        if dff is None:
            raise ValueError("DFF is required for the Fed forward-path calculation")
        gap = round((us02y - dff) * 100, 1)
        delta = None if us02y_5d is None else round((us02y - us02y_5d) * 100, 1)
        signal = "Market-implied easing" if gap <= -25 else "Market-implied tightening" if gap >= 25 else "Near-policy / neutral pricing"
        return {"fed_policy_rate_pct": round(dff, 3), "fed_policy_rate_source": "FRED DFF", "implied_rate_gap_bps": gap, "delta_02y_5d_bps": delta, "rate_expectation_signal": signal}

    @staticmethod
    def _validate_key_ranges(market: Dict[str, Any], fred: Dict[str, Any]) -> None:
        ranges = {"DXY": (0, 500), "GOLD": (0, 10000), "BRENT": (0, 500), "US10Y": (-5, 20), "US02Y": (-5, 20), "BTC": (0, 2_000_000), "COPPER": (0, 20), "VIX": (0, 200), "HYG": (0, 200), "LQD": (0, 300), "CA02Y": (-5, 20), "DE02Y": (-5, 20), "GB02Y": (-5, 25), "AU02Y": (-5, 20), "NZ02Y": (-5, 20), "SOL": (0, 100_000)}
        for name, (lo, hi) in ranges.items():
            data = market.get(name)
            if isinstance(data, dict) and data.get("value") is not None:
                validate_numeric_range(name, data["value"], lo, hi)
        for name, (lo, hi) in {"T10YIE": (-10, 20), "DFII10": (-10, 20), "DFF": (0, 20), "BAMLH0A0HYM2": (0, 50), "NFCI": (-10, 10), "ICSA": (0, 10000)}.items():
            if name in fred and fred[name] is not None:
                validate_numeric_range(name, fred[name], lo, hi)

    def _validate_fred_freshness(self, fred: Dict[str, Any], as_of: Optional[dt.date]) -> Dict[str, int]:
        if as_of is None:
            return {}
        metadata = fred.get("data_quality", {})
        observations = metadata.get("observation_dates", {}) if isinstance(metadata, dict) else {}
        return {field: validate_freshness(field, dt.date.fromisoformat(str(raw)), as_of, self.FRED_FREQUENCIES.get(field, "unknown")) for field, raw in observations.items()}

    def process_all_macro_data(self, market_data: Dict[str, Any], fred_data: Dict[str, Any], calendar_events: List[Dict[str, Any]], as_of_date: Optional[dt.date] = None, as_of_datetime: Optional[dt.datetime] = None, previous_regime_state: Optional[Mapping[str, Any]] = None, now_utc: Optional[dt.datetime] = None) -> Dict[str, Any]:
        validate_market_payload(market_data)
        validate_fred_payload(fred_data)
        self._validate_key_ranges(market_data, fred_data)
        as_of = as_of_date or self.as_of_date
        freshness = self._validate_fred_freshness(fred_data, as_of)
        effective_datetime = as_of_datetime or (dt.datetime.combine(as_of, dt.time.max, tzinfo=dt.timezone.utc) if as_of else None)
        events = [normalize_calendar_event(event) for event in calendar_events]
        freeze = event_freeze_status(events, now_utc=(now_utc or effective_datetime)) if (now_utc or effective_datetime) else None

        with _fixed_legacy_state(as_of, effective_datetime, previous_regime_state):
            result = super().process_all_macro_data(market_data, fred_data, events)

        if freeze is not None:
            result.setdefault("cross_pairs_analysis", {})["event_freeze"] = freeze
            result.setdefault("regime_state", {})["event_freeze_active"] = bool(freeze["active"])

        fed = result.get("fed_forward_path_analysis", {})
        if fred_data.get("DFF") is not None:
            result["fed_forward_path_analysis"] = self.calculate_fed_forward_path(
                float(fed.get("us02y_yield", market_data["US02Y"]["value"])),
                float(fred_data["DFF"]),
                market_data["US02Y"].get("val_5d_ago"),
            )
        result.setdefault("regime_state", {})["state_source"] = "explicit_previous_regime_state" if previous_regime_state is not None else "default_inactive_state"
        result["dxy_oil_correlation_method"] = "pearson_on_period_returns"
        result["data_quality"] = {"fallback_used": "DFF" not in fred_data, "synthetic_fallback_used": "DFF" not in fred_data}

        gold = result.get("gold_fiscal_dominance", {})
        credit = result.get("credit_spread_analysis", {})
        if float(market_data.get("VIX", {}).get("value", 0)) >= 40 and "Distress" in str(credit.get("stress_level", "")) or float(market_data.get("VIX", {}).get("value", 0)) >= 40 and "Şiddetli Kredi Krizi" in str(credit.get("stress_level", "")):
            gold["is_cash_dash"] = True
            gold["gold_short_allowed"] = True
            result["gold_fiscal_dominance"] = gold
        result["validation"] = {"fred_freshness_days": freshness}
        return result
