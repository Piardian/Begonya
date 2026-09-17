from __future__ import annotations

import argparse
import datetime as dt
import json
from pathlib import Path
from statistics import mean, pstdev
from typing import Any, Dict, Iterable, Mapping, Sequence

from calibration.surprise_sigma import load_observations_csv
from core.deterministic_controls import chronological_split, fit_surprise_sigmas, signed_surprise_zscore


DEFAULT_REQUIRED_INDICATORS = (
    "nfp",
    "cpi",
    "core_cpi",
    "unemployment",
    "pmi",
    "gdp",
    "retail_sales",
)


def evaluate_rows(sigmas: Mapping[str, float], rows: Sequence[Mapping[str, Any]]) -> Dict[str, Any]:
    zscores = []
    for row in rows:
        kind = str(row.get("indicator_type", "")).lower()
        if kind not in sigmas:
            continue
        try:
            z = signed_surprise_zscore(
                kind,
                float(row["actual"]),
                float(row["forecast"]),
                sigmas[kind],
                clip=10.0,
            )
        except (KeyError, TypeError, ValueError):
            continue
        zscores.append(z)

    n = len(zscores)
    if not n:
        return {
            "sample_count": 0,
            "mean_z": 0.0,
            "std_z": 0.0,
            "msnr": 0.0,
            "pct_within_1sigma": 0.0,
            "pct_within_2sigma": 0.0,
        }

    return {
        "sample_count": n,
        "mean_z": round(mean(zscores), 4),
        "std_z": round(pstdev(zscores), 4),
        "msnr": round(mean(z * z for z in zscores), 4),
        "pct_within_1sigma": round(sum(abs(z) <= 1.0 for z in zscores) / n * 100.0, 2),
        "pct_within_2sigma": round(sum(abs(z) <= 2.0 for z in zscores) / n * 100.0, 2),
    }


def run_expanding_walk_forward(
    rows: Iterable[Mapping[str, Any]],
    *,
    calibration_start: dt.date,
    first_validation_year: int,
    last_validation_year: int,
    min_observations: int = 30,
    required_indicators: Sequence[str] = DEFAULT_REQUIRED_INDICATORS,
) -> Dict[str, Any]:
    normalized = list(rows)
    folds: list[Dict[str, Any]] = []

    for year in range(first_validation_year, last_validation_year + 1):
        calibration_end = dt.date(year - 1, 12, 31)
        validation_end = dt.date(year, 12, 31)
        split = chronological_split(normalized, calibration_end, validation_end)
        calibration = [
            r for r in split["calibration"]
            if dt.date.fromisoformat(str(r["date"])) >= calibration_start
        ]
        validation = split["validation"]

        methods: Dict[str, Any] = {}
        for method in ("mad", "std"):
            sigmas = fit_surprise_sigmas(
                calibration,
                min_observations=min_observations,
                method=method,
            )
            missing = [ind for ind in required_indicators if ind.lower() not in sigmas]
            methods[method] = {
                "status": "ok" if not missing else "insufficient_data",
                "missing_indicators": missing,
                "sigmas": sigmas,
                "validation": evaluate_rows(sigmas, validation) if not missing else evaluate_rows({}, validation),
            }

        folds.append({
            "validation_year": year,
            "calibration_end": calibration_end.isoformat(),
            "validation_end": validation_end.isoformat(),
            "calibration_sample_count": len(calibration),
            "validation_sample_count": len(validation),
            "methods": methods,
        })

    return {
        "methodology": "expanding_walk_forward",
        "calibration_start": calibration_start.isoformat(),
        "first_validation_year": first_validation_year,
        "last_validation_year": last_validation_year,
        "folds": folds,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Run expanding walk-forward validation for surprise sigma estimators.")
    parser.add_argument(
        "--input",
        type=Path,
        default=Path(__file__).with_name("surprise_observations.csv"),
    )
    parser.add_argument("--calibration-start", type=dt.date.fromisoformat, default=dt.date(2016, 1, 1))
    parser.add_argument("--first-validation-year", type=int, default=2020)
    parser.add_argument("--last-validation-year", type=int, default=2025)
    parser.add_argument("--min-observations", type=int, default=30)
    parser.add_argument("--required-indicator", action="append", default=[])
    parser.add_argument("--output", type=Path, default=Path(__file__).with_name("walk_forward_validation.json"))
    args = parser.parse_args()

    if args.first_validation_year <= args.calibration_start.year:
        parser.error("first validation year must be after calibration start year")
    if args.last_validation_year < args.first_validation_year:
        parser.error("last validation year must be >= first validation year")

    rows = load_observations_csv(args.input)
    required_indicators = tuple(args.required_indicator) if args.required_indicator else DEFAULT_REQUIRED_INDICATORS
    report = run_expanding_walk_forward(
        rows,
        calibration_start=args.calibration_start,
        first_validation_year=args.first_validation_year,
        last_validation_year=args.last_validation_year,
        min_observations=args.min_observations,
        required_indicators=required_indicators,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Walk-forward validation written to {args.output}\n")
    print(f"{'YEAR':<6} | {'METHOD':<8} | {'N_VAL':<6} | {'MEAN(Z)':<8} | {'STD(Z)':<8} | {'MSNR':<8} | {'IN 1SIG':<8} | {'IN 2SIG':<8}")
    print("-" * 76)
    for f in report["folds"]:
        y = f["validation_year"]
        for m in ("mad", "std"):
            info = f["methods"][m]
            if info["status"] != "ok":
                print(f"{y:<6} | {m.upper():<8} | {f['validation_sample_count']:<6} | INSUFFICIENT DATA ({', '.join(info['missing_indicators'])})")
            else:
                v = info["validation"]
                print(f"{y:<6} | {m.upper():<8} | {v['sample_count']:<6} | {v['mean_z']:>+7.4f}  | {v['std_z']:>7.4f}  | {v['msnr']:>7.4f}  | {v['pct_within_1sigma']:>6.2f}%  | {v['pct_within_2sigma']:>6.2f}%")
        print("-" * 76)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
