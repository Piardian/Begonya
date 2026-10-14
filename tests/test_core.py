import unittest
import json
import os
import tempfile
from research.diagnostic_engine import DiagnosticEngine

class TestDiagnosticEngine(unittest.TestCase):
    def setUp(self):
        # Test için geçici bir dizin oluştur
        self.test_dir = tempfile.TemporaryDirectory()
        # DiagnosticEngine'in beklediği data_root'u ayarla
        self.engine = DiagnosticEngine(self.test_dir.name)

    def tearDown(self):
        self.test_dir.cleanup()

    def test_load_notified_pois_empty(self):
        """Veri dosyası yokken boş liste dönmeli."""
        pois = self.engine.load_notified_pois()
        self.assertEqual(pois, [])

    def test_load_notified_pois_with_data(self):
        """Veri dosyası varken verileri doğru okumalı."""
        mock_data = [{"id": "test_1", "symbol": "BTCUSD", "timestamp": "2023-10-27T10:00:00"}]
        file_path = os.path.join(self.test_dir.name, 'notified_pois.json')
        
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(mock_data, f)
            
        pois = self.engine.load_notified_pois()
        self.assertEqual(len(pois), 1)
        self.assertEqual(pois[0]['id'], "test_1")

    def test_calculate_metrics(self):
        """Metrik hesaplama mantığını test et."""
        mock_data = [{"id": "test_1", "timestamp": "2023-10-27T10:00:00"}]
        metrics = self.engine.calculate_metrics(mock_data)
        
        self.assertIn("frequency", metrics)
        self.assertEqual(metrics["total_processed"], 1)

    def test_generate_markdown_report(self):
        """Rapor oluşturma fonksiyonunun çıktısını test et."""
        metrics = {
            "frequency": {"7_day_signal_count": 1, "14_day_signal_count": 1, "30_day_signal_count": 1, "60_day_signal_count": 1},
            "total_processed": 1,
            "filter_success_rate": 0.75,
            "pnl_analysis": {"total_r": 10.0, "expectancy": 0.5}
        }
        report = self.engine.generate_markdown_report(metrics)
        self.assertIn("# Begonya Sinyal Teşhis Raporu", report)
        self.assertIn("Toplam İşlenen Sinyal: 1", report)

if __name__ == '__main__':
    unittest.main()
