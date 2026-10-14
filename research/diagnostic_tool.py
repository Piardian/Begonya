"""Legacy async entry point delegating to the canonical Begonya diagnostics.

The old implementation merged unrelated JSON files (including POI lists) and treated
missing PnL as zero. It is intentionally replaced with a single-source-of-truth runner.
"""
import asyncio
from typing import Any

from research.diagnostic_engine import DiagnosticEngine


async def run_diagnostic() -> dict[str, Any]:
    engine = DiagnosticEngine()
    return await asyncio.to_thread(engine.run_diagnostic)


async def generate_report(metrics: dict[str, Any]) -> None:
    engine = DiagnosticEngine()
    report = engine.generate_markdown_report(metrics)
    await asyncio.to_thread(engine.report_path.parent.mkdir, parents=True, exist_ok=True)
    await asyncio.to_thread(engine.report_path.write_text, report, encoding="utf-8")


if __name__ == "__main__":
    asyncio.run(run_diagnostic())
