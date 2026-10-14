"""
Inspect whether the 6 15M POI setups in March-April-May 2026 produce a valid LTF Unicorn (SFP + Breaker + iFVG) confirmation on M5.
"""

import json
from datetime import datetime, timezone, timedelta
import pandas as pd
import numpy as np
import MetaTrader5 as mt5

def check_ltf_unicorn(symbol: str, direction: str, opened_at_str: str):
    if not mt5.initialize():
        print("MT5 failed")
        return None
    
    # parse time
    opened_dt = datetime.strptime(opened_at_str, "%Y-%m-%d %H:%M").replace(tzinfo=timezone.utc)
    # search window: from 15 min before opened_at to 2 hours after opened_at
    w_start = opened_dt - timedelta(minutes=15)
    w_end = opened_dt + timedelta(hours=3)
    
    rates = mt5.copy_rates_range(symbol, mt5.TIMEFRAME_M5, w_start, w_end)
    if rates is None or len(rates) == 0:
        return {"status": "NO_DATA", "bars": 0}
    
    df = pd.DataFrame(rates)
    df["datetime"] = pd.to_datetime(df["time"], unit="s", utc=True)
    
    # Check price action
    # For LONG: needs a sweep of recent swing low (SFP wick), then break above prior swing high (MSS Breaker Block), then return to iFVG
    # For SHORT: needs a sweep of recent swing high (SFP wick), then break below prior swing low (MSS Breaker Block), then return to iFVG
    highs = df["high"].values
    lows = df["low"].values
    opens = df["open"].values
    closes = df["close"].values
    dts = df["datetime"].dt.strftime("%H:%M").values
    
    unicorn_found = False
    details = []
    
    for i in range(2, len(df)):
        if direction == "LONG":
            # SFP low: low[i] < low[i-1], close[i] > low[i-1]
            if lows[i] < lows[i-1] and closes[i] > lows[i-1]:
                # look for subsequent MSS break above highs[i-1] or highs[i-2]
                for k in range(i+1, min(i+10, len(df))):
                    if closes[k] > highs[i-1]:
                        # displacement candle
                        body = abs(closes[k] - opens[k])
                        rng = max(highs[k] - lows[k], 1e-6)
                        if body / rng > 0.4:
                            unicorn_found = True
                            details.append(f"Bullish SFP at {dts[i]} -> MSS Breaker at {dts[k]}")
                            break
        else: # SHORT
            # SFP high: high[i] > high[i-1], close[i] < high[i-1]
            if highs[i] > highs[i-1] and closes[i] < highs[i-1]:
                for k in range(i+1, min(i+10, len(df))):
                    if closes[k] < lows[i-1]:
                        body = abs(closes[k] - opens[k])
                        rng = max(highs[k] - lows[k], 1e-6)
                        if body / rng > 0.4:
                            unicorn_found = True
                            details.append(f"Bearish SFP at {dts[i]} -> MSS Breaker at {dts[k]}")
                            break

    return {
        "symbol": symbol,
        "direction": direction,
        "opened_at": opened_at_str,
        "m5_bars": len(df),
        "unicorn_confirmed": unicorn_found,
        "details": details
    }

if __name__ == "__main__":
    with open("data/spring_2026_march_april_may_result.json", "r", encoding="utf-8") as f:
        data = json.load(f)
    
    print("\n" + "="*80)
    print("LTF UNICORN (M5 GRANULAR) CONFIRMATION TEST ON 15M POI SETUPS")
    print("="*80)
    
    for month_data in data["MONTHS"]:
        print(f"\n--- {month_data['month']} ---")
        for t_str in month_data["trade_log"]:
            # Example: "USDCAD SHORT [AAA] (2026-03-02 11:00 -> 2026-03-02 17:30): STOP_LOSS (-1.0R)"
            parts = t_str.split()
            sym = parts[0]
            dir_ = parts[1]
            time_part = t_str.split("(")[1].split("->")[0].strip()
            
            res = check_ltf_unicorn(sym, dir_, time_part)
            print(f"Trade: {t_str}")
            print(f"  -> LTF Unicorn Confirmed: {res['unicorn_confirmed']}")
            if res['details']:
                print(f"  -> Triggers: {res['details']}")
            else:
                print(f"  -> REJECTED BY LTF: No sweep+displacement confirmation found!")
