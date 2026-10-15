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
    exit_ts: Optional[int] = None
    exit_time_iso: Optional[str] = None
    exit_price: Optional[float] = None
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

    def calculate_lots_from_risk(self, direction: str, entry_price: float, stop_loss: float, risk_percent: float) -> float:
        """Calculates volume in lots based on desired % risk of current balance."""
        risk_capital = (self.balance * (risk_percent / 100.0))
        price_risk = abs(entry_price - stop_loss)
        if price_risk <= 0:
            return 0.01

        # lot_size * price_risk = $ loss per lot
        loss_per_lot = price_risk * self.cost_profile.lot_size
        if loss_per_lot <= 0:
            return 0.01

        raw_lots = risk_capital / loss_per_lot
        # Standard step 0.01 lot
        return max(0.01, round(raw_lots, 2))

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

        # Sanity validation
        if direction_upper == "BUY" and stop_loss >= price:
            raise ValueError(f"Long Stop Loss ({stop_loss}) must be below Entry Price ({price})")
        if direction_upper == "SELL" and stop_loss <= price:
            raise ValueError(f"Short Stop Loss ({stop_loss}) must be above Entry Price ({price})")

        lots = volume_lots or self.calculate_lots_from_risk(direction_upper, price, stop_loss, risk_percent)

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
        initial_risk = abs(exec_price - order.stop_loss)

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
            commission_usd=commission,
            macro_snapshot=macro_snapshot,
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

        # Calculate PnL
        if trade.direction == "BUY":
            price_delta = exec_exit_price - trade.entry_price
        else:
            price_delta = trade.entry_price - exec_exit_price

        gross_pnl = price_delta * trade.volume_lots * self.cost_profile.lot_size
        net_pnl = gross_pnl - trade.commission_usd

        # Realized R
        if trade.initial_risk_r > 0:
            raw_r = price_delta / trade.initial_risk_r
            trade.realized_r = round(raw_r, 2)
        else:
            trade.realized_r = 0.0

        trade.gross_pnl_usd = round(gross_pnl, 2)
        trade.net_pnl_usd = round(net_pnl, 2)

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
        # 1. Evaluate Pending Limit Orders
        for order in list(self.orders.values()):
            if order.status == "PENDING" and order.order_type == "LIMIT":
                if order.direction == "BUY" and candle.low <= order.requested_price:
                    self._fill_order(order, order.requested_price, candle.timestamp, is_market=False)
                elif order.direction == "SELL" and candle.high >= order.requested_price:
                    self._fill_order(order, order.requested_price, candle.timestamp, is_market=False)

        # 2. Evaluate Open Position SL / TP
        pos = self.open_position
        if pos is None:
            return

        if pos.direction == "BUY":
            hit_sl = candle.low <= pos.stop_loss
            hit_tp = candle.high >= pos.take_profit

            if hit_sl and hit_tp:
                # Conservative rule: SL hit first
                self._finalize_trade(pos, pos.stop_loss, candle.timestamp, exit_reason="SL", is_market=False, conservative_ambiguity=True)
            elif hit_sl:
                self._finalize_trade(pos, pos.stop_loss, candle.timestamp, exit_reason="SL", is_market=False)
            elif hit_tp:
                self._finalize_trade(pos, pos.take_profit, candle.timestamp, exit_reason="TP", is_market=False)

        elif pos.direction == "SELL":
            hit_sl = candle.high >= pos.stop_loss
            hit_tp = candle.low <= pos.take_profit

            if hit_sl and hit_tp:
                # Conservative rule: SL hit first
                self._finalize_trade(pos, pos.stop_loss, candle.timestamp, exit_reason="SL", is_market=False, conservative_ambiguity=True)
            elif hit_sl:
                self._finalize_trade(pos, pos.stop_loss, candle.timestamp, exit_reason="SL", is_market=False)
            elif hit_tp:
                self._finalize_trade(pos, pos.take_profit, candle.timestamp, exit_reason="TP", is_market=False)

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
            "gross_profit_usd": round(gross_profit, 2),
            "gross_loss_usd": round(gross_loss, 2),
            "profit_factor": round(profit_factor, 2),
            "net_pnl_usd": round(total_net_pnl, 2),
            "total_r": round(total_r, 2),
            "expectancy_r": round(expectancy, 3),
            "max_drawdown_usd": round(max_dd, 2),
            "current_balance": round(self.balance, 2),
        }
