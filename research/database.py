import asyncio
from typing import Protocol, List, Any, Optional
from .models import Signal, Trade, DiagnosticReport

# --- Arayüz Tanımları (Salt Okunur) ---

class ReadOnlyRepository(Protocol):
    """Veri okuma işlemleri için güvenli arayüz."""
    
    async def get_signal(self, signal_id: str) -> Optional[Signal]:
        ...
        
    async def get_trades_by_signal(self, signal_id: str) -> List[Trade]:
        ...
        
    async def get_latest_diagnostics(self, limit: int = 10) -> List[DiagnosticReport]:
        ...

# --- Asenkron İşleme Altyapısı ---

class AsyncDataProcessor:
    """Asenkron veri işleme için event loop yönetimi."""
    
    def __init__(self):
        self._loop = asyncio.get_event_loop()

    async def run_analysis(self, task_func, *args, **kwargs) -> Any:
        """Verilen görevi asenkron olarak çalıştırır."""
        return await task_func(*args, **kwargs)

    def execute_sync(self, coro) -> Any:
        """Asenkron bir görevi senkron bağlamda çalıştırır."""
        return self._loop.run_until_complete(coro)
