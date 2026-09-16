import datetime as dt
import json
import tempfile
import unittest
from pathlib import Path

from gateways.execution_bias_bridge import ExecutionBiasBridge


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


if __name__ == "__main__":
    unittest.main(verbosity=2)
