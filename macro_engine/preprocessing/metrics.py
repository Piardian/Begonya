from __future__ import annotations

import datetime as dt
import json
import tempfile
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional

from config import BIAS_GATE_FILE, HYSTERESIS_CONFIG, NEWS_FREEZE_CONFIG
from core.deterministic_controls import (
    event_freeze_status,
    normalize_calendar_event,
    resolve_hysteresis,
    return_correlation,
    signed_surprise_zscore,
    validate_freshness,
    validate_numeric_range,
)
from data_quality import DataUnavailableError, validate_fred_payload, validate_market_payload
from preprocessing.metrics_legacy import MacroMetricsCalculator as _LegacyMacroMetricsCalculator
import preprocessing.metrics_legacy as _legacy_metrics_module


@contextmanager
def _fixed_legacy_date(
    as_of_date: Optional[dt.date],
    as_of_datetime: Optional[dt.datetime] = None,
    state: Optional[Mapping[str, Any]] = None,
):
    """Compatibility shim for legacy code; caller supplies all state explicitly."""
    if as_of_date is None and as_of_datetime is None and state is None:
        yield
        return

    legacy_module = __import__("preprocessing.metrics_legacy", fromlist=["datetime"])
    original_date = legacy_module.datetime.date
    original_datetime = legacy_module.datetime.datetime
    original_gate_file = legacy_module.BIAS_GATE_FILE

    effective_date = as_of_date or (as_of_datetime.date() if as_of_datetime else dt.date.today())
    effective_datetime = as_of_datetime or dt.datetime.combine(
        effective_date, dt.time.min, tzinfo=dt.timezone.utc
    )

    class _FixedDate(original_date):
        @classmethod
        def today(cls):
            return effective_date

    class _FixedDateTime(original_datetime):
        @classmethod
        def now(cls, tz=None):
            value = effective_datetime
            if tz is not None:
                value = value.astimezone(tz)
            return value.replace(tzinfo=None) if tz is None else value

    with tempfile.TemporaryDirectory(prefix="begonya_macro_state_") as tmpdir:
        path = Path(tmpdir) / "previous_regime_state.json"
        path.write_text(json.dumps({"regime_state": dict(state or {})}), encoding="utf-8")
        legacy_module.BIAS_GATE_FILE = path
        legacy_module.datetime.date = _FixedDate
        legacy_module.datetime.datetime = _FixedDateTime
        try:
            yield
        finally:
            legacy_module.datetime.date = original_date
            legacy_module.datetime.datetime = original_datetime
            legacy_module.BIAS_GATE_FILE = original_gate_file


class MacroMetricsCalculator(_LegacyMacroMetricsCalculator):
    """Validated deterministic macro metrics facade over the legacy calculator."""

    DEFAULT_SURPRISE_SIGMAS = {
        # Uncalibrated compatibility defaults. NFP is expressed in persons here because
        # calendar normalization converts K/M/B suffixes to absolute units.
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

    def __init__(
        self,
        as_of_date: Optional[dt.date] = None,
        surprise_sigmas: Optional[Mapping[str, float]] = None,
    ):
        super().__init__()
        self.as_of_date = as_of_date
        self.surprise_sigmas = dict(surprise_sigmas or self.DEFAULT_SURPRISE_SIGMAS)

    @classmethod
    def from_calibration_profile(
        cls,
        profile_path: Optional[Path] = None,
        allow_default_fallback: bool = False,
        **kwargs: Any,
    ) -> MacroMetricsCalculator:
        """Build from a fitted sigma profile; missing profiles fail closed by default.

        ``allow_default_fallback`` is intentionally explicit for legacy/replay/test
        contexts. Production callers should use the calibrated profile.
        """
        path = profile_path or Path(__file__).resolve().parent.parent / "calibration" / "surprise_sigma_profile.json"
        if not path.exists():
            if allow_default_fallback:
                return cls(**kwargs)
            raise DataUnavailableError(f"Calibration profile unavailable: {path}")
        from calibration.surprise_sigma import load_calibration_profile
        sigmas = load_calibration_profile(path)
        return cls(surprise_sigmas=sigmas, **kwargs)

    def calculate_surprise_zscore(self, indicator_type: str, actual: float, forecast: float) -> float:
        sigma = float(self.surprise_sigmas.get(indicator_type.lower(), self.surprise_sigmas.get("generic", 1.0)))
        # Backward-compatible direct-call behavior for legacy tests that pass NFP in K.
        if indicator_type.lower() == "nfp" and max(abs(float(actual)), abs(float(forecast))) < 10_000:
            sigma = sigma / 1_000.0
        return signed_surprise_zscore(indicator_type, actual, forecast, sigma)

    @staticmethod
    def calculate_real_yield(
        us10y: float,
        dfii10_tips: Optional[float] = None,
        breakeven_10y: Optional[float] = None,
    ) -> Dict[str, Any]:
        if dfii10_tips is not None:
            real_yield = round(dfii10_tips, 3)
            source = "FRED DFII10 (Doğrudan 10Y TIPS Reel Getirisi)"
        else:
            if breakeven_10y is None:
                raise ValueError("DFII10 unavailable and no breakeven fallback supplied")
            real_yield = round(us10y - breakeven_10y, 3)
            source = f"Sentetik (US10Y {us10y}% - Breakeven {breakeven_10y}%)"
        if real_yield >= 1.90:
            pressure_on_gold = "High Fırsat Maliyeti (Reel Faiz >= %1.90; Yeni Long Kısıtlanır)"
        elif real_yield < 1.0:
            pressure_on_gold = "Low (Destekleyici; Negatif/Düşük Reel Faiz)"
        else:
            pressure_on_gold = "Moderate (Dengeli)"
        return {
            "real_yield_pct": real_yield,
            "yield_source": source,
            "pressure_on_gold": pressure_on_gold,
            "description": f"10Y Reel Getiri: %{real_yield} [{source}] (Altın baskısı: {pressure_on_gold})",
        }

    @staticmethod
    def calculate_fed_forward_path(us02y: float, dff: Optional[float], us02y_5d: Optional[float] = None) -> Dict[str, Any]:
        if dff is None:
            raise ValueError("DFF is required for the Fed forward-path calculation")
        gap_bps = round((us02y - dff) * 100, 1)
        delta_02y_5d_bps = None if us02y_5d is None else round((us02y - us02y_5d) * 100, 1)
        if gap_bps <= -25.0:
            signal = "Market-implied easing"
        elif gap_bps >= 25.0:
            signal = "Market-implied tightening"
        else:
            signal = "Near-policy / neutral pricing"
        return {
            "fed_policy_rate_pct": round(dff, 3),
            "fed_policy_rate_source": "FRED DFF",
            "implied_rate_gap_bps": gap_bps,
            "delta_02y_5d_bps": delta_02y_5d_bps,
            "rate_expectation_signal": signal,
        }

    @staticmethod
    def _validate_key_ranges(market_data: Dict[str, Any], fred_data: Dict[str, Any]) -> None:
        ranges = {
            "DXY": (0.0, 500.0), "GOLD": (0.0, 10000.0), "BRENT": (0.0, 500.0),
            "US10Y": (-5.0, 20.0), "US02Y": (-5.0, 20.0), "BTC": (0.0, 2_000_000.0),
            "COPPER": (0.0, 20.0), "VIX": (0.0, 200.0), "HYG": (0.0, 200.0), "LQD": (0.0, 300.0),
            "CA02Y": (-5.0, 20.0), "DE02Y": (-5.0, 20.0), "GB02Y": (-5.0, 25.0),
            "AU02Y": (-5.0, 20.0), "NZ02Y": (-5.0, 20.0), "SOL": (0.0, 100_000.0),
        }
        for name, (lo, hi) in ranges.items():
            data = market_data.get(name)
            if isinstance(data, dict) and data.get("value") is not None:
                validate_numeric_range(name, data["value"], lo, hi)
        fred_ranges = {
            "T10YIE": (-10.0, 20.0), "DFII10": (-10.0, 20.0), "DFF": (0.0, 20.0),
            "BAMLH0A0HYM2": (0.0, 50.0), "NFCI": (-10.0, 10.0), "ICSA": (0.0, 10_000.0),
        }
        for name, (lo, hi) in fred_ranges.items():
            if name in fred_data and fred_data[name] is not None:
                validate_numeric_range(name, fred_data[name], lo, hi)

    def _validate_fred_freshness(self, fred_data: Dict[str, Any], as_of: Optional[dt.date]) -> Dict[str, int]:
        if as_of is None:
            return {}
        metadata = fred_data.get("data_quality", {})
        observations = metadata.get("observation_dates", {}) if isinstance(metadata, dict) else {}
        ages: Dict[str, int] = {}
        for field, raw_date in observations.items():
            try:
                obs_date = dt.date.fromisoformat(str(raw_date))
                frequency = self.FRED_FREQUENCIES.get(field, "unknown")
                ages[field] = validate_freshness(field, obs_date, as_of, frequency)
            except ValueError as exc:
                raise ValueError(f"Invalid observation date for {field}: {raw_date}") from exc
        return ages

    def process_all_macro_data(
        self,
        market_data: Dict[str, Any],
        fred_data: Dict[str, Any],
        calendar_events: List[Dict[str, Any]],
        as_of_date: Optional[dt.date] = None,
        as_of_datetime: Optional[dt.datetime] = None,
        previous_regime_state: Optional[Mapping[str, Any]] = None,
        now_utc: Optional[dt.datetime] = None,
    ) -> Dict[str, Any]:
        validate_market_payload(market_data)
        validate_fred_payload(fred_data)
        self._validate_key_ranges(market_data, fred_data)
        as_of = as_of_date or self.as_of_date
        freshness = self._validate_fred_freshness(fred_data, as_of)
        effective_datetime = as_of_datetime
        if effective_datetime is None and as_of is not None:
            effective_datetime = dt.datetime.combine(as_of, dt.time.max, tzinfo=dt.timezone.utc)
        for event in calendar_events:
            normalize_calendar_event(event)
            if effective_datetime is not None:
                event_freeze_status(event, now_utc=now_utc or effective_datetime)
        with _fixed_legacy_date(as_of, effective_datetime, previous_regime_state):
            result = super().process_all_macro_data(market_data, fred_data, calendar_events)
        result["validation"] = {"fred_freshness_days": freshness}
        return result
