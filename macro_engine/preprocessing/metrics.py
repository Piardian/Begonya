from __future__ import annotations

import datetime as dt
from contextlib import contextmanager
from typing import Any, Dict, List, Optional

from config import BIAS_GATE_FILE
from data_quality import validate_fred_payload, validate_market_payload
from preprocessing.metrics_legacy import MacroMetricsCalculator as _LegacyMacroMetricsCalculator
import preprocessing.metrics_legacy as _legacy_metrics_module


@contextmanager
def _fixed_legacy_date(as_of_date: Optional[dt.date], as_of_datetime: Optional[dt.datetime] = None):
    if as_of_date is None and as_of_datetime is None:
        yield
        return

    legacy_module = __import__("preprocessing.metrics_legacy", fromlist=["datetime"])
    original_date = legacy_module.datetime.date
    original_datetime = legacy_module.datetime.datetime

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

    legacy_module.datetime.date = _FixedDate
    legacy_module.datetime.datetime = _FixedDateTime
    try:
        yield
    finally:
        legacy_module.datetime.date = original_date
        legacy_module.datetime.datetime = original_datetime


class MacroMetricsCalculator(_LegacyMacroMetricsCalculator):
    """Legacy metric engine with validated inputs and deterministic replay clock."""

    def __init__(self, as_of_date: Optional[dt.date] = None):
        super().__init__()
        self.as_of_date = as_of_date

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

    def process_all_macro_data(
        self,
        market_data: Dict[str, Any],
        fred_data: Dict[str, Any],
        calendar_events: List[Dict[str, Any]],
        as_of_date: Optional[dt.date] = None,
        as_of_datetime: Optional[dt.datetime] = None,
    ) -> Dict[str, Any]:
        validate_market_payload(market_data)
        validate_fred_payload(fred_data)
        effective_date = as_of_date or self.as_of_date

        # Preserve the public module-level test seam while keeping the legacy
        # implementation as the single stateful owner of the gate path.
        _legacy_metrics_module.BIAS_GATE_FILE = BIAS_GATE_FILE

        with _fixed_legacy_date(effective_date, as_of_datetime):
            result = super().process_all_macro_data(market_data, fred_data, calendar_events)

        gold_state = result.get("gold_fiscal_dominance", {})
        credit_state = result.get("credit_spread_analysis", {})
        vix_level = result.get("t0_fast_stress_analysis", {}).get("vix_level")
        oas = credit_state.get("hy_oas_spread_pct")
        distress = (
            isinstance(oas, (int, float)) and oas >= 4.8
        ) or "Distress" in str(credit_state.get("stress_level", ""))
        if isinstance(vix_level, (int, float)):
            is_cash_dash = bool(vix_level >= 40.0 and distress)
            gold_state["is_cash_dash"] = is_cash_dash
            gold_state["gold_short_allowed"] = is_cash_dash
            if is_cash_dash:
                gold_state["status_message"] = (
                    "⚠️ SİSTEMİK NAKİT YARIŞI: Dolar likidite donması nedeniyle geçici Altın Short izni aktif."
                )
            result["gold_fiscal_dominance"] = gold_state

        result["data_quality"] = {
            "fallback_used": False,
            "market_provider": "validated upstream payload",
            "fred_provider": "validated upstream payload",
            "as_of_date": effective_date.isoformat() if effective_date else None,
            "as_of_datetime": as_of_datetime.isoformat() if as_of_datetime else None,
        }
        return result
