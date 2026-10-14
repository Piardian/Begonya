"""Compatibility facade for the canonical persisted-data diagnostic engine.

Older callers may still import DiagnosticsEngine from this module. All calculations
are delegated to research.diagnostic_engine; no synthetic signal/PnL values are used.
"""
from pathlib import Path
from typing import Any

from research.diagnostic_engine import DiagnosticEngine


class DiagnosticsEngine:
    def __init__(
        self,
        log_path: str | None = None,
        journal_path: str | None = None,
        data_root: str | Path | None = None,
        project_root: str | Path | None = None,
    ) -> None:
        # log_path/journal_path remain accepted for backward compatibility, but
        # benchmark_records.json is the canonical source for realized trade outcomes.
        self.engine = DiagnosticEngine(data_root=data_root, project_root=project_root)

    def analyze_signals(self) -> dict[str, Any]:
        return self.engine.calculate_metrics()

    def generate_report(self, data: dict[str, Any], output_path: str | Path) -> bool:
        try:
            report = self.engine.generate_markdown_report(data)
            Path(output_path).write_text(report, encoding="utf-8")
            return True
        except (OSError, KeyError, TypeError, ValueError):
            return False
