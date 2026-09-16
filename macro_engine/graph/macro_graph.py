from __future__ import annotations

import asyncio
import datetime as dt
from typing import Any, Dict, List, Optional

from data_quality import DataUnavailableError
from graph.macro_graph_legacy import MacroWorkflowEngine as _LegacyMacroWorkflowEngine
from config import BIAS_GATE_FILE
from graph.macro_graph_legacy import MacroGraphState


class MacroWorkflowEngine(_LegacyMacroWorkflowEngine):
    """Production wrapper that fails closed on unavailable inputs and supports deterministic replay time."""

    def _node_ingestion_and_preprocessing(self, state: MacroGraphState) -> Dict[str, Any]:
        as_of = getattr(self, "_as_of_date", None)
        raw_market = self.market_ingest.fetch_current_prices()
        raw_fred = self.fred_ingest.fetch_liquidity_metrics(as_of=as_of)
        events = list(state.get("calendar_events") or [])
        if not events:
            events = asyncio.run(self.cal_ingest.fetch_latest_events())

        processed = self.preprocessor.process_all_macro_data(
            raw_market,
            raw_fred,
            events,
            as_of_date=as_of,
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
        as_of = getattr(self, "_as_of_date", None)
        if as_of is not None:
            final["timestamp"] = as_of.isoformat()
            result["final_output"] = final
        return result

    def run_pipeline(
        self,
        initial_events: Optional[List[Dict[str, Any]]] = None,
        as_of: Optional[dt.datetime] = None,
    ) -> Dict[str, Any]:
        self._as_of_date = as_of.date() if as_of is not None else None
        return super().run_pipeline(initial_events=initial_events)
