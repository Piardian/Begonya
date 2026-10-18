"""
Begonya / ChecklistTrigger (CLT) - Isolated Hybrid Replay Engine
================================================================
Research module evaluating HTF POI signals against M1 granular price action
with strict chronological order, no-lookahead guarantees, and parametric variants.

Path: Begonya/research/hybrid_replay/hybrid_replay.py
"""

from __future__ import annotations

import os
import json
import math
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple


@dataclass
class Candle:
    timestamp: int
    open: float
    high: float
    low: float
    close: float
    volume: float = 0.0


@dataclass
class ReplayCandidate:
    candidate_id: str
    structural_opportunity_id: str
    symbol: str
    timeframe: str
    trade_direction: str  # 'long' or 'short'
    poi_type: str  # 'OB' or 'FVG'
    zone_low: float
    zone_high: float
    signal_known_at_utc: str
    signal_known_at_timestamp: int
    structural_anchor_price: Optional[float]
    structural_anchor_type: Optional[str]  # 'SWING_HIGH', 'SWING_LOW', None
    structural_anchor_timeframe: str
    target_price: Optional[float]
    target_type: Optional[str]
    target_known: bool
    raw_metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class StepRecord:
    step_name: str
    bar_index: Optional[int]
    timestamp: Optional[int]
    details: Dict[str, Any]


@dataclass
class ReplayEvaluationResult:
    candidate_id: str
    structural_opportunity_id: str
    symbol: str
    trade_direction: str
    variant_name: str  # e.g., 'BODY_40', 'BODY_50', 'BODY_60', 'LADDER'
    final_status: str  # 'ENTRY_FILLED', 'NO_ENTRY', 'INVALIDATED', 'EXPIRED', 'MANUAL_REVIEW_REQUIRED', 'INSUFFICIENT_DATA_*'
    status_reason: str
    
    # Timing & Bars
    signal_known_timestamp: int
    forward_bars_count: int
    poi_touched_bar_index: Optional[int] = None
    poi_touched_timestamp: Optional[int] = None
    htf_veto_bar_index: Optional[int] = None
    sweep_bar_index: Optional[int] = None
    sweep_extreme_price: Optional[float] = None
    choch_bar_index: Optional[int] = None
    displacement_bar_index: Optional[int] = None
    displacement_body_ratio: Optional[float] = None
    displacement_type: Optional[str] = None  # 'LARGE_BODY', 'LADDER', 'NONE'
    fvg_detected: bool = False
    fvg_bounds: Optional[Tuple[float, float]] = None
    fib_05_price: Optional[float] = None
    breaker_overlap_tag: str = 'NO_OVERLAP'  # 'PERFECT_OVERLAP', 'NO_OVERLAP', 'NOT_APPLICABLE'
    
    # Entry Details
    filled_bar_index: Optional[int] = None
    filled_timestamp: Optional[int] = None
    entry_price: Optional[float] = None
    structural_stop_price: Optional[float] = None
    risk_distance: Optional[float] = None
    
    # Target Verification
    target_price: Optional[float] = None
    target_verified: bool = False
    
    # Chronological Audit Trail
    audit_trail: List[StepRecord] = field(default_factory=list)


def get_pip_size(symbol: str) -> float:
    s = symbol.upper()
    if 'JPY' in s:
        return 0.01
    if any(c in s for c in ['BTC', 'ETH', 'SOL', 'XAU', 'USDCAD', 'USDCHF']):
        if 'XAU' in s:
            return 0.10
        if any(c in s for c in ['BTC', 'ETH', 'SOL']):
            return 0.01
    return 0.0001


def is_htf_boundary_minute(timestamp_ms: int, timeframe_minutes: int = 15) -> bool:
    """
    Clock-aligned HTF boundary check:
    Determines if an M1 candle represents the completion/close of an HTF bar (e.g., :14, :29, :44, :59 for 15M).
    """
    dt = datetime.fromtimestamp(timestamp_ms / 1000.0, tz=timezone.utc)
    # The bar closing at :15:00 started at :14:00 (if timestamp is bar open).
    # If timestamp is bar close, minute % 15 == 0.
    # Typically in MT5 / JSON store, timestamp represents bar OPEN time.
    # An open timestamp of 14:14:00 ends at 14:15:00 (boundary).
    return (dt.minute + 1) % timeframe_minutes == 0


class HybridReplayEngine:
    """
    Deterministic Replay Engine strictly processing M1 bars in chronological sequence.
    Guarantees no future bar is read during any decision step.
    """

    def __init__(
        self,
        max_wait_touch_bars: int = 1440,     # Max 24h wait for POI retest
        max_reaction_bars: int = 60,         # Max 60 M1 bars inside/after touch for 1M setup
        max_fib_fill_bars: int = 60,         # Max 60 M1 bars for 0.5 Fib limit fill
        htf_timeframe_minutes: int = 15
    ):
        self.max_wait_touch_bars = max_wait_touch_bars
        self.max_reaction_bars = max_reaction_bars
        self.max_fib_fill_bars = max_fib_fill_bars
        self.htf_timeframe_minutes = htf_timeframe_minutes

    def evaluate_candidate(
        self,
        candidate: ReplayCandidate,
        future_m1_candles: List[Candle],
        body_threshold: float = 0.50,
        enable_ladder_detection: bool = False
    ) -> ReplayEvaluationResult:
        """
        Evaluate a single candidate strictly against future M1 candles.
        """
        variant_name = (
            f"BODY_{int(body_threshold * 100)}"
            if not enable_ladder_detection
            else "LADDER_REVIEW"
        )
        
        audit: List[StepRecord] = []
        is_long = candidate.trade_direction.lower() == 'long'
        pip = get_pip_size(candidate.symbol)

        # 0. Structural Stop Check
        if candidate.structural_anchor_price is None or candidate.structural_anchor_price <= 0:
            return ReplayEvaluationResult(
                candidate_id=candidate.candidate_id,
                structural_opportunity_id=candidate.structural_opportunity_id,
                symbol=candidate.symbol,
                trade_direction=candidate.trade_direction,
                variant_name=variant_name,
                final_status='INSUFFICIENT_DATA_STRUCTURAL_STOP',
                status_reason='No verified HTF structural anchor price available in signal record',
                signal_known_timestamp=candidate.signal_known_at_timestamp,
                forward_bars_count=len(future_m1_candles),
                target_price=candidate.target_price,
                target_verified=candidate.target_known,
                audit_trail=[StepRecord('REJECTED_ANCHOR', None, None, {'reason': 'MISSING_HTF_ANCHOR'})]
            )

        # 1. Forward Bars Availability Check
        if not future_m1_candles or len(future_m1_candles) < 15:
            return ReplayEvaluationResult(
                candidate_id=candidate.candidate_id,
                structural_opportunity_id=candidate.structural_opportunity_id,
                symbol=candidate.symbol,
                trade_direction=candidate.trade_direction,
                variant_name=variant_name,
                final_status='INSUFFICIENT_DATA_M1_MISSING',
                status_reason=f'Insufficient post-signal M1 bars: available={len(future_m1_candles)}',
                signal_known_timestamp=candidate.signal_known_at_timestamp,
                forward_bars_count=len(future_m1_candles),
                target_price=candidate.target_price,
                target_verified=candidate.target_known,
                audit_trail=[StepRecord('REJECTED_M1', None, None, {'bars': len(future_m1_candles)})]
            )

        # ---------------------------------------------------------------------
        # Step A: Chronological Scan for First POI Touch & HTF Invalidation Guard
        # ---------------------------------------------------------------------
        touch_idx: Optional[int] = None
        touch_ts: Optional[int] = None

        search_touch_limit = min(len(future_m1_candles), self.max_wait_touch_bars)

        for i in range(search_touch_limit):
            c = future_m1_candles[i]

            # HTF Invalidation Guard (Clock-Aligned Close Check)
            # If an HTF bar completes and its close violates the POI boundary before any valid touch
            if is_htf_boundary_minute(c.timestamp, self.htf_timeframe_minutes):
                htf_breached = c.close < candidate.zone_low if is_long else c.close > candidate.zone_high
                if htf_breached:
                    audit.append(StepRecord('HTF_CLOSE_VETO', i, c.timestamp, {'close': c.close, 'zone_low': candidate.zone_low, 'zone_high': candidate.zone_high}))
                    return ReplayEvaluationResult(
                        candidate_id=candidate.candidate_id,
                        structural_opportunity_id=candidate.structural_opportunity_id,
                        symbol=candidate.symbol,
                        trade_direction=candidate.trade_direction,
                        variant_name=variant_name,
                        final_status='INVALIDATED',
                        status_reason='POI breached on clock-aligned HTF candle close before entry execution',
                        signal_known_timestamp=candidate.signal_known_at_timestamp,
                        forward_bars_count=len(future_m1_candles),
                        htf_veto_bar_index=i,
                        target_price=candidate.target_price,
                        target_verified=candidate.target_known,
                        audit_trail=audit
                    )

            # Check POI touch
            touched = (
                (c.low <= candidate.zone_high and c.high >= candidate.zone_low)
                if is_long
                else (c.high >= candidate.zone_low and c.low <= candidate.zone_high)
            )

            if touched:
                touch_idx = i
                touch_ts = c.timestamp
                audit.append(StepRecord('POI_TOUCHED', i, c.timestamp, {'low': c.low, 'high': c.high}))
                break

        if touch_idx is None:
            return ReplayEvaluationResult(
                candidate_id=candidate.candidate_id,
                structural_opportunity_id=candidate.structural_opportunity_id,
                symbol=candidate.symbol,
                trade_direction=candidate.trade_direction,
                variant_name=variant_name,
                final_status='EXPIRED',
                status_reason='Price did not retest/touch 15M POI within max wait window',
                signal_known_timestamp=candidate.signal_known_at_timestamp,
                forward_bars_count=len(future_m1_candles),
                target_price=candidate.target_price,
                target_verified=candidate.target_known,
                audit_trail=audit
            )

        # ---------------------------------------------------------------------
        # Step B: Scan for 1M Inducement / SFP Sweep + CHoCH + Displacement + FVG
        # ---------------------------------------------------------------------
        reaction_limit = min(len(future_m1_candles), touch_idx + self.max_reaction_bars)

        sweep_idx: Optional[int] = None
        sweep_extreme: Optional[float] = None
        choch_idx: Optional[int] = None
        disp_idx: Optional[int] = None
        disp_ratio: Optional[float] = None
        disp_type: Optional[str] = None
        fvg_found: bool = False
        fvg_box: Optional[Tuple[float, float]] = None

        # To prevent look-ahead, we walk sequentially from touch_idx + 1
        for k in range(touch_idx + 1, reaction_limit):
            # HTF Invalidation guard continues inside reaction window
            c = future_m1_candles[k]
            prev_c = future_m1_candles[k - 1]

            if is_htf_boundary_minute(c.timestamp, self.htf_timeframe_minutes):
                htf_breached = c.close < candidate.zone_low if is_long else c.close > candidate.zone_high
                if htf_breached:
                    audit.append(StepRecord('HTF_CLOSE_VETO_DURING_REACTION', k, c.timestamp, {'close': c.close}))
                    return ReplayEvaluationResult(
                        candidate_id=candidate.candidate_id,
                        structural_opportunity_id=candidate.structural_opportunity_id,
                        symbol=candidate.symbol,
                        trade_direction=candidate.trade_direction,
                        variant_name=variant_name,
                        final_status='INVALIDATED',
                        status_reason='POI breached on clock-aligned HTF close while awaiting 1M confirmation',
                        signal_known_timestamp=candidate.signal_known_at_timestamp,
                        forward_bars_count=len(future_m1_candles),
                        poi_touched_bar_index=touch_idx,
                        poi_touched_timestamp=touch_ts,
                        htf_veto_bar_index=k,
                        target_price=candidate.target_price,
                        target_verified=candidate.target_known,
                        audit_trail=audit
                    )

            # 1. Detect 1M SFP / IDM Sweep
            # Pierced prior local extreme and closed back inside
            lookback_start = max(touch_idx, k - 6)
            if k - 1 > lookback_start:
                prior_bars = future_m1_candles[lookback_start : k - 1]
                if is_long:
                    local_low = min(b.low for b in prior_bars)
                    is_sweep = (prev_c.low < local_low and prev_c.close > local_low) or (c.low < prev_c.low and c.close > prev_c.high)
                    if is_sweep:
                        sweep_idx = k
                        sweep_extreme = min(c.low, prev_c.low)
                else:
                    local_high = max(b.high for b in prior_bars)
                    is_sweep = (prev_c.high > local_high and prev_c.close < local_high) or (c.high > prev_c.high and c.close < prev_c.low)
                    if is_sweep:
                        sweep_idx = k
                        sweep_extreme = max(c.high, prev_c.high)

            if sweep_idx is None:
                continue

            # 2. CHoCH & Displacement Check
            # Look for displacement break of recent 1M swing level formed before/at the sweep
            recent_bars = future_m1_candles[max(touch_idx, k - 5) : k]
            if is_long:
                choch_level = max(b.high for b in recent_bars)
                is_choch = c.close > choch_level
            else:
                choch_level = min(b.low for b in recent_bars)
                is_choch = c.close < choch_level

            if not is_choch:
                continue

            # 3. Displacement Evaluation
            c_range = max(c.high - c.low, 1e-8)
            c_body = abs(c.close - c.open)
            body_ratio = c_body / c_range

            # Check Large Body
            if body_ratio >= body_threshold:
                choch_idx = k
                disp_idx = k
                disp_ratio = body_ratio
                disp_type = 'LARGE_BODY'
            elif enable_ladder_detection:
                # Check 3-bar Ladder Displacement: cumulative directional bodies >= 0.40
                if k >= 2:
                    three_bars = [future_m1_candles[k - 2], future_m1_candles[k - 1], c]
                    total_body = sum(abs(b.close - b.open) for b in three_bars)
                    total_range = sum(max(b.high - b.low, 1e-8) for b in three_bars)
                    all_directional = (
                        all(b.close > b.open for b in three_bars)
                        if is_long
                        else all(b.close < b.open for b in three_bars)
                    )
                    if all_directional and (total_body / total_range >= 0.40):
                        choch_idx = k
                        disp_idx = k
                        disp_ratio = total_body / total_range
                        disp_type = 'LADDER'

            if disp_idx is None:
                continue

            # 4. FVG / iFVG Detection
            # Check 3-bar classic FVG or prior 12-bar inverted FVG (iFVG)
            if is_long:
                if k >= 2 and future_m1_candles[k].low > future_m1_candles[k - 2].high:
                    fvg_found = True
                    fvg_box = (future_m1_candles[k - 2].high, future_m1_candles[k].low)
                else:
                    # Inversion FVG search
                    for j in range(k - 1, max(touch_idx, k - 12), -1):
                        if j >= 2 and future_m1_candles[j - 2].low > future_m1_candles[j].high:
                            if c.close > future_m1_candles[j - 2].low:
                                fvg_found = True
                                fvg_box = (future_m1_candles[j].high, future_m1_candles[j - 2].low)
                                break
            else:
                if k >= 2 and future_m1_candles[k].high < future_m1_candles[k - 2].low:
                    fvg_found = True
                    fvg_box = (future_m1_candles[k].high, future_m1_candles[k - 2].low)
                else:
                    for j in range(k - 1, max(touch_idx, k - 12), -1):
                        if j >= 2 and future_m1_candles[j].low > future_m1_candles[j - 2].high:
                            if c.close < future_m1_candles[j - 2].high:
                                fvg_found = True
                                fvg_box = (future_m1_candles[j - 2].high, future_m1_candles[j].low)
                                break

            # If displacement is LADDER, flag for manual review immediately (do not auto-fill as WIN/LOSS)
            if disp_type == 'LADDER':
                audit.append(StepRecord('LADDER_DISPLACEMENT_DETECTED', k, c.timestamp, {'ladder_ratio': disp_ratio}))
                return ReplayEvaluationResult(
                    candidate_id=candidate.candidate_id,
                    structural_opportunity_id=candidate.structural_opportunity_id,
                    symbol=candidate.symbol,
                    trade_direction=candidate.trade_direction,
                    variant_name=variant_name,
                    final_status='MANUAL_REVIEW_REQUIRED',
                    status_reason='Ladder displacement detected without confirmed single large-body rule; requires manual discretionary review',
                    signal_known_timestamp=candidate.signal_known_at_timestamp,
                    forward_bars_count=len(future_m1_candles),
                    poi_touched_bar_index=touch_idx,
                    poi_touched_timestamp=touch_ts,
                    sweep_bar_index=sweep_idx,
                    sweep_extreme_price=sweep_extreme,
                    choch_bar_index=choch_idx,
                    displacement_bar_index=disp_idx,
                    displacement_body_ratio=disp_ratio,
                    displacement_type=disp_type,
                    fvg_detected=fvg_found,
                    target_price=candidate.target_price,
                    target_verified=candidate.target_known,
                    audit_trail=audit
                )

            # If valid single large-body displacement confirmed, proceed to Fibonacci execution
            if disp_type == 'LARGE_BODY':
                audit.append(StepRecord('CONFIRMED_DISPLACEMENT', k, c.timestamp, {'body_ratio': disp_ratio, 'fvg_found': fvg_found}))
                break

        if disp_idx is None or sweep_extreme is None:
            return ReplayEvaluationResult(
                candidate_id=candidate.candidate_id,
                structural_opportunity_id=candidate.structural_opportunity_id,
                symbol=candidate.symbol,
                trade_direction=candidate.trade_direction,
                variant_name=variant_name,
                final_status='NO_ENTRY',
                status_reason='No 1M sweep + displacement confirmation formed within reaction window',
                signal_known_timestamp=candidate.signal_known_at_timestamp,
                forward_bars_count=len(future_m1_candles),
                poi_touched_bar_index=touch_idx,
                poi_touched_timestamp=touch_ts,
                target_price=candidate.target_price,
                target_verified=candidate.target_known,
                audit_trail=audit
            )

        # ---------------------------------------------------------------------
        # Step C: Dynamic 0.5 Fibonacci Tracking & Subsequent Bar Limit Fill
        # ---------------------------------------------------------------------
        anchor_extreme = sweep_extreme
        anchor_impulse = future_m1_candles[disp_idx].high if is_long else future_m1_candles[disp_idx].low
        
        fill_limit = min(len(future_m1_candles), disp_idx + self.max_fib_fill_bars)
        filled_idx: Optional[int] = None
        filled_ts: Optional[int] = None
        executed_entry_price: Optional[float] = None
        final_fib_05: Optional[float] = None

        # Check Confluence Quality Tag with Breaker (candidate POI or Breaker box)
        breaker_overlap = False
        if candidate.zone_low <= anchor_extreme <= candidate.zone_high:
            breaker_overlap = True

        for m in range(disp_idx + 1, fill_limit):
            mc = future_m1_candles[m]

            # Dynamic expansion: if price continues running without pullback, expand impulse
            if is_long:
                if mc.high > anchor_impulse:
                    anchor_impulse = mc.high
                current_fib05 = anchor_extreme + (anchor_impulse - anchor_extreme) * 0.50
                final_fib_05 = current_fib05
                # Fill test: does current bar low reach or cross current_fib05?
                if mc.low <= current_fib05:
                    filled_idx = m
                    filled_ts = mc.timestamp
                    executed_entry_price = current_fib05
                    audit.append(StepRecord('LIMIT_FILLED', m, mc.timestamp, {'fib05': current_fib05, 'bar_low': mc.low}))
                    break
            else:
                if mc.low < anchor_impulse:
                    anchor_impulse = mc.low
                current_fib05 = anchor_impulse + (anchor_extreme - anchor_impulse) * 0.50
                final_fib_05 = current_fib05
                # Fill test: does current bar high reach or cross current_fib05?
                if mc.high >= current_fib05:
                    filled_idx = m
                    filled_ts = mc.timestamp
                    executed_entry_price = current_fib05
                    audit.append(StepRecord('LIMIT_FILLED', m, mc.timestamp, {'fib05': current_fib05, 'bar_high': mc.high}))
                    break

        if filled_idx is None or executed_entry_price is None:
            return ReplayEvaluationResult(
                candidate_id=candidate.candidate_id,
                structural_opportunity_id=candidate.structural_opportunity_id,
                symbol=candidate.symbol,
                trade_direction=candidate.trade_direction,
                variant_name=variant_name,
                final_status='NO_ENTRY',
                status_reason='Price did not retrace to dynamic 0.5 Fib limit level within fill window',
                signal_known_timestamp=candidate.signal_known_at_timestamp,
                forward_bars_count=len(future_m1_candles),
                poi_touched_bar_index=touch_idx,
                poi_touched_timestamp=touch_ts,
                sweep_bar_index=sweep_idx,
                sweep_extreme_price=sweep_extreme,
                choch_bar_index=choch_idx,
                displacement_bar_index=disp_idx,
                displacement_body_ratio=disp_ratio,
                displacement_type=disp_type,
                fvg_detected=fvg_found,
                fib_05_price=final_fib_05,
                breaker_overlap_tag='PERFECT_OVERLAP' if breaker_overlap else 'NO_OVERLAP',
                target_price=candidate.target_price,
                target_verified=candidate.target_known,
                audit_trail=audit
            )

        # ---------------------------------------------------------------------
        # Step D: Confirm Structural Stop Loss & Risk Distance
        # ---------------------------------------------------------------------
        # Rule 8: Stop MUST be anchored to the HTF structural swing price
        structural_stop = candidate.structural_anchor_price
        risk_dist = abs(executed_entry_price - structural_stop)

        if risk_dist <= 0:
            return ReplayEvaluationResult(
                candidate_id=candidate.candidate_id,
                structural_opportunity_id=candidate.structural_opportunity_id,
                symbol=candidate.symbol,
                trade_direction=candidate.trade_direction,
                variant_name=variant_name,
                final_status='INSUFFICIENT_DATA_STRUCTURAL_STOP',
                status_reason=f'Invalid non-positive risk distance ({risk_dist}) to structural stop ({structural_stop})',
                signal_known_timestamp=candidate.signal_known_at_timestamp,
                forward_bars_count=len(future_m1_candles),
                target_price=candidate.target_price,
                target_verified=candidate.target_known,
                audit_trail=audit
            )

        return ReplayEvaluationResult(
            candidate_id=candidate.candidate_id,
            structural_opportunity_id=candidate.structural_opportunity_id,
            symbol=candidate.symbol,
            trade_direction=candidate.trade_direction,
            variant_name=variant_name,
            final_status='ENTRY_FILLED',
            status_reason='1M Sniper confirmation validated and dynamic 0.5 Fib limit filled on subsequent price action',
            signal_known_timestamp=candidate.signal_known_at_timestamp,
            forward_bars_count=len(future_m1_candles),
            poi_touched_bar_index=touch_idx,
            poi_touched_timestamp=touch_ts,
            sweep_bar_index=sweep_idx,
            sweep_extreme_price=sweep_extreme,
            choch_bar_index=choch_idx,
            displacement_bar_index=disp_idx,
            displacement_body_ratio=disp_ratio,
            displacement_type=disp_type,
            fvg_detected=fvg_found,
            fib_05_price=final_fib_05,
            breaker_overlap_tag='PERFECT_OVERLAP' if breaker_overlap else 'NO_OVERLAP',
            filled_bar_index=filled_idx,
            filled_timestamp=filled_ts,
            entry_price=executed_entry_price,
            structural_stop_price=structural_stop,
            risk_distance=risk_dist,
            target_price=candidate.target_price,
            target_verified=candidate.target_known,
            audit_trail=audit
        )


def load_66_verified_opportunities(
    queue_path: str,
    data_dir: str,
    full_symbols: List[str]
) -> Tuple[List[ReplayCandidate], Dict[str, List[Candle]]]:
    """
    Loads M1 candle series and extracts verified unique opportunities matching M1 range.
    """
    with open(queue_path, 'r', encoding='utf-8') as f:
        queue_data = json.load(f)

    # 1. Load M1 candle series for full symbols
    m1_stores: Dict[str, List[Candle]] = {}
    m1_bounds: Dict[str, Tuple[int, int]] = {}

    for sym in full_symbols:
        fpath = os.path.join(data_dir, f"{sym}_1m.json")
        if not os.path.exists(fpath):
            continue
        with open(fpath, 'r', encoding='utf-8') as fp:
            raw_candles = json.load(fp)
            candles = [
                Candle(
                    timestamp=c.get('timestamp', c.get('time')),
                    open=c['open'],
                    high=c['high'],
                    low=c['low'],
                    close=c['close'],
                    volume=c.get('volume', 0.0)
                )
                for c in raw_candles
            ]
            candles.sort(key=lambda x: x.timestamp)
            m1_stores[sym] = candles
            if candles:
                m1_bounds[sym] = (candles[0].timestamp, candles[-1].timestamp)

    # 2. Extract and Deduplicate structural opportunities
    seen_opps = set()
    candidates: List[ReplayCandidate] = []

    for item in queue_data:
        sym = item.get('symbol')
        if sym not in full_symbols or sym not in m1_bounds:
            continue

        cand = item.get('candidate', {})
        dk = cand.get('dedupeKey') or item.get('signalId')
        if dk in seen_opps:
            continue

        # Check timestamp
        created_at_str = item.get('signalCreatedAt')
        try:
            dt_created = datetime.fromisoformat(created_at_str.replace('Z', '+00:00'))
            ts_created = int(dt_created.timestamp() * 1000)
        except Exception:
            ts_created = cand.get('marketDataTimestamp') or 0

        t0, t1 = m1_bounds[sym]
        if not (t0 <= ts_created <= t1):
            continue

        seen_opps.add(dk)

        # POI bounds
        poi_type = cand.get('poiType', 'OB')
        poi = cand.get('poi', {})
        if poi_type == 'OB':
            zlow = float(poi.get('low', 0.0))
            zhigh = float(poi.get('high', 0.0))
        else:
            zlow = float(poi.get('gapLow', 0.0))
            zhigh = float(poi.get('gapHigh', 0.0))

        # Structural anchor (Swing high/low)
        rel_evt = poi.get('relatedEvent', {})
        broken_swing = rel_evt.get('brokenSwing', {})
        anchor_price = broken_swing.get('price')
        if anchor_price is not None:
            anchor_price = float(anchor_price)
        anchor_type = 'SWING_' + str(broken_swing.get('type', 'UNKNOWN')).upper()

        # Target verification
        liq_magnet = cand.get('liquidityMagnet') or {}
        has_active_target = bool(liq_magnet.get('isActive') and liq_magnet.get('priceLevel') is not None)
        target_price = float(liq_magnet['priceLevel']) if has_active_target else None
        target_type = liq_magnet.get('type') if has_active_target else None

        candidates.append(
            ReplayCandidate(
                candidate_id=item.get('signalId', dk),
                structural_opportunity_id=dk,
                symbol=sym,
                timeframe=cand.get('poiTimeframe', '15m'),
                trade_direction=cand.get('tradeDirection', 'long').lower(),
                poi_type=poi_type,
                zone_low=zlow,
                zone_high=zhigh,
                signal_known_at_utc=created_at_str,
                signal_known_at_timestamp=ts_created,
                structural_anchor_price=anchor_price,
                structural_anchor_type=anchor_type,
                structural_anchor_timeframe=cand.get('poiTimeframe', '15m'),
                target_price=target_price,
                target_type=target_type,
                target_known=has_active_target,
                raw_metadata={'deliveryItem': item.get('signalId')}
            )
        )

    return candidates, m1_stores


def run_hybrid_entry_evaluation(
    output_json_path: str,
    queue_path: str = r"c:\Users\piard\.gemini\antigravity\scratch\swing-bos-core\data\signal_delivery_queue.json",
    data_dir: str = r"c:\Users\piard\.gemini\antigravity\scratch\swing-bos-core\data"
) -> Dict[str, Any]:
    full_symbols = ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCAD', 'XAUUSD', 'ETHUSD', 'SOLUSD']
    candidates, m1_stores = load_66_verified_opportunities(queue_path, data_dir, full_symbols)

    engine = HybridReplayEngine()

    variants = [
        ('BODY_40', 0.40, False),
        ('BODY_50', 0.50, False),
        ('BODY_60', 0.60, False),
        ('LADDER', 0.50, True)
    ]

    all_results: Dict[str, List[Dict[str, Any]]] = {}
    summary_stats: Dict[str, Dict[str, int]] = {}

    for v_name, b_thresh, is_ladder in variants:
        variant_results = []
        counts = {
            'TOTAL': len(candidates),
            'ENTRY_FILLED': 0,
            'NO_ENTRY': 0,
            'INVALIDATED': 0,
            'EXPIRED': 0,
            'MANUAL_REVIEW_REQUIRED': 0,
            'INSUFFICIENT_DATA_STRUCTURAL_STOP': 0,
            'INSUFFICIENT_DATA_M1_MISSING': 0
        }

        for cand in candidates:
            # Sinyal anından SONRAKİ barları filtrele (Strict No-Lookahead)
            all_m1 = m1_stores.get(cand.symbol, [])
            post_candles = [c for c in all_m1 if c.timestamp > cand.signal_known_at_timestamp]

            res = engine.evaluate_candidate(
                candidate=cand,
                future_m1_candles=post_candles,
                body_threshold=b_thresh,
                enable_ladder_detection=is_ladder
            )

            counts[res.final_status] = counts.get(res.final_status, 0) + 1

            record = {
                'candidate_id': res.candidate_id,
                'structural_opportunity_id': res.structural_opportunity_id,
                'symbol': res.symbol,
                'trade_direction': res.trade_direction,
                'variant_name': res.variant_name,
                'final_status': res.final_status,
                'status_reason': res.status_reason,
                'signal_known_timestamp': res.signal_known_timestamp,
                'forward_bars_count': res.forward_bars_count,
                'poi_touched_bar_index': res.poi_touched_bar_index,
                'sweep_bar_index': res.sweep_bar_index,
                'sweep_extreme_price': res.sweep_extreme_price,
                'displacement_bar_index': res.displacement_bar_index,
                'displacement_body_ratio': res.displacement_body_ratio,
                'displacement_type': res.displacement_type,
                'fvg_detected': res.fvg_detected,
                'fib_05_price': res.fib_05_price,
                'breaker_overlap_tag': res.breaker_overlap_tag,
                'filled_bar_index': res.filled_bar_index,
                'filled_timestamp': res.filled_timestamp,
                'entry_price': res.entry_price,
                'structural_stop_price': res.structural_stop_price,
                'risk_distance': res.risk_distance,
                'target_price': res.target_price,
                'target_verified': res.target_verified
            }
            variant_results.append(record)

        all_results[v_name] = variant_results
        summary_stats[v_name] = counts

    output_payload = {
        'evaluated_at': datetime.now(timezone.utc).isoformat(),
        'total_verified_opportunities': len(candidates),
        'summary_statistics': summary_stats,
        'results_by_variant': all_results
    }

    with open(output_json_path, 'w', encoding='utf-8') as f:
        json.dump(output_payload, f, indent=2)

    return output_payload


if __name__ == '__main__':
    out_path = os.path.join(os.path.dirname(__file__), "hybrid_replay_evaluation_log.json")
    print(f"Running Hybrid Entry Evaluation on 66 opportunities -> {out_path}")
    payload = run_hybrid_entry_evaluation(out_path)
    print("Done! Summary statistics:")
    print(json.dumps(payload['summary_statistics'], indent=2))

