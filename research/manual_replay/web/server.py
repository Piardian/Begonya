"""
Begonya Manual Replay - Web API & Application Server
====================================================
FastAPI backend providing REST endpoints for the interactive TradingView chart,
timeline progression, order simulator, macro HUD, and session management.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict, List, Optional
from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from manual_replay.session.session_store import SessionStore, ReplaySession

logger = logging.getLogger("Begonya.ManualReplay.Server")

STATIC_DIR = Path(__file__).parent / "static"

app = FastAPI(title="Begonya Manual Replay API", version="1.0.0")

session_store = SessionStore()


# --- Pydantic Request Models ---
class CreateSessionRequest(BaseModel):
    symbol: str = "EURUSD"
    initial_balance: float = Field(default=10000.0, gt=0, le=1_000_000_000)


class LoadSessionRequest(BaseModel):
    session_id: str


class StepRequest(BaseModel):
    timeframe: str = "1m"
    count: int = Field(default=1, ge=1, le=100_000)


class JumpRequest(BaseModel):
    timestamp_ms: Optional[int] = None
    iso_time: Optional[str] = None


class PlaceOrderRequest(BaseModel):
    order_type: str = "MARKET"
    direction: str = "BUY"
    price: float
    stop_loss: float
    take_profit: float
    volume_lots: Optional[float] = None
    risk_percent: float = 1.0
    reason_tag: Optional[str] = None


# --- Endpoints ---
@app.get("/api/symbols")
def get_supported_symbols():
    return {
        "symbols": [
            {"symbol": "EURUSD", "name": "Euro / US Dollar", "tier": "PRIMARY_FULL_1Y_M1"},
            {"symbol": "GBPUSD", "name": "British Pound / US Dollar", "tier": "PRIMARY_FULL_1Y_M1"},
            {"symbol": "XAUUSD", "name": "Gold / US Dollar", "tier": "PRIMARY_FULL_1Y_M1"},
            {"symbol": "BTCUSD", "name": "Bitcoin / US Dollar", "tier": "CRYPTO_M1_30D"},
            {"symbol": "ETHUSD", "name": "Ethereum / US Dollar", "tier": "CRYPTO_M1_2MO"},
            {"symbol": "SOLUSD", "name": "Solana / US Dollar", "tier": "CRYPTO_M1_2MO"},
            {"symbol": "USDJPY", "name": "US Dollar / Japanese Yen", "tier": "FX_M1_3MO"},
            {"symbol": "USDCAD", "name": "US Dollar / Canadian Dollar", "tier": "FX_M1_3MO"},
        ]
    }


@app.post("/api/session/create")
def create_session(req: CreateSessionRequest):
    try:
        session = session_store.create_session(req.symbol, req.initial_balance)
        return session.get_snapshot()
    except (ValueError, FileNotFoundError, KeyError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/session/load")
def load_session(req: LoadSessionRequest):
    try:
        session = session_store.load_saved_session(req.session_id)
        return session.get_snapshot()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (ValueError, KeyError, TypeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/session/{session_id}/snapshot")
def get_snapshot(session_id: str):
    session = session_store.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session.get_snapshot()


@app.get("/api/session/{session_id}/candles")
def get_candles(
    session_id: str,
    timeframe: str = "15m",
    include_forming: bool = False,
    limit: int = Query(default=5000, ge=1, le=20000),
):
    session = session_store.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        total_visible = session.clock.get_visible_candle_count(timeframe, include_forming=include_forming)
        candles = session.clock.get_visible_candles(timeframe, include_forming=include_forming, limit=limit)
        # Format for Lightweight Charts: { time: seconds, open, high, low, close }
        formatted = [
            {
                "time": int(c.timestamp / 1000),
                "open": c.open,
                "high": c.high,
                "low": c.low,
                "close": c.close,
            }
            for c in candles
        ]
        return {
            "symbol": session.symbol,
            "timeframe": timeframe,
            "count": len(formatted),
            "total_visible_count": total_visible,
            "truncated": total_visible > len(formatted),
            "candles": formatted,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/session/{session_id}/step")
def step_session(session_id: str, req: StepRequest):
    session = session_store.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        return session.advance_bar(req.timeframe, req.count)
    except (ValueError, KeyError, RuntimeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/session/{session_id}/jump")
def jump_session(session_id: str, req: JumpRequest):
    session = session_store.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        if req.timestamp_ms is not None:
            target_time = req.timestamp_ms
        elif req.iso_time:
            from datetime import datetime, timezone
            parsed = datetime.fromisoformat(req.iso_time.replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            target_time = int(parsed.timestamp() * 1000)
        else:
            raise HTTPException(status_code=400, detail="timestamp_ms or iso_time is required")
        return session.advance_to(target_time, reason={"type": "jump"})
    except HTTPException:
        raise
    except (ValueError, KeyError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/session/{session_id}/order")
def place_order(session_id: str, req: PlaceOrderRequest):
    session = session_store.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        return session.place_manual_order(
            order_type=req.order_type,
            direction=req.direction,
            price=req.price,
            stop_loss=req.stop_loss,
            take_profit=req.take_profit,
            volume_lots=req.volume_lots,
            risk_percent=req.risk_percent,
            reason_tag=req.reason_tag,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/session/{session_id}/close")
def close_position(session_id: str):
    session = session_store.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        return session.close_open_position()
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/session/{session_id}/save")
def save_session(session_id: str):
    session = session_store.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    saved_path = session.save_to_disk()
    return {"status": "SUCCESS", "file_path": str(saved_path), "snapshot": session.get_snapshot()}


@app.get("/api/sessions/saved")
def list_saved_sessions():
    return {"saved_sessions": session_store.list_saved_sessions()}


# Mount static assets
if STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")
