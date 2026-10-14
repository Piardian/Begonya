"""Read-only Begonya diagnostics based on persisted benchmark/POI records.

This module reports measured values only. It does not modify strategy logic or place orders.
"""
from __future__ import annotations

import json
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


def _parse_datetime(value: Any) -> datetime | None:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        # POI watchlist timestamps are Unix epoch milliseconds.
        try:
            return datetime.fromtimestamp(float(value) / 1000.0, tz=timezone.utc)
        except (OverflowError, OSError, ValueError):
            return None
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


class DiagnosticEngine:
    """Calculate transparent diagnostics from persisted project data."""

    def __init__(
        self,
        data_root: str | Path | None = None,
        benchmark_path: str | Path | None = None,
        report_path: str | Path | None = None,
        project_root: str | Path | None = None,
    ) -> None:
        self.project_root = Path(project_root).resolve() if project_root else Path(__file__).resolve().parents[1]
        self.data_root = Path(data_root).resolve() if data_root else self.project_root / "data"
        self.benchmark_path = (
            Path(benchmark_path).resolve()
            if benchmark_path
            else self.project_root / "benchmark" / "benchmark_records.json"
        )
        self.report_path = (
            Path(report_path).resolve()
            if report_path
            else self.project_root / "diagnostics" / "begonya_signal_diagnostic.md"
        )

    def load_benchmark_records(self) -> list[dict[str, Any]]:
        if not self.benchmark_path.exists():
            raise FileNotFoundError(f"Benchmark ledger not found: {self.benchmark_path}")
        data = _load_json(self.benchmark_path)
        if not isinstance(data, list):
            raise ValueError(f"Expected a JSON list in {self.benchmark_path}")
        return [row for row in data if isinstance(row, dict)]

    def load_pois(self) -> list[dict[str, Any]]:
        # Prefer the current watchlist; fall back to the persisted NotifiedStore file.
        for path in (self.data_root / "active_poi_watchlist.json", self.data_root / "notified_pois.json"):
            if path.exists():
                data = _load_json(path)
                if not isinstance(data, list):
                    raise ValueError(f"Expected a JSON list in {path}")
                return [row for row in data if isinstance(row, dict)]
        return []

    @staticmethod
    def _timestamp(record: dict[str, Any]) -> datetime | None:
        return _parse_datetime(
            record.get("timestamp_utc") or record.get("timestamp_tsi") or record.get("timestamp")
        )

    @staticmethod
    def _outcome(record: dict[str, Any]) -> str:
        audit = record.get("post_trade_audit")
        if isinstance(audit, dict) and audit.get("actual_outcome"):
            return str(audit["actual_outcome"]).strip().upper()
        reality = record.get("m1_execution_reality")
        if isinstance(reality, dict) and reality.get("execution_state"):
            return str(reality["execution_state"]).strip().upper()
        return "UNKNOWN"

    @classmethod
    def _window_metrics(
        cls, records: list[dict[str, Any]], start: datetime, end: datetime
    ) -> dict[str, Any]:
        selected = [
            record for record in records
            if (stamp := cls._timestamp(record)) is not None and start <= stamp < end
        ]
        outcomes = Counter(cls._outcome(record) for record in selected)
        realized_pnl = 0.0
        pnl_count = 0
        realized_r = 0.0
        r_count = 0
        open_count = 0
        no_entry_count = 0
        unknown_count = 0
        inconsistencies: list[str] = []

        for record in selected:
            outcome = cls._outcome(record)
            audit = record.get("post_trade_audit")
            audit = audit if isinstance(audit, dict) else {}
            if outcome == "UNKNOWN":
                unknown_count += 1

            is_no_entry = (
                "NO_ENTRY" in outcome
                or outcome.startswith("INVALID")
                or outcome.startswith("SKIPPED")
            )
            is_open = (
                outcome == "ACTIVE"
                or "ACTIVE" in outcome
                or "RUNNER" in outcome
                or "OPEN" in outcome
            )
            if is_no_entry:
                no_entry_count += 1
            if is_open:
                open_count += 1

            # No-entry/open records are not realized trades. Missing values are
            # excluded rather than silently interpreted as zero.
            if is_no_entry or is_open:
                continue
            value = audit.get("realized_pnl_usd", audit.get("realized_usd"))
            if isinstance(value, (int, float)) and not isinstance(value, bool):
                realized_pnl += float(value)
                pnl_count += 1
                if outcome in {"BREAK_EVEN", "BE", "BREAKEVEN"} and abs(float(value)) > 1e-9:
                    inconsistencies.append(str(record.get("record_id", "unknown")))
            value_r = audit.get("realized_r")
            if isinstance(value_r, (int, float)) and not isinstance(value_r, bool):
                realized_r += float(value_r)
                r_count += 1

        return {
            "records": len(selected),
            "outcomes": dict(sorted(outcomes.items())),
            "realized_pnl_usd_sum": round(realized_pnl, 2) if pnl_count else None,
            "records_with_realized_pnl": pnl_count,
            "realized_r_sum": round(realized_r, 4) if r_count else None,
            "records_with_realized_r": r_count,
            "no_entry_records": no_entry_count,
            "open_or_runner_records": open_count,
            "unknown_outcome_records": unknown_count,
            "break_even_with_nonzero_pnl_record_ids": inconsistencies,
        }

    def calculate_metrics(self, as_of: datetime | None = None) -> dict[str, Any]:
        now = as_of or datetime.now(timezone.utc)
        if now.tzinfo is None:
            now = now.replace(tzinfo=timezone.utc)
        now = now.astimezone(timezone.utc)
        records = self.load_benchmark_records()
        pois = self.load_pois()
        current_start = now - timedelta(days=7)
        previous_start = now - timedelta(days=14)
        timestamps = [self._timestamp(row) for row in records]
        valid_timestamps = [stamp for stamp in timestamps if stamp is not None]
        poi_statuses = Counter(str(poi.get("status", "UNKNOWN")).upper() for poi in pois)
        poi_activity = [
            stamp for poi in pois
            if (stamp := _parse_datetime(poi.get("lastCheckedAt") or poi.get("createdAt"))) is not None
        ]
        watchlist_path = self.data_root / "active_poi_watchlist.json"

        return {
            "generated_at_utc": now.isoformat(),
            "source_files": {
                "benchmark_ledger": str(self.benchmark_path),
                "poi_watchlist": str(watchlist_path) if watchlist_path.exists() else None,
            },
            "ledger_records": len(records),
            "records_with_valid_timestamps": len(valid_timestamps),
            "ledger_first_timestamp_utc": min(valid_timestamps).isoformat() if valid_timestamps else None,
            "ledger_last_timestamp_utc": max(valid_timestamps).isoformat() if valid_timestamps else None,
            "last_7_days": self._window_metrics(records, current_start, now + timedelta(microseconds=1)),
            "previous_7_days": self._window_metrics(records, previous_start, current_start),
            "poi_count": len(pois),
            "poi_status_counts": dict(sorted(poi_statuses.items())),
            "latest_poi_activity_utc": max(poi_activity).isoformat() if poi_activity else None,
            "filter_pass_reject_metrics": {
                "status": "UNAVAILABLE",
                "reason": (
                    "Persisted benchmark/POI files do not contain complete per-candidate "
                    "filter pass/reject telemetry. No rate is inferred."
                ),
            },
        }

    @staticmethod
    def generate_markdown_report(metrics: dict[str, Any]) -> str:
        def fmt(value: Any) -> str:
            return "N/A (not recorded)" if value is None else str(value)

        lines = [
            "# Begonya Signal Diagnostics",
            "",
            f"Generated (UTC): {metrics['generated_at_utc']}",
            "",
            "## Data provenance",
            f"- Benchmark ledger: {metrics['source_files']['benchmark_ledger']}",
            f"- POI watchlist: {fmt(metrics['source_files']['poi_watchlist'])}",
            f"- Ledger records: {metrics['ledger_records']}",
            f"- Valid timestamps: {metrics['records_with_valid_timestamps']}",
            f"- First record (UTC): {fmt(metrics['ledger_first_timestamp_utc'])}",
            f"- Last record (UTC): {fmt(metrics['ledger_last_timestamp_utc'])}",
            "",
            "## Signal and trade outcomes",
        ]
        for name, label in (("last_7_days", "Last 7 days"), ("previous_7_days", "Previous 7 days")):
            section = metrics[name]
            lines.extend([
                "",
                f"### {label}",
                f"- Records: {section['records']}",
                f"- Outcomes: {json.dumps(section['outcomes'], ensure_ascii=False, sort_keys=True)}",
                f"- Realized PnL sum (USD): {fmt(section['realized_pnl_usd_sum'])} "
                f"({section['records_with_realized_pnl']} records with recorded PnL)",
                f"- Realized R sum: {fmt(section['realized_r_sum'])} "
                f"({section['records_with_realized_r']} records with recorded R)",
                f"- No-entry records: {section['no_entry_records']}",
                f"- Open/runner records excluded from realized totals: {section['open_or_runner_records']}",
                f"- Unknown outcome records: {section['unknown_outcome_records']}",
                "- Break-even outcomes with non-zero recorded PnL (review IDs): "
                f"{', '.join(section['break_even_with_nonzero_pnl_record_ids']) or 'none'}",
            ])
        lines.extend([
            "",
            "## POI lifecycle",
            f"- Total POIs: {metrics['poi_count']}",
            f"- Status counts: {json.dumps(metrics['poi_status_counts'], ensure_ascii=False, sort_keys=True)}",
            f"- Latest POI activity (UTC): {fmt(metrics['latest_poi_activity_utc'])}",
            "",
            "## Filter telemetry",
            f"- Status: {metrics['filter_pass_reject_metrics']['status']}",
            f"- Reason: {metrics['filter_pass_reject_metrics']['reason']}",
            "",
            "## Limitations",
            "- This report summarizes persisted records only; it does not claim live runtime health.",
            "- No filter pass/reject rate is calculated without per-candidate telemetry.",
            "- Missing PnL/R fields remain missing rather than being treated as zero.",
            "",
        ])
        return "\n".join(lines)

    def run_diagnostic(self, as_of: datetime | None = None, write_report: bool = True) -> dict[str, Any]:
        metrics = self.calculate_metrics(as_of=as_of)
        report = self.generate_markdown_report(metrics)
        if write_report:
            self.report_path.parent.mkdir(parents=True, exist_ok=True)
            self.report_path.write_text(report, encoding="utf-8")
            print(f"Report written: {self.report_path}")
        else:
            print(report)
        return metrics


if __name__ == "__main__":
    DiagnosticEngine().run_diagnostic()
