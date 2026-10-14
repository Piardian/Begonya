import unittest
import json
import os
import tempfile
from diagnostics.diagnostic_engine import DiagnosticEngine

class TestDiagnosticEngine(unittest.TestCase):
    def setUp(self):
        # Test için geçici bir dizin oluştur
        self.test_dir = tempfile.TemporaryDirectory()
        self.engine = DiagnosticEngine(self.test_dir.name)

    def tearDown(self):
        self.test_dir.cleanup()

    def test_load_notified_pois_empty(self):
        """Veri dosyası yokken boş liste dönmeli."""
        pois = self.engine.load_notified_pois()
        self.assertEqual(pois, [])

    def test_load_notified_pois_with_data(self):
        """Veri dosyası varken verileri doğru okumalı."""
        mock_data = [{"id": "test_1", "symbol": "BTCUSD"}]
        file_path = os.path.join(self.test_dir.name, 'notified_pois.json')
        
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(mock_data, f)
            
        pois = self.engine.load_notified_pois()
        self.assertEqual(len(pois), 1)
        self.assertEqual(pois[0]['id'], "test_1")

    def test_generate_report(self):
        """Rapor oluşturma fonksiyonunun temel yapısını test et."""
        report = self.engine.generate_system_health_report()
        self.assertIn("total_notified_pois", report)
        self.assertEqual(report["status"], "healthy")

if __name__ == '__main__':
    unittest.main()
