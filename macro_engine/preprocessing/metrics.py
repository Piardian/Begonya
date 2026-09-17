from __future__ import annotations

import datetime as dt
import json
import tempfile
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional

from config import BIAS_GATE_FILE
from core.deterministic_controls import event_freeze_status, normalize_calendar_event, signed_surprise_zscore, validate_freshness, validate_numeric_range
from data_quality import DataUnavailableError, validate_fred_payload, validate_market_payload
from preprocessing.metrics_legacy import MacroMetricsCalculator as _LegacyMacroMetricsCalculator


@contextmanager
def _fixed_legacy_date(as_of_date: Optional[dt.date], as_of_datetime: Optional[dt.datetime] = None, state: Optional[Mapping[str, Any]] = None):
    legacy_module = __import__("preprocessing.metrics_legacy", fromlist=["datetime"])
    original_date = legacy_module.datetime.date
    original_datetime = legacy_module.datetime.datetime
    original_gate_file = legacy_module.BIAS_GATE_FILE
    effective_date = as_of_date or (as_of_datetime.date() if as_of_datetime else dt.date.today())
    effective_datetime = as_of_datetime or dt.datetime.combine(effective_date, dt.time.min, tzinfo=dt.timezone.utc)

    class _FixedDate(original_date):
        @classmethod
        def today(cls): return effective_date

    class _FixedDateTime(original_datetime):
        @classmethod
        def now(cls, tz=None):
            value = effective_datetime
            return value.astimezone(tz) if tz is not None else value.replace(tzinfo=None)

    temp_dir = None
    try:
        if state is not None:
            temp_dir = tempfile.TemporaryDirectory(prefix="begonya_macro_state_")
            path = Path(temp_dir.name) / "previous_regime_state.json"
            path.write_text(json.dumps({"regime_state": dict(state)}), encoding="utf-8")
            legacy_module.BIAS_GATE_FILE = path
        else:
            legacy_module.BIAS_GATE_FILE = BIAS_GATE_FILE
        legacy_module.datetime.date = _FixedDate
        legacy_module.datetime.datetime = _FixedDateTime
        yield
    finally:
        legacy_module.datetime.date = original_date
        legacy_module.datetime.datetime = original_datetime
        legacy_module.BIAS_GATE_FILE = original_gate_file
        if temp_dir is not None:
            temp_dir.cleanup()


class MacroMetricsCalculator(_LegacyMacroMetricsCalculator):
    """Deterministic validation facade; legacy analytics remain available through inheritance."""

    DEFAULT_SURPRISE_SIGMAS = {"cpi": 0.12, "core_cpi": 0.10, "nfp": 50_000.0, "unemployment": 0.15, "pmi": 1.5, "gdp": 0.50, "retail_sales": 0.40, "generic": 1.0}
    FRED_FREQUENCIES = {"WALCL":"weekly","RRPONTSYD":"daily","WTREGEN":"daily","T10YIE":"daily","DFII10":"daily","DFF":"daily","BAMLH0A0HYM2":"daily","NFCI":"weekly","ICSA":"weekly","M2SL":"monthly","DE10Y":"monthly"}

    def __init__(self, as_of_date: Optional[dt.date] = None, surprise_sigmas: Optional[Mapping[str, float]] = None):
        super().__init__()
        self.as_of_date = as_of_date
        self.surprise_sigmas = dict(surprise_sigmas or self.DEFAULT_SURPRISE_SIGMAS)

    @classmethod
    def from_calibration_profile(cls, profile_path: Optional[Path] = None, allow_default_fallback: bool = False, **kwargs: Any):
        path = profile_path or Path(__file__).resolve().parent.parent / "calibration" / "surprise_sigma_profile.json"
        if not path.exists():
            if allow_default_fallback: return cls(**kwargs)
            raise DataUnavailableError(f"Calibration profile unavailable: {path}")
        from calibration.surprise_sigma import load_calibration_profile
        return cls(surprise_sigmas=load_calibration_profile(path), **kwargs)

    def calculate_surprise_zscore(self, indicator_type: str, actual: float, forecast: float) -> float:
        sigma = float(self.surprise_sigmas.get(indicator_type.lower(), self.surprise_sigmas.get("generic", 1.0)))
        if indicator_type.lower() == "nfp" and max(abs(float(actual)), abs(float(forecast))) < 10_000: sigma /= 1000.0
        return signed_surprise_zscore(indicator_type, actual, forecast, sigma)

    @staticmethod
    def calculate_real_yield(us10y: float, dfii10_tips: Optional[float] = None, breakeven_10y: Optional[float] = None) -> Dict[str, Any]:
        if dfii10_tips is not None:
            real_yield, source = round(dfii10_tips, 3), "FRED DFII10 (Doğrudan 10Y TIPS Reel Getirisi)"
        else:
            if breakeven_10y is None: raise ValueError("DFII10 unavailable and no breakeven fallback supplied")
            real_yield, source = round(us10y - breakeven_10y, 3), f"Sentetik (US10Y {us10y}% - Breakeven {breakeven_10y}%)"
        pressure = "High Fırsat Maliyeti (Reel Faiz >= %1.90; Yeni Long Kısıtlanır)" if real_yield >= 1.90 else "Low (Destekleyici; Negatif/Düşük Reel Faiz)" if real_yield < 1.0 else "Moderate (Dengeli)"
        return {"real_yield_pct": real_yield, "yield_source": source, "pressure_on_gold": pressure, "description": f"10Y Reel Getiri: %{real_yield} [{source}] (Altın baskısı: {pressure})"}

    @staticmethod
    def calculate_fed_forward_path(us02y: float, dff: Optional[float], us02y_5d: Optional[float] = None) -> Dict[str, Any]:
        if dff is None:
            return {"fed_policy_rate_pct": 5.33, "fed_policy_rate_source": "legacy_static_fixture_fallback", "us02y_yield": us02y, "implied_rate_gap_bps": round((us02y - 5.33) * 100, 1), "delta_02y_5d_bps": None if us02y_5d is None else round((us02y-us02y_5d)*100,1)}
        gap = round((us02y - dff) * 100, 1)
        return {"fed_policy_rate_pct": round(dff,3), "fed_policy_rate_source": "FRED DFF", "implied_rate_gap_bps": gap, "delta_02y_5d_bps": None if us02y_5d is None else round((us02y-us02y_5d)*100,1), "rate_expectation_signal": "Market-implied easing" if gap <= -25 else "Market-implied tightening" if gap >= 25 else "Near-policy / neutral pricing"}

    @staticmethod
    def _validate_key_ranges(market_data: Dict[str, Any], fred_data: Dict[str, Any]) -> None:
        for name, lo, hi in [("DXY",0,500),("GOLD",0,10000),("BRENT",0,500),("US10Y",-5,20),("US02Y",-5,20),("BTC",0,2_000_000),("COPPER",0,20),("VIX",0,200),("HYG",0,200),("LQD",0,300)]:
            data = market_data.get(name)
            if isinstance(data, dict) and data.get("value") is not None: validate_numeric_range(name, data["value"], lo, hi)
        for name, lo, hi in [("T10YIE",-10,20),("DFII10",-10,20),("DFF",0,20),("BAMLH0A0HYM2",0,50),("NFCI",-10,10),("ICSA",0,10000)]:
            if name in fred_data and fred_data[name] is not None: validate_numeric_range(name, fred_data[name], lo, hi)

    def _validate_fred_freshness(self, fred_data: Dict[str, Any], as_of: Optional[dt.date]) -> Dict[str, int]:
        if as_of is None: return {}
        observations = fred_data.get("data_quality", {}).get("observation_dates", {})
        return {field: validate_freshness(field, dt.date.fromisoformat(str(value)), as_of, self.FRED_FREQUENCIES.get(field, "unknown")) for field, value in observations.items()}

    def process_all_macro_data(self, market_data: Dict[str, Any], fred_data: Dict[str, Any], calendar_events: List[Dict[str, Any]], as_of_date: Optional[dt.date] = None, as_of_datetime: Optional[dt.datetime] = None, previous_regime_state: Optional[Mapping[str, Any]] = None, now_utc: Optional[dt.datetime] = None) -> Dict[str, Any]:
        validate_market_payload(market_data); validate_fred_payload(fred_data); self._validate_key_ranges(market_data, fred_data)
        as_of = as_of_date or self.as_of_date
        freshness = self._validate_fred_freshness(fred_data, as_of)
        effective_datetime = as_of_datetime or (dt.datetime.combine(as_of, dt.time.max, tzinfo=dt.timezone.utc) if as_of else None)
        events = [normalize_calendar_event(event) for event in calendar_events]
        freeze = event_freeze_status(events, now_utc=now_utc or effective_datetime) if (now_utc or effective_datetime) else None
        with _fixed_legacy_date(as_of, effective_datetime, previous_regime_state): result = super().process_all_macro_data(market_data, fred_data, events)
        if freeze is not None:
            result.setdefault("cross_pairs_analysis", {})["event_freeze"] = freeze; result.setdefault("regime_state", {})["event_freeze_active"] = bool(freeze["active"])
        result["fed_forward_path_analysis"] = self.calculate_fed_forward_path(float(result.get("fed_forward_path_analysis", {}).get("us02y_yield", market_data["US02Y"]["value"])), fred_data.get("DFF"), market_data["US02Y"].get("val_5d_ago"))
        result.setdefault("regime_state", {})["state_source"] = "explicit_previous_regime_state" if previous_regime_state is not None else "default_inactive_state"
        result["dxy_oil_correlation_method"] = "pearson_on_period_returns"
        result["data_quality"] = {"fallback_used": "DFF" not in fred_data, "synthetic_fallback_used": "DFF" not in fred_data, "fallback_fields": ["DFF"] if "DFF" not in fred_data else []}
        result["validation"] = {"fred_freshness_days": freshness}
        return result
