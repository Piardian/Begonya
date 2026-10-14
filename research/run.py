import os
import sys
import time
import argparse
from datetime import datetime
from loguru import logger
from diagnostics_engine import DiagnosticsEngine

# Yapılandırma
DIAGNOSTICS_DIR = "diagnostics"
RESEARCH_DIR = "research"
REPORT_FILE = os.path.join(DIAGNOSTICS_DIR, "begonya_signal_diagnostic.md")

# Loguru yapılandırması
logger.remove()
logger.add(sys.stdout, format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level:<=8}</level> | <cyan>{message}</cyan>", level="INFO")
logger.add("diagnostics/execution.log", rotation="10 MB", level="DEBUG")

def ensure_directories():
    """Gerekli klasörlerin varlığını kontrol et."""
    try:
        if not os.path.exists(DIAGNOSTICS_DIR):
            os.makedirs(DIAGNOSTICS_DIR)
            logger.info(f"Dizin oluşturuldu: {DIAGNOSTICS_DIR}")
        if not os.path.exists(RESEARCH_DIR):
            os.makedirs(RESEARCH_DIR)
            logger.info(f"Dizin oluşturuldu: {RESEARCH_DIR}")
    except Exception as e:
        logger.error(f"Dizinler oluşturulurken hata meydana geldi: {e}")
        raise

def run_diagnostic_once(engine):
    """Tek seferlik teşhis analizi çalıştırır ve özeti terminale ve loglara yazdırır."""
    logger.info("Teşhis süreci başlatılıyor...")
    
    try:
        results = engine.analyze_signals()
        
        if isinstance(results, dict) and "error" in results:
            logger.error(f"Analiz hatası tespit edildi: {results['error']}")
            return False
            
        success = engine.generate_report(results, REPORT_FILE)
        if success:
            logger.success(f"Rapor başarıyla oluşturuldu: {REPORT_FILE}")
            print("\n--- TEŞHİS ÖZETİ ---")
            if isinstance(results, dict):
                for key, value in results.items():
                    print(f"{key.replace('_', ' ').title()}: {value}")
            else:
                print(f"Sonuçlar: {results}")
            print("--------------------\n")
            return True
        else:
            logger.error("Rapor oluşturulurken hata meydana geldi.")
            return False
    except Exception as e:
        logger.exception(f"Teşhis yürütülürken beklenmeyen bir hata oluştu: {e}")
        return False

def main():
    """Ana çalıştırma işlevi (Event loop yapısı ve CLI parametreleri)."""
    parser = argparse.ArgumentParser(description="Begonya Teşhis Modülü")
    parser.add_argument("--loop", action="store_true", help="Sürekli döngü modunda çalıştır (60sn aralıkla)")
    parser.add_argument("--interval", type=int, default=60, help="Döngü modunda bekleme süresi (saniye)")