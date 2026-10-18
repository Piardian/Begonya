"""
Begonya Ultimate Validation - Session Liquidity & Capped R-Target Module
========================================================================
Implements fixed R-multiples (2R, 3R, 4R, 5R) and Intraday Session Liquidity targets.
Strict chronological and no-lookahead guarantee.

Path: Begonya/research/ultimate_validation/session_targets.py
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional, Tuple


@dataclass
class Candle:
    timestamp: int
    open: float
    high: float
    low: float
    close: float
    volume: float = 0.0


def compute_fixed_r_target(
    entry_price: float,
    stop_price: float,
    direction: str,
    target_r_multiplier: float
) -> float:
    """
    Computes a fixed R-multiple target.
    """
    risk = abs(entry_price - stop_price)
    if direction.lower() == 'long':
        return entry_price + (risk * target_r_multiplier)
    else:
        return entry_price - (risk * target_r_multiplier)


def detect_intraday_session_liquidity_target(
    entry_price: float,
    stop_price: float,
    direction: str,
    signal_timestamp: int,
    recent_m1_candles: List[Candle],
    min_r: float = 1.5,
    max_r: float = 5.0
) -> Tuple[float, str]:
    """
    Detects session liquidity target from the active/previous session before signal_timestamp.
    Asia: 00:00 - 07:00 UTC
    London: 07:00 - 13:00 UTC
    New York: 13:00 - 21:00 UTC
    """
    risk = abs(entry_price - stop_price)
    sig_dt = datetime.fromtimestamp(signal_timestamp / 1000.0, timezone.utc)
    sig_hour = sig_dt.hour

    if 7 <= sig_hour < 13:
        active_session = 'LONDON'
    elif 13 <= sig_hour < 21:
        active_session = 'NEW_YORK'
    else:
        active_session = 'ASIA'

    # Filter candles strictly before signal timestamp within the last 12 hours (720 bars)
    valid_bars = [c for c in recent_m1_candles if c.timestamp < signal_timestamp][-720:]

    if not valid_bars:
        # Fallback to 3R default
        default_target = compute_fixed_r_target(entry_price, stop_price, direction, 3.0)
        return (default_target, 'FALLBACK_FIXED_3R_NO_SESSION_BARS')

    if direction.lower() == 'long':
        session_high = max(c.high for c in valid_bars)
        reward = session_high - entry_price
        r_mult = reward / risk if risk > 0 else 0.0

        if r_mult < min_r:
            # Session high too close; default to 2R
            return (compute_fixed_r_target(entry_price, stop_price, direction, 2.0), f'{active_session}_EXPANDED_2R')
        elif r_mult > max_r:
            # Session high too distant; cap at max_r
            return (compute_fixed_r_target(entry_price, stop_price, direction, max_r), f'{active_session}_CAPPED_{max_r}R')
        else:
            return (session_high, f'{active_session}_HIGH_LIQUIDITY_{r_mult:.1f}R')
    else:
        session_low = min(c.low for c in valid_bars)
        reward = entry_price - session_low
        r_mult = reward / risk if risk > 0 else 0.0

        if r_mult < min_r:
            return (compute_fixed_r_target(entry_price, stop_price, direction, 2.0), f'{active_session}_EXPANDED_2R')
        elif r_mult > max_r:
            return (compute_fixed_r_target(entry_price, stop_price, direction, max_r), f'{active_session}_CAPPED_{max_r}R')
        else:
            return (session_low, f'{active_session}_LOW_LIQUIDITY_{r_mult:.1f}R')
