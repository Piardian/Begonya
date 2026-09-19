from __future__ import annotations

import argparse
import datetime as dt
import json
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Optional

import yfinance as yf

from calibration.replay import run_replay
from config import MARKET_SYMBOLS
from ingestion.mt5_market_data import MT5MarketDataIngestion, mt5
from preprocessing.metrics import MacroMetricsCalculator


class HistoricalMarketReplayIngestion(MT5MarketDataIngestion):
    """Research-only historical adapter. Production ingestion is untouched."""

    def _from_mt5(self, generic_name: str, as_of: dt.datetime, n_bars: int) -> Optional[Dict[str, Any]]:
        if mt5 is None or not self._check_connection():
            return None
        broker_sym = self.find_broker_symbol(generic_name)
        if not broker_sym:
            return None
        try:
            rates = mt5.copy_rates_from(broker_sym, mt5.TIMEFRAME_D1, as_of, n_bars)
            if rates is None:
                return None
            rows = [
                r for r in rates
                if dt.datetime.fromtimestamp(int(r["time"]), tz=dt.timezone.utc) <= as_of
            ]
            if len(rows) < 2:
                return None
            closes = [float(r["close"]) for r in rows]
            return self._build_payload(generic_name, closes, as_of, f"MT5 Historical Broker Feed ({broker_sym})")
        except Exception:
            return None

    @staticmethod
    def _from_yfinance(generic_name: str, as_of: dt.datetime, n_bars: int) -> Optional[Dict[str, Any]]:
        ticker = MARKET_SYMBOLS.get(generic_name)
        if not ticker:
            return None
        try:
            start = as_of.date() - dt.timedelta(days=max(120, n_bars * 3))
            end = as_of.date() + dt.timedelta(days=1)
            hist = yf.Ticker(ticker).history(
                start=start.isoformat(),
                end=end.isoformat(),
                interval="1d",
                auto_adjust=False,
            )
            if hist.empty:
                return None
            closes = [float(x) for x in hist["Close"].dropna().tolist() if float(x) > 0][-n_bars:]
            if len(closes) < 2:
                return None
            return HistoricalMarketReplayIngestion._build_payload(
                generic_name, closes, as_of, f"Yahoo Finance Historical ({ticker})"
            )
        except Exception:
            return None

    @staticmethod
    def _build_payload(generic_name: str, closes: List[float], as_of: dt.datetime, source: str) -> Dict[str, Any]:
        current_val = closes[-1]
        prev_val = closes[-2]
        val_5d_ago = closes[-6] if len(closes) >= 6 else closes[0]
        month_ago_val = closes[-21] if len(closes) >= 21 else closes[0]
        pct = lambda a, b: round(((a - b) / b) * 100, 2) if b else 0.0

        if generic_name == "BTC" and current_val < 10000.0:
            raise ValueError("BTC historical symbol/value validation failed")
        if generic_name in {"BRENT", "WTI"} and current_val < 30.0:
            raise ValueError("oil historical symbol/value validation failed")
        if generic_name == "DXY" and not 70.0 <= current_val <= 150.0:
            raise ValueError("DXY historical symbol/value validation failed")

        return {
            "value": round(current_val, 4),
            "prev": round(prev_val, 4),
            "val_5d_ago": round(val_5d_ago, 4),
            "month_ago": round(month_ago_val, 4),
            "change_pct": pct(current_val, prev_val),
            "change_pct_5d": pct(current_val, val_5d_ago),
            "change_pct_4w": pct(current_val, month_ago_val),
            "pct_rank_60d": round(sum(1 for x in closes if x <= current_val) / len(closes) * 100, 1),
            "history_close": closes,
            "source": source,
            "snapshot_timestamp": as_of.isoformat(),
        }

    def fetch_symbol_snapshot(self, generic_name: str, as_of: dt.datetime, n_bars: int = 60) -> Optional[Dict[str, Any]]:
        if as_of.tzinfo is None:
            as_of = as_of.replace(tzinfo=dt.timezone.utc)
        as_of = as_of.astimezone(dt.timezone.utc)
        # Real broker history first; Yahoo is a real-data research fallback.
        return self._from_mt5(generic_name, as_of, n_bars) or self._from_yfinance(generic_name, as_of, n_bars)


def build_market_snapshot(ingestion: HistoricalMarketReplayIngestion, symbols: Iterable[str], as_of: dt.datetime) -> Dict[str, Any]:
    snapshot: Dict[str, Any] = {}
    missing: List[str] = []
    for symbol in symbols:
        item = ingestion.fetch_symbol_snapshot(symbol, as_of)
        if item is None:
            missing.append(symbol)
        else:
            snapshot[symbol] = item
    if missing:
        raise RuntimeError("Historical market snapshot incomplete; no synthetic fallback permitted: " + ", ".join(sorted(missing)))
    snapshot["_metadata"] = {
        "timestamp": as_of.isoformat(),
        "source_policy": "MT5_FIRST_THEN_YAHOO_REAL_DATA_ONLY",
        "lookahead_policy": "historical_rows_must_be_<=_as_of",
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
        dict(market), dict(fred), events,
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
    args.output.write_text(json.dumps(results, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    print(f"replay_rows={len(results)}")
    print(f"output={args.output}")


if __name__ == "__main__":
    main()
