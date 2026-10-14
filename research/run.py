import os
import time
import json
import pandas as pd
from tabulate import tabulate
from datetime import datetime

# Yapılandırma
DIAGNOSTICS_DIR = "diagnostics"
REPORT_FILE = os.path.join(DIAGNOSTICS_DIR, "begonya_signal_diagnostic.md")
BENCHMARK_PATH = "../benchmark/benchmark_records.json"

def ensure_directories():
    """Teşhis klasörünün varlığını kontrol et."""
    if not os.path.exists(DIAGNOSTICS_DIR):
        os.makedirs(DIAGNOSTICS_DIR)

def run_diagnostic():
    """Sistem verilerini oku ve analiz et."""
    try:
        print(f"[{datetime.now().strftime('%H:%M:%S')}] Teşhis süreci başlatılıyor...")
        
        # Veri okuma simülasyonu (Gerçek dosya yapısına göre güncellenebilir)
        if not os.path.exists(BENCHMARK_PATH):
            print(f"Uyarı: {BENCHMARK_PATH} bulunamadı. Boş veri ile devam ediliyor.")
            data = []
        else:
            with open(BENCHMARK_PATH, 'r') as f:
                data = json.load(f)

        # DataFrame oluşturma
        df = pd.DataFrame(data)
        
        # Basit analiz (Örnek)
        summary = {
            "Toplam Sinyal": len(df),
            "Başarı Oranı": "N/A" if len(df) == 0 else f"{(df.get('success', 0).mean() * 100):.2f}%"
        }

        # Rapor oluşturma
        with open(REPORT_FILE, "w", encoding="utf-8") as f:
            f.write(f"# Begonya Teşhis Raporu - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
            f.write(f"## Özet\n")
            f.write(f"- Toplam Kayıt: {summary['Toplam Sinyal']}\n")
            f.write(f"- Başarı Oranı: {summary['Başarı Oranı']}\n")
            f.write("\n---\n*Otomatik oluşturulmuştur.*")

        # Terminal çıktısı
        table = [[k, v] for k, v in summary.items()]
        print("\n--- Teşhis Özeti ---")
        print(tabulate(table, headers=["Metrik", "Değer"], tablefmt="grid"))
        print(f"\nDetaylı rapor şuraya kaydedildi: {REPORT_FILE}")

    except Exception as e:
        print(f"Hata oluştu: {e}")

def main():
    """Ana event loop."""
    ensure_directories()
    
    print("Begonya Teşhis Modülü Aktif.")
    try:
        while True:
            run_diagnostic()
            # 60 saniyede bir çalıştır
            time.sleep(60)
    except KeyboardInterrupt:
        print("\nTeşhis süreci kullanıcı tarafından durduruldu.")
    except Exception as e:
        print(f"Kritik hata: {e}")

if __name__ == "__main__":
    main()
