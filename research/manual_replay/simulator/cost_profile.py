"""
Begonya Manual Replay - Cost Profile Models
===========================================
Defines realistic execution cost models per instrument:
- Bid-Ask Spread
- Broker Commission (per lot or % notional)
- Slippage assumption for market orders
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict


@dataclass
class CostProfile:
    symbol: str
    spread_pips: float
    pip_size: float
    commission_per_lot_usd: float
    slippage_pips: float
    lot_size: float = 100000.0  # Standard FX lot size

    def calculate_entry_price(self, direction: str, mid_price: float, is_market: bool = True) -> float:
        """Calculates effective entry price including half-spread and market slippage."""
        half_spread = (self.spread_pips * self.pip_size) / 2.0
        slippage = (self.slippage_pips * self.pip_size) if is_market else 0.0

        if direction.upper() in ["BUY", "LONG"]:
            # Buy at Ask: mid + half_spread + slippage
            return mid_price + half_spread + slippage
        else:
            # Sell at Bid: mid - half_spread - slippage
            return mid_price - half_spread - slippage

    def calculate_exit_price(self, direction: str, mid_price: float, is_market: bool = True) -> float:
        """Calculates effective exit price including half-spread and slippage."""
        half_spread = (self.spread_pips * self.pip_size) / 2.0
        slippage = (self.slippage_pips * self.pip_size) if is_market else 0.0

        if direction.upper() in ["BUY", "LONG"]:
            # Close long at Bid: mid - half_spread - slippage
            return mid_price - half_spread - slippage
        else:
            # Close short at Ask: mid + half_spread + slippage
            return mid_price + half_spread + slippage

    def calculate_commission(self, lots: float) -> float:
        """Round-trip commission in USD."""
        return self.commission_per_lot_usd * lots


# Built-in realistic institutional/broker cost profiles
DEFAULT_COST_PROFILES: Dict[str, CostProfile] = {
    "EURUSD": CostProfile(symbol="EURUSD", spread_pips=0.8, pip_size=0.0001, commission_per_lot_usd=7.0, slippage_pips=0.2),
    "GBPUSD": CostProfile(symbol="GBPUSD", spread_pips=1.0, pip_size=0.0001, commission_per_lot_usd=7.0, slippage_pips=0.3),
    "USDJPY": CostProfile(symbol="USDJPY", spread_pips=0.9, pip_size=0.01, commission_per_lot_usd=7.0, slippage_pips=0.2),
    "USDCAD": CostProfile(symbol="USDCAD", spread_pips=1.2, pip_size=0.0001, commission_per_lot_usd=7.0, slippage_pips=0.3),
    "AUDUSD": CostProfile(symbol="AUDUSD", spread_pips=1.1, pip_size=0.0001, commission_per_lot_usd=7.0, slippage_pips=0.3),
    "XAUUSD": CostProfile(symbol="XAUUSD", spread_pips=2.5, pip_size=0.1, commission_per_lot_usd=7.0, slippage_pips=0.5, lot_size=100.0),
    "BTCUSD": CostProfile(symbol="BTCUSD", spread_pips=15.0, pip_size=1.0, commission_per_lot_usd=10.0, slippage_pips=2.0, lot_size=1.0),
    "ETHUSD": CostProfile(symbol="ETHUSD", spread_pips=1.5, pip_size=0.1, commission_per_lot_usd=5.0, slippage_pips=0.5, lot_size=10.0),
    "SOLUSD": CostProfile(symbol="SOLUSD", spread_pips=0.2, pip_size=0.01, commission_per_lot_usd=2.0, slippage_pips=0.1, lot_size=100.0),
}


def get_cost_profile(symbol: str) -> CostProfile:
    sym = symbol.replace("/", "").replace("-", "").upper()
    return DEFAULT_COST_PROFILES.get(
        sym,
        CostProfile(symbol=sym, spread_pips=1.5, pip_size=0.0001, commission_per_lot_usd=7.0, slippage_pips=0.5),
    )
