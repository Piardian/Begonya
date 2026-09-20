from __future__ import annotations

import csv
import datetime as dt
import io
import urllib.parse
import urllib.request
from typing import Any, Dict, Optional

from data_quality import DataUnavailableError


class BankOfEnglandDataIngestion:
    """Official Bank Rate ingestion from the Bank of England database."""

    SERIES_CODE = "YWMB47D"
    ENDPOINT = "https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp"

    def __init__(self, timeout: int = 8):
        self.timeout = timeout

    @staticmethod
    def _parse_date(raw: str) -> Optional[dt.date]:
        raw = str(raw).strip()
        for fmt in ("%d %b %y", "%d/%b/%Y", "%d/%m/%Y", "%Y-%m-%d"):
            try:
                return dt.datetime.strptime(raw, fmt).date()
            except ValueError:
                continue
        return None

    @classmethod
    def _parse_csv(cls, payload: str) -> list[tuple[dt.date, float]]:
        rows: list[tuple[dt.date, float]] = []
        reader = csv.reader(io.StringIO(payload))
        for row in reader:
            if len(row) < 2:
                continue
            date_value = cls._parse_date(row[0])
            if date_value is None:
                continue
            try:
                rate = float(str(row[1]).strip())
            except (TypeError, ValueError):
                continue
            rows.append((date_value, rate))
        return rows

    def fetch_bank_rate(
        self,
        as_of: Optional[dt.datetime] = None,
    ) -> Dict[str, Any]:
        """Return the latest official Bank Rate known strictly before the replay day.

        The source records rate-change dates, not intraday decision timestamps.
        Therefore an intraday replay never applies a rate change occurring later
        on the same calendar day.
        """
        as_of = as_of or dt.datetime.now(dt.timezone.utc)
        if as_of.tzinfo is None:
            as_of = as_of.replace(tzinfo=dt.timezone.utc)
        as_of = as_of.astimezone(dt.timezone.utc)

        end_date = as_of.date()
        params = {
            "csv.x": "yes",
            "Datefrom": "01/Jan/2000",
            "Dateto": end_date.strftime("%d/%b/%Y"),
            "SeriesCodes": self.SERIES_CODE,
            "CSVF": "TN",
            "UsingCodes": "Y",
            "VPD": "Y",
        }
        url = self.ENDPOINT + "?" + urllib.parse.urlencode(params)
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "BegonyaMacroEngine/1.0"},
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                body = resp.read().decode("utf-8-sig", errors="replace")
        except Exception as exc:
            raise DataUnavailableError(
                f"Bank of England Bank Rate request failed: {exc}"
            ) from None

        rows = self._parse_csv(body)
        completed = [row for row in rows if row[0] < as_of.date()]
        if not completed:
            raise DataUnavailableError(
                f"No Bank Rate observation available before {as_of.date().isoformat()}"
            )

        change_date, rate = completed[-1]
        previous_rows = [row for row in completed if row[0] < change_date]
        previous_rate = previous_rows[-1][1] if previous_rows else rate

        return {
            "value": round(rate, 4),
            "previous_value": round(previous_rate, 4),
            "change_pp": round(rate - previous_rate, 4),
            "observation_date": change_date.isoformat(),
            "source": "Bank of England official Bank Rate (YWMB47D)",
            "pit_rule": "latest rate-change date strictly before replay calendar day",
            "status": "AVAILABLE",
        }
