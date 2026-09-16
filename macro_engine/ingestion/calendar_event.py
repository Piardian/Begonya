from __future__ import annotations

import logging
from typing import Dict, Any, List, Optional
import aiohttp

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
                    return [e for e in data if e.get("impact") == "High"]
        except Exception as exc:
            logger.warning("Economic calendar unavailable: %s", exc)
            return []
