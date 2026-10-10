import yfinance as yf
import pandas as pd
import json
import os
import sys

# 23 Non-Crypto Symbols (Excluding BTCUSD, ETHUSD, SOLUSD, LTCUSD)
TICKERS = {
    # 7 Core FX Majors
    'EURUSD': 'EURUSD=X',
    'GBPUSD': 'GBPUSD=X',
    'AUDUSD': 'AUDUSD=X',
    'USDCAD': 'USDCAD=X',
    'USDJPY': 'USDJPY=X',
    'NZDUSD': 'NZDUSD=X',
    'USDCHF': 'USDCHF=X',
    # 14 FX Crosses
    'AUDCAD': 'AUDCAD=X',
    'EURGBP': 'EURGBP=X',
    'EURJPY': 'EURJPY=X',
    'GBPJPY': 'GBPJPY=X',
    'CADJPY': 'CADJPY=X',
    'AUDJPY': 'AUDJPY=X',
    'EURAUD': 'EURAUD=X',
    'NZDCAD': 'NZDCAD=X',
    'EURCHF': 'EURCHF=X',
    'GBPCHF': 'GBPCHF=X',
    'AUDCHF': 'AUDCHF=X',
    'CADCHF': 'CADCHF=X',
    'NZDCHF': 'NZDCHF=X',
    'CHFJPY': 'CHFJPY=X',
    # 2 Commodities & Indices
    'XAUUSD': 'GC=F',
    'NAS100': 'NQ=F',
}

sys.stdout.reconfigure(encoding='utf-8')

def fetch_and_build():
    output_dir = os.path.join(os.path.dirname(__file__), '..', 'smc_engine', 'data')
    os.makedirs(output_dir, exist_ok=True)
    out_file = os.path.join(output_dir, 'backtest_candles_3mo_noncrypto.json')
    
    result = {}
    print(f"[FETCH] Downloading 3-month (60 trading days / 80 calendar days) 15M candles for {len(TICKERS)} non-crypto symbols...")
    
    for symbol, ticker in TICKERS.items():
        try:
            print(f"  -> Fetching {symbol} ({ticker})...", end="", flush=True)
            df = yf.Ticker(ticker).history(period='60d', interval='15m')
            if len(df) == 0:
                print(" ❌ No data")
                continue
            
            df = df[['Open', 'High', 'Low', 'Close']].rename(columns=str.lower)
            df_1h = df.resample('1h').agg({'open': 'first', 'high': 'max', 'low': 'min', 'close': 'last'}).dropna()
            df_4h = df.resample('4h').agg({'open': 'first', 'high': 'max', 'low': 'min', 'close': 'last'}).dropna()
            
            decimals = 2 if 'JPY' in symbol or symbol in ('XAUUSD', 'NAS100') else 5
            
            candles_15m = [
                {
                    'timestamp': int(idx.timestamp() * 1000),
                    'open': round(float(row['open']), decimals),
                    'high': round(float(row['high']), decimals),
                    'low': round(float(row['low']), decimals),
                    'close': round(float(row['close']), decimals),
                }
                for idx, row in df.iterrows()
            ]
            candles_1h = [
                {
                    'timestamp': int(idx.timestamp() * 1000),
                    'open': round(float(row['open']), decimals),
                    'high': round(float(row['high']), decimals),
                    'low': round(float(row['low']), decimals),
                    'close': round(float(row['close']), decimals),
                }
                for idx, row in df_1h.iterrows()
            ]
            candles_4h = [
                {
                    'timestamp': int(idx.timestamp() * 1000),
                    'open': round(float(row['open']), decimals),
                    'high': round(float(row['high']), decimals),
                    'low': round(float(row['low']), decimals),
                    'close': round(float(row['close']), decimals),
                }
                for idx, row in df_4h.iterrows()
            ]
            
            result[symbol] = {
                '15m': candles_15m,
                '1h': candles_1h,
                '4h': candles_4h
            }
            print(f" [OK] {len(candles_15m)} bars (15m), {len(candles_1h)} bars (1h), {len(candles_4h)} bars (4h)")
        except Exception as e:
            print(f" [ERROR] Error: {e}")
            
    print(f"\n[SAVE] Saving {len(result)} symbols to {out_file}...")
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(result, f)
    print(f"[DONE] Complete! File size: {os.path.getsize(out_file) / 1024 / 1024:.2f} MB")

if __name__ == '__main__':
    fetch_and_build()
