from dataclasses import dataclass
from typing import Optional, List, Dict, Any
from datetime import datetime

# --- Özel Hata Sınıfları ---

class ResearchError(Exception):
    """Araştırma modülü için temel hata sınıfı."""
    pass

class DataValidationError(ResearchError):
    """Veri doğrulama hataları için."""
    pass

class ProcessingError(ResearchError):
    """İşleme sırasındaki hatalar için."""
    pass

# --- Veri Sınıfları ---

@dataclass(frozen=True)
class Signal:
    signal_id: str
    symbol: str
    timestamp: datetime
    direction: str
    score: float
    metadata: Dict[str, Any]

@dataclass(frozen=True)
class Trade:
    trade_id: str
    signal_id: str
    entry_price: float
    exit_price: Optional[float]
    pnl: Optional[float]
    status: str

@dataclass(frozen=True)
class DiagnosticReport:
    report_id: str
    timestamp: datetime
    target_id: str
    issues: List[str]
    severity: str
    summary: str
