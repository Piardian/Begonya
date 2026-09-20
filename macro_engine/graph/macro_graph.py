from __future__ import annotations

import asyncio
import datetime as dt
from typing import Any, Dict, List, Optional, Mapping

from core.deterministic_controls import resolve_execution_gate
from graph.macro_graph_legacy import MacroWorkflowEngine as _LegacyMacroWorkflowEngine
from graph.macro_graph_legacy import MacroGraphState, save_macro_gate_atomic
from config import BIAS_GATE_FILE
from preprocessing.economic_regimes import build_economic_regime_snapshot
from preprocessing.policy_expectations import build_policy_expectations
from ingestion.bank_of_england import BankOfEnglandDataIngestion


class MacroWorkflowEngine(_LegacyMacroWorkflowEngine):
    """Production macro workflow with explicit state/time and deterministic execution gates."""

    def _node_ingestion_and_preprocessing(self, state: MacroGraphState) -> Dict[str, Any]:
        as_of = getattr(self, "_as_of_date", None)
        as_of_datetime = getattr(self, "_as_of_datetime", None)
        raw_market = self.market_ingest.fetch_current_prices()
        raw_fred = self.fred_ingest.fetch_liquidity_metrics(as_of=as_of)
        raw_fred["UK_BANK_RATE"] = uk_bank_rate.get("value")
        raw_fred["UK_BANK_RATE_PREVIOUS"] = uk_bank_rate.get("previous_value")
        raw_fred["UK_BANK_RATE_SOURCE_DATE"] = uk_bank_rate.get("observation_date")
        raw_fred.setdefault("data_quality", {})["uk_bank_rate"] = uk_bank_rate
        try:
            uk_bank_rate = BankOfEnglandDataIngestion().fetch_bank_rate(as_of_datetime)
        except Exception as exc:
            uk_bank_rate = {
                "status": "UNAVAILABLE",
                "value": None,
                "observation_date": None,
                "source": "Bank of England official Bank Rate (YWMB47D)",
                "error": str(exc),
            }

        supplied_events = state.get("calendar_events") or []
        events_provided = bool(state.get("calendar_events_supplied", False)) or bool(supplied_events)
        events = list(supplied_events) if events_provided else asyncio.run(self.cal_ingest.fetch_latest_events())

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
        processed["economic_regime_snapshot"] = build_economic_regime_snapshot(
            raw_fred,
            as_of=as_of,
            market_data=raw_market,
        )
        processed["policy_expectations"] = build_policy_expectations(
            raw_fred,
            market_data=raw_market,
        )

        fred_dq = raw_fred.get("data_quality", {})
        processed["data_quality"]["fred_provider"] = fred_dq.get("provider", "FRED")
        processed["data_quality"]["ism_status"] = fred_dq.get("ism_status", "UNAVAILABLE")
        processed["data_quality"]["calendar_provider"] = "Caller" if events_provided else "ForexFactory"
        processed["data_quality"]["calendar_status"] = (
            "CALLER_SUPPLIED" if events_provided else getattr(self.cal_ingest, "get_last_status", lambda: "UNKNOWN")()
        )
        processed["data_quality"]["calendar_fail_closed"] = any(e.get("fail_closed") for e in events)

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
        cross_analysis = metrics.get("cross_pairs_analysis", {})
        freeze = bool(cross_analysis.get("event_freeze", {}).get("active", False))
        fast_stress = bool(
            metrics.get("t0_fast_stress_analysis", {})
            .get("fast_stress_override", False)
        )

        real_yield = metrics.get("real_yield_info", {}).get("real_yield_pct")
        yield_curve = metrics.get("yield_curve", {})
        delta_10y_5d = yield_curve.get("delta_10y_5d_bps")
        bear_steepening = yield_curve.get("regime") == "Bear Steepening"

        dxy = metrics.get("dxy_trend_analysis", {})
        dxy_delta_20d = dxy.get("delta_20d_pct")
        liquidity = metrics.get("liquidity_dynamics", {})
        liquidity_delta = liquidity.get("delta_liquidity_billion")
        nfci = metrics.get("financial_conditions_analysis", {}).get("nfci_value")
        credit = metrics.get("credit_spread_analysis", {})
        credit_stress = str(credit.get("stress_level", ""))

        evidence: Dict[str, Any] = {}

        # XAUUSD: LONG_ONLY requires two independent supportive channels.
        gold_short = bool(
            metrics.get("gold_fiscal_dominance", {})
            .get("gold_short_allowed", False)
        )
        xau_bullish = []
        xau_bearish = []
        if isinstance(real_yield, (int, float)):
            (xau_bullish if float(real_yield) < 1.90 else xau_bearish).append(
                f"real_yield={'supportive' if float(real_yield) < 1.90 else 'restrictive'}:{float(real_yield):.2f}%"
            )
        if isinstance(dxy_delta_20d, (int, float)):
            (xau_bullish if float(dxy_delta_20d) < -0.5 else xau_bearish if float(dxy_delta_20d) > 0.5 else []).append(
                f"DXY_20d={float(dxy_delta_20d):+.2f}%"
            ) if abs(float(dxy_delta_20d)) > 0.5 else None
        if isinstance(liquidity_delta, (int, float)):
            (xau_bullish if float(liquidity_delta) > 0 else xau_bearish).append(
                f"net_liquidity_4w={float(liquidity_delta):+.1f}B"
            )
        if isinstance(nfci, (int, float)) and float(nfci) < 0:
            xau_bullish.append(f"NFCI={float(nfci):+.2f}")
        if bear_steepening:
            xau_bearish.append("bear_steepening")
        if isinstance(delta_10y_5d, (int, float)) and float(delta_10y_5d) >= 10.0:
            xau_bearish.append(f"10Y_5d={float(delta_10y_5d):+.1f}bps")
        if gold_short:
            xau_base = "SHORT_ONLY"
        elif len(xau_bullish) >= 2 and not xau_bearish:
            xau_base = "LONG_ONLY"
        else:
            xau_base = "NEUTRAL_RANGE"
        evidence["XAUUSD"] = {
            "bullish_factors": xau_bullish,
            "bearish_factors": xau_bearish,
            "minimum_for_long_only": 2,
        }

        # BTC: "no stress" is not enough. Require at least two independent
        # macro supports for LONG_ONLY and reject when clear bearish evidence exists.
        btc_bullish = []
        btc_bearish = []
        if isinstance(real_yield, (int, float)):
            (btc_bullish if float(real_yield) < 1.90 else btc_bearish).append(
                f"real_yield:{float(real_yield):.2f}%"
            )
        if isinstance(dxy_delta_20d, (int, float)):
            if float(dxy_delta_20d) < -0.5:
                btc_bullish.append(f"DXY_20d:{float(dxy_delta_20d):+.2f}%")
            elif float(dxy_delta_20d) > 0.5:
                btc_bearish.append(f"DXY_20d:{float(dxy_delta_20d):+.2f}%")
        if isinstance(liquidity_delta, (int, float)):
            (btc_bullish if float(liquidity_delta) > 0 else btc_bearish).append(
                f"net_liquidity_4w:{float(liquidity_delta):+.1f}B"
            )
        if isinstance(nfci, (int, float)):
            (btc_bullish if float(nfci) < 0 else btc_bearish).append(
                f"NFCI:{float(nfci):+.2f}"
            )
        if bear_steepening:
            btc_bearish.append("bear_steepening")
        if isinstance(delta_10y_5d, (int, float)) and float(delta_10y_5d) >= 10.0:
            btc_bearish.append(f"10Y_5d:{float(delta_10y_5d):+.1f}bps")
        if isinstance(credit_stress, str) and "Distress" in credit_stress:
            btc_bearish.append("credit_distress")

        legacy_btc = metrics.get("btc_decoupling_analysis", {}).get(
            "recommended_btc_gate", "DEFENSIVE_HOLD"
        )
        if fast_stress:
            btc_base = "DEFENSIVE_HOLD"
        elif "SHORT_ONLY" in str(legacy_btc).upper() and bear_steepening:
            btc_base = "SHORT_ONLY"
        elif len(btc_bullish) >= 2 and not btc_bearish:
            btc_base = "LONG_ONLY"
        else:
            btc_base = "NEUTRAL_RANGE"
        evidence["BTC"] = {
            "bullish_factors": btc_bullish,
            "bearish_factors": btc_bearish,
            "legacy_recommendation": legacy_btc,
            "minimum_for_long_only": 2,
        }

        # EURUSD: use both USD-side and EUR-side policy evidence.
        transatlantic = metrics.get("transatlantic_analysis", {})
        spread_bps = transatlantic.get("spread_bps")
        energy_penalty = bool(
            metrics.get("terms_of_trade_energy_analysis", {})
            .get("eurusd_energy_penalty", False)
        )
        euro_panel = metrics.get("economic_regime_snapshot", {}).get("euro_area_macro", {})
        us_minus_ecb = euro_panel.get("us_minus_ecb_policy_spread_bps")
        hicp_direction = euro_panel.get("hicp_direction")

        eur_bullish = []
        eur_bearish = []
        if isinstance(us_minus_ecb, (int, float)):
            if float(us_minus_ecb) < 100.0:
                eur_bullish.append(f"US-ECB policy spread:{float(us_minus_ecb):+.1f}bps")
            elif float(us_minus_ecb) > 150.0:
                eur_bearish.append(f"US-ECB policy spread:{float(us_minus_ecb):+.1f}bps")
        if isinstance(spread_bps, (int, float)):
            if float(spread_bps) < 150.0:
                eur_bullish.append(f"US-DE 10Y spread:{float(spread_bps):+.1f}bps")
            elif float(spread_bps) > 180.0:
                eur_bearish.append(f"US-DE 10Y spread:{float(spread_bps):+.1f}bps")
        if hicp_direction == "RISING":
            eur_bullish.append("EA HICP:RISING")
        elif hicp_direction == "FALLING":
            eur_bearish.append("EA HICP:FALLING")
        if energy_penalty:
            eur_bearish.append("EA energy penalty")

        dxy_confirm_bear = isinstance(dxy_delta_20d, (int, float)) and float(dxy_delta_20d) > 0.5
        dxy_confirm_bull = isinstance(dxy_delta_20d, (int, float)) and float(dxy_delta_20d) < -0.5

        if dxy_confirm_bear and (
            (isinstance(us_minus_ecb, (int, float)) and float(us_minus_ecb) > 150.0)
            or (isinstance(spread_bps, (int, float)) and float(spread_bps) > 180.0)
            or energy_penalty
        ):
            eur_base = "SHORT_ONLY"
        elif dxy_confirm_bull and (
            isinstance(us_minus_ecb, (int, float))
            and float(us_minus_ecb) < 100.0
            and isinstance(spread_bps, (int, float))
            and float(spread_bps) < 150.0
        ):
            eur_base = "LONG_ONLY"
        else:
            eur_base = "NEUTRAL_RANGE"

        evidence["EURUSD"] = {
            "gate_basis": "US-ECB policy spread + US-DE 10Y spread + DXY confirmation + EA inflation/energy context",
            "us_minus_ecb_policy_spread_bps": us_minus_ecb,
            "transatlantic_spread_bps": spread_bps,
            "dxy_delta_20d_pct": dxy_delta_20d,
            "hicp_direction": hicp_direction,
            "energy_penalty": energy_penalty,
            "bullish_factors": eur_bullish,
            "bearish_factors": eur_bearish,
        }

        # GBPUSD: legacy relative-value direction must agree with official
        # UK Bank Rate versus US policy rate. If the local policy input is absent
        # or contradicts the legacy direction, suppress the directional gate.
        cross_gates_raw = cross_analysis.get("cross_gates", {}) or {}
        gbpusd_legacy = str(cross_gates_raw.get("GBPUSD", "NEUTRAL_RANGE"))
        uk_panel = metrics.get("economic_regime_snapshot", {}).get("uk_policy", {})
        us_minus_uk = uk_panel.get("us_minus_uk_policy_spread_bps")
        gbpusd_confirmed = False
        if isinstance(us_minus_uk, (int, float)):
            if gbpusd_legacy == "SHORT_ONLY":
                gbpusd_confirmed = float(us_minus_uk) > 25.0
            elif gbpusd_legacy == "LONG_ONLY":
                gbpusd_confirmed = float(us_minus_uk) < -25.0
        if gbpusd_legacy in ("SHORT_ONLY", "LONG_ONLY") and not gbpusd_confirmed:
            cross_gates_raw = dict(cross_gates_raw)
            cross_gates_raw["GBPUSD"] = "NEUTRAL_RANGE"
            cross_analysis["cross_gates"] = cross_gates_raw

        spx_allowed = bool(
            metrics.get("equity_short_regime", {})
            .get("equity_short_allowed", False)
        )
        spx_base = "SHORT_ONLY" if spx_allowed else "NEUTRAL_RANGE"
        evidence["SPX"] = {
            "gate_basis": "equity_short_regime; otherwise neutral",
            "equity_short_allowed": spx_allowed,
        }

        cross = cross_analysis.get("cross_gates", {})
        base_gates = {
            "XAUUSD": xau_base,
            "BTC": btc_base,
            "EURUSD": eur_base,
            "SPX": spx_base,
        }
        base_gates.update(
            {
                str(k): str(v)
                for k, v in cross.items()
                if isinstance(v, str) and str(k) not in base_gates
            }
        )

        # If BTC is not long-permitted, a legacy SOL long gate must not bypass it.
        if base_gates.get("BTC") != "LONG_ONLY" and base_gates.get("SOL") == "LONG_ONLY":
            base_gates["SOL"] = "NEUTRAL_RANGE"
            evidence["SOL"] = {
                "gate_basis": "BTC parent gate is not LONG_ONLY; SOL cannot bypass parent crypto regime."
            }

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
            "base_gates": base_gates,
            "evidence": evidence,
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
            "deterministic_base_gates": deterministic.get("base_gates", {}),
            "deterministic_gate_evidence": deterministic.get("evidence", {}),
            "deterministic_gate_reasons": deterministic.get("gate_reasons", {}),
            "deterministic_gate_source": deterministic["source"],
            "gate_precedence": deterministic["precedence"],
            "llm_execution_gates_ignored": True,
            "asset_biases": final_dict.get("asset_biases", {}),
            "regime_state": regime_state,
            "macro_rationale": final_dict.get("macro_rationale", ""),
            "horizon_today": final_dict.get("horizon_today", ""),
            "horizon_this_week": final_dict.get("horizon_this_week", ""),
            "horizon_this_month": final_dict.get("horizon_this_month", ""),
            "economic_regime_snapshot": metrics.get("economic_regime_snapshot", {}),
            "policy_expectations": metrics.get("policy_expectations", {}),
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
        """Run with caller-supplied events/state; no hidden persistent regime state is consulted."""
        self._as_of_datetime = as_of
        self._as_of_date = as_of.date() if as_of is not None else None
        initial_state = {
            "raw_market": {},
            "raw_fred": {},
            "calendar_events": list(initial_events or []),
            "calendar_events_supplied": initial_events is not None,
            "previous_regime_state": dict(previous_regime_state or {}),
            "processed_metrics": {},
            "liquidity_output": None,
            "growth_output": None,
            "final_output": None,
        }
        result = self.app.invoke(initial_state)
        result["deterministic_execution_gates"] = self._build_deterministic_gates(
            result.get("processed_metrics", {})
        )
        return result
