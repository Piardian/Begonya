"""Research-only deterministic loss attribution for macro trade records."""

from __future__ import annotations

from collections import Counter, defaultdict
from typing import Any, Dict, Iterable, Mapping, Optional, Sequence

LOSS_CATEGORIES = (
    "MACRO_DIRECTION_WRONG",
    "CROSS_ASSET_DECOUPLING",
    "WHIPSAW",
    "SETUP_STALENESS",
    "ENTRY_QUALITY_FAILURE",
    "EXIT_OR_STOP_MANAGEMENT",
    "UNEXPLAINED",
)

_LOSS_OUTCOMES = {"LOSS", "STOP", "STOPPED", "SL", "STOP_LOSS"}


def _text(value: Any) -> str:
    return str(value or "").strip().upper()


def _nested(record: Mapping[str, Any]) -> Mapping[str, Any]:
    value = record.get("post_trade_macro_attribution")
    return value if isinstance(value, Mapping) else {}


def _lookup(record: Mapping[str, Any], key: str) -> Any:
    post = _nested(record)
    if key in post:
        return post[key]
    return record.get(key)


def _is_loss(record: Mapping[str, Any]) -> bool:
    return _text(_lookup(record, "trade_actual_outcome")) in _LOSS_OUTCOMES


def _explicit_category(value: Any) -> Optional[str]:
    token = _text(value)
    if not token or token in {"NONE", "NONE_PENDING", "N/A", "NA"}:
        return None
    if "WHIPSAW" in token:
        return "WHIPSAW"
    if "DECOUPLING" in token or "CROSS_ASSET" in token:
        return "CROSS_ASSET_DECOUPLING"
    if "POI_STALENESS" in token or "STALE" in token or "MARKET_FATIGUE" in token:
        return "SETUP_STALENESS"
    if "PREMIUM_OVERBOUGHT" in token or "ENTRY" in token or "POI" in token:
        return "ENTRY_QUALITY_FAILURE"
    if "EXIT" in token or "STOP" in token or "TP" in token or "BREAKEVEN" in token:
        return "EXIT_OR_STOP_MANAGEMENT"
    if "MACRO_DIRECTION" in token or "DIRECTION_WRONG" in token:
        return "MACRO_DIRECTION_WRONG"
    return None


def classify_loss(record: Mapping[str, Any]) -> Dict[str, Any]:
    """Classify one losing record using explicit evidence only."""
    if not _is_loss(record):
        return {"is_loss": False, "category": None, "evidence": None}

    explicit = _explicit_category(_lookup(record, "failure_attribution"))
    if explicit:
        return {"is_loss": True, "category": explicit, "evidence": "failure_attribution"}

    if _lookup(record, "was_whipsawed") is True:
        return {"is_loss": True, "category": "WHIPSAW", "evidence": "was_whipsawed"}

    if _lookup(record, "decoupling_detected") is True:
        return {"is_loss": True, "category": "CROSS_ASSET_DECOUPLING", "evidence": "decoupling_detected"}

    if _lookup(record, "macro_directional_accuracy") is False:
        return {"is_loss": True, "category": "MACRO_DIRECTION_WRONG", "evidence": "macro_directional_accuracy"}

    exit_reason = _text(_lookup(record, "exit_reason"))
    if any(token in exit_reason for token in ("STOP", "SL", "BREAKEVEN", "TP")):
        return {"is_loss": True, "category": "EXIT_OR_STOP_MANAGEMENT", "evidence": "exit_reason"}

    return {"is_loss": True, "category": "UNEXPLAINED", "evidence": None}


def _group_value(record: Mapping[str, Any], key: str) -> str:
    value = _lookup(record, key)
    return _text(value) or "UNKNOWN"


def attribute_losses(
    records: Iterable[Mapping[str, Any]],
    *,
    group_by: Sequence[str] = (),
) -> Dict[str, Any]:
    """Aggregate loss modes; never optimizes or activates a trading filter."""
    materialized = list(records)
    losses = [
        (record, result)
        for record in materialized
        if (result := classify_loss(record))["is_loss"]
    ]
    counts = Counter(result["category"] for _, result in losses)
    total = len(losses)

    report: Dict[str, Any] = {
        "methodology_version": "loss-attribution-v1",
        "production_activation": False,
        "records_seen": len(materialized),
        "losses": total,
        "categories": {},
        "evidence_coverage_pct": 0.0,
        "unexplained_pct": 0.0,
        "groups": {},
    }

    for category in LOSS_CATEGORIES:
        count = counts.get(category, 0)
        report["categories"][category] = {
            "count": count,
            "pct_of_losses": round(count / total * 100.0, 2) if total else 0.0,
        }

    unexplained = counts.get("UNEXPLAINED", 0)
    report["evidence_coverage_pct"] = round(
        (total - unexplained) / total * 100.0, 2
    ) if total else 0.0
    report["unexplained_pct"] = round(
        unexplained / total * 100.0, 2
    ) if total else 0.0

    if group_by:
        grouped: Dict[str, Dict[str, Counter]] = defaultdict(
            lambda: {"categories": Counter(), "losses": Counter()}
        )
        for record, result in losses:
            group_key = "|".join(
                f"{key}={_group_value(record, key)}" for key in group_by
            )
            grouped[group_key]["categories"][result["category"]] += 1
            grouped[group_key]["losses"]["total"] += 1

        report["groups"] = {
            key: {
                "losses": value["losses"]["total"],
                "categories": dict(value["categories"]),
            }
            for key, value in sorted(grouped.items())
        }

    return report
