import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).parent.resolve()
ENV_FILE = BASE_DIR / ".env"

# Mevcut .env dosyasından 4 anahtarı oku
EXISTING_ENV = Path(r"C:\Users\piard\.gemini\antigravity\scratch\crewai_aider_orchestrator\.env")
if ENV_FILE.exists():
    load_dotenv(ENV_FILE)
elif EXISTING_ENV.exists():
    load_dotenv(EXISTING_ENV)
else:
    load_dotenv()

# 4 Adet Google Gemini API Anahtarı (Ortam değişkenlerinden veya .env dosyasından okunur)
GEMINI_KEYS = [
    k for k in [
        os.getenv("GEMINI_USER_A_KEY", ""),
        os.getenv("GEMINI_USER_B_KEY", ""),
        os.getenv("GEMINI_USER_C_KEY", ""),
        os.getenv("GEMINI_USER_D_KEY", ""),
        os.getenv("GEMINI_API_KEY", ""),
    ] if k
]

# 1. Baş Stratejist (Ajan 3) Modeli Kademesi
# Gemini 3.8 Flash -> 3.7 Flash -> 3.6 Flash -> 3.5 Flash
STRATEGIST_CASCADE = [
    "gemini-3.8-flash",
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-2.5-flash",
]

# 2. Analist / Çalışan Ajanlar (Ajan 1 & Ajan 2) Kademesi
# Gemini 3.5 Flash Lite -> 3.1 Flash Lite -> 2.5 Flash Lite -> 3.5 Flash
ANALYST_CASCADE = [
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-2.5-flash-lite",
    "gemini-3.5-flash",
    "gemini-2.5-flash",
]

# FRED (Federal Reserve Economic Data) API Anahtarı
FRED_API_KEY = os.getenv("FRED_API_KEY", "")

# Takip Edilecek Temel Semboller
MARKET_SYMBOLS = {
    "DXY": "DX-Y.NYB",       # US Dollar Index
    "GOLD": "GC=F",          # Altın Vadeli / XAUUSD
    "BRENT": "BZ=F",         # Brent Ham Petrol
    "WTI": "CL=F",           # WTI Ham Petrol
    "US10Y": "^TNX",         # 10 Yıllık ABD Tahvil Getirisi
    "US02Y": "2YY=F",        # 2 Yıllık ABD Tahvil Getirisi
    "BTC": "BTC-USD",        # Bitcoin
    "SPX": "^GSPC",          # S&P 500
    "COPPER": "HG=F",        # Bakır
    "VIX": "^VIX",           # Cboe Volatilite Endeksi (Hisse/Piyasa Oynaklığı)
    "HYG": "HYG",            # iShares iBoxx $ High Yield Corporate Bond ETF
    "LQD": "LQD",            # iShares iBoxx $ Investment Grade Corporate Bond ETF
    "EUR_BOND": "IBGM.AS",   # iShares EUR Govt Bond 7-10yr ETF (Almanya/Euro Tahvil Göstergesi)
}

# Histeresis ve Eşik Değeri Ayarları (Whipsaw / Titreme Önleyici)
HYSTERESIS_CONFIG = {
    "BRENT_ENERGY_PENALTY_ENTER": 85.0,  # Brent bu seviyenin üzerine çıkınca ceza aktifleşir
    "BRENT_ENERGY_PENALTY_EXIT": 81.0,   # Brent bu seviyenin altına inmeden ceza kalkmaz (~%5 marj)
    "RISK_PRESERVATION_ENTER": 0.65,     # Risk skoru bu seviyeyi aşınca sermaye koruma aktifleşir
    "RISK_PRESERVATION_EXIT": 0.50,      # Risk skoru bu seviyenin altına inmeden koruma kalkmaz
}

# MT5 Entegrasyon Yolu
MT5_SCALPER_DIR = Path(r"C:\Users\piard\.gemini\antigravity\scratch\MT5_EURUSD_NewsScalper")
BIAS_GATE_FILE = BASE_DIR / "gateways" / "macro_bias_gate.json"

