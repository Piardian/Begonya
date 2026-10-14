# Begonya Araştırma ve Teşhis Modülü

Bu dizin, **Begonya** hibrit işlem sisteminin performansını analiz etmek, sistem loglarını incelemek ve sinyal kalitesini raporlamak için kullanılan araçları içerir.

## Amaç
Sistemin canlı verilerini ve geçmiş performans kayıtlarını (benchmark) okuyarak, işlem sinyallerinin doğruluğunu ve makro rejim uyumunu denetlemek.

## Kurulum
Gerekli kütüphaneleri yüklemek için:
```bash
pip install -r requirements.txt
```

## Kullanım
Teşhis sürecini başlatmak ve `diagnostics/` klasörü altında bir rapor oluşturmak için:
```bash
python run.py
```

## Teşhis Metodolojisi
1. **Veri Okuma:** Sistem kayıtları (`benchmark_records.json` vb.) taranır.
2. **Analiz:** Sinyal başarı oranları, makro veto durumları ve risk çarpanları hesaplanır.
3. **Raporlama:** `diagnostics/begonya_signal_diagnostic.md` dosyasına detaylı bir markdown raporu yazılır.
4. **Özet:** Terminal üzerinde `tabulate` kütüphanesi ile hızlı bir durum özeti gösterilir.
