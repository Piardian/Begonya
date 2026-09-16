import datetime as dt
import json
import tempfile
import unittest
from pathlib import Path

from gateways.execution_bias_bridge import ExecutionBiasBridge
from graph.macro_graph import MacroWorkflowEngine


class ExecutionGateTests(unittest.TestCase):
    def _write_gate(self, payload):
        tmp = tempfile.TemporaryDirectory()
        path = Path(tmp.name) / "gate.json"
        path.write_text(json.dumps(payload), encoding="utf-8")
        return tmp, path

    def test_untrusted_gate_source_fails_closed(self):
        tmp, path = self._write_gate({
            "timestamp": dt.datetime.now(dt.timezone.utc).isoformat(),
            "execution_bias_gates": {"XAUUSD": "LONG_ONLY"},
        })
        try:
            bridge = ExecutionBiasBridge(path)
            allowed, _ = bridge.is_trade_allowed("XAUUSD", "BUY")
            self.assertFalse(allowed)
        finally:
            tmp.cleanup()

    def test_stale_gate_fails_closed(self):
        old = dt.datetime.now(dt.timezone.utc) - dt.timedelta(minutes=61)
        tmp, path = self._write_gate({
            "timestamp": old.isoformat(),
            "deterministic_gate_source": "deterministic_metrics_only",
            "deterministic_execution_bias_gates": {"XAUUSD": "LONG_ONLY"},
        })
        try:
            bridge = ExecutionBiasBridge(path)
            allowed, _ = bridge.is_trade_allowed("XAUUSD", "BUY")
            self.assertFalse(allowed)
        finally:
            tmp.cleanup()

    def test_valid_deterministic_gate_controls_direction(self):
        tmp, path = self._write_gate({
            "timestamp": dt.datetime.now(dt.timezone.utc).isoformat(),
            "deterministic_gate_source": "deterministic_metrics_only",
            "deterministic_execution_bias_gates": {"XAUUSD": "LONG_ONLY"},
        })
        try:
            bridge = ExecutionBiasBridge(path)
            self.assertTrue(bridge.is_trade_allowed("XAUUSD", "BUY")[0])
            self.assertFalse(bridge.is_trade_allowed("XAUUSD", "SELL")[0])
        finally:
            tmp.cleanup()

    def test_unknown_symbol_fails_closed(self):
        tmp, path = self._write_gate({
            "timestamp": dt.datetime.now(dt.timezone.utc).isoformat(),
            "deterministic_gate_source": "deterministic_metrics_only",
            "deterministic_execution_bias_gates": {"XAUUSD": "LONG_ONLY"},
        })
        try:
            bridge = ExecutionBiasBridge(path)
            self.assertFalse(bridge.is_trade_allowed("UNKNOWN", "BUY")[0])
        finally:
            tmp.cleanup()

    def test_workflow_gate_boundary_ignores_llm_gate_values(self):
        metrics = {
            "cross_pairs_analysis": {
                "event_freeze": {"active": False},
                "cross_gates": {"XAUUSD": "LONG_ONLY"},
            },
            "t0_fast_stress_analysis": {"fast_stress_override": False},
            "gold_fiscal_dominance": {"gold_short_allowed": False},
            "btc_decoupling_analysis": {"recommended_btc_gate": "LONG_ONLY_ALLOWED_IF_DEBASEMENT"},
        }
        gates = MacroWorkflowEngine._build_deterministic_gates(metrics)
        self.assertEqual(gates["execution_bias_gates"]["XAUUSD"], "LONG_ONLY")
        self.assertEqual(gates["source"], "deterministic_metrics_only")
        self.assertTrue(gates["llm_execution_gates_ignored"])

    def test_workflow_event_freeze_overrides_base_gate(self):
        metrics = {
            "cross_pairs_analysis": {
                "event_freeze": {"active": True},
                "cross_gates": {"XAUUSD": "LONG_ONLY", "EURUSD": "SHORT_ONLY"},
            },
            "t0_fast_stress_analysis": {"fast_stress_override": False},
            "gold_fiscal_dominance": {"gold_short_allowed": False},
            "btc_decoupling_analysis": {"recommended_btc_gate": "LONG_ONLY_ALLOWED_IF_DEBASEMENT"},
        }
        gates = MacroWorkflowEngine._build_deterministic_gates(metrics)
        self.assertEqual(gates["execution_bias_gates"]["XAUUSD"], "NO_TRADE")
        self.assertEqual(gates["execution_bias_gates"]["EURUSD"], "NO_TRADE")
