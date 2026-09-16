from __future__ import annotations

import datetime as dt
from contextlib import contextmanager
from typing import Any, Dict, List, Optional

from data_quality import validate_fred_payload, validate_market_payload
from preprocessing.metrics_legacy import MacroMetricsCalculator as _LegacyMacroMetricsCalculator


@contextmanager
def _fixed_legacy_date(as_of_date: Optional[dt.date]):
    if as_of_date is None:
        yield
        return
    legacy_module = __import__("preprocessing.metrics_legacy", fromlist=["datetime"])
    original_date = legacy_module.datetime.date

    class _FixedDate(original_date):
        @classmethod
        def today(cls):
            return as_of_date

    legacy_module.datetime.date = _FixedDate
    try:
        yield
    finally:
        legacy_module.datetime.date = original_date


class MacroMetricsCalculator(_LegacyMacroMetricsCalculator):
    """Legacy metric engine with fail-closed input validation and deterministic time injection."""

    def __init__(self, as_of_date: Optional[dt.date] = None):
        super().__init__()
        self.as_of_date = as_of_date

    @staticmethod
    def calculate_real_yield(
        us10y: float,
        dfii10_tips: Optional[float] = None,
        breakeven_10y: Optional[float] = None,
    ) -> Dict[str, Any]:
        # Negative TIPS yields are valid observations and must be used directly.
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
    ) -> Dict[str, Any]:
        validate_market_payload(market_data)
        validate_fred_payload(fred_data)
        effective_date = as_of_date or self.as_of_date
        with _fixed_legacy_date(effective_date):
            result = super().process_all_macro_data(market_data, fred_data, calendar_events)

        # Correct the legacy emergency-gold predicate. Legacy expects the bare string
        # "Distress", while the credit classifier emits a Turkish label containing it.
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
        }
        return result
