"""Market-Response and Economic Value Validation Engine.

Matches historical macroeconomic surprises (PIT) against high-frequency broker price bars (EUR/USD)
to validate whether surprise z-scores contain genuine economic information and directional market edge.
Compares Median Absolute Deviation (MAD) vs. Sample Standard Deviation (STD) across:
  - Spearman Rank Information Coefficient (IC) across multiple horizons (+30m/1h, +1.5h, +4h)
  - 5-Bucket Monotonicity Analysis (Z < -2, [-2, -1], [-1, +1], [1, 2], Z > 2)
  - Directional Hit Rate for actionable signals (|Z| >= 1.0 and |Z| >= 2.0)
  - By-indicator breakdown across major US macro releases
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import math
from pathlib import Path
from statistics import mean, median
from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple

from core.deterministic_controls import (
    INDICATOR_DIRECTIONS,
    fit_surprise_sigmas,
)

# Time constants for US macro announcements mapped to Broker Server Time (EET/EEST)
# US 8:30 AM Eastern releases (NFP, CPI, Core CPI, Unemployment, Retail Sales, GDP) -> 15:30 Broker Time
# US 10:00 AM Eastern releases (ISM PMI) -> 17:00 Broker Time
BROKER_HOUR_830_AM = 15
BROKER_HOUR_1000_AM = 17


def rank_data(seq: Sequence[float]) -> List[float]:
    """Computes fractional ranks for a sequence with average-rank tie handling (1-based)."""
    n = len(seq)
    if n == 0:
        return []
    indexed = sorted(enumerate(seq), key=lambda x: x[1])
    ranks = [0.0] * n
    i = 0
    while i < n:
        j = i
        while j + 1 < n and indexed[j + 1][1] == indexed[i][1]:
            j += 1
        avg_rank = (i + j) / 2.0 + 1.0
        for k in range(i, j + 1):
            ranks[indexed[k][0]] = avg_rank
        i = j + 1
    return ranks


def spearman_rank_ic(x: Sequence[float], y: Sequence[float]) -> float:
    """Computes Spearman Rank Correlation (Information Coefficient) between two sequences.
    
    Pure Python implementation without scipy dependency.
    """
    if len(x) != len(y) or len(x) < 2:
        return 0.0
    rx = rank_data(x)
    ry = rank_data(y)
    n = len(rx)
    mx = sum(rx) / n
    my = sum(ry) / n
    cov = sum((rx[i] - mx) * (ry[i] - my) for i in range(n))
    var_x = sum((rx[i] - mx) ** 2 for i in range(n))
    var_y = sum((ry[i] - my) ** 2 for i in range(n))
    denom = math.sqrt(var_x * var_y)
    if denom == 0:
        return 0.0
    return float(cov / denom)


def resolve_event_datetime(row: Mapping[str, Any]) -> Tuple[dt.date, int]:
    """Resolves the exact market event date and broker hour for an observation row.
    
    In the scraped ForexFactory calendar:
    - Rows with 19:30 or 20:30 UTC reflect midnight (00:00:00) in Iran (IRST/IRDT),
      meaning the US release actually occurred on date + 1 day.
    - Other timestamps were recorded directly in UTC.
    - 8:30 AM US Eastern announcements map to 15:30 Broker Time (EET/EEST candle hour 15).
    - 10:00 AM US Eastern announcements (PMI) map to 17:00 Broker Time (candle hour 17).
    """
    kind = str(row.get("indicator_type", "")).lower()
    raw_utc_str = str(row.get("event_timestamp_utc", ""))
    date_str = str(row.get("date", ""))
    base_date = dt.date.fromisoformat(date_str)

    try:
        event_dt = dt.datetime.fromisoformat(raw_utc_str)
        if (event_dt.hour, event_dt.minute) in [(19, 30), (20, 30)]:
            actual_date = base_date + dt.timedelta(days=1)
        else:
            actual_date = base_date
    except Exception:
        actual_date = base_date

    if kind == "pmi":
        broker_hour = BROKER_HOUR_1000_AM
    else:
        broker_hour = BROKER_HOUR_830_AM

    return actual_date, broker_hour


def fetch_mt5_bars(symbol: str = "EURUSD", count: int = 50000) -> Dict[Tuple[dt.date, int], Dict[str, float]]:
    """Loads hourly bars from MetaTrader 5 and returns a map keyed by (date, hour)."""
    try:
        import MetaTrader5 as mt5
    except ImportError:
        return {}

    if not mt5.initialize():
        return {}

    rates = mt5.copy_rates_from_pos(symbol, mt5.TIMEFRAME_H1, 0, count)
    mt5.shutdown()

    if rates is None or len(rates) == 0:
        return {}

    bar_map: Dict[Tuple[dt.date, int], Dict[str, float]] = {}
    for r in rates:
        t = dt.datetime.fromtimestamp(r["time"], tz=dt.timezone.utc)
        bar_map[(t.date(), t.hour)] = {
            "open": float(r["open"]),
            "high": float(r["high"]),
            "low": float(r["low"]),
            "close": float(r["close"]),
        }
    return bar_map


def calculate_usd_returns(
    p0: float,
    p_close: float,
    quote_currency_is_usd: bool = True,
) -> float:
    """Calculates price return in basis points from the perspective of USD strength.
    
    For EURUSD (Base EUR, Quote USD):
      If EURUSD falls (p_close < p0), USD has strengthened -> positive USD return.
      R_USD = ((p0 - p_close) / p0) * 10000.
    """
    if p0 <= 0:
        return 0.0
    if quote_currency_is_usd:
        return ((p0 - p_close) / p0) * 10000.0
    return ((p_close - p0) / p0) * 10000.0


def classify_bucket(z: float) -> str:
    """Classifies a z-score into one of 5 standard econometric buckets."""
    if z < -2.0:
        return "1_strong_neg"
    if z < -1.0:
        return "2_mod_neg"
    if z <= 1.0:
        return "3_in_line"
    if z <= 2.0:
        return "4_mod_pos"
    return "5_strong_pos"


BUCKET_LABELS = {
    "1_strong_neg": "1. Strong Neg (Z < -2.0)",
    "2_mod_neg": "2. Mod Neg (-2.0 <= Z < -1.0)",
    "3_in_line": "3. In-Line (-1.0 <= Z <= +1.0)",
    "4_mod_pos": "4. Mod Pos (+1.0 < Z <= +2.0)",
    "5_strong_pos": "5. Strong Pos (Z > +2.0)",
}


def compute_bucket_metrics(records: Sequence[Mapping[str, Any]], z_key: str, ret_key: str = "ret_imm") -> Dict[str, Any]:
    """Computes bucket distribution, mean/median return, and hit rates for a model."""
    grouped: Dict[str, List[float]] = {k: [] for k in BUCKET_LABELS}
    for r in records:
        z = float(r[z_key])
        ret = float(r[ret_key])
        b_key = classify_bucket(z)
        grouped[b_key].append(ret)

    results: Dict[str, Any] = {}
    for b_key, label in BUCKET_LABELS.items():
        rets = grouped[b_key]
        n = len(rets)
        if n > 0:
            m_ret = mean(rets)
            med_ret = median(rets)
            pos_count = sum(1 for x in rets if x > 0)
            neg_count = sum(1 for x in rets if x < 0)
            pos_pct = pos_count / n
            neg_pct = neg_count / n
        else:
            m_ret = 0.0
            med_ret = 0.0
            pos_pct = 0.0
            neg_pct = 0.0

        results[b_key] = {
            "label": label,
            "count": n,
            "mean_usd_bps": round(m_ret, 2),
            "median_usd_bps": round(med_ret, 2),
            "pos_pct": round(pos_pct * 100, 1),
            "neg_pct": round(neg_pct * 100, 1),
        }
    return results


def run_market_response_analysis(
    observations_path: Path,
    bar_map: Mapping[Tuple[dt.date, int], Mapping[str, float]],
    test_years: Sequence[int] = (2019, 2020, 2021, 2022, 2023, 2024, 2025),
    min_observations: int = 15,
) -> Dict[str, Any]:
    """Runs walk-forward expanding window market response validation against price bars."""
    with observations_path.open("r", encoding="utf-8") as f:
        all_rows = list(csv.DictReader(f))

    matched_records: List[Dict[str, Any]] = []

    for year in test_years:
        hist_rows = [r for r in all_rows if dt.date.fromisoformat(r["date"]).year < year]
        if not hist_rows:
            continue

        sigmas_mad = fit_surprise_sigmas(hist_rows, min_observations=min_observations, method="mad")
        sigmas_std = fit_surprise_sigmas(hist_rows, min_observations=min_observations, method="std")

        test_rows = [r for r in all_rows if dt.date.fromisoformat(r["date"]).year == year]
        for row in test_rows:
            kind = str(row.get("indicator_type", "")).lower()
            if kind not in sigmas_mad or kind not in sigmas_std:
                continue

            try:
                act = float(row["actual"])
                fc = float(row["forecast"])
            except (KeyError, TypeError, ValueError):
                continue

            direction = INDICATOR_DIRECTIONS.get(kind, 1.0)
            z_mad = ((act - fc) * direction) / sigmas_mad[kind]
            z_std = ((act - fc) * direction) / sigmas_std[kind]

            edate, ehour = resolve_event_datetime(row)
            b0 = bar_map.get((edate, ehour))
            if not b0:
                continue

            p0 = b0["open"]
            # Immediate return (+30m to +1h)
            p_imm = b0["close"]
            ret_imm = calculate_usd_returns(p0, p_imm)

            # 1-Hour return (candle at ehour + 1)
            b_next = bar_map.get((edate, ehour + 1))
            p_1h = b_next["close"] if b_next else p_imm
            ret_1h = calculate_usd_returns(p0, p_1h)

            # 4-Hour return (candle at ehour + 4)
            b_4h = bar_map.get((edate, ehour + 4))
            p_4h = b_4h["close"] if b_4h else p_1h
            ret_4h = calculate_usd_returns(p0, p_4h)

            matched_records.append(
                {
                    "year": year,
                    "date": edate.isoformat(),
                    "broker_hour": ehour,
                    "indicator": kind,
                    "event": row.get("event", ""),
                    "actual": act,
                    "forecast": fc,
                    "z_mad": z_mad,
                    "z_std": z_std,
                    "p0": p0,
                    "ret_imm": ret_imm,
                    "ret_1h": ret_1h,
                    "ret_4h": ret_4h,
                }
            )

    total_n = len(matched_records)
    if total_n == 0:
        return {"error": "No matching price bars found for observations"}

    z_mads = [r["z_mad"] for r in matched_records]
    z_stds = [r["z_std"] for r in matched_records]
    r_imms = [r["ret_imm"] for r in matched_records]
    r_1hs = [r["ret_1h"] for r in matched_records]
    r_4hs = [r["ret_4h"] for r in matched_records]

    # Rank Information Coefficients
    ic_mad_imm = spearman_rank_ic(z_mads, r_imms)
    ic_std_imm = spearman_rank_ic(z_stds, r_imms)
    ic_mad_1h = spearman_rank_ic(z_mads, r_1hs)
    ic_std_1h = spearman_rank_ic(z_stds, r_1hs)
    ic_mad_4h = spearman_rank_ic(z_mads, r_4hs)
    ic_std_4h = spearman_rank_ic(z_stds, r_4hs)

    # Directional Hit Rate (|Z| >= 1.0)
    hits_mad_1 = [r for r in matched_records if abs(r["z_mad"]) >= 1.0]
    hits_std_1 = [r for r in matched_records if abs(r["z_std"]) >= 1.0]

    def calc_hit_rate(hits: List[Dict[str, Any]], z_key: str, ret_key: str) -> float:
        if not hits:
            return 0.0
        wins = sum(1 for r in hits if (r[z_key] > 0 and r[ret_key] > 0) or (r[z_key] < 0 and r[ret_key] < 0))
        return wins / len(hits)

    hr_mad_1_imm = calc_hit_rate(hits_mad_1, "z_mad", "ret_imm")
    hr_std_1_imm = calc_hit_rate(hits_std_1, "z_std", "ret_imm")
    hr_mad_1_1h = calc_hit_rate(hits_mad_1, "z_mad", "ret_1h")
    hr_std_1_1h = calc_hit_rate(hits_std_1, "z_std", "ret_1h")

    # Directional Hit Rate (|Z| >= 2.0)
    hits_mad_2 = [r for r in matched_records if abs(r["z_mad"]) >= 2.0]
    hits_std_2 = [r for r in matched_records if abs(r["z_std"]) >= 2.0]
    hr_mad_2_imm = calc_hit_rate(hits_mad_2, "z_mad", "ret_imm")
    hr_std_2_imm = calc_hit_rate(hits_std_2, "z_std", "ret_imm")

    # Buckets
    buckets_mad = compute_bucket_metrics(matched_records, "z_mad", "ret_imm")
    buckets_std = compute_bucket_metrics(matched_records, "z_std", "ret_imm")

    # By indicator breakdown
    by_ind: Dict[str, Dict[str, Any]] = {}
    unique_inds = sorted({r["indicator"] for r in matched_records})
    for ind in unique_inds:
        sub = [r for r in matched_records if r["indicator"] == ind]
        zm = [r["z_mad"] for r in sub]
        zs = [r["z_std"] for r in sub]
        ri = [r["ret_imm"] for r in sub]
        sub_mad_1 = [r for r in sub if abs(r["z_mad"]) >= 1.0]
        sub_std_1 = [r for r in sub if abs(r["z_std"]) >= 1.0]
        by_ind[ind] = {
            "sample_count": len(sub),
            "spearman_ic_mad": round(spearman_rank_ic(zm, ri), 4),
            "spearman_ic_std": round(spearman_rank_ic(zs, ri), 4),
            "mad_signals_ge_1": len(sub_mad_1),
            "mad_hit_rate_ge_1": round(calc_hit_rate(sub_mad_1, "z_mad", "ret_imm") * 100, 1),
            "std_signals_ge_1": len(sub_std_1),
            "std_hit_rate_ge_1": round(calc_hit_rate(sub_std_1, "z_std", "ret_imm") * 100, 1),
        }

    return {
        "metadata": {
            "evaluation_time_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
            "symbol": "EURUSD",
            "total_matched_events": total_n,
            "tested_years": list(test_years),
        },
        "spearman_rank_ic": {
            "immediate_30m_1h": {
                "mad": round(ic_mad_imm, 4),
                "std": round(ic_std_imm, 4),
                "delta_ic_mad_std": round(ic_mad_imm - ic_std_imm, 4),
            },
            "one_hour": {
                "mad": round(ic_mad_1h, 4),
                "std": round(ic_std_1h, 4),
                "delta_ic_mad_std": round(ic_mad_1h - ic_std_1h, 4),
            },
            "four_hour": {
                "mad": round(ic_mad_4h, 4),
                "std": round(ic_std_4h, 4),
                "delta_ic_mad_std": round(ic_mad_4h - ic_std_4h, 4),
            },
        },
        "directional_hit_rate": {
            "moderate_signals_abs_z_ge_1": {
                "mad": {
                    "count": len(hits_mad_1),
                    "immediate_hit_rate_pct": round(hr_mad_1_imm * 100, 1),
                    "one_hour_hit_rate_pct": round(hr_mad_1_1h * 100, 1),
                },
                "std": {
                    "count": len(hits_std_1),
                    "immediate_hit_rate_pct": round(hr_std_1_imm * 100, 1),
                    "one_hour_hit_rate_pct": round(hr_std_1_1h * 100, 1),
                },
            },
            "extreme_signals_abs_z_ge_2": {
                "mad": {
                    "count": len(hits_mad_2),
                    "immediate_hit_rate_pct": round(hr_mad_2_imm * 100, 1),
                },
                "std": {
                    "count": len(hits_std_2),
                    "immediate_hit_rate_pct": round(hr_std_2_imm * 100, 1),
                },
            },
        },
        "bucket_analysis": {
            "mad": buckets_mad,
            "std": buckets_std,
        },
        "by_indicator": by_ind,
    }


def print_summary_table(report: Mapping[str, Any]) -> None:
    """Prints a clear, publication-quality console summary of the market validation."""
    meta = report.get("metadata", {})
    ic = report.get("spearman_rank_ic", {})
    hr = report.get("directional_hit_rate", {})
    buckets = report.get("bucket_analysis", {})
    by_ind = report.get("by_indicator", {})

    print("\n" + "=" * 90)
    print(f"PIYASA REAKSIYONU VE EKONOMIK BILGI DEGERI VALIDASYONU (EUR/USD, N={meta.get('total_matched_events')})")
    print("=" * 90)

    print("\n1. SPEARMAN RANK INFORMATION COEFFICIENT (IC):")
    print(f"{'Vade (Horizon)':<25} {'MAD Rank IC':>15} {'STD Rank IC':>15} {'Delta (MAD - STD)':>18}")
    print("-" * 75)
    for horizon, label in [
        ("immediate_30m_1h", "Immediate (+30m/+1h)"),
        ("one_hour", "1-Hour (+1.5h)"),
        ("four_hour", "4-Hour (+4.0h)"),
    ]:
        data = ic.get(horizon, {})
        print(
            f"{label:<25} {data.get('mad', 0.0):>+15.4f} {data.get('std', 0.0):>+15.4f} {data.get('delta_ic_mad_std', 0.0):>+18.4f}"
        )

    print("\n2. YONSEL ISABET ORANI (DIRECTIONAL HIT RATE):")
    ge1 = hr.get("moderate_signals_abs_z_ge_1", {})
    m_ge1 = ge1.get("mad", {})
    s_ge1 = ge1.get("std", {})
    ge2 = hr.get("extreme_signals_abs_z_ge_2", {})
    m_ge2 = ge2.get("mad", {})
    s_ge2 = ge2.get("std", {})

    print(f"{'Sinyal Esigi':<25} {'MAD Sinyal Sayisi':>18} {'MAD Isabet %':>14} {'STD Sinyal Sayisi':>18} {'STD Isabet %':>14}")
    print("-" * 90)
    print(f"{'|Z| >= 1.0 (Orta Sok)':<25} {m_ge1.get('count', 0):>18} {m_ge1.get('immediate_hit_rate_pct', 0.0):>13.1f}% {s_ge1.get('count', 0):>18} {s_ge1.get('immediate_hit_rate_pct', 0.0):>13.1f}%")
    print(f"{'|Z| >= 2.0 (Ekstrem Sok)':<25} {m_ge2.get('count', 0):>18} {m_ge2.get('immediate_hit_rate_pct', 0.0):>13.1f}% {s_ge2.get('count', 0):>18} {s_ge2.get('immediate_hit_rate_pct', 0.0):>13.1f}%")

    print("\n3. 5-BUCKET MONOTONISI (MAD vs. STD Karsilastirmasi):")
    print(f"{'Bucket':<32} {'N (MAD)':>8} {'MAD Ort USD bps':>16} {'MAD Pos%':>10} | {'N (STD)':>8} {'STD Ort USD bps':>16} {'STD Pos%':>10}")
    print("-" * 105)
    b_mad = buckets.get("mad", {})
    b_std = buckets.get("std", {})
    for k in BUCKET_LABELS:
        bm = b_mad.get(k, {})
        bs = b_std.get(k, {})
        print(
            f"{bm.get('label', k):<32} {bm.get('count', 0):>8} {bm.get('mean_usd_bps', 0.0):>+15.2f}b {bm.get('pos_pct', 0.0):>9.1f}% | "
            f"{bs.get('count', 0):>8} {bs.get('mean_usd_bps', 0.0):>+15.2f}b {bs.get('pos_pct', 0.0):>9.1f}%"
        )

    print("\n4. GOSTERGE BAZLI DETAY (BY-INDICATOR PERFORMANCE):")
    print(f"{'Gosterge':<15} {'N':>5} {'MAD IC':>10} {'STD IC':>10} {'MAD |Z|>=1 N':>14} {'MAD Isabet %':>14} {'STD |Z|>=1 N':>14} {'STD Isabet %':>14}")
    print("-" * 90)
    for ind, d in sorted(by_ind.items()):
        print(
            f"{ind:<15} {d.get('sample_count', 0):>5} {d.get('spearman_ic_mad', 0.0):>+10.4f} {d.get('spearman_ic_std', 0.0):>+10.4f} "
            f"{d.get('mad_signals_ge_1', 0):>14} {d.get('mad_hit_rate_ge_1', 0.0):>13.1f}% "
            f"{d.get('std_signals_ge_1', 0):>14} {d.get('std_hit_rate_ge_1', 0.0):>13.1f}%"
        )
    print("=" * 90 + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="Piyasa Reaksiyonu & Ekonomik Bilgi Degeri Dogrulama Motoru")
    parser.add_argument(
        "--observations",
        type=Path,
        default=Path(__file__).with_name("surprise_observations.csv"),
        help="Path to point-in-time surprise observations CSV",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).with_name("market_response_validation.json"),
        help="Path to save validation output JSON",
    )
    args = parser.parse_args()

    print("[*] MetaTrader 5 uzerinden EUR/USD saatlik fiyat barlari cekiliyor...")
    bar_map = fetch_mt5_bars("EURUSD", count=50000)
    if not bar_map:
        print("[!] MetaTrader 5 barlari cekilemedi. Terminalin acik oldugundan emin olun.")
        return

    print(f"[+] {len(bar_map)} bar basariyla indekslendi. OOS piyasa validasyonu yurutuluyor...")
    report = run_market_response_analysis(args.observations, bar_map)

    with args.output.open("w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    print(f"[+] Sonuclar kaydedildi: {args.output}")

    print_summary_table(report)


if __name__ == "__main__":
    main()
