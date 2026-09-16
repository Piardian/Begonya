from __future__ import annotations

import datetime as dt
from typing import Any, Dict, Iterable, Mapping

from data_quality import DataUnavailableError


REPLAY_SCHEMA_VERSION = 1


def validate_snapshot_no_lookahead(snapshot: Mapping[str, Any], as_of: dt.datetime) -> None:
    raw_ts = snapshot.get("timestamp") or snapshot.get("as_of")
    if raw_ts is None:
        raise DataUnavailableError("Replay snapshot timestamp is required")
    ts = dt.datetime.fromisoformat(str(raw_ts).replace("Z", "+00:00"))
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=dt.timezone.utc)
    ref = as_of if as_of.tzinfo else as_of.replace(tzinfo=dt.timezone.utc)
    if ts > ref.astimezone(dt.timezone.utc):
        raise DataUnavailableError(
            f"Look-ahead leakage detected: snapshot={ts.isoformat()} > as_of={ref.isoformat()}"
        )


def validate_replay_dataset(rows: Iterable[Mapping[str, Any]]) -> list[Mapping[str, Any]]:
    validated = []
    for row in rows:
        if row.get("schema_version", REPLAY_SCHEMA_VERSION) != REPLAY_SCHEMA_VERSION:
            raise ValueError("Unsupported replay schema version")
        if not row.get("timestamp"):
            raise DataUnavailableError("Replay row missing timestamp")
        if not row.get("market") or not row.get("fred"):
            raise DataUnavailableError("Replay row requires market and fred snapshots")
        validated.append(row)
    return validated


def chronological_rows(rows: Iterable[Mapping[str, Any]]) -> list[Mapping[str, Any]]:
    return sorted(rows, key=lambda row: dt.datetime.fromisoformat(str(row["timestamp"]).replace("Z", "+00:00")))
