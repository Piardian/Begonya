# Begonya Manual Replay

Research-only historical replay and manual trade journal. It does not connect to a broker and does not send live orders. The production strategy and live-order infrastructure are outside this module.

## Run locally

From the repository root on Windows:

```bat
research\manual_replay\start_replay.bat
```

The server binds to `127.0.0.1:8000`. The Python environment must have FastAPI and Uvicorn installed.

## Data configuration

Set `BEGONYA_REPLAY_DATA_PATHS` to one or more directories containing historical candle JSON files. Separate multiple directories with the platform path separator (`; ` on Windows, `:` on Linux/macOS; do not include spaces around the separator).

Expected filenames are `SYMBOL_1m.json`, `SYMBOL_1m_1y.json`, `SYMBOL_1m_30d.json`, and similarly for `15m`, `1h`, and `4h`. M5 is resampled from five complete, consecutive M1 candles. Data timestamps must be Unix milliseconds representing candle-open time. Each row must contain positive finite `open`, `high`, `low`, and `close` values with valid OHLC relationships.

Data-directory precedence is the order in `BEGONYA_REPLAY_DATA_PATHS`, then repository-local Begonya data, then legacy local paths. Within the first matching directory, the adapter prefers the declared `_1y` filename, then the unsuffixed filename, then `_30d`; it does not infer coverage from file size.

Example PowerShell:

```powershell
$env:BEGONYA_REPLAY_DATA_PATHS = "D:\market-data\Begonya;D:\market-data\MT5"
$env:BEGONYA_REPLAY_SESSION_DIR = "D:\market-data\saved-replays"
$env:BEGONYA_MACRO_RECORDS_PATH = "D:\market-data\macro_records.json"
research\manual_replay\start_replay.bat
```

## Session storage

Saved sessions default to `~/.begonya/manual_replay/saved_sessions`. Override this with `BEGONYA_REPLAY_SESSION_DIR`.

A saved session can only be restored if its stored dataset checksums match the currently loaded local dataset. This prevents silently continuing a session with changed historical data.

## Macro point-in-time requirements

The adapter will only mark a macro snapshot as PIT-verified when a record includes an explicit availability timestamp, one of:

- `available_at_utc`
- `published_at_utc`
- `release_timestamp_utc`
- `first_seen_at_utc`

A record containing only `timestamp_utc` is not sufficient evidence of when the information became available. Such records are reported as unverified and do not produce an actionable bias gate. Missing currency scores or pair gates are not silently converted to neutral values.

The source record format must preserve historical vintages/revisions to establish true point-in-time correctness; a timestamp field alone cannot prove that later revisions were excluded.

## Execution and accounting assumptions

- Historical OHLC is treated as mid-price data.
- Limit fills inferred from an M1 candle are not allowed to trigger SL/TP on that same candle because the intrabar path is unknown.
- Same-candle SL/TP conflicts are resolved conservatively in favor of SL.
- Gross PnL is mid-price-to-mid-price. Spread, slippage, and commission are reported separately and deducted for net PnL.
- Risk-based sizing includes modeled execution costs and floors down to 0.01 lots. If the minimum lot would exceed the risk budget, sizing fails rather than silently increasing risk.
- USDJPY and USDCAD PnL is converted from quote currency to USD using the exit/reference price.
- The built-in cost profiles are assumptions, not historical bid/ask data or a guarantee of any particular broker's execution.

## Tests

From the repository root:

```bash
PYTHONPATH=research python -m pytest research/manual_replay/tests/test_all_manual_replay.py -q
python -m compileall -q research/manual_replay
node --check research/manual_replay/web/static/app.js
```

The regression suite uses in-memory fixtures and does not depend on developer-specific data directories.
