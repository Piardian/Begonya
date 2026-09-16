from __future__ import annotations

import asyncio
import datetime as dt
from typing import Any, Dict, List, Optional, Mapping

from core.deterministic_controls import resolve_execution_gate
from graph.macro_graph_legacy import MacroWorkflowEngine as _LegacyMacroWorkflowEngine
from graph.macro_graph_legacy import MacroGraphState, save_macro_gate_atomic
from config import BIAS_GATE_FILE, NEWS_FREEZE_CONFIG


class MacroWorkflowEngine(_LegacyMacroWorkflowEngine):
    """Production macro workflow with explicit state/time and deterministic execution gates."""

    def _node_ingestion_and_preprocessing(self, state: MacroGraphState) -> Dict[str, Any]:
        as_of = getattr(self, "_as_of_date", None)
        as_of_datetime = getattr(self, "_as_of_datetime", None)
        raw_market = self.market_ingest.fetch_current_prices()
        raw_fred = self.fred_ingest.fetch_liquidity_metrics(as_of=as_of)
        supplied_events = state.get("calendar_events")
        events = list(supplied_events) if supplied_events else asyncio.run(self.cal_ingest.fetch_latest_events())

        previous_state = state.get("previous_regime_state") or {}
        processed = self.preprocessor.process_all_macro_data(
            raw_market,
            raw_fred,
            events,
            as_of_date=as_of,
            as_of_datetime=as_of_datetime,
            previous_regime_state=previous_state,
            now_utc=as_of_datetime,
        )
        return {
            "raw_market": raw_market,
            "raw_fred": raw_fred,
            "calendar_events": events,
            "processed_metrics": processed,
        }

    def _node_macro_strategist(self, state: MacroGraphState) -> Dict[str, Any]:
        result = super()._node_macro_strategist(state)
        final = result.get("final_output") or {}
        as_of = getattr(self, "_as_of_datetime", None)
        if as_of is not None:
            final["timestamp"] = as_of.isoformat()
            result["final_output"] = final
        return result

    @staticmethod
    def _build_deterministic_gates(metrics: Mapping[str, Any]) -> Dict[str, Any]:
        freeze = bool(metrics.get("cross_pairs_analysis", {}).get("event_freeze", {}).get("active", False))
        fast_stress = bool(metrics.get("t0_fast_stress_analysis", {}).get("fast_stress_override", False))
        gold_short = bool(metrics.get("gold_fiscal_dominance", {}).get("gold_short_allowed", False))
        btc_base = metrics.get("btc_decoupling_analysis", {}).get("recommended_btc_gate", "DEFENSIVE_HOLD")
        btc_map = {
            "LONG_ONLY_ALLOWED_IF_DEBASEMENT": "LONG_ONLY",
            "SHORT_ONLY": "SHORT_ONLY",
            "DEFENSIVE_HOLD": "DEFENSIVE_HOLD",
            "LONG_ONLY": "LONG_ONLY",
            "NEUTRAL_RANGE": "NEUTRAL_RANGE",
        }
        base_gates = {
            "XAUUSD": "SHORT_ONLY" if gold_short else "NEUTRAL_RANGE",
            "BTC": btc_map.get(btc_base, "DEFENSIVE_HOLD"),
            "EURUSD": "NEUTRAL_RANGE" if metrics.get("terms_of_trade_energy_analysis", {}).get("eurusd_energy_penalty") else "NEUTRAL_RANGE",
            "SPX": "DEFENSIVE_HOLD" if fast_stress else "NEUTRAL_RANGE",
        }
        cross = metrics.get("cross_pairs_analysis", {}).get("cross_gates", {})
        base_gates.update({str(k): str(v) for k, v in cross.items() if isinstance(v, str)})
        resolved: Dict[str, str] = {}
        reasons: Dict[str, str] = {}
        for symbol, base_bias in base_gates.items():
            decision = resolve_execution_gate(
                base_bias,
                event_freeze=freeze,
                systemic_stress=fast_stress,
                risk_score=0.0,
            )
            resolved[symbol] = decision["gate"]
            reasons[symbol] = decision["reason"]
        return {
            "execution_bias_gates": resolved,
            "gate_reasons": reasons,
            "source": "deterministic_metrics_only",
            "precedence": ["EVENT_FREEZE", "SYSTEMIC_STRESS", "BASE_BIAS"],
            "llm_execution_gates_ignored": True,
        }

    def _node_gate_export(self, state: MacroGraphState) -> Dict[str, Any]:
        """Export execution gates derived only from deterministic metrics; LLM gates are advisory and ignored."""
        final_dict = state.get("final_output") or {}
        metrics = state.get("processed_metrics", {})
        deterministic = self._build_deterministic_gates(metrics)
        regime_state = metrics.get("regime_state", {})
        payload = {
            "timestamp": final_dict.get("timestamp") or metrics.get("data_quality", {}).get("as_of_datetime"),
            "primary_regime": final_dict.get("primary_regime"),
            "volatility_risk_score": final_dict.get("volatility_risk_score"),
            "capital_preservation_mode": final_dict.get("capital_preservation_mode", False),
            "btc_decoupling_active": metrics.get("btc_decoupling_analysis", {}).get("btc_decoupling_active", False),
            "hysteresis_active": bool(regime_state.get("energy_penalty_active")),
            "recommended_risk_multiplier": final_dict.get("recommended_risk_multiplier", 1.0),
            "execution_bias_gates": deterministic["execution_bias_gates"],
            "deterministic_execution_bias_gates": deterministic["execution_bias_gates"],
            "deterministic_gate_source": deterministic["source"],
            "gate_precedence": deterministic["precedence"],
            "llm_execution_gates_ignored": True,
            "asset_biases": final_dict.get("asset_biases", {}),
            "regime_state": regime_state,
            "macro_rationale": final_dict.get("macro_rationale", ""),
            "horizon_today": final_dict.get("horizon_today", ""),
            "horizon_this_week": final_dict.get("horizon_this_week", ""),
            "horizon_this_month": final_dict.get("horizon_this_month", ""),
            "data_quality": metrics.get("data_quality", {}),
        }
        save_macro_gate_atomic(payload, BIAS_GATE_FILE)
        return {}

    def run_pipeline(
        self,
        initial_events: Optional[List[Dict[str, Any]]] = None,
        as_of: Optional[dt.datetime] = None,
        previous_regime_state: Optional[Mapping[str, Any]] = None,
    ) -> Dict[str, Any]:
        self._as_of_datetime = as_of
        self._as_of_date = as_of.date() if as_of is not None else None
        # The initial event list and previous state are input data, not persistent hidden state.
        self._previous_regime_state = dict(previous_regime_state or {})
        result = super().run_pipeline(initial_events=initial_events)
        result["deterministic_execution_gates"] = self._build_deterministic_gates(
            result.get("processed_metrics", {})
        )
        return result

    def _build_graph(self):
        # Recreate the legacy graph so the overridden node implementations are bound.
        return super()._build_graph()
