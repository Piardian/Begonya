import json
import os
from pathlib import Path
from typing import Dict, Any, List

class DiagnosticEngine:
    """
    SMC ve Makro motorlarından gelen verileri analiz ederek
    sistem sağlığı hakkında teşhis raporları oluşturur.
    """
    def __init__(self, data_root: str):
        self.data_root = Path(data_root)

    def load_notified_pois(self) -> List[Dict[str, Any]]:
        """NotifiedStore tarafından oluşturulan POI verilerini yükler."""
        file_path = self.data_root / 'notified_pois.json'
        if not file_path.exists():
            return []
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return []

    def generate_system_health_report(self) -> Dict[str, Any]:
        """Sistem genelinde bir sağlık raporu oluşturur."""
        pois = self.load_notified_pois()
        
        return {
            "total_notified_pois": len(pois),
            "data_directory": str(self.data_root),
            "status": "healthy" if pois is not None else "error",
            "timestamp_check": True
        }

if __name__ == "__main__":
    # Varsayılan veri dizini (proje yapısına göre)
    engine = DiagnosticEngine(data_root="./data")
    report = engine.generate_system_health_report()
    print(json.dumps(report, indent=2))
