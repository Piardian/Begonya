from __future__ import annotations

import argparse
import datetime as dt
import json
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Optional

from calibration.replay import run_replay
from ingestion.mt5_market_data import MT5MarketDataIngestion
from preprocessing.metrics import MacroMetricsCalculator


class HistoricalMarketReplayIngestion(MT5MarketDataIngestion):
    """Research-only MT5 historical adapter. Never changes production ingestion."""

    def fetch_symbol_snapshot(
        self,
        generic_name: str,
        as_of: dt.datetime,
        n_bars: int = 60,
    ) -> Optional[Dict[str, Any]]:
        if as_of.tzinfo is None:
            as_of = as_of.replace(tzinfo=dt.timezone.utc)
        as_of = as_of.astimezone(dt.timezone.utc)

        if not self._check_connection():
            return None

        broker_sym = self.find_broker_symbol(generic_name)
        if not broker_sym:
            return None

        try:
            # MT5 bars are selected strictly by bar open time <= as_of.
            end = as_of.replace(tzinfo=None)
            rates = mt5.copy_rates_from(
                broker_sym,
                mt5.TIMEFRAME_D1,
                end,
                n_bars,
            )
            if rates is None or len(rates) < 2:
                return None

            rows = [r for r in rates if dt.datetime.fromtimestamp(
                int(r["time"]), tz=dt.timezone.utc
            ) <= as_of]
            if len(rows) < 2:
                return None

            closes = [float(r["close"]) for r in rows]
            current_val = closes[-1]
            prev_val = closes[-2]
            val_5d_ago = closes[-6] if len(closes) >= 6 else closes[0]
            month_ago_val = closes[-21] if len(closes) >= 21 else closes[0]

            if generic_name.upper() == "BTC" and current_val < 10000.0:
                return None
            if generic_name.upper() in {"BRENT", "WTI"} and current_val < 30.0:
                return None
            if generic_name.upper() == "DXY" and not 70.0 <= current_val <= 150.0:
                return None

            pct = lambda a, b: round(((a - b) / b) * 100, 2) if b else 0.0
            return {
                "value": round(current_val, 4),
                "prev": round(prev_val, 4),
                "val_5d_ago": round(val_5d_ago, 4),
                "month_ago": round(month_ago_val, 4),
                "change_pct": pct(current_val, prev_val),
                "change_pct_5d": pct(current_val, val_5d_ago),
                "change_pct_4w": pct(current_val, month_ago_val),
                "pct_rank_60d": round(
                    sum(1 for x in closes if x <= current_val) / len(closes) * 100, 1
                ),
                "history_close": closes,
                "source": f"MT5 Historical Broker Feed ({broker_sym})",
                "snapshot_timestamp": as_of.isoformat(),
            }
        except Exception:
            return None


def build_market_snapshot(
    ingestion: HistoricalMarketReplayIngestion,
    symbols: Iterable[str],
    as_of: dt.datetime,
) -> Dict[str, Any]:
    snapshot: Dict[str, Any] = {}
    missing: List[str] = []
    for symbol in symbols:
        item = ingestion.fetch_symbol_snapshot(symbol, as_of)
        if item is None:
            missing.append(symbol)
        else:
            snapshot[symbol] = item

    if missing:
        raise RuntimeError(
            "Historical market snapshot incomplete; no fallback is permitted: "
            + ", ".join(sorted(missing))
        )

    snapshot["_metadata"] = {
        "timestamp": as_of.isoformat(),
        "source": "MT5_HISTORICAL_ONLY",
        "lookahead_policy": "bar_open_time_must_be_<=_as_of",
    }
    return snapshot


def load_rows(path: Path) -> List[Mapping[str, Any]]:
    rows = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(rows, list):
        raise ValueError("Replay dataset must be a JSON list")
    return rows


def process_snapshot(
    market: Mapping[str, Any],
    fred: Mapping[str, Any],
    events: List[Dict[str, Any]],
    *,
    as_of_date: dt.date,
    as_of_datetime: dt.datetime,
    now_utc: dt.datetime,
    previous_regime_state: Mapping[str, Any],
) -> Dict[str, Any]:
    calculator = MacroMetricsCalculator(as_of_date=as_of_date)
    return calculator.process_all_macro_data(
        dict(market),
        dict(fred),
        events,
        as_of_date=as_of_date,
        as_of_datetime=as_of_datetime,
        previous_regime_state=previous_regime_state,
        now_utc=now_utc,
    )


def replay_dataset(path: Path) -> List[Dict[str, Any]]:
    return run_replay(load_rows(path), process_snapshot)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Research-only historical macro replay")
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    results = replay_dataset(args.dataset)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(results, ensure_ascii=False, indent=2, default=str),
        encoding="utf-8",
    )
    print(f"replay_rows={len(results)}")
    print(f"output={args.output}")


if __name__ == "__main__":
    main()
