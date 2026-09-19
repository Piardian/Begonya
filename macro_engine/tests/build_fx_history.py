"""Build a normalized historical FX panel from FRED H.10.

The source is FRED H.10 daily spot FX. This module only normalizes the
currency orientation; it does not claim macro factors are point-in-time.
Macro factor values must be joined separately with an explicit vintage_end.

Output columns:
date,pair,fx_close,source_series
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

from ingestion.fred_data import FredDataIngestion


FX_SERIES = {
    "EURUSD": ("DEXUSEU", False),  # USD per EUR
    "GBPUSD": ("DEXUSUK", False),  # USD per GBP
    "USDJPY": ("DEXJPUS", False),  # JPY per USD
    "AUDUSD": ("DEXUSAL", False),  # USD per AUD
    "NZDUSD": ("DEXUSNZ", False),  # USD per NZD
    "USDCAD": ("DEXCAUS", False),  # CAD per USD
    "USDCHF": ("DEXSZUS", False),  # CHF per USD
}


def _fetch(ingestion: FredDataIngestion, series_id: str, start: dt.date, end: dt.date) -> List[Tuple[dt.date, float]]:
    return ingestion._get_observations(series_id, start, end)


def build(start: dt.date, end: dt.date, api_key: str) -> List[Dict[str, str]]:
    ingestion = FredDataIngestion(api_key=api_key)
    output: List[Dict[str, str]] = []
    for pair, (series_id, invert) in FX_SERIES.items():
        for date, value in _fetch(ingestion, series_id, start, end):
            normalized = (1.0 / value) if invert else value
            if normalized <= 0:
                continue
            output.append({
                "date": date.isoformat(),
                "pair": pair,
                "fx_close": f"{normalized:.10f}",
                "source_series": series_id,
            })
    output.sort(key=lambda row: (row["date"], row["pair"]))
    return output


def write_csv(rows: Iterable[Dict[str, str]], path: Path) -> None:
    rows = list(rows)
    if not rows:
        raise ValueError("FRED returned no FX observations")
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=["date", "pair", "fx_close", "source_series"])
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description="Download normalized FRED H.10 FX history")
    parser.add_argument("--start", required=True, type=dt.date.fromisoformat)
    parser.add_argument("--end", required=True, type=dt.date.fromisoformat)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--api-key", default=None)
    args = parser.parse_args()

    from config import FRED_API_KEY
    api_key = args.api_key or FRED_API_KEY
    if not api_key:
        raise SystemExit("FRED_API_KEY is required via environment/.env or --api-key")
    if args.end < args.start:
        raise SystemExit("--end must be >= --start")

    rows = build(args.start, args.end, api_key)
    write_csv(rows, args.output)
    print(f"wrote {len(rows)} FX observations to {args.output}")


if __name__ == "__main__":
    main()
