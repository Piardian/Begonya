"""
Begonya Ultimate Validation - HTF Macro Gate Module
===================================================
Evaluates 4H and 1H market structure strictly prior to signal_known_timestamp.
Strict no-lookahead guarantee: only closed 4H bars are processed.

Path: Begonya/research/ultimate_validation/macro_gate.py
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Dict, Any, Optional


@dataclass
class Candle:
    timestamp: int
    open: float
    high: float
    low: float
    close: float
    volume: float = 0.0


def compute_ema(values: List[float], period: int) -> List[float]:
    if len(values) < period:
        return [values[-1]] if values else [0.0]
    multiplier = 2.0 / (period + 1)
    ema = [sum(values[:period]) / period]
    for price in values[period:]:
        ema.append((price - ema[-1]) * multiplier + ema[-1])
    return ema


def evaluate_htf_macro_bias(
    four_hour_candles: List[Candle],
    cutoff_timestamp: int
) -> Dict[str, Any]:
    """
    Evaluates higher timeframe trend strictly using 4H candles closed before cutoff_timestamp.
    A 4H candle starting at ts closes at ts + 4*3600*1000.
    """
    # Filter 4H candles fully closed prior to signal cutoff
    valid_candles = [c for c in four_hour_candles if (c.timestamp + 4 * 3600 * 1000) <= cutoff_timestamp]
    if len(valid_candles) < 10:
        return {
            'bias': 'NEUTRAL_RANGE',
            'rationale': f'Insufficient closed 4H candles before cutoff ({len(valid_candles)} < 10)',
            'permitted_direction': 'BOTH'
        }

    closes = [c.close for c in valid_candles]
    p_fast = 20 if len(closes) >= 20 else max(3, len(closes) // 2)
    p_slow = 50 if len(closes) >= 50 else len(closes)

    ema_fast = compute_ema(closes, p_fast)[-1]
    ema_slow = compute_ema(closes, p_slow)[-1]

    last_close = closes[-1]

    # Market structure: Swing detection on 4H
    swings = []
    for i in range(2, len(valid_candles) - 2):
        c = valid_candles[i]
        # Confirmed at i+2 close
        conf_ts = valid_candles[i + 2].timestamp + 4 * 3600 * 1000
        if conf_ts > cutoff_timestamp:
            continue
        if (c.high > valid_candles[i - 1].high and c.high > valid_candles[i - 2].high and
            c.high > valid_candles[i + 1].high and c.high > valid_candles[i + 2].high):
            swings.append({'type': 'high', 'price': c.high, 'ts': c.timestamp})
        if (c.low < valid_candles[i - 1].low and c.low < valid_candles[i - 2].low and
            c.low < valid_candles[i + 1].low and c.low < valid_candles[i + 2].low):
            swings.append({'type': 'low', 'price': c.low, 'ts': c.timestamp})

    # Determine trend by structural breaks and EMA alignment
    last_highs = [s for s in swings if s['type'] == 'high']
    last_lows = [s for s in swings if s['type'] == 'low']

    is_bearish = (last_close < ema_fast or ema_fast < ema_slow)
    is_bullish = (last_close > ema_fast or ema_fast > ema_slow)

    if last_highs and last_lows:
        # Check lower lows / lower highs
        if len(last_lows) >= 2 and last_lows[-1]['price'] < last_lows[-2]['price']:
            is_bearish = True
        elif len(last_highs) >= 2 and last_highs[-1]['price'] > last_highs[-2]['price']:
            is_bullish = True

    if is_bearish and not is_bullish:
        bias = 'BEARISH'
        permitted = 'SHORT_ONLY'
    elif is_bullish and not is_bearish:
        bias = 'BULLISH'
        permitted = 'LONG_ONLY'
    else:
        bias = 'NEUTRAL_RANGE'
        permitted = 'BOTH'

    return {
        'bias': bias,
        'permitted_direction': permitted,
        'last_4h_close': last_close,
        'ema_fast': ema_fast,
        'ema_slow': ema_slow,
        'closed_4h_bars_count': len(valid_candles),
        'rationale': f'4H Structure: {bias} (Close={last_close:.2f}, FastEMA={ema_fast:.2f}, SlowEMA={ema_slow:.2f})'
    }


def check_macro_gate(
    trade_direction: str,
    four_hour_candles: List[Candle],
    cutoff_timestamp: int
) -> Dict[str, Any]:
    """
    Checks if a proposed trade direction is permitted by the 4H macro trend.
    """
    bias_info = evaluate_htf_macro_bias(four_hour_candles, cutoff_timestamp)
    permitted = bias_info['permitted_direction']
    direction_upper = trade_direction.upper()

    if permitted == 'BOTH':
        return {
            'permitted': True,
            'gate_action': 'PERMITTED_NEUTRAL_REGIME',
            'bias_info': bias_info
        }
    elif (permitted == 'LONG_ONLY' and direction_upper == 'LONG') or (permitted == 'SHORT_ONLY' and direction_upper == 'SHORT'):
        return {
            'permitted': True,
            'gate_action': 'PERMITTED_TREND_ALIGNED',
            'bias_info': bias_info
        }
    else:
        return {
            'permitted': False,
            'gate_action': 'VETO_MACRO_COUNTER_TREND',
            'bias_info': bias_info
        }
