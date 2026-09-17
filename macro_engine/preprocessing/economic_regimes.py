from __future__ import annotations

import datetime as dt
from typing import Any, Dict, Mapping, Optional

from data_quality import DataUnavailableError, REQUIRED_ECONOMIC_FRED_FIELDS


MAX_AGE_DAYS = {
    "daily": 3,
    "monthly": 45,
    "quarterly": 120,
}

FREQUENCIES = {
    "CPI_YOY": "monthly",
    "CORE_CPI_YOY": "monthly",
    "PCE_YOY": "monthly",
    "CORE_PCE_YOY": "monthly",
    "PAYEMS": "monthly",
    "UNRATE": "monthly",
    "AHE_YOY": "monthly",
    "GDP_QOQ_SAAR": "quarterly",
    "INDPRO": "monthly",
    "RSAFS": "monthly",
    "DGS3MO": "daily",
    "DGS2": "daily",
    "DGS5": "daily",
    "DGS10": "daily",
    "DGS30": "daily",
    "T10Y2Y": "daily",
    "T10Y3M": "daily",
}


def _num(data: Mapping[str, Any], key: str) -> Optional[float]:
    value = data.get(key)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value)


def _delta(data: Mapping[str, Any], key: str) -> Optional[float]:
    current = _num(data, key)
    prior = _num(data, f"{key}_4W_AGO")
    if current is None or prior is None:
        return None
    return current - prior


def _pct_change(data: Mapping[str, Any], key: str) -> Optional[float]:
    current = _num(data, key)
    prior = _num(data, f"{key}_4W_AGO")
    if current is None or prior is None or prior == 0:
        return None
    return (current / prior - 1.0) * 100.0


def _direction(delta: Optional[float], threshold: float) -> str:
    if delta is None:
        return "UNAVAILABLE"
    if delta > threshold:
        return "RISING"
    if delta < -threshold:
        return "FALLING"
    return "STABLE"


def _freshness(
    fred: Mapping[str, Any], as_of: Optional[dt.date]
) -> Dict[str, int]:
    if as_of is None:
        return {}
    metadata = fred.get("data_quality", {})
    dates = metadata.get("economic_observation_dates", {}) if isinstance(metadata, Mapping) else {}
    ages: Dict[str, int] = {}
    for field, raw_date in dates.items():
        observation_date = dt.date.fromisoformat(str(raw_date))
        age = (as_of - observation_date).days
        allowed = MAX_AGE_DAYS[FREQUENCIES.get(field, "monthly")]
        if age < 0:
            raise DataUnavailableError(f"Future economic observation for {field}: {observation_date}")
        if age > allowed:
            raise DataUnavailableError(
                f"Stale economic observation for {field}: age={age}d > allowed={allowed}d"
            )
        ages[field] = age
    return ages


def _missing_fields(fred: Mapping[str, Any]) -> list[str]:
    required = set(REQUIRED_ECONOMIC_FRED_FIELDS)
    missing = [key for key in sorted(required) if not isinstance(fred.get(key), (int, float))]
    return missing


def build_economic_regime_snapshot(
    fred: Mapping[str, Any],
    as_of: Optional[dt.date] = None,
) -> Dict[str, Any]:
    """Create a deterministic economic panel without inventing a composite score."""
    missing = _missing_fields(fred)
    if missing:
        return {
            "status": "UNAVAILABLE",
            "missing_fields": missing,
            "methodology_warning": "Economic regime panel withheld; required provider observations are missing.",
        }

    ages = _freshness(fred, as_of)

    inflation_delta = {
        "cpi_yoy_pp_4w": _delta(fred, "CPI_YOY"),
        "core_cpi_yoy_pp_4w": _delta(fred, "CORE_CPI_YOY"),
        "pce_yoy_pp_4w": _delta(fred, "PCE_YOY"),
        "core_pce_yoy_pp_4w": _delta(fred, "CORE_PCE_YOY"),
    }
    inflation_directions = [
        _direction(fred.get("CPI_YOY_4W_AGO") and _delta(fred, "CPI_YOY"), 0.10),
        _direction(_delta(fred, "CORE_CPI_YOY"), 0.10),
        _direction(_delta(fred, "PCE_YOY"), 0.10),
        _direction(_delta(fred, "CORE_PCE_YOY"), 0.10),
    ]
    non_unknown_infl = [x for x in inflation_directions if x != "UNAVAILABLE"]
    inflation_signal = "MIXED"
    if non_unknown_infl and all(x == "RISING" for x in non_unknown_infl):
        inflation_signal = "RISING"
    elif non_unknown_infl and all(x == "FALLING" for x in non_unknown_infl):
        inflation_signal = "FALLING"
    elif non_unknown_infl and all(x == "STABLE" for x in non_unknown_infl):
        inflation_signal = "STABLE"

    payroll_change = _delta(fred, "PAYEMS")
    unemployment_change = _delta(fred, "UNRATE")
    wage_change_pp = _delta(fred, "AHE_YOY")
    claims_change = _delta(fred, "ICSA")
    if payroll_change is not None and unemployment_change is not None and claims_change is not None:
        if payroll_change < -100.0 or unemployment_change >= 0.20 or claims_change >= 15.0:
            labor_regime = "WEAKENING"
        elif payroll_change > 0.0 and unemployment_change <= 0.10 and claims_change < 10.0:
            labor_regime = "RESILIENT"
        else:
            labor_regime = "COOLING"
    else:
        labor_regime = "UNAVAILABLE"

    industrial_change = _pct_change(fred, "INDPRO")
    retail_change = _pct_change(fred, "RSAFS")
    gdp_growth = _num(fred, "GDP_QOQ_SAAR")
    if gdp_growth is not None and industrial_change is not None and retail_change is not None:
        if gdp_growth < 0.0 and industrial_change < 0.0 and retail_change < 0.0:
            growth_regime = "CONTRACTING"
        elif gdp_growth > 0.0 and industrial_change > 0.0 and retail_change > 0.0:
            growth_regime = "EXPANDING"
        else:
            growth_regime = "MIXED"
    else:
        growth_regime = "UNAVAILABLE"

    two_year = _num(fred, "DGS2")
    three_month = _num(fred, "DGS3MO")
    five_year = _num(fred, "DGS5")
    ten_year = _num(fred, "DGS10")
    thirty_year = _num(fred, "DGS30")
    two_ten_spread = _num(fred, "T10Y2Y")
    three_ten_spread = _num(fred, "T10Y3M")
    two_ten_delta = _delta(fred, "T10Y2Y")
    three_ten_delta = _delta(fred, "T10Y3M")
    curve_move = "STABLE"
    if two_ten_delta is not None:
        if two_ten_delta > 0.10:
            curve_move = "STEEPENING"
        elif two_ten_delta < -0.10:
            curve_move = "FLATTENING"

    dff = _num(fred, "DFF")
    policy_gap_bps = (two_year - dff) * 100.0 if two_year is not None and dff is not None else None

    return {
        "status": "COMPLETE",
        "methodology_version": "economic-panel-v1",
        "point_in_time_vintage_end": fred.get("data_quality", {}).get("vintage_end"),
        "freshness_days": ages,
        "inflation_regime": {
            "signal": inflation_signal,
            "cpi_yoy_pct": _num(fred, "CPI_YOY"),
            "core_cpi_yoy_pct": _num(fred, "CORE_CPI_YOY"),
            "pce_yoy_pct": _num(fred, "PCE_YOY"),
            "core_pce_yoy_pct": _num(fred, "CORE_PCE_YOY"),
            "deltas_pp_4w": inflation_delta,
            "directions": inflation_directions,
            "cross_measure_confirmation": len(set(non_unknown_infl)) == 1 if non_unknown_infl else False,
        },
        "labor_regime": {
            "signal": labor_regime,
            "payems_change_thousand_4w": payroll_change,
            "unemployment_change_pp_4w": unemployment_change,
            "wage_growth_yoy_pct": _num(fred, "AHE_YOY"),
            "wage_growth_change_pp_4w": wage_change_pp,
            "initial_claims_k": _num(fred, "ICSA"),
            "initial_claims_change_k_4w": claims_change,
        },
        "growth_regime": {
            "signal": growth_regime,
            "real_gdp_qoq_saar_pct": gdp_growth,
            "industrial_production_change_pct_4w": industrial_change,
            "retail_sales_change_pct_4w": retail_change,
        },
        "rate_curve_regime": {
            "dgs3mo_pct": three_month,
            "dgs2_pct": two_year,
            "dgs5_pct": five_year,
            "dgs10_pct": ten_year,
            "dgs30_pct": thirty_year,
            "two_ten_spread_bps": None if two_ten_spread is None else two_ten_spread * 100.0,
            "three_ten_spread_bps": None if three_ten_spread is None else three_ten_spread * 100.0,
            "two_ten_change_bps_4w": None if two_ten_delta is None else two_ten_delta * 100.0,
            "three_ten_change_bps_4w": None if three_ten_delta is None else three_ten_delta * 100.0,
            "curve_move": curve_move,
            "two_ten_inverted": bool(two_ten_spread is not None and two_ten_spread < 0.0),
            "three_ten_inverted": bool(three_ten_spread is not None and three_ten_spread < 0.0),
            "two_year_minus_dff_bps": policy_gap_bps,
        },
        "policy_regime": {
            "dff_pct": dff,
            "two_year_minus_dff_bps": policy_gap_bps,
            "market_vs_policy": (
                "NEAR_POLICY" if policy_gap_bps is None or abs(policy_gap_bps) < 25.0
                else "MARKET_PRICES_LOWER_POLICY_PATH" if policy_gap_bps < 0.0
                else "MARKET_PRICES_HIGHER_POLICY_PATH"
            ),
        },
        "interpretation_guardrails": {
            "no_composite_score": True,
            "no_causal_claim": True,
            "no_market_trade_signal": True,
            "note": "Dimensions are reported separately; aggregation into an execution decision remains downstream and deterministic.",
        },
    }
