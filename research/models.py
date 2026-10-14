from dataclasses import dataclass, field
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

class NotFoundError(ResearchError):
    """Kayıt veya kaynak bulunamadığında fırlatılır."""
    pass


# --- Veri Sınıfları ---

@dataclass(frozen=True)
class SignalDiagnostic:
    """Sinyal istatistikleri ve teşhis verileri."""
    signal_id: str
    symbol: str
    timestamp: datetime
    direction: str
    score: float
    status: str
    metrics: Dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class TradeResult:
    """İşlem sonuçları ve PnL verileri."""
    trade_id: str
    signal_id: str
    symbol: str
    entry_price: float
    exit_price: Optional[float]
    pnl: Optional[float]
    pnl_percentage: Optional[float]
    entry_time: datetime
    exit_time: Optional[datetime]
    status: str


@dataclass(frozen=True)
class FilterMetrics:
    """Filtreleme süreçleri ve performans metrikleri."""
    filter_name: str
    passed_count: int
    rejected_count: int
    rejection_reasons: Dict[str, int] = field(default_factory=dict)


@dataclass(frozen=True)
class DiagnosticReport:
    """Genel teşhis raporu yapısı."""
    report_id: str
    generated_at: datetime
    signals_summary: List[SignalDiagnostic]