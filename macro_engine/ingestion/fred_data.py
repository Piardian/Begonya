from __future__ import annotations

import datetime as dt
import json
import logging
import re
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional, Tuple

from config import FRED_API_KEY
from data_quality import (
    DataUnavailableError,
    REQUIRED_ECONOMIC_FRED_FIELDS,
    REQUIRED_FRED_FIELDS,
)

logger = logging.getLogger("FredDataIngestion")


def _mask_api_key(text: str, key: Optional[str] = None) -> str:
    if not text:
        return text
    clean = str(text)
    if key and len(key) >= 6:
        clean = clean.replace(key, "REDACTED_FRED_KEY")
    clean = re.sub(r"api_key=[a-zA-Z0-9_-]+", "api_key=REDACTED", clean)
    return clean


class FredDataIngestion:
    """Fetch FRED observations using an explicit real-time vintage when replaying."""

    BASE_FRED_SERIES = {
        "WALCL": "WALCL",
        "RRPONTSYD": "RRPONTSYD",
        "WTREGEN": "WTREGEN",
        "T10YIE": "T10YIE",
        "DFII10": "DFII10",
        "DFF": "DFF",
        "SOFR": "SOFR",
        "BAMLH0A0HYM2": "BAMLH0A0HYM2",
        "NFCI": "NFCI",
        "ICSA": "ICSA",
        "M2SL": "M2SL",
        # OECD Germany 10Y government bond yield, monthly, via FRED.
        "DE10Y": "IRLTLT01DEM156N",
        "ECBDFR": "ECBDFR",
        "SONIA": "IUDSOIA",
        # OECD Main Economic Indicators: current monthly local short-rate market proxies.
        "CA3M_INTERBANK": "IR3TIB01CAM156N",
        "AU3M_INTERBANK": "IR3TIB01AUM156N",
        "NZ3M_INTERBANK": "IR3TIB01NZM156N",
        "JP3M_INTERBANK": "IR3TIB01JPM156N",
        "CH3M_INTERBANK": "IR3TIB01CHM156N",
    }

    ECONOMIC_FRED_SERIES = {
        # Inflation: year-over-year rates from price-index series.
        "CPI_YOY": "CPIAUCSL",
        "CORE_CPI_YOY": "CPILFESL",
        "PCE_YOY": "PCEPI",
        "CORE_PCE_YOY": "PCEPILFE",
        # Labor market.
        "PAYEMS": "PAYEMS",
        "UNRATE": "UNRATE",
        "AHE_YOY": "CES0500000003",
        # Growth/activity.
        "GDP_QOQ_SAAR": "A191RL1Q225SBEA",
        "INDPRO": "INDPRO",
        "RSAFS": "RSAFS",
        # Real retail sales, used for real consumption/growth diagnostics.
        "RRSFS": "RRSFS",
        # Treasury curve.
        "DGS3MO": "DGS3MO",
        "DGS2": "DGS2",
        "DGS5": "DGS5",
        "DGS10": "DGS10",
        "DGS30": "DGS30",
        "T10Y2Y": "T10Y2Y",
        "T10Y3M": "T10Y3M",
        # ISM diffusion measures. Services uses Business Activity Index, not a synthetic headline.
        "ISM_MANUFACTURING_PMI": "NAPM",
        "ISM_SERVICES_ACTIVITY": "NMFBAI",
    }

    # FRED's pc1 transform returns percent change from one year ago.
    FRED_UNITS = {
        "CPI_YOY": "pc1",
        "CORE_CPI_YOY": "pc1",
        "PCE_YOY": "pc1",
        "CORE_PCE_YOY": "pc1",
        "AHE_YOY": "pc1",
    }

    FRED_SERIES = {**BASE_FRED_SERIES, **ECONOMIC_FRED_SERIES}

    def __init__(self, api_key: str = FRED_API_KEY, timeout: int = 8):
        self.api_key = api_key
        self.timeout = timeout

    def _get_observations(
        self,
        series_id: str,
        start: dt.date,
        end: dt.date,
        realtime_end: Optional[dt.date] = None,
        units: Optional[str] = None,
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
        if realtime_end is not None:
            params["realtime_start"] = realtime_end.isoformat()
            params["realtime_end"] = realtime_end.isoformat()
        if units is not None:
            params["units"] = units

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
            masked_msg = _mask_api_key(str(exc), self.api_key)
            raise DataUnavailableError(
                f"FRED request failed for {series_id}: {masked_msg}"
            ) from None

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
        self,
        series_id: str,
        as_of: dt.date,
        units: Optional[str] = None,
    ) -> Tuple[float, float, dt.date, dt.date]:
        target = as_of - dt.timedelta(days=28)
        rows = self._get_observations(
            series_id,
            target - dt.timedelta(days=90),
            as_of,
            realtime_end=as_of,
            units=units,
        )
        rows_sorted = sorted(rows, key=lambda x: x[0])
        current_candidates = [row for row in rows_sorted if row[0] <= as_of]
        if not current_candidates:
            raise DataUnavailableError(f"No observation on or before {as_of.isoformat()} for {series_id}")
        current_date, current = current_candidates[-1]

        prior = [row for row in rows_sorted if row[0] <= target]
        if not prior:
            raise DataUnavailableError(
                f"No usable 4-week historical observation for {series_id} "
                f"before {target.isoformat()}"
            )
        prior_date, prior_value = prior[-1]
        if series_id == "ICSA":
            current = round(current / 1000.0, 1)
            prior_value = round(prior_value / 1000.0, 1)
        return current, prior_value, current_date, prior_date

    def fetch_liquidity_metrics(
        self, as_of: Optional[dt.date] = None
    ) -> Dict[str, Any]:
        as_of = as_of or dt.date.today()
        if not self.api_key:
            raise DataUnavailableError(
                "FRED_API_KEY is not configured; real FRED observations are required."
            )

        results: Dict[str, Any] = {}
        observation_dates: Dict[str, str] = {}
        prior_dates: Dict[str, str] = {}
        economic_observation_dates: Dict[str, str] = {}
        economic_prior_dates: Dict[str, str] = {}

        for logical_name, series_id in self.BASE_FRED_SERIES.items():
            current, prior, current_date, prior_date = self._current_and_4w(
                series_id, as_of
            )
            results[logical_name] = current
            results[f"{logical_name}_4W_AGO"] = prior
            observation_dates[logical_name] = current_date.isoformat()
            prior_dates[logical_name] = prior_date.isoformat()

        for logical_name, series_id in self.ECONOMIC_FRED_SERIES.items():
            if series_id in ("NAPM", "NMFBAI"):
                # ISM discontinued public redistribution on FRED.
                # Explicitly record as None / unavailable; never fabricate fake proxy values or dates.
                results[logical_name] = None
                results[f"{logical_name}_4W_AGO"] = None
                economic_observation_dates[logical_name] = "UNAVAILABLE"
                economic_prior_dates[logical_name] = "UNAVAILABLE"
                continue

            current, prior, current_date, prior_date = self._current_and_4w(
                series_id,
                as_of,
                units=self.FRED_UNITS.get(logical_name),
            )
            results[logical_name] = current
            results[f"{logical_name}_4W_AGO"] = prior
            economic_observation_dates[logical_name] = current_date.isoformat()
            economic_prior_dates[logical_name] = prior_date.isoformat()

        # Synchronized 5-day Treasury history used for curve dynamics.
        for logical_name in ("DGS2", "DGS10"):
            rows = self._get_observations(
                logical_name,
                as_of - dt.timedelta(days=20),
                as_of,
                realtime_end=as_of,
            )
            eligible = sorted([row for row in rows if row[0] <= as_of], key=lambda x: x[0])
            prior_5d = [row for row in eligible if row[0] <= as_of - dt.timedelta(days=5)]
            if prior_5d:
                results[f"{logical_name}_5D_AGO"] = prior_5d[-1][1]
                economic_observation_dates[f"{logical_name}_5D_AGO"] = prior_5d[-1][0].isoformat()

        missing = (REQUIRED_FRED_FIELDS | REQUIRED_ECONOMIC_FRED_FIELDS) - set(results)
        if missing:
            raise DataUnavailableError(
                "Missing FRED fields: " + ", ".join(sorted(missing))
            )

        results["M2SL_SOURCE_DATE"] = observation_dates["M2SL"]
        results["data_quality"] = {
            "provider": "FRED",
            "fallback_used": False,
            "ism_status": "UNAVAILABLE",
            "as_of": as_of.isoformat(),
            "vintage_end": as_of.isoformat(),
            "observation_dates": observation_dates,
            "prior_4w_dates": prior_dates,
            "economic_observation_dates": economic_observation_dates,
            "economic_prior_4w_dates": economic_prior_dates,
            "economic_transformations": {
                **{key: f"FRED {units} transform from {series_id}" for key, series_id in self.ECONOMIC_FRED_SERIES.items() if (units := self.FRED_UNITS.get(key))},
                "ISM_MANUFACTURING_PMI": "UNAVAILABLE (publisher discontinued public series NAPM on FRED; no synthetic data substituted)",
                "ISM_SERVICES_ACTIVITY": "UNAVAILABLE (publisher discontinued public series NMFBAI on FRED; no synthetic data substituted)",
                "SOFR": "direct New York Fed SOFR observation via FRED",
            },
        }
        logger.info(
            "[FRED] base+economic observations loaded at vintage=%s; synthetic baselines disabled",
            as_of.isoformat(),
        )
        return results
