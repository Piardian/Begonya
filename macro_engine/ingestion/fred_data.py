from __future__ import annotations

import datetime as dt
import json
import logging
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional, Tuple

from config import FRED_API_KEY
from data_quality import DataUnavailableError, REQUIRED_FRED_FIELDS

logger = logging.getLogger("FredDataIngestion")


class FredDataIngestion:
    """Fetch current and prior observations from FRED; never synthesize missing data."""

    # Logical name -> actual FRED series ID.
    FRED_SERIES = {
        "WALCL": "WALCL",
        "RRPONTSYD": "RRPONTSYD",
        "WTREGEN": "WTREGEN",
        "T10YIE": "T10YIE",
        "DFII10": "DFII10",
        "BAMLH0A0HYM2": "BAMLH0A0HYM2",
        "NFCI": "NFCI",
        "ICSA": "ICSA",
        "M2SL": "M2SL",
        # OECD Germany 10Y government bond yield, monthly, via FRED.
        "DE10Y": "IRLTLT01DEM156N",
    }

    def __init__(self, api_key: str = FRED_API_KEY, timeout: int = 8):
        self.api_key = api_key
        self.timeout = timeout

    def _get_observations(
        self, series_id: str, start: dt.date, end: dt.date
    ) -> List[Tuple[dt.date, float]]:
        if not self.api_key:
            raise DataUnavailableError("FRED_API_KEY is not configured")

        params = {
            "series_id": series_id,
            "api_key": self.api_key,
            "file_type": "json",
            "observation_start": start.isoformat(),
            "observation_end": end.isoformat(),
            "sort_order": "asc",
            "limit": 1000,
        }
        url = (
            "https://api.stlouisfed.org/fred/series/observations?"
            + urllib.parse.urlencode(params)
        )
        req = urllib.request.Request(
            url, headers={"User-Agent": "BegonyaMacroEngine/1.0"}
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                body = json.loads(resp.read().decode("utf-8"))
        except Exception as exc:
            raise DataUnavailableError(
                f"FRED request failed for {series_id}: {exc}"
            ) from exc

        rows: List[Tuple[dt.date, float]] = []
        for obs in body.get("observations", []):
            raw_value = obs.get("value")
            if raw_value in (None, "") or raw_value == ".":
                continue
            try:
                value = float(raw_value)
                date = dt.date.fromisoformat(obs["date"])
            except (KeyError, TypeError, ValueError):
                continue
            rows.append((date, value))

        if not rows:
            raise DataUnavailableError(
                f"FRED returned no numeric observations for {series_id}"
            )
        return rows

    def _current_and_4w(
        self, series_id: str, as_of: dt.date
    ) -> Tuple[float, float, dt.date, dt.date]:
        target = as_of - dt.timedelta(days=28)
        rows = self._get_observations(
            series_id,
            target - dt.timedelta(days=90),
            as_of,
        )
        rows_sorted = sorted(rows, key=lambda x: x[0])
        current_date, current = rows_sorted[-1]

        prior = [(date, value) for date, value in rows_sorted if date <= target]
        if not prior:
            raise DataUnavailableError(
                f"No usable 4-week historical observation for {series_id} "
                f"before {target.isoformat()}"
            )
        prior_date, prior_value = prior[-1]
        return current, prior_value, current_date, prior_date

    def fetch_liquidity_metrics(
        self, as_of: Optional[dt.date] = None
    ) -> Dict[str, Any]:
        as_of = as_of or dt.date.today()
        results: Dict[str, Any] = {}
        observation_dates: Dict[str, str] = {}
        prior_dates: Dict[str, str] = {}

        for logical_name, series_id in self.FRED_SERIES.items():
            current, prior, current_date, prior_date = self._current_and_4w(
                series_id, as_of
            )
            results[logical_name] = current
            results[f"{logical_name}_4W_AGO"] = prior
            observation_dates[logical_name] = current_date.isoformat()
            prior_dates[logical_name] = prior_date.isoformat()

        missing = REQUIRED_FRED_FIELDS - set(results)
        if missing:
            raise DataUnavailableError(
                "Missing FRED fields: " + ", ".join(sorted(missing))
            )

        if "M2SL" in results:
            results["M2SL_SOURCE_DATE"] = observation_dates["M2SL"]

        results["data_quality"] = {
            "provider": "FRED",
            "fallback_used": False,
            "as_of": as_of.isoformat(),
            "observation_dates": observation_dates,
            "prior_4w_dates": prior_dates,
        }
        logger.info(
            "[FRED] current and historical observations loaded; synthetic baselines disabled"
        )
        return results
