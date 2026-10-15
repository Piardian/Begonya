"""
Begonya Manual Replay - Manual Trade Simulator / Execution Engine
=================================================================
Simulates order fills, position tracking, stop-loss / take-profit triggering,
and realistic cost-adjusted PnL & R-multiple calculation.
Guarantees:
- Completely isolated from live broker APIs.
- Conservative intra-bar conflict rule: if both SL and TP are touched in the same bar,
  Stop-Loss is applied first.
- Strict determinism across repeated executions.
"""

from __future__ import annotations

import logging
import math
import uuid
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from manual_replay.adapter.historical_data_adapter import Candle
from manual_replay.simulator.cost_profile import CostProfile, get_cost_profile

logger = logging.getLogger("Begonya.ManualReplay.ExecutionEngine")


@dataclass
class ManualOrder:
    order_id: str
    symbol: str
    order_type: str  # 'MARKET' or 'LIMIT'
    direction: str   # 'BUY' or 'SELL'
    requested_price: float
    stop_loss: float
    take_profit: float
    volume_lots: float
    risk_percent: float
    placed_at_ts: int
    placed_at_iso: str
    status: str      # 'PENDING', 'FILLED', 'CANCELLED', 'EXPIRED'
    reason_tag: Optional[str] = None
    filled_price: Optional[float] = None
    filled_at_ts: Optional[int] = None
    macro_snapshot: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class TradeRecord:
    trade_id: str
    order_id: str
    symbol: str
    direction: str
    entry_ts: int
    entry_time_iso: str
    entry_price: float
    stop_loss: float
    take_profit: float
    initial_risk_r: float
    volume_lots: float
    mid_entry_price: Optional[float] = None
    entry_was_market: bool = True
    exit_ts: Optional[int] = None
    exit_time_iso: Optional[str] = None
    exit_price: Optional[float] = None
    mid_exit_price: Optional[float] = None
    exit_reason: Optional[str] = None  # 'SL', 'TP', 'MANUAL_CLOSE'
    gross_pnl_usd: float = 0.0
    net_pnl_usd: float = 0.0
    realized_r: float = 0.0
    commission_usd: float = 0.0
    spread_cost_usd: float = 0.0
    slippage_cost_usd: float = 0.0
    status: str = "OPEN"  # 'OPEN', 'CLOSED'
    macro_snapshot: Optional[Dict[str, Any]] = None
    conservative_ambiguity_applied: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class ExecutionEngine:
    """Simulated exchange and position manager for manual replay sessions."""

    def __init__(self, symbol: str, initial_balance: float = 10000.0, cost_profile: Optional[CostProfile] = None):
        self.symbol = symbol.replace("/", "").replace("-", "").upper()
        self.initial_balance = initial_balance
        self.balance = initial_balance
        self.cost_profile = cost_profile or get_cost_profile(self.symbol)

        self.orders: Dict[str, ManualOrder] = {}
        self.open_position: Optional[TradeRecord] = None
        self.trade_history: List[TradeRecord] = []
        self.event_log: List[Dict[str, Any]] = []

    def log_event(self, event_type: str, timestamp_ms: int, payload: Dict[str, Any]) -> None:
        self.event_log.append({
            "seq": len(self.event_log) + 1,
            "type": event_type,
            "timestamp": timestamp_ms,
            "iso": datetime.fromtimestamp(timestamp_ms / 1000, tz=timezone.utc).isoformat(),
            "payload": payload,
        })

    def _usd_conversion_factor(self, reference_price: float) -> float:
        """Convert quote-currency PnL to USD for supported USD-base pairs."""
        if self.symbol in {"USDJPY", "USDCAD"}:
            if reference_price <= 0:
                raise ValueError("A positive reference price is required for quote-currency conversion")
            return 1.0 / reference_price
        # The supported remaining instruments are quoted in USD.
        return 1.0

    def calculate_lots_from_risk(self, direction: str, entry_price: float, stop_loss: float, risk_percent: float) -> float:
        """Size down to 0.01 lots using stop risk plus estimated execution costs."""
        risk_capital = self.balance * (risk_percent / 100.0)
        price_risk = abs(entry_price - stop_loss)
        if price_risk <= 0:
            raise ValueError("Entry and stop loss must differ")
        conversion = self._usd_conversion_factor(entry_price)
        profile = self.cost_profile
        price_risk_usd = price_risk * profile.lot_size * conversion
        spread_usd = profile.spread_pips * profile.pip_size * profile.lot_size * conversion
        slippage_usd = 2.0 * profile.slippage_pips * profile.pip_size * profile.lot_size * conversion
        loss_per_lot = price_risk_usd + spread_usd + slippage_usd + profile.commission_per_lot_usd
        if loss_per_lot <= 0 or not math.isfinite(loss_per_lot):
            raise ValueError("Could not calculate a finite per-lot risk")
        raw_lots = risk_capital / loss_per_lot
        # Floor to the broker's assumed 0.01 lot step; never round risk upward.
        lots = math.floor(raw_lots * 100.0) / 100.0
        if lots < 0.01:
            raise ValueError("Risk budget is below the minimum 0.01-lot position after costs")
        return round(lots, 2)

    def place_order(
        self,
        order_type: str,
        direction: str,
        price: float,
        stop_loss: float,
        take_profit: float,
        current_time_ms: int,
        volume_lots: Optional[float] = None,
        risk_percent: float = 1.0,
        reason_tag: Optional[str] = None,
        macro_snapshot: Optional[Dict[str, Any]] = None,
    ) -> ManualOrder:
        """Places a new manual market or limit order."""
        direction_upper = direction.upper()
        order_type_upper = order_type.upper()

        # Validate all inputs before mutating the order book.
        if direction_upper not in {"BUY", "SELL"}:
            raise ValueError("direction must be BUY or SELL")
        if order_type_upper not in {"MARKET", "LIMIT"}:
            raise ValueError("order_type must be MARKET or LIMIT")
        if any(not math.isfinite(float(v)) for v in (price, stop_loss, take_profit, risk_percent)):
            raise ValueError("Price, SL, TP, and risk percent must be finite numbers")
        if min(price, stop_loss, take_profit) <= 0:
            raise ValueError("Price, SL, and TP must be greater than zero")
        if risk_percent <= 0:
            raise ValueError("risk_percent must be greater than zero")
        if direction_upper == "BUY" and not (stop_loss < price < take_profit):
            raise ValueError("BUY orders require SL < entry/limit price < TP")
        if direction_upper == "SELL" and not (take_profit < price < stop_loss):
            raise ValueError("SELL orders require TP < entry/limit price < SL")
        if self.open_position is not None:
            raise RuntimeError("Cannot place an order while another position is open")
        if any(o.status == "PENDING" for o in self.orders.values()):
            raise RuntimeError("Only one pending order is supported; resolve it before placing another")

        lots = volume_lots if volume_lots is not None else self.calculate_lots_from_risk(direction_upper, price, stop_loss, risk_percent)
        if not math.isfinite(float(lots)) or lots <= 0:
            raise ValueError("volume_lots must be a finite number greater than zero")

        order_id = f"ord_{uuid.uuid4().hex[:8]}"
        order = ManualOrder(
            order_id=order_id,
            symbol=self.symbol,
            order_type=order_type_upper,
            direction=direction_upper,
            requested_price=price,
            stop_loss=stop_loss,
            take_profit=take_profit,
            volume_lots=lots,
            risk_percent=risk_percent,
            placed_at_ts=current_time_ms,
            placed_at_iso=datetime.fromtimestamp(current_time_ms / 1000, tz=timezone.utc).isoformat(),
            status="PENDING",
            reason_tag=reason_tag,
            macro_snapshot=macro_snapshot,
        )
        self.orders[order_id] = order

        self.log_event("ORDER_PLACED", current_time_ms, order.to_dict())

        # If MARKET order, execute immediately at current effective price
        if order_type_upper == "MARKET":
            self._fill_order(order, price, current_time_ms, is_market=True, macro_snapshot=macro_snapshot)

        return order

    def _fill_order(
        self,
        order: ManualOrder,
        mid_fill_price: float,
        fill_time_ms: int,
        is_market: bool = True,
        macro_snapshot: Optional[Dict[str, Any]] = None,
    ) -> TradeRecord:
        """Fills an order and initiates an open position."""
        if self.open_position is not None:
            raise RuntimeError("Cannot open multiple concurrent positions in manual replay MVP")

        exec_price = self.cost_profile.calculate_entry_price(order.direction, mid_fill_price, is_market=is_market)
        order.status = "FILLED"
        order.filled_price = exec_price
        order.filled_at_ts = fill_time_ms

        commission = self.cost_profile.calculate_commission(order.volume_lots)
        initial_risk = abs(mid_fill_price - order.stop_loss)

        trade = TradeRecord(
            trade_id=f"trd_{uuid.uuid4().hex[:8]}",
            order_id=order.order_id,
            symbol=self.symbol,
            direction=order.direction,
            entry_ts=fill_time_ms,
            entry_time_iso=datetime.fromtimestamp(fill_time_ms / 1000, tz=timezone.utc).isoformat(),
            entry_price=exec_price,
            stop_loss=order.stop_loss,
            take_profit=order.take_profit,
            initial_risk_r=initial_risk,
            volume_lots=order.volume_lots,
            mid_entry_price=mid_fill_price,
            entry_was_market=is_market,
            commission_usd=commission,
            macro_snapshot=macro_snapshot if macro_snapshot is not None else order.macro_snapshot,
            status="OPEN",
        )
        self.open_position = trade

        self.log_event("ORDER_FILLED", fill_time_ms, {
            "order_id": order.order_id,
            "trade_id": trade.trade_id,
            "entry_price": exec_price,
            "lots": order.volume_lots,
        })
        return trade

    def close_position_manually(self, current_mid_price: float, current_time_ms: int) -> TradeRecord:
        """Manually closes the active position at the market price."""
        if not self.open_position:
            raise RuntimeError("No active open position to close")

        return self._finalize_trade(self.open_position, current_mid_price, current_time_ms, exit_reason="MANUAL_CLOSE", is_market=True)

    def _finalize_trade(
        self,
        trade: TradeRecord,
        exit_mid_price: float,
        exit_time_ms: int,
        exit_reason: str,
        is_market: bool = True,
        conservative_ambiguity: bool = False,
    ) -> TradeRecord:
        """Finalizes trade calculations, updates balance, and archives to trade history."""
        exec_exit_price = self.cost_profile.calculate_exit_price(trade.direction, exit_mid_price, is_market=is_market)

        trade.exit_ts = exit_time_ms
        trade.exit_time_iso = datetime.fromtimestamp(exit_time_ms / 1000, tz=timezone.utc).isoformat()
        trade.exit_price = exec_exit_price
        trade.exit_reason = exit_reason
        trade.conservative_ambiguity_applied = conservative_ambiguity
        trade.status = "CLOSED"

        # OHLC candles are treated as mid prices. Report mid-to-mid gross PnL
        # separately from modeled spread, slippage, and commission costs.
        mid_entry = trade.mid_entry_price if trade.mid_entry_price is not None else trade.entry_price
        trade.mid_exit_price = exit_mid_price
        if trade.direction == "BUY":
            mid_delta = exit_mid_price - mid_entry
        else:
            mid_delta = mid_entry - exit_mid_price

        notional_multiplier = trade.volume_lots * self.cost_profile.lot_size
        entry_conversion = self._usd_conversion_factor(mid_entry)
        exit_conversion = self._usd_conversion_factor(exit_mid_price)
        gross_pnl = mid_delta * notional_multiplier * exit_conversion
        half_spread = (self.cost_profile.spread_pips * self.cost_profile.pip_size) / 2.0
        slippage = self.cost_profile.slippage_pips * self.cost_profile.pip_size
        spread_cost = half_spread * notional_multiplier * (entry_conversion + exit_conversion)
        slippage_cost = slippage * notional_multiplier * (
            (entry_conversion if trade.entry_was_market else 0.0)
            + (exit_conversion if is_market else 0.0)
        )
        net_pnl = gross_pnl - spread_cost - slippage_cost - trade.commission_usd

        trade.spread_cost_usd = round(spread_cost, 2)
        trade.slippage_cost_usd = round(slippage_cost, 2)
        trade.gross_pnl_usd = round(gross_pnl, 2)
        trade.net_pnl_usd = round(net_pnl, 2)

        # Realized R is net PnL divided by the original price risk in dollars.
        risk_capital = trade.initial_risk_r * notional_multiplier * exit_conversion
        trade.realized_r = round(net_pnl / risk_capital, 2) if risk_capital > 0 else 0.0

        # Update balance
        self.balance += trade.net_pnl_usd
        self.trade_history.append(trade)
        self.open_position = None

        self.log_event("POSITION_CLOSED", exit_time_ms, {
            "trade_id": trade.trade_id,
            "exit_reason": exit_reason,
            "exit_price": exec_exit_price,
            "net_pnl_usd": trade.net_pnl_usd,
            "realized_r": trade.realized_r,
            "new_balance": round(self.balance, 2),
            "conservative_ambiguity": conservative_ambiguity,
        })
        return trade

    def process_candle(self, candle: Candle) -> None:
        """
        Processes a newly completed bar (typically M1):
        1. Checks pending LIMIT orders for fills.
        2. Checks OPEN position for SL / TP hits.
        """
        # OHLC does not reveal the intrabar path. If a limit fills on this candle,
        # its high/low may have occurred before entry, so do not evaluate SL/TP until
        # the next candle. Record the fill at bar close, when it is first confirmed.
        if self.open_position is None:
            for order in list(self.orders.values()):
                if order.status != "PENDING" or order.order_type != "LIMIT":
                    continue
                touched = (
                    order.direction == "BUY" and candle.low <= order.requested_price
                ) or (
                    order.direction == "SELL" and candle.high >= order.requested_price
                )
                if touched:
                    self._fill_order(
                        order,
                        order.requested_price,
                        candle.timestamp + 60_000,
                        is_market=False,
                        macro_snapshot=order.macro_snapshot,
                    )
                    return

        # 2. Evaluate Open Position SL / TP
        pos = self.open_position
        if pos is None:
            return

        if pos.direction == "BUY":
            hit_sl = candle.low <= pos.stop_loss
            hit_tp = candle.high >= pos.take_profit

            if hit_sl and hit_tp:
                # Conservative rule: SL hit first
                self._finalize_trade(pos, pos.stop_loss, candle.timestamp + 60_000, exit_reason="SL", is_market=False, conservative_ambiguity=True)
            elif hit_sl:
                self._finalize_trade(pos, pos.stop_loss, candle.timestamp + 60_000, exit_reason="SL", is_market=False)
            elif hit_tp:
                self._finalize_trade(pos, pos.take_profit, candle.timestamp + 60_000, exit_reason="TP", is_market=False)

        elif pos.direction == "SELL":
            hit_sl = candle.high >= pos.stop_loss
            hit_tp = candle.low <= pos.take_profit

            if hit_sl and hit_tp:
                # Conservative rule: SL hit first
                self._finalize_trade(pos, pos.stop_loss, candle.timestamp + 60_000, exit_reason="SL", is_market=False, conservative_ambiguity=True)
            elif hit_sl:
                self._finalize_trade(pos, pos.stop_loss, candle.timestamp + 60_000, exit_reason="SL", is_market=False)
            elif hit_tp:
                self._finalize_trade(pos, pos.take_profit, candle.timestamp + 60_000, exit_reason="TP", is_market=False)

    def get_summary_metrics(self) -> Dict[str, Any]:
        """Calculates performance statistics across all closed trades."""
        total_trades = len(self.trade_history)
        if total_trades == 0:
            return {
                "sample_size_status": "INSUFFICIENT_SAMPLE_SIZE",
                "total_trades": 0,
                "win_rate_pct": 0.0,
                "net_pnl_usd": 0.0,
                "total_r": 0.0,
                "expectancy_r": 0.0,
                "profit_factor": 0.0,
                "max_drawdown_usd": 0.0,
            }

        wins = [t for t in self.trade_history if t.net_pnl_usd > 0]
        losses = [t for t in self.trade_history if t.net_pnl_usd < 0]

        gross_profit = sum(t.net_pnl_usd for t in wins)
        gross_loss = abs(sum(t.net_pnl_usd for t in losses))

        profit_factor = (gross_profit / gross_loss) if gross_loss > 0 else (999.0 if gross_profit > 0 else 0.0)
        win_rate = (len(wins) / total_trades) * 100.0
        total_net_pnl = sum(t.net_pnl_usd for t in self.trade_history)
        total_r = sum(t.realized_r for t in self.trade_history)
        expectancy = total_r / total_trades

        # Drawdown calculation
        peak = self.initial_balance
        max_dd = 0.0
        running_bal = self.initial_balance
        for t in self.trade_history:
            running_bal += t.net_pnl_usd
            if running_bal > peak:
                peak = running_bal
            dd = peak - running_bal
            if dd > max_dd:
                max_dd = dd

        return {
            "sample_size_status": "INSUFFICIENT_SAMPLE_SIZE" if total_trades < 30 else "ADEQUATE",
            "total_trades": total_trades,
            "winning_trades": len(wins),
            "losing_trades": len(losses),
            "win_rate_pct": round(win_rate, 1),
            "net_profit_trades_usd": round(gross_profit, 2),
            "net_loss_trades_usd": round(gross_loss, 2),
            "profit_factor": round(profit_factor, 2),
            "net_pnl_usd": round(total_net_pnl, 2),
            "total_r": round(total_r, 2),
            "expectancy_r": round(expectancy, 3),
            "max_drawdown_usd": round(max_dd, 2),
            "current_balance": round(self.balance, 2),
        }
