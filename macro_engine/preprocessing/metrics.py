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
    resolve_execution_gate,
    signed_surprise_zscore,
    validate_numeric_range,
)
from data_quality import validate_fred_payload, validate_market_payload
from preprocessing.metrics_legacy import MacroMetricsCalculator as _LegacyMacroMetricsCalculator
import preprocessing.metrics_legacy as _legacy_metrics_module


@contextmanager
def _fixed_legacy_date(
    as_of_date: Optional[dt.date],
    as_of_datetime: Optional[dt.datetime] = None,
    state: Optional[Mapping[str, Any]] = None,
):
    """Compatibility shim for the legacy calculator; no production state is read from disk."""
    if as_of_date is None and as_of_datetime is None and not state:
        yield
        return

    legacy_module = __import__("preprocessing.metrics_legacy", fromlist=["datetime"])
    original_date = legacy_module.datetime.date
    original_datetime = legacy_module.datetime.datetime
    original_gate_file = legacy_module.BIAS_GATE_FILE

    effective_date = as_of_date or as_of_datetime.date()
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
        "cpi": 0.12,
        "core_cpi": 0.10,
        "nfp": 50.0,
        "unemployment": 0.15,
        "pmi": 1.5,
        "gdp": 0.50,
        "retail_sales": 0.40,
        "generic": 1.0,
    }

    def __init__(
        self,
        as_of_date: Optional[dt.date] = None,
        surprise_sigmas: Optional[Mapping[str, float]] = None,
    ):
        super().__init__()
        self.as_of_date = as_of_date
        self.surprise_sigmas = dict(surprise_sigmas or self.DEFAULT_SURPRISE_SIGMAS)

    def calculate_surprise_zscore(self, indicator_type: str, actual: float, forecast: float) -> float:
        """Use calibrated sigmas when supplied; defaults are explicitly uncalibrated."""
        sigma = float(self.surprise_sigmas.get(indicator_type.lower(), self.surprise_sigmas.get("generic", 1.0)))
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
    def calculate_fed_forward_path(
        us02y: float,
        dff: Optional[float],
        us02y_5d: Optional[float] = None,
    ) -> Dict[str, Any]:
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
        effective_date = as_of_date or self.as_of_date
        effective_now = now_utc or as_of_datetime
        if effective_now is None and effective_date is not None:
            effective_now = dt.datetime.combine(effective_date, dt.time.min, tzinfo=dt.timezone.utc)

        normalized_events = [normalize_calendar_event(e) for e in calendar_events]
        state = dict(previous_regime_state or {})

        with _fixed_legacy_date(effective_date, effective_now, state):
            result = super().process_all_macro_data(market_data, fred_data, normalized_events)

        dff_available = isinstance(fred_data.get("DFF"), (int, float))
        if dff_available:
            us02y_data = market_data.get("US02Y", {})
            result["fed_forward_path_analysis"] = self.calculate_fed_forward_path(
                float(us02y_data["value"]),
                float(fred_data["DFF"]),
                float(us02y_data["val_5d_ago"]) if us02y_data.get("val_5d_ago") is not None else None,
            )
        else:
            legacy_fed = result.get("fed_forward_path_analysis", {})
            legacy_fed["fed_policy_rate_source"] = "LEGACY_STATIC_5.33_FALLBACK"
            legacy_fed["methodology_warning"] = "DFF unavailable; compatibility replay fallback only."
            result["fed_forward_path_analysis"] = legacy_fed

        cycle_state = result.get("cycle_diagnosis", {})
        if cycle_state:
            labor_strong = cycle_state.get("is_labor_strong")
            cycle_state["us_domestic_cycle"] = "Labor regime: strong/resilient" if labor_strong else "Labor regime: cooling/weakening"
            cycle_state["global_macro_cycle"] = "Not directly assessed: deterministic feed has no validated PMI/GDP cycle input"
            cycle_state["methodology_warning"] = "Global cycle narrative is withheld without direct validated cycle data."
            result["cycle_diagnosis"] = cycle_state

        if effective_now is None:
            effective_now = dt.datetime.now(dt.timezone.utc)
        freeze = event_freeze_status(
            normalized_events,
            effective_now,
            NEWS_FREEZE_CONFIG.get("FREEZE_MINUTES_BEFORE", 15),
            NEWS_FREEZE_CONFIG.get("FREEZE_MINUTES_AFTER", 15),
            NEWS_FREEZE_CONFIG.get("HIGH_IMPACT_KEYWORDS", []),
        )

        gold_state = result.get("gold_fiscal_dominance", {})
        credit_state = result.get("credit_spread_analysis", {})
        vix_level = result.get("t0_fast_stress_analysis", {}).get("vix_level")
        oas = credit_state.get("hy_oas_spread_pct")
        distress = isinstance(oas, (int, float)) and oas >= 4.8
        if isinstance(vix_level, (int, float)):
            is_cash_dash = bool(vix_level >= 40.0 and distress)
            gold_state["is_cash_dash"] = is_cash_dash
            gold_state["gold_short_allowed"] = is_cash_dash
            result["gold_fiscal_dominance"] = gold_state

        brent = float(market_data.get("BRENT", {}).get("value", result.get("brent_level", 0.0)))
        ratio_delta = float(result.get("copper_gold_analysis", {}).get("delta_4w_pct", 0.0))
        hysteresis = resolve_hysteresis(
            brent,
            ratio_delta < -2.0,
            state,
            float(HYSTERESIS_CONFIG.get("BRENT_ENERGY_PENALTY_ENTER", 85.0)),
            float(HYSTERESIS_CONFIG.get("BRENT_ENERGY_PENALTY_EXIT", 81.0)),
        )
        energy_state = result.get("terms_of_trade_energy_analysis", {})
        energy_state["eurusd_energy_penalty"] = hysteresis["energy_penalty_active"]
        energy_state["hysteresis_active"] = hysteresis["hysteresis_active"]
        energy_state["hysteresis_note"] = hysteresis["hysteresis_note"]
        result["terms_of_trade_energy_analysis"] = energy_state

        cross_pairs = result.get("cross_pairs_analysis", {})
        cross_pairs["event_freeze"] = freeze
        result["cross_pairs_analysis"] = cross_pairs

        regime_state = dict(result.get("regime_state", {}))
        regime_state["energy_penalty_active"] = hysteresis["energy_penalty_active"]
        regime_state["event_freeze_active"] = freeze["active"]
        regime_state["active_event_info"] = freeze["info"]
        regime_state["state_source"] = "explicit_previous_regime_state"
        result["regime_state"] = regime_state

        dxy_hist = market_data.get("DXY", {}).get("history_close", [])
        brent_hist = market_data.get("BRENT", {}).get("history_close", [])
        result["dxy_oil_correlation"] = return_correlation(dxy_hist, brent_hist)
        result["dxy_oil_correlation_method"] = "pearson_on_period_returns"

        fallback_fields = ["DFF"] if not dff_available else []
        result["data_quality"] = {
            "fallback_used": bool(fallback_fields),
            "fallback_fields": fallback_fields,
            "market_provider": "validated upstream payload",
            "fred_provider": "validated upstream payload",
            "as_of_date": effective_date.isoformat() if effective_date else None,
            "as_of_datetime": effective_now.isoformat() if effective_now else None,
            "surprise_calibration": "empirical" if self.surprise_sigmas != self.DEFAULT_SURPRISE_SIGMAS else "uncalibrated_default",
            "execution_gate_source": "deterministic_controls_only",
            "event_freeze_clock": "explicit_now_utc",
        }

        return result
