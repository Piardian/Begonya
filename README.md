# 🌺 Begonya: Kurumsal Makro Rejim & SMC Checklist İşlem Sistemi

**Begonya**, çoklu Google Gemini yapay zeka ajanları ile küresel likidite ve getiri eğrilerini analiz eden kurumsal makro motor (**MakroEkomiAnalisti**) ile M5/M15/H1 zaman dilimlerinde likidite süpürmeleri, BOS kırılımları ve emir bloklarını takip eden akıllı SMC tetikleme motorunu (**ChecklistTrigger**) tek bir çatı altında birleştiren hibrit bir algoritmik işlem çerçevesidir.

---

## 🏛️ Begonya İki Katmanlı Hibrit Mimarisi

```
                                 [ KÜRESEL PİYASA VERİLERİ ]
                       (MT5 Live Ticks, FRED API, Takvim Haberleri)
                                            │
                                            ▼
                    ┌───────────────────────────────────────────────┐
                    │  1. MAKROEKONOMİK REJİM MOTORU (Python)       │
                    │  • Getiri Eğrisi & 20-Günlük Eğim (Spread_20D)│
                    │  • TIPS Reel Faizler (DFII10) & Histeresis    │
                    │  • Likidite Dinamikleri (WALCL - RRP - TGA)   │
                    │  • Çoklu Ajan Konsensüsü (Ajan 1, 2, 3)      │
                    │  • T-0 Anlık Stres Devre Kesicisi (VIX/OAS)   │
                    └───────────────────────┬───────────────────────┘
                                            │ Atomik JSON Kapısı
                                            ▼
                              [ shared/macro_bias_gate.json ]
                           (Yön Kısıtı: LONG_ONLY / SHORT_ONLY,
                            Risk Çarpanı: 0.5x, 1.0x, VETO)
                                            │
                                            ▼
                    ┌───────────────────────────────────────────────┐
                    │  2. SMC MİKRO TETİKLEYİCİ MOTORU (TypeScript) │
                    │  • TwelveData / MT5 Bar & Fiyat Akışı         │
                    │  • BOS / CHoCH Yapısal Kırılım Tespiti       │
                    │  • OB / FVG / Likidite Süpürme Algoritmaları │
                    │  • Killzone (Londra / New York) Zamanlama     │
                    │  • Begonya Macro Gate Veto & Risk Ölçekleme   │
                    └───────────────────────┬───────────────────────┘
                                            │
                                            ▼
                    [ KUSURSUZ İŞLEM BİLDİRİMİ / YÜRÜTME ]
                    • Telegram Detaylı Checklist Kartı
                    • Çok Zaman Dilimli Grafik Kanıtı (1M / 15M / 1H)
                    • Makro Stratejist Rasyoneli & Risk Uyumu
```

---

## 🛡️ Hiyerarşik Yönetişim (Top-Down Governance)

1. **Makro Veto Yetkisi:**
   - Makro motor bir varlık için örneğin `DEFENSIVE_HOLD` veya `SHORT_ONLY` kararı vermişse, SMC motoru M15'te kusursuz bir Long sinyali (A+ Grade) üretse dahi bu sinyal **"🛑 VETO: Makro Rejim Uyuşmazlığı"** gerekçesiyle işlemden men edilir.
2. **Dinamik Risk Çarpanı:**
   - Sermaye koruma, tahvil arz şoku veya BTC decoupling dönemlerinde risk çarpanı dinamik olarak `0.5x` veya `0.25x` seviyesine çekilir.
3. **Kriz Kalkanı (T-0 Fast Stress):**
   - VIX fırladığında veya kredi makası (HY OAS) çöktüğünde tüm yönlü işlemler anında dondurulur.

---

## 🚀 Hızlı Başlangıç

### 1. Ortam Değişkenlerini Ayarlayın
`.env.example` dosyasını `.env` olarak kopyalayın ve API anahtarlarınızı girin:
```bash
cp .env.example .env
```

### 2. Sistem Sağlık Denetimini Çalıştırın
```bash
python orchestrator/health_check.py
```

### 3. Sistemi Başlatın
Windows üzerinde tek tıkla:
```bat
orchestrator\start_begonya.bat
```
veya terminalden:
```bash
python orchestrator/start_begonya.py
```
