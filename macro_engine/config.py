import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).parent.resolve()
ENV_FILE = BASE_DIR / ".env"

# Mevcut .env dosyasından 4 anahtarı oku
EXISTING_ENV = Path(r"C:\Users\piard\.gemini\antigravity\scratch\crewai_aider_orchestrator\.env")
ROOT_ENV = BASE_DIR.parent / ".env"
if ROOT_ENV.exists():
    load_dotenv(ROOT_ENV)
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
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")

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
    "SOL": "SOL-USD",        # Solana (Yüksek Beta Kripto)
    "CA02Y": "CAD2Y=X",      # Kanada 2 Yıllık Tahvil Getirisi
    "DE02Y": "DE02Y=X",      # Almanya 2 Yıllık Tahvil Getirisi (Schatz)
    "GB02Y": "GB02Y=X",      # İngiltere 2 Yıllık Tahvil Getirisi (Gilt)
    "AU02Y": "AU02Y=X",      # Avustralya 2 Yıllık Tahvil Getirisi
    "IRON_ORE": "TIO=F",     # Demir Cevheri Vadeli (Iron Ore 62% Fe)
    "DAIRY_GDT": "DAIRY",    # Küresel Süt Fiyat Endeksi (Global Dairy Trade)
    "NZ02Y": "NZD2Y=X",      # Yeni Zelanda 2 Yıllık Tahvil Getirisi
}

# Histeresis ve Eşik Değeri Ayarları (Whipsaw / Titreme Önleyici)
HYSTERESIS_CONFIG = {
    "BRENT_ENERGY_PENALTY_ENTER": 85.0,  # Brent bu seviyenin üzerine çıkınca ceza aktifleşir
    "BRENT_ENERGY_PENALTY_EXIT": 81.0,   # Brent bu seviyenin altına inmeden ceza kalkmaz (~%5 marj)
    "RISK_PRESERVATION_ENTER": 0.65,     # Risk skoru bu seviyeyi aşınca sermaye koruma aktifleşir
    "RISK_PRESERVATION_EXIT": 0.50,      # Risk skoru bu seviyenin altına inmeden koruma kalkmaz
    "SPREAD_DESYNC_NOISE_BPS": 3.0,      # Seans uyuşmazlığı gürültü eşiği (±3.0 bps altı değişimler nötr kabul edilir)
}

# Yüksek Etkili Kırmızı Bülten (Red-Folder) Dondurma Ayarları
NEWS_FREEZE_CONFIG = {
    "FREEZE_MINUTES_BEFORE": 15,
    "FREEZE_MINUTES_AFTER": 15,
    "HIGH_IMPACT_KEYWORDS": [
        "non-farm", "nfp", "payrolls", "unemployment rate",
        "cpi", "consumer price index", "core cpi", "pce",
        "fomc", "interest rate decision", "rate decision",
        "ecb", "boe", "rba", "rbnz", "boc", "boj"
    ]
}

# Portföy Beta Kümelenme ve Korelasyon Tavanı (Portfolio Exposure Caps)
PORTFOLIO_EXPOSURE_CONFIG = {
    "MAX_USD_CONCURRENT_LEGS": 2,       # Aynı anda tek yönde en fazla 2 aktif USD pozisyonu
    "MAX_JPY_CONCURRENT_LEGS": 2,       # Aynı anda tek yönde en fazla 2 aktif JPY pozisyonu
    "MAX_CRYPTO_CONCURRENT_LEGS": 1,    # Aynı anda en fazla 1 aktif yüksek beta Kripto pozisyonu
    "MAX_TOTAL_PORTFOLIO_RISK": 2.5     # Toplam eşzamanlı maksimum portföy riski (2.5x lot)
}

# MT5 Entegrasyon Yolu
MT5_SCALPER_DIR = Path(r"C:\Users\piard\.gemini\antigravity\scratch\MT5_EURUSD_NewsScalper")
BIAS_GATE_FILE = BASE_DIR / "gateways" / "macro_bias_gate.json"

