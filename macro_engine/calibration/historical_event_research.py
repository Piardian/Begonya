"""Deterministic historical macro-event research dataset builder.

This module is a research layer, not a production signal filter. It converts aligned
macro surprise observations plus EURUSD bars into one row per event time and adds
ONLY features that are knowable at or before the event. Forward-looking fields are
explicitly separated as outcomes.

Design goals:
  * preserve the existing event-time / broker-timezone contract;
  * use expanding walk-forward calibration for MAD/STD;
  * de-duplicate simultaneous releases into one event cluster;
  * expose loss-analysis features without requiring a live trade journal;
  * avoid ML and automatic rule selection in this stage.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import math
from pathlib import Path
from statistics import mean, pstdev
from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple

from calibration.market_response_validation_v2 import (
    BROKER_TZ,
    HORIZONS_MINUTES,
    fetch_mt5_bars,
    parse_observation_event_utc,
)
from core.deterministic_controls import INDICATOR_DIRECTIONS, fit_surprise_sigmas

UTC = dt.timezone.utc
DEFAULT_YEARS = tuple(range(2021, 2026))
DEFAULT_HORIZONS = (30, 60, 240)
DEFAULT_PRE_WINDOWS = (30, 60, 240)
DEFAULT_VOL_LOOKBACK_BARS = 8


def _finite(value: Any) -> bool:
    try:
        return math.isfinite(float(value))
    except (TypeError, ValueError):
        return False


def _sign(value: float, eps: float = 0.0) -> int:
    if value > eps:
        return 1
    if value < -eps:
        return -1
    return 0


def _sorted_bar_times(bar_map: Mapping[dt.datetime, Mapping[str, float]]) -> List[dt.datetime]:
    return sorted(bar_map.keys())


def _window_return_bps(
    bar_map: Mapping[dt.datetime, Mapping[str, float]],
    start: dt.datetime,
    end: dt.datetime,
) -> Optional[float]:
    """USD-strength return from exact start-bar close to exact end-bar open."""
    start_bar = bar_map.get(start)
    end_bar = bar_map.get(end)
    if start_bar is None or end_bar is None:
        return None
    p0 = float(start_bar["close"])
    p1 = float(end_bar["open"])
    if not _finite(p0) or p0 <= 0 or not _finite(p1):
        return None
    return (p0 - p1) / p0 * 10000.0


def _prior_returns_bps(
    bar_map: Mapping[dt.datetime, Mapping[str, float]],
    event_time: dt.datetime,
    interval_minutes: int,
    lookback_bars: int,
) -> List[float]:
    values: List[float] = []
    for i in range(lookback_bars, 0, -1):
        start = event_time - dt.timedelta(minutes=i * interval_minutes)
        end = event_time - dt.timedelta(minutes=(i - 1) * interval_minutes)
        start_bar = bar_map.get(start)
        end_bar = bar_map.get(end)
        if start_bar is None or end_bar is None:
            continue
        p0 = float(start_bar["close"])
        p1 = float(end_bar["close"])
        if p0 <= 0 or not _finite(p0) or not _finite(p1):
            continue
        values.append((p0 - p1) / p0 * 10000.0)
    return values


def _realized_vol_bps(
    bar_map: Mapping[dt.datetime, Mapping[str, float]],
    event_time: dt.datetime,
    interval_minutes: int,
    lookback_bars: int,
) -> Optional[float]:
    returns = _prior_returns_bps(bar_map, event_time, interval_minutes, lookback_bars)
    if len(returns) < 3:
        return None
    return pstdev(returns)


def _atr_bps(
    bar_map: Mapping[dt.datetime, Mapping[str, float]],
    event_time: dt.datetime,
    interval_minutes: int,
    lookback_bars: int,
) -> Optional[float]:
    """Pre-event mean true range in bps using only completed bars."""
    trs: List[float] = []
    for i in range(lookback_bars, 0, -1):
        t = event_time - dt.timedelta(minutes=i * interval_minutes)
        prev_t = t - dt.timedelta(minutes=interval_minutes)
        bar = bar_map.get(t)
        prev = bar_map.get(prev_t)
        if bar is None or prev is None:
            continue
        close_prev = float(prev["close"])
        if close_prev <= 0 or not _finite(close_prev):
            continue
        high = float(bar["high"])
        low = float(bar["low"])
        if not all(_finite(v) for v in (high, low)):
            continue
        tr = max(high - low, abs(high - close_prev), abs(low - close_prev))
        trs.append(tr / close_prev * 10000.0)
    if len(trs) < 3:
        return None
    return mean(trs)


def _outcome_path(
    bar_map: Mapping[dt.datetime, Mapping[str, float]],
    event_time: dt.datetime,
    interval_minutes: int,
    horizon_minutes: int,
) -> Optional[Tuple[float, float, float, float]]:
    """Return (USD final, MFE, MAE, observed_bars) from event-bar open."""
    base = bar_map.get(event_time)
    if base is None:
        return None
    p0 = float(base["open"])
    if p0 <= 0 or not _finite(p0):
        return None

    steps = max(1, horizon_minutes // interval_minutes)
    highs: List[float] = []
    lows: List[float] = []
    final_close: Optional[float] = None
    observed = 0
    for step in range(0, steps + 1):
        t = event_time + dt.timedelta(minutes=step * interval_minutes)
        bar = bar_map.get(t)
        if bar is None:
            if step == 0:
                return None
            break
        highs.append(float(bar["high"]))
        lows.append(float(bar["low"]))
        final_close = float(bar["close"])
        observed += 1

    if final_close is None or observed < steps + 1:
        return None

    usd_final = (p0 - final_close) / p0 * 10000.0
    mfe = (p0 - min(lows)) / p0 * 10000.0
    mae = (p0 - max(highs)) / p0 * 10000.0
    return usd_final, mfe, mae, float(observed)


def _cluster_observations(rows: Sequence[Mapping[str, Any]]) -> List[List[Mapping[str, Any]]]:
    groups: Dict[str, List[Mapping[str, Any]]] = {}
    for row in rows:
        event_time = parse_observation_event_utc(row)
        key = event_time.isoformat()
        groups.setdefault(key, []).append(row)
    return [group for _, group in sorted(groups.items())]


def _cluster_signal(rows: Sequence[Mapping[str, Any]]) -> Dict[str, Any]:
    signed: List[float] = []
    for row in rows:
        kind = str(row.get("indicator_type", "")).strip().lower()
        try:
            raw = (float(row["actual"]) - float(row["forecast"])) * INDICATOR_DIRECTIONS.get(kind, 1.0)
        except (KeyError, TypeError, ValueError):
            continue
        signed.append(float(_sign(raw)))

    if not signed:
        return {
            "cluster_signal": 0,
            "cluster_coherence": 0.0,
            "cluster_all_aligned": False,
        }

    avg = mean(signed)
    return {
        "cluster_signal": _sign(avg),
        "cluster_coherence": round(abs(avg), 4),
        "cluster_all_aligned": abs(avg) == 1.0,
    }


def _walk_forward_scores(
    rows: Sequence[Mapping[str, Any]],
    year: int,
    min_observations: int,
) -> Tuple[Mapping[str, float], Mapping[str, float]]:
    history = [r for r in rows if dt.date.fromisoformat(str(r["date"])).year < year]
    mad = fit_surprise_sigmas(history, min_observations=min_observations, method="mad")
    std = fit_surprise_sigmas(history, min_observations=min_observations, method="std")
    return mad, std


def _normalize_years(value: Sequence[int]) -> Tuple[int, ...]:
    return tuple(sorted({int(v) for v in value}))


def build_historical_event_dataset(
    observations_path: Path,
    bar_map: Mapping[dt.datetime, Mapping[str, float]],
    *,
    timeframe_minutes: int,
    test_years: Sequence[int] = DEFAULT_YEARS,
    horizons: Sequence[int] = DEFAULT_HORIZONS,
    pre_windows: Sequence[int] = DEFAULT_PRE_WINDOWS,
    min_observations: int = 15,
    vol_lookback_bars: int = DEFAULT_VOL_LOOKBACK_BARS,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """Build one research row per unique release timestamp.

    All columns prefixed with ``pre_`` and ``event_`` are available at event time.
    Columns prefixed with ``post_`` plus MFE/MAE are outcomes and must never be used
    as production features.
    """
    with observations_path.open("r", encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))

    years = _normalize_years(test_years)
    selected_rows = [r for r in rows if dt.date.fromisoformat(str(r["date"])).year in years]
    groups_by_year: Dict[int, List[Mapping[str, Any]]] = {year: [] for year in years}
    for row in selected_rows:
        year = dt.date.fromisoformat(str(row["date"])).year
        groups_by_year[year].append(row)

    dataset: List[Dict[str, Any]] = []
    diagnostics: Dict[str, Any] = {
        "observation_rows_total": len(rows),
        "selected_years": list(years),
        "selected_observation_rows": len(selected_rows),
        "event_clusters_total": 0,
        "event_clusters_matched": 0,
        "missing_event_bar": 0,
        "missing_outcome": 0,
        "invalid_observation_rows": 0,
        "cluster_histogram": {},
    }

    for year in years:
        year_rows = groups_by_year[year]
        mad_sigma, std_sigma = _walk_forward_scores(rows, year, min_observations)
        clusters = _cluster_observations(year_rows)
        diagnostics["event_clusters_total"] += len(clusters)

        for group in clusters:
            event_time = parse_observation_event_utc(group[0])
            base_bar = bar_map.get(event_time)
            if base_bar is None:
                diagnostics["missing_event_bar"] += 1
                continue

            signal_data = _cluster_signal(group)
            indicators = sorted({str(r.get("indicator_type", "")).strip().lower() for r in group})
            mad_zs: List[float] = []
            std_zs: List[float] = []
            raw_surprises: List[float] = []
            for row in group:
                kind = str(row.get("indicator_type", "")).strip().lower()
                if kind not in mad_sigma or kind not in std_sigma:
                    diagnostics["invalid_observation_rows"] += 1
                    continue
                try:
                    raw = (float(row["actual"]) - float(row["forecast"])) * INDICATOR_DIRECTIONS.get(kind, 1.0)
                    mad_zs.append(raw / mad_sigma[kind])
                    std_zs.append(raw / std_sigma[kind])
                    raw_surprises.append(raw)
                except (KeyError, TypeError, ValueError, ZeroDivisionError):
                    diagnostics["invalid_observation_rows"] += 1

            if not mad_zs:
                continue

            dominant_idx = max(range(len(mad_zs)), key=lambda i: abs(mad_zs[i]))
            dominant_z_mad = mad_zs[dominant_idx]
            dominant_z_std = std_zs[dominant_idx]
            signal = int(signal_data["cluster_signal"])

            record: Dict[str, Any] = {
                "event_time_utc": event_time.isoformat(),
                "year": year,
                "indicators": "+".join(indicators),
                "cluster_size": len(group),
                "cluster_signal": signal,
                "cluster_coherence": signal_data["cluster_coherence"],
                "cluster_all_aligned": signal_data["cluster_all_aligned"],
                "mean_signed_surprise": round(mean(raw_surprises), 8),
                "mean_abs_mad_z": round(mean(abs(z) for z in mad_zs), 6),
                "max_abs_mad_z": round(max(abs(z) for z in mad_zs), 6),
                "dominant_z_mad": round(dominant_z_mad, 6),
                "dominant_z_std": round(dominant_z_std, 6),
            }

            # Pre-event state: only bars strictly before the release bar are used.
            for minutes in sorted(set(int(v) for v in pre_windows)):
                if minutes <= 0 or minutes % timeframe_minutes != 0:
                    continue
                start = event_time - dt.timedelta(minutes=minutes)
                pre = _window_return_bps(bar_map, start, event_time)
                record[f"pre_{minutes}m_usd_bps"] = None if pre is None else round(pre, 4)
                record[f"pre_{minutes}m_abs_bps"] = None if pre is None else round(abs(pre), 4)
                if pre is not None and signal != 0:
                    record[f"pre_{minutes}m_aligned"] = _sign(pre) == signal
                else:
                    record[f"pre_{minutes}m_aligned"] = None

            record["pre_realized_vol_bps"] = _realized_vol_bps(
                bar_map, event_time, timeframe_minutes, vol_lookback_bars
            )
            record["pre_atr_bps"] = _atr_bps(
                bar_map, event_time, timeframe_minutes, vol_lookback_bars
            )

            outcome_complete = True
            for horizon in sorted(set(int(v) for v in horizons)):
                if horizon <= 0 or horizon % timeframe_minutes != 0:
                    outcome_complete = False
                    break
                outcome = _outcome_path(bar_map, event_time, timeframe_minutes, horizon)
                if outcome is None:
                    outcome_complete = False
                    break
                usd_final, mfe, mae, observed = outcome
                record[f"post_{horizon}m_usd_bps"] = round(usd_final, 4)
                record[f"post_{horizon}m_mfe_bps"] = round(mfe, 4)
                record[f"post_{horizon}m_mae_bps"] = round(mae, 4)
                record[f"post_{horizon}m_hit"] = bool(signal != 0 and signal * usd_final > 0)
                if signal != 0 and horizon == timeframe_minutes:
                    record["post_confirmation_aligned"] = signal * usd_final > 0
                record[f"post_{horizon}m_observed_bars"] = int(observed)

            if not outcome_complete:
                diagnostics["missing_outcome"] += 1
                continue

            for horizon in sorted(set(int(v) for v in horizons)):
                ret = record[f"post_{horizon}m_usd_bps"]
                if signal != 0:
                    record[f"trade_{horizon}m_gross_bps"] = round(signal * ret, 4)

            record["dominant_mad_actionable"] = abs(dominant_z_mad) >= 1.0
            record["dominant_mad_directional_hit_30m"] = (
                signal != 0 and abs(dominant_z_mad) >= 1.0 and signal * record.get("post_30m_usd_bps", 0.0) > 0
            )
            diagnostics["event_clusters_matched"] += 1
            histogram_key = str(len(group))
            diagnostics["cluster_histogram"][histogram_key] = diagnostics["cluster_histogram"].get(histogram_key, 0) + 1
            dataset.append(record)

    dataset.sort(key=lambda r: str(r["event_time_utc"]))
    diagnostics["dataset_rows"] = len(dataset)
    diagnostics["coverage_pct"] = round(
        (diagnostics["event_clusters_matched"] / diagnostics["event_clusters_total"] * 100.0)
        if diagnostics["event_clusters_total"] else 0.0,
        2,
    )
    diagnostics["broker_timezone_contract"] = str(BROKER_TZ)
    return dataset, diagnostics


def summarize_dataset(dataset: Sequence[Mapping[str, Any]]) -> Dict[str, Any]:
    """Small deterministic summary; no filter discovery is performed here."""
    if not dataset:
        return {"sample_count": 0}

    by_indicator: Dict[str, List[Mapping[str, Any]]] = {}
    by_year: Dict[str, List[Mapping[str, Any]]] = {}
    for row in dataset:
        for indicator in str(row["indicators"]).split("+"):
            by_indicator.setdefault(indicator, []).append(row)
        by_year.setdefault(str(row["year"]), []).append(row)

    def _hit_rate(rows: Sequence[Mapping[str, Any]], key: str) -> Optional[float]:
        values = [r[key] for r in rows if key in r]
        if not values:
            return None
        return round(sum(bool(v) for v in values) / len(values) * 100.0, 2)

    out: Dict[str, Any] = {
        "sample_count": len(dataset),
        "cluster_size_distribution": {},
        "by_year": {},
        "by_indicator": {},
    }
    for row in dataset:
        size = str(row["cluster_size"])
        out["cluster_size_distribution"][size] = out["cluster_size_distribution"].get(size, 0) + 1

    for year, rows in sorted(by_year.items()):
        out["by_year"][year] = {
            "count": len(rows),
            "30m_hit_rate_pct": _hit_rate(rows, "post_30m_hit"),
            "mean_30m_trade_bps": round(mean(float(r.get("trade_30m_gross_bps", 0.0)) for r in rows), 4),
            "aligned_event_pct": round(mean(1.0 if bool(r["cluster_all_aligned"]) else 0.0 for r in rows) * 100.0, 2),
        }

    for indicator, rows in sorted(by_indicator.items()):
        out["by_indicator"][indicator] = {
            "cluster_membership_count": len(rows),
            "30m_hit_rate_pct": _hit_rate(rows, "post_30m_hit"),
            "mean_abs_mad_z": round(mean(float(r["mean_abs_mad_z"]) for r in rows), 4),
        }
    return out


def write_dataset_csv(dataset: Sequence[Mapping[str, Any]], path: Path) -> None:
    if not dataset:
        path.write_text("", encoding="utf-8")
        return
    columns = sorted({key for row in dataset for key in row.keys()})
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=columns)
        writer.writeheader()
        writer.writerows(dataset)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build deterministic historical macro-event research dataset")
    parser.add_argument("--observations", type=Path, default=Path(__file__).with_name("surprise_observations.csv"))
    parser.add_argument("--output", type=Path, default=Path(__file__).with_name("historical_event_research.json"))
    parser.add_argument("--csv-output", type=Path, default=Path(__file__).with_name("historical_event_research.csv"))
    parser.add_argument("--symbol", default="EURUSD")
    parser.add_argument("--timeframe", default="M30", choices=["M15", "M30", "H1"])
    parser.add_argument("--count", type=int, default=65000)
    parser.add_argument("--years", nargs="+", type=int, default=list(DEFAULT_YEARS))
    args = parser.parse_args()

    interval_minutes = {"M15": 15, "M30": 30, "H1": 60}[args.timeframe.upper()]
    horizons = [h for h in DEFAULT_HORIZONS if h % interval_minutes == 0]
    pre_windows = [w for w in DEFAULT_PRE_WINDOWS if w % interval_minutes == 0]

    bars = fetch_mt5_bars(args.symbol, timeframe=args.timeframe, count=args.count)
    if not bars:
        raise SystemExit("MT5 bars unavailable; run this command on the Windows/MT5 environment.")

    dataset, diagnostics = build_historical_event_dataset(
        args.observations,
        bars,
        timeframe_minutes=interval_minutes,
        test_years=args.years,
        horizons=horizons,
        pre_windows=pre_windows,
    )

    report = {
        "metadata": {
            "symbol": args.symbol,
            "timeframe": args.timeframe.upper(),
            "time_basis": "UTC event time reconstructed from America/New_York schedule",
            "feature_rule": "pre-event fields use bars strictly before event_time",
            "outcome_rule": "forward fields use event_bar_open and future closes/highs/lows",
            "walk_forward": "MAD/STD fitted strictly before each validation year",
            "scope": "research dataset only; no automatic production filter activation",
        },
        "diagnostics": diagnostics,
        "summary": summarize_dataset(dataset),
        "records": dataset,
    }
    args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    write_dataset_csv(dataset, args.csv_output)
    print(json.dumps({"output": str(args.output), "csv_output": str(args.csv_output), "summary": report["summary"], "diagnostics": diagnostics}, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
