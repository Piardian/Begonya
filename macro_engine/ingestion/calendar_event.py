from __future__ import annotations

import logging
from typing import Dict, Any, List
import aiohttp

from data_quality import DataUnavailableError

logger = logging.getLogger("CalendarEventIngestion")


class CalendarEventIngestion:
    """Fetch high-impact calendar events; never inject simulated events."""

    URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json"

    async def fetch_latest_events(self) -> List[Dict[str, Any]]:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36",
            "Accept": "application/json",
        }
        try:
            async with aiohttp.ClientSession(headers=headers) as session:
                async with session.get(self.URL, timeout=8) as resp:
                    if resp.status != 200:
                        raise RuntimeError(f"HTTP {resp.status}")
                    data = await resp.json()
                    events = [e for e in data if e.get("impact") == "High"]
                    if not isinstance(events, list):
                        raise RuntimeError("Calendar payload is not a list")
                    return events
        except Exception as exc:
            logger.error("Economic calendar unavailable: %s", exc)
            raise DataUnavailableError(
                "Economic calendar unavailable; event freeze cannot be trusted."
            ) from exc
