"""Build a point-in-time FX factor replay dataset from a normalized panel.

Input is a CSV containing one row per observation date and the raw values
needed by the macro model. The builder intentionally does not download or
silently substitute data. This keeps vintage handling outside the scoring
logic and makes look-ahead risk explicit.

Required columns:
date,pair,fx_close

Optional factor columns:
base_score,quote_score,rate_level_factor,rate_momentum_factor,
commodity_factor,risk_factor,policy_repricing_factor,dxy_factor,
safe_haven_factor,market_rate_factor

Forward returns are calculated only from fx_close rows in the same pair and
are expressed in percent. Missing future observations remain blank.

The source CSV should be produced from a point-in-time/vintage-aware provider.
For FRED/ALFRED, use the observation vintage available on each as-of date.
Do not feed a fully revised current macro history into this builder and call it
point-in-time.
"""

from __future__ import annotations

import argparse
import csv
from pathlib import Path
from typing import Dict, List, Optional


HORIZONS = (1, 3, 5, 10)


def _float(value: str) -> Optional[float]:
    try:
        x = float(value)
        return x
    except (TypeError, ValueError):
        return None


def load_rows(path: Path) -> List[Dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as fh:
        rows = list(csv.DictReader(fh))
    rows.sort(key=lambda r: (r.get("pair", ""), r.get("date", "")))
    return rows


def add_forward_returns(rows: List[Dict[str, str]]) -> List[Dict[str, str]]:
    grouped: Dict[str, List[Dict[str, str]]] = {}
    for row in rows:
        grouped.setdefault(row.get("pair", ""), []).append(row)

    output: List[Dict[str, str]] = []
    for pair_rows in grouped.values():
        for i, row in enumerate(pair_rows):
            row = dict(row)
            px = _float(row.get("fx_close", ""))
            for horizon in HORIZONS:
                key = f"ret_{horizon}d"
                if px is None or i + horizon >= len(pair_rows):
                    row[key] = ""
                    continue
                future = _float(pair_rows[i + horizon].get("fx_close", ""))
                row[key] = "" if future is None or px == 0 else f"{(future / px - 1.0) * 100.0:.8f}"
            output.append(row)
    return output


def validate(rows: List[Dict[str, str]]) -> None:
    required = {"date", "pair", "fx_close"}
    if not rows:
        raise ValueError("Input dataset is empty")
    missing = required - set(rows[0])
    if missing:
        raise ValueError("Missing required columns: " + ", ".join(sorted(missing)))

    pairs = {r.get("pair", "") for r in rows}
    expected = {"EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "NZDUSD", "USDCAD", "USDCHF"}
    unknown = pairs - expected
    if unknown:
        raise ValueError("Unexpected pair(s): " + ", ".join(sorted(unknown)))


def main() -> None:
    parser = argparse.ArgumentParser(description="Create point-in-time FX factor replay outcomes")
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    rows = load_rows(args.input)
    validate(rows)
    output = add_forward_returns(rows)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    fields = list(output[0].keys())
    for key in [f"ret_{h}d" for h in HORIZONS]:
        if key not in fields:
            fields.append(key)

    with args.output.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fields)
        writer.writeheader()
        writer.writerows(output)

    print(f"wrote {len(output)} rows to {args.output}")


if __name__ == "__main__":
    main()
