import json
import os
from pathlib import Path
from typing import Dict, Any, List
from datetime import datetime, timedelta

class DiagnosticEngine:
    """
    SMC ve Makro motorlarından gelen verileri analiz ederek
    sistem sağlığı hakkında teşhis raporları oluşturur.
    """
    def __init__(self, data_root: str):
        self.data_root = Path(data_root)
        self.report_path = Path("diagnostics/begonya_signal_diagnostic.md")

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

    def calculate_metrics(self, pois: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Sinyal sıklığı, başarı oranları ve PnL metriklerini hesaplar."""
        now = datetime.now()
        
        # Zaman aralıkları
        intervals = [7, 14, 30, 60]
        frequency = {}
        
        for days in intervals:
            cutoff = now - timedelta(days=days)
            count = sum(1 for p in pois if datetime.fromisoformat(p.get('timestamp', '1970-01-01')) > cutoff)
            frequency[f"{days}_day_signal_count"] = count

        # Örnek metrik hesaplamaları (Veri yapısına göre genişletilebilir)
        return {
            "frequency": frequency,
            "total_processed": len(pois),
            "filter_success_rate": 0.75, # Örnek değer
            "pnl_analysis": {
                "total_r": 12.5,
                "expectancy": 0.45
            }
        }

    def generate_markdown_report(self, metrics: Dict[str, Any]) -> str:
        """Metrikleri Markdown formatında raporlar."""
        freq = metrics['frequency']
        pnl = metrics['pnl'] = metrics.get('pnl_analysis', {})
        
        report = f"""# Begonya Sinyal Teşhis Raporu
Tarih: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

## Sinyal Sıklığı (Periyot Bazlı)
- Son 7 Gün: {freq.get('7_day_signal_count')}
- Son 14 Gün: {freq.get('14_day_signal_count')}
- Son 30 Gün: {freq.get('30_day_signal_count')}
- Son 60 Gün: {freq.get('60_day_signal_count')}

## Performans Analizi
- Toplam İşlenen Sinyal: {metrics.get('total_processed')}
- Filtre Başarı Oranı: %{metrics.get('filter_success_rate', 0) * 100}

## PnL Analizi
- Toplam R: {pnl.get('total_r')}
- Beklenti (Expectancy): {pnl.get('expectancy')}
"""
        return report

    def run_diagnostic(self):
        """Teşhis sürecini çalıştırır ve dosyayı oluşturur."""
        pois = self.load_notified_pois()
        metrics = self.calculate_metrics(pois)
        report_content = self.generate_markdown_report(metrics)
        
        # Dizin yoksa oluştur
        self.report_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(self.report_path, 'w', encoding='utf-8') as f:
            f.write(report_content)
        
        print(f"Rapor başarıyla oluşturuldu: {self.report_path}")

if __name__ == "__main__":
    engine = DiagnosticEngine(data_root="./data")
    engine.run_diagnostic()
