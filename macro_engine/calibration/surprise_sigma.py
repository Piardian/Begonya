from __future__ import annotations

import csv
import datetime as dt
import json
from pathlib import Path
from typing import Any, Dict, Iterable, Mapping

from core.deterministic_controls import chronological_split, fit_surprise_sigmas


REQUIRED_COLUMNS = {"date", "indicator_type", "actual", "forecast"}


def load_observations_csv(path: Path) -> list[Dict[str, Any]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    if not rows:
        raise ValueError("Calibration dataset is empty")
    missing = REQUIRED_COLUMNS - set(rows[0])
    if missing:
        raise ValueError("Calibration dataset missing columns: " + ", ".join(sorted(missing)))
    return rows


def calibrate_from_csv(
    path: Path,
    calibration_end: dt.date,
    validation_end: dt.date,
    min_observations: int = 30,
) -> Dict[str, Any]:
    rows = load_observations_csv(path)
    split = chronological_split(rows, calibration_end, validation_end)
    sigmas = fit_surprise_sigmas(split["calibration"], min_observations=min_observations)
    return {
        "method": "empirical_population_std_of_direction_adjusted_surprise",
        "calibration_end": calibration_end.isoformat(),
        "validation_end": validation_end.isoformat(),
        "sample_counts": {key: len(value) for key, value in split.items()},
        "sigmas": sigmas,
        "validation_rows": split["validation"],
        "out_of_sample_rows": split["out_of_sample"],
    }


def write_calibration_profile(profile: Mapping[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(profile, ensure_ascii=False, indent=2), encoding="utf-8")


def load_calibration_profile(path: Path) -> Dict[str, float]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    sigmas = payload.get("sigmas")
    if not isinstance(sigmas, dict) or not sigmas:
        raise ValueError("Calibration profile has no fitted sigmas")
    return {str(key): float(value) for key, value in sigmas.items() if float(value) > 0}
