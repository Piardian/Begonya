from __future__ import annotations

import datetime as dt
import json
import urllib.parse
import urllib.request
from typing import Any, Dict, Optional

from data_quality import DataUnavailableError


class BankOfCanadaDataIngestion:
    """Official Bank of Canada policy-rate ingestion via the Valet API."""

    SERIES_CODE = "V39079"
    ENDPOINT = "https://www.bankofcanada.ca/valet/observations"

    def __init__(self, timeout: int = 8):
        self.timeout = timeout

    @staticmethod
    def _extract_rows(payload: Any) -> list[tuple[dt.date, float]]:
        observations = payload.get("observations", []) if isinstance(payload, dict) else []
        rows: list[tuple[dt.date, float]] = []
        for item in observations:
            if not isinstance(item, dict):
                continue
            raw_date = item.get("d") or item.get("date")
            series = item.get(BankOfCanadaDataIngestion.SERIES_CODE, {})
            raw_value = (
                series.get("v")
                if isinstance(series, dict)
                else series
            )
            try:
                date = dt.date.fromisoformat(str(raw_date))
                value = float(raw_value)
            except (TypeError, ValueError):
                continue
            rows.append((date, value))
        return rows

    def fetch_policy_rate(
        self,
        as_of: Optional[dt.datetime] = None,
    ) -> Dict[str, Any]:
        as_of = as_of or dt.datetime.now(dt.timezone.utc)
        if as_of.tzinfo is None:
            as_of = as_of.replace(tzinfo=dt.timezone.utc)
        as_of = as_of.astimezone(dt.timezone.utc)

        params = {
            "start_date": "2000-01-01",
            "end_date": as_of.date().isoformat(),
        }
        url = (
            f"{self.ENDPOINT}/{self.SERIES_CODE}/json?"
            + urllib.parse.urlencode(params)
        )
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "BegonyaMacroEngine/1.0"},
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
        except Exception as exc:
            raise DataUnavailableError(
                f"Bank of Canada policy-rate request failed: {exc}"
            ) from None

        rows = self._extract_rows(payload)
        completed = [row for row in rows if row[0] < as_of.date()]
        if not completed:
            raise DataUnavailableError(
                f"No Bank of Canada policy-rate observation before {as_of.date().isoformat()}"
            )

        observation_date, value = completed[-1]
        previous_rows = [row for row in completed if row[0] < observation_date]
        previous_value = previous_rows[-1][1] if previous_rows else value

        return {
            "value": round(value, 4),
            "previous_value": round(previous_value, 4),
            "change_pp": round(value - previous_value, 4),
            "observation_date": observation_date.isoformat(),
            "source": "Bank of Canada official Target for the overnight rate (V39079)",
            "pit_rule": "latest daily observation strictly before replay calendar day",
            "status": "AVAILABLE",
        }
