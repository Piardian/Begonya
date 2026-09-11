# 🌺 Begonya: Kurumsal Makro Rejim & SMC Checklist Hibrit İşlem Sistemi

[![CI Pipeline](https://github.com/Piardian/Begonya/actions/workflows/ci.yml/badge.svg)](https://github.com/Piardian/Begonya/actions)
[![Python Version](https://img.shields.io/badge/python-3.12%2B-blue.svg)](https://www.python.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-3178c6.svg)](https://www.typescriptlang.org/)
[![Testing](https://img.shields.io/badge/tests-Jest%20%7C%20Passing-brightgreen.svg)](https://jestjs.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Architecture](https://img.shields.io/badge/Architecture-Hybrid%20Macro%20%2B%20SMC-purple.svg)]()

**Begonya**, kurumsal düzeyde iki temel ayağı tek bir orkestrasyon çatısı altında birleştiren hibrit bir algoritmik işlem çerçevesidir:
1. **Makroekonomik Rejim Motoru (`macro_engine`):** Çoklu Google Gemini yapay zeka ajanları, FRED veri entegrasyonu, ABD Hazine getiri eğrisi dinamiği (2Y/10Y spread), TIPS reel faizleri ve Fed net likidite metrikleriyle piyasanın birincil rejimini ve yön kısıtını belirler.
2. **SMC Mikro Tetikleyici Motoru (`smc_engine`):** M5/M15/H1/H4 zaman dilimlerinde TwelveData üzerinden akan piyasa verilerini analiz eder; BOS kırılımları, likidite süpürmeleri, Order Block (OB), Fair Value Gap (FVG), Likidite Mıknatısı (Liquidity Magnet) ve Karşıt Engel (Opposing Obstacle) tespitleriyle milisaniyelik seviyede A+/A kalite işlem sinyalleri üretir.

---

## 🏛️ Begonya İki Katmanlı Hibrit Mimarisi

```text
                                 [ KÜRESEL PİYASA VERİLERİ ]
                        (TwelveData API, FRED API, Takvim & Makro)
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
                             Risk Çarpanı: 0.25x, 0.5x, 1.0x, VETO)
                                             │
                                             ▼
                     ┌───────────────────────────────────────────────┐
                     │  2. SMC MİKRO TETİKLEYİCİ MOTORU (TypeScript) │
                     │  • TwelveData / Çok Zaman Dilimli Bar Akışı  │
                     │  • BOS / CHoCH Yapısal Kırılım Tespiti       │
                     │  • OB / FVG / Likidite Süpürme Algoritmaları │
                     │  • Likidite Mıknatısı (+1 Puan Bonusu)        │
                     │  • Karşıt Engel Kalkanı (<=15 Pip B+ Sınırı)  │
                     │  • Killzone (Londra / New York) Zamanlama     │
                     │  • Begonya Macro Gate Veto & Risk Ölçekleme   │
                     └───────────────────────┬───────────────────────┘
                                             │
                                             ▼
                     [ KUSURSUZ İŞLEM BİLDİRİMİ & GÖRSEL KANIT ]
                     • Telegram Detaylı Checklist Kartı (@Begonyamatematiksel_bot)
                     • Çok Zaman Dilimli Grafik Kanıtı (1M / 15M / 1H)
                     • Makro Stratejist Gerekçesi & Dinamik Risk Çarpanı
```

---

## 🛡️ Hiyerarşik Yönetişim (Top-Down Governance)

Begonya'nın en temel kurumsal prensibi **Hiyerarşik Yönetişimdir**:

1. **Makro Veto Yetkisi:**
   - Makro motor bir varlık için `DEFENSIVE_HOLD`, `NEUTRAL_RANGE` veya `SHORT_ONLY` kararı vermişse, SMC motoru M15'te kusursuz bir Long sinyali (A+ Grade) üretse dahi bu işlem **"🛑 VETO: Makro Rejim Uyuşmazlığı"** gerekçesiyle reddedilir ve yürütülmez.
2. **Asimetrik Enstrüman Kuralları:**
   - **Altın / Gümüş (XAUUSD / SILVER):** Mali hakimiyet ve para birimi erozyonu çağında, sistemik deflasyonist nakde kaçış haricinde Altın/Gümüş üzerinde Short sinyalleri makro düzeyde engellenir.
   - **Kripto Decoupling Kalkanı:** Tahvil faizlerindeki ani şoklar ve likidite çekilmelerinde kripto varlıklarda (BTC/ETH/SOL) long açılması engellenir.
   - **Endeks (SPX/NAS100) VIX Kalkanı:** Aşırı yükselmiş VIX ortamlarında ayı piyasası rallisi veya squeeze riski nedeniyle gecikmiş shortlar veto edilir.
3. **Dinamik Sermaye Riski Çarpanı:**
   - Sermaye koruma modu, faiz belirsizliği veya stres dönemlerinde pozisyon başına tahsis edilen risk çarpanı dinamik olarak `0.25x` veya `0.50x` seviyesine çekilir.
4. **T-0 Anlık Kriz Kalkanı (Fast Stress Override):**
   - Canlı piyasada VIX fırladığında veya kredi makası çöktüğünde tüm yönlü işlemler milisaniyeler içinde dondurulur.

---

## 📁 Proje Dizin Mimarisi

```text
Begonya/
├── .github/
│   └── workflows/
│       └── ci.yml                   # GitHub Actions Sürekli Entegrasyon Pipeline'ı
├── benchmark/
│   ├── BEGONYA_BENCHMARK_JOURNAL.md # Kurumsal geriye dönük test ve işlem jurnali
│   └── benchmark_records.json       # Sayısal metrik kayıtları
├── config/
│   └── symbol_map.json              # MT5, TwelveData ve Makro sembol eşleşmeleri
├── macro_engine/                    # [PYTHON] Makroekonomik Rejim & Ajan Motoru
│   ├── agents/                      # Gemini tabanlı uzman makro ajanları ve şemalar
│   ├── core/                        # Çoklu API anahtarı havuz yöneticisi (KeyManager)
│   ├── daemon/                      # Arka plan periyodik rejim güncelleme servisi
│   ├── gateways/                    # JSON kapı çıktı üreticileri
│   ├── ingestion/                   # FRED API ve canlı makro veri toplayıcıları
│   ├── preprocessing/               # Getiri eğrisi, TIPS reel faiz, likidite hesaplayıcıları
│   ├── config.py                    # Makro motor ayarları
│   ├── main.py                      # Makro analiz giriş noktası
│   └── requirements.txt             # Python bağımlılıkları
├── orchestrator/                    # [PYTHON] Birleşik Süreç Orkestratörü
│   ├── health_check.py              # Sistem entegrasyonu ve sağlık denetleyicisi
│   └── start_begonya.py             # Eş zamanlı alt süreç ve PID kilit yöneticisi
├── shared/                          # [IPC] Çapraz Motor Durum ve İletişim Alanı
│   └── macro_bias_gate.json         # Atomik makro rejim ve yönlü kapı durumu
├── smc_engine/                      # [TYPESCRIPT] SMC Mikro Tetikleyici Motoru
│   ├── server/                      # Poller, pipeline, candleStore, Telegram & chart servisleri
│   ├── src/                         # BOS/CHoCH, OB/FVG, Liquidity Magnet, Grade hesaplayıcı
│   ├── tests/                       # Kapsamlı Jest test suiteleri (100% Passing)
│   ├── package.json                 # Node bağımlılıkları ve çalıştırma komutları
│   └── tsconfig.json                # TypeScript derleme ayarları
├── .env.example                     # Örnek ortam değişkenleri şablonu
├── .gitignore                       # Güvenlik ve depo hijyeni kuralları
├── CONTRIBUTING.md                  # Katkı sağlama yönergeleri ve commit standardı
├── LICENSE                          # MIT Lisansı
├── README.md                        # Ana proje kılavuzu ve dokümantasyon
├── SECURITY.md                      # Güvenlik ve hassas anahtar koruma şartnamesi
├── start_begonya.bat                # Windows hızlı başlatma betiği
└── start_begonya_task.bat           # Windows Görev Zamanlayıcı başlatma betiği
```

---

## 🚀 Kurulum ve Çalıştırma

### 1. Ön Gereksinimler
- **Python:** 3.12 veya üzeri
- **Node.js:** 20.x veya üzeri & npm
- **Git:** Sürüm kontrol sistemi

### 2. Depoyu Klonlayın
```bash
git clone https://github.com/Piardian/Begonya.git
cd Begonya
```

### 3. Ortam Değişkenlerini Tanımlayın
`.env.example` dosyasını ana dizinde `.env` olarak kopyalayın:
```bash
cp .env.example .env
```
Gerekli API anahtarlarını yapılandırın:
```env
# Google Gemini API Keys (Rotasyonlu veya Tekil)
GEMINI_API_KEY=your_gemini_api_key
GEMINI_USER_A_KEY=your_gemini_api_key_1

# FRED (Federal Reserve Bank of St. Louis) API Key
FRED_API_KEY=your_fred_api_key

# Twelve Data Market Data API Key
TWELVE_DATA_API_KEY=your_twelvedata_api_key

# Telegram Bot & Alert Settings
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_CHAT_ID=your_chat_id
```

### 4. Bağımlılıkları Yükleyin

#### SMC Motoru (TypeScript):
```bash
cd smc_engine
npm install
cd ..
```

#### Makro Motoru (Python):
```bash
cd macro_engine
pip install -r requirements.txt
cd ..
```

---

## 🧪 Test & Sistem Doğrulama

### A) Birleşik Sistem Sağlık Denetimi
Tüm alt modüllerin, sembol eşleşmelerinin ve IPC JSON kapısının bütünlüğünü tek komutla test edin:
```bash
python orchestrator/health_check.py
```
*Beklenen çıktı:*
```text
  ✅ Macro Engine Core              : PASS
  ✅ Macro Gate Data                : PASS
  ✅ SMC Engine & Bridge            : PASS
  ✅ Symbol Map                     : PASS
🎉 BEGONYA SİSTEMİ %100 SAĞLIKLI VE ÇALIŞMAYA HAZIR!
```

### B) SMC Motoru Birim ve Entegrasyon Testleri
```bash
cd smc_engine
node --max-old-space-size=4096 ./node_modules/jest/bin/jest.js tests/liquidityMagnetDetector.test.ts tests/opposingObstacleDetector.test.ts tests/smc2Rules.test.ts tests/poller.test.ts tests/telegramFormatter.test.ts tests/sharedCache.test.ts
```

---

## 🚦 Canlı Sistemi Başlatma

### Windows Üzerinde Tek Tıkla:
Doğrudan `start_begonya.bat` dosyasını çalıştırabilirsiniz.

### Terminal Üzerinden Orkestratör ile:
```bash
python orchestrator/start_begonya.py
```
Orkestratör şunları otomatik olarak yönetir:
1. `orchestrator/begonya_orchestrator.lock` ile tekil process garantisi.
2. `macro_engine` rejim servisini arka planda bağımsız başlatma.
3. `smc_engine` TwelveData poller ve mikro tetikleyiciyi başlatma.
4. Alt süreçlerin sağlığını izleme ve beklenmedik kapanmada otomatik yeniden başlatma (fail-safe recovery).

---

## 🔒 Güvenlik & Gizlilik Politikası

Begonya sıfır-sızıntı prensibini benimser. Hiçbir API anahtarı, bot tokenı veya yerel işlem verisi git deposuna dahil edilmez. Detaylı güvenlik prosedürleri için lütfen [SECURITY.md](SECURITY.md) dosyasını inceleyiniz.

---

## 📄 Lisans

Bu proje **[MIT Lisansı](LICENSE)** kapsamında lisanslanmıştır. Telif Hakkı (c) 2026 Piardian.
