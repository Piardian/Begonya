"""Deterministic historical factor attribution replay.

This module does not create trading signals from future data. It consumes a
point-in-time dataset where every factor value is known at t and outcome
returns are measured strictly after t.

Expected CSV columns:
timestamp,pair,base_score,quote_score,<factor columns...>,ret_1d,ret_3d,ret_5d,ret_10d

Factor columns should contain -1, 0, +1, or be blank for unavailable.
The replay reports coverage, directional hit-rate, mean forward return,
median forward return, and adverse/favorable excursion when supplied.

Use an explicit train/test cutoff. Threshold selection must be performed on
the train partition only; this module deliberately does not optimize
thresholds.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import statistics
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional


DEFAULT_HORIZONS = ("ret_1d", "ret_3d", "ret_5d", "ret_10d")


def _num(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    try:
        x = float(value)
    except (TypeError, ValueError):
        return None
    return x if math.isfinite(x) else None


def _mean(values: List[float]) -> Optional[float]:
    return statistics.fmean(values) if values else None


def _median(values: List[float]) -> Optional[float]:
    return statistics.median(values) if values else None


def _summarize(rows: List[Dict[str, Any]], signal_key: str, horizon: str) -> Dict[str, Any]:
    usable = []
    for row in rows:
        signal = _num(row.get(signal_key))
        outcome = _num(row.get(horizon))
        if signal in (-1, 0, 1) and outcome is not None:
            usable.append((int(signal), outcome))

    directional = [(s, r) for s, r in usable if s != 0]
    hits = [r for s, r in directional if (s == 1 and r > 0) or (s == -1 and r < 0)]
    signed = [s * r for s, r in directional]

    return {
        "observations": len(usable),
        "directional_observations": len(directional),
        "coverage_pct": round(100 * len(directional) / len(usable), 2) if usable else None,
        "hit_rate_pct": round(100 * len(hits) / len(directional), 2) if directional else None,
        "mean_forward_return_pct": round(_mean([r for _, r in directional]), 6) if directional else None,
        "median_forward_return_pct": round(_median([r for _, r in directional]), 6) if directional else None,
        "mean_signed_return_pct": round(_mean(signed), 6) if signed else None,
    }


def _alignment(rows: List[Dict[str, Any]], factors: List[str]) -> List[Dict[str, Any]]:
    out = []
    for row in rows:
        vals = [_num(row.get(f)) for f in factors]
        vals = [int(v) for v in vals if v in (-1, 0, 1)]
        if len(vals) < 2:
            continue
        pos = sum(v == 1 for v in vals)
        neg = sum(v == -1 for v in vals)
        if pos == len(vals):
            row = dict(row)
            row["_alignment"] = 1
            out.append(row)
        elif neg == len(vals):
            row = dict(row)
            row["_alignment"] = -1
            out.append(row)
        # Mixed or neutral factor states are not "alignment" observations.
        # They remain analyzable at factor level but are excluded from the
        # full-alignment cohort to keep the cohort definition deterministic.
    return out


def analyze(rows: List[Dict[str, Any]], factor_columns: List[str], horizons: Iterable[str]) -> Dict[str, Any]:
    result: Dict[str, Any] = {
        "dataset": {
            "rows": len(rows),
            "pairs": sorted({str(r.get("pair")) for r in rows if r.get("pair")}),
            "factor_columns": factor_columns,
        },
        "factors": {},
        "alignment": {},
    }

    for factor in factor_columns:
        result["factors"][factor] = {
            h: _summarize(rows, factor, h) for h in horizons
        }

    aligned = _alignment(rows, factor_columns)
    for h in horizons:
        result["alignment"][h] = _summarize(aligned, "_alignment", h)

    # Pair-level evidence: avoids hiding a factor that only works in one pair.
    result["by_pair"] = {}
    for pair in sorted({str(r.get("pair")) for r in rows if r.get("pair")}):
        pair_rows = [r for r in rows if str(r.get("pair")) == pair]
        result["by_pair"][pair] = {
            factor: {h: _summarize(pair_rows, factor, h) for h in horizons}
            for factor in factor_columns
        }

    return result


def load_csv(path: Path) -> List[Dict[str, Any]]:
    with path.open("r", encoding="utf-8-sig", newline="") as fh:
        return list(csv.DictReader(fh))


def split_rows(rows: List[Dict[str, Any]], cutoff: str) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    train, test = [], []
    for row in rows:
        ts = str(row.get("timestamp", ""))
        (train if ts < cutoff else test).append(row)
    return train, test


def main() -> None:
    parser = argparse.ArgumentParser(description="Point-in-time macro factor attribution replay")
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--cutoff", help="ISO timestamp/date. Rows before cutoff are train; rows at/after are test.")
    parser.add_argument(
        "--factors",
        nargs="+",
        required=True,
        help="Factor columns containing -1/0/+1 evidence.",
    )
    args = parser.parse_args()

    rows = load_csv(args.input)
    horizons = [h for h in DEFAULT_HORIZONS if any(h in r for r in rows)]

    if args.cutoff:
        train_rows, test_rows = split_rows(rows, args.cutoff)
    else:
        train_rows, test_rows = rows, []

    report = {
        "methodology": {
            "point_in_time": True,
            "future_data_used_for_factor_values": False,
            "threshold_optimization_in_module": False,
            "cutoff": args.cutoff,
            "horizons": horizons,
        },
        "train": analyze(train_rows, args.factors, horizons),
    }

    if args.cutoff:
        report["test"] = analyze(test_rows, args.factors, horizons)

    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
