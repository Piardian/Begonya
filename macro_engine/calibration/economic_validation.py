from __future__ import annotations

import math
from statistics import mean
from typing import Any, Iterable, Mapping, Sequence



def forward_return(prices: Sequence[float], horizon: int = 1) -> float | None:
    if horizon <= 0 or len(prices) <= horizon:
        return None
    start = prices[0]
    end = prices[horizon]
    if start == 0:
        return None
    return (end / start) - 1.0


def evaluate_gate_signal(rows: Iterable[Mapping[str, Any]], horizon: int = 1) -> dict[str, Any]:
    """Evaluate realized forward returns for externally supplied deterministic signals.

    This function is intentionally descriptive: it reports sample count, hit rate and
    mean realized return by gate. It does not rank gates or claim causal/predictive edge.
    """
    buckets: dict[str, list[float]] = {}
    for row in rows:
        gate = str(row.get("gate", "UNKNOWN"))
        prices = row.get("future_prices")
        if not isinstance(prices, (list, tuple)):
            continue
        ret = forward_return(prices, horizon)
        if ret is None or not math.isfinite(ret):
            continue
        buckets.setdefault(gate, []).append(ret)

    report: dict[str, Any] = {"horizon": horizon, "by_gate": {}}
    for gate, values in buckets.items():
        positive = sum(1 for value in values if value > 0)
        report["by_gate"][gate] = {
            "n": len(values),
            "positive_return_rate": positive / len(values),
            "mean_forward_return": mean(values),
        }
    return report
