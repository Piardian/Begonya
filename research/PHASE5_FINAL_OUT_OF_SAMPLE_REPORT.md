# BEGONYA — PHASE 5: FROZEN STRATEGY FINAL OUT-OF-SAMPLE EVALUATION REPORT

**Tarih:** 14 Ekim 2026  
**Değerlendirme Kapsamı:** Tamamen Bağımsız ve Daha Önce Görülmemiş Tarihsel Dönem (Out-of-Sample)  
**Test Edilen Dönem:** 1 Kasım 2025 00:00 UTC – 31 Mart 2026 23:59 UTC (5 Ay Kesintisiz OOS Veri)  
**Isınma (Warmup) Dönemi:** 10 Ekim 2025 – 31 Ekim 2025 (21 Gün 15M/1H/4H yapı ve swing tespiti)  
**Sembol Sepeti:** BTCUSD, ETHUSD, SOLUSD, EURUSD, GBPUSD, XAUUSD  
**Çalışma Alanı:** `research/` (Üretim stratejisine, macro gate eşiklerine ve canlı emir altyapısına dokunulmamıştır)  
**Canlı Emir Durumu:** `LIVE_ORDERS = false` (Kesin olarak kapalı)

---

## 1. Yönetici Özeti ve Nihai Karar

Begonya SMC stratejisinin dondurulmuş üretim sürümü, daha önce hiçbir parametre seçimi, optimizasyon veya test için kullanılmamış olan 5 aylık bağımsız **Out-of-Sample (OOS)** veri kümesi üzerinde (`replay_1year` 1 Kasım 2025 – 31 Mart 2026) test edilmiştir.

Test, Aşama 4B'de doğrulanmış olan **sızıntısız Bar 0 (`STRICT_BAR1`)** execution motoru ve üretim `SetupFamilyGuard` kurallarıyla bar-by-bar (mum kapanışı bazlı) yürütülmüştür.

### Temel Bulgular:
1. **İşlem Dağılımı:** 5 aylık OOS döneminde 131 sinyal üretilmiş; bunlardan 83'ü 16 bar içinde dolmayarak iptal olmuş (`EXPIRED_UNFILLED`), 48'i geçerli şekilde dolmuştur (`FILLED`).
2. **Üretim Stratejisi (15M Stop + 1.0R BE):** 48 işlemde yalnızca 8 TP, 33 SL ve 7 BE oluşmuştur. Kazanma oranı **%16,7**'de kalmış; brüt PnL **-17,00R**, maliyetler **13,21R** ve net PnL **-30,21R** ile derin bir sermaye erimesi gerçekleşmiştir.
3. **İşlem Başına Net Beklenti:** **-0,629R / işlem** (Her işlemde kasanın %63'ü oranında matematiksel negatif beklenti).
4. **No-BE ve Alternatif Senaryolar:** BE kuralının kaldırılması (No-BE) sonucu kurtarmamış, **-28,21R net zarar** üretmiştir.
5. **1H Yapısal Stop Varyantı:** Sürtünme maliyeti 7,75R'a inse dahi strateji **-11,75R net zarar** (-0,245R/işlem) ile negatif bölgede kalmıştır.
6. **Maliyet Duyarlılığı:** Maliyet çarpanı 1.25x'te -33.52R'a, 1.5x'te -36.82R'a, 2.0x'te -43.42R'a gerilemektedir.

```text
========================================================================================
NİHAİ DEĞERLENDİRME KARARI:
EDGE NOT ESTABLISHED — DO NOT DEPLOY
========================================================================================
```

---

## 2. Test Dönemi ve Veri Bütünlüğü Doğrulaması

- **Önceki Dönemlerle Örtüşmeme Kanıtı:** 
  - Önceki 90 günlük test: 1 Temmuz – 30 Eylül 2026
  - Önceki 6 aylık test (Aşama 3, 4A, 4B): 1 Nisan – 30 Eylül 2026
  - Phase 5 OOS Dönemi: **1 Kasım 2025 – 31 Mart 2026** (Önceki testlerin tamamen öncesinde, hiçbir parametre ayarında görülmemiş temiz veri).
- **Veri Sürekliliği ve Mum Kontrolü:**
  - BTCUSD, ETHUSD, SOLUSD: 14.496 adet 15M mumu (Sıfır anormal boşluk).
  - EURUSD (12.300 mum), GBPUSD (12.279 mum), XAUUSD (13.458 mum): Hafta sonu borsa tatilleri dışında sıfır anormal boşluk.
  - Veri kapsamı ve tarihsel süreklilik %100 doğrulanmıştır.

---

## 3. Dondurulan Strateji ve Replay Kuralları

Test sürecinde hiçbir kural, eşik veya filtre değiştirilmemiştir:
- **Sinyal Tespiti:** 15M POI (OB/FVG) + 1H/4H trend bias uyumu + `SetupFamilyGuard` tekilleştirme.
- **Emir İletimi:** Kırılım mumu kapandıktan sonra (`closeTs`), sonraki mum açılışında limit emir iletimi.
- **Zaman Aşımı:** 16 bar (4 saat) dolmayan emirler `EXPIRED_UNFILLED` olarak iptal (Sıfır maliyet/PnL).
- **Giriş Mumunda Fiyat Sızıntısı Koruması (`STRICT_BAR1`):** Giriş anından önceki tepe/dip hareketleri MFE, BE veya TP'ye sayılmamış; Bar 0'da yalnızca aleyhe hareket (SL kontrolü) yapılmıştır.
- **Aynı Mumda Çakışma:** SL ve TP seviyeleri aynı mumda görülürse `CONFLICT_SL_FIRST` işletilmiştir.
- **Veri Sonu:** Açık kalan emirler yapay kapatılmamış, mark-to-market `OPEN_TIMEOUT` olarak kaydedilmiştir.

---

## 4. Maliyet Modeli ve Çoklu Çarpan Duyarlılık Matrisi

Maliyetler komisyon, spread ve slippage bileşenleriyle pozisyon büyüklüğü ve stop mesafesine göre hesaplanmıştır:
- **Kripto (BTC, ETH, SOL):** %0,04-%0,05 komisyon + %0,01-%0,03 spread + %0,015-%0,035 slippage.
- **Forex (EURUSD, GBPUSD):** 0.6 - 0.95 pip spread + $6/lot komisyon + 0.25 - 0.3 pip slippage.
- **Emtia (XAUUSD):** $0.20 komisyon + $0.15 spread + $0.10 slippage.

### Maliyet Çarpanı Duyarlılık Tablosu

#### Üretim Modeli (15M Invalidation Stop + 1.0R BE)
| Maliyet Senaryosu | Toplam Maliyet | Brüt PnL | Net PnL | İşlem Başına Net Beklenti | Maksimum Drawdown |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **1.00x (Temel)** | 13,21R | -17,00R | **-30,21R** | **-0,629R** | 30,21R |
| **1.25x (Muhafazakâr)** | 16,52R | -17,00R | **-33,52R** | **-0,698R** | 33,52R |
| **1.50x (Yüksek Volatilite)** | 19,82R | -17,00R | **-36,82R** | **-0,767R** | 36,82R |
| **2.00x (Stres Testi)** | 26,42R | -17,00R | **-43,42R** | **-0,905R** | 43,42R |

#### Araştırma Modeli (1H Structural Stop + 1.0R BE)
| Maliyet Senaryosu | Toplam Maliyet | Brüt PnL | Net PnL | İşlem Başına Net Beklenti | Maksimum Drawdown |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **1.00x (Temel)** | 7,75R | -4,00R | **-11,75R** | **-0,245R** | 16,60R |
| **1.25x (Muhafazakâr)** | 9,68R | -4,00R | **-13,68R** | **-0,285R** | 18,26R |
| **1.50x (Yüksek Volatilite)** | 11,62R | -4,00R | **-15,62R** | **-0,325R** | 20,10R |
| **2.00x (Stres Testi)** | 15,49R | -4,00R | **-19,49R** | **-0,406R** | 23,79R |

---

## 5. Nihai Performans Metrikleri ve Karşılaştırmalı Tablo

### 5 Aylık Out-of-Sample Sepet Performansı (48 İşlem)

| Stop Modeli | Çıkış / BE Kuralı | TP | SL | BE | Açık | Kazanma Oranı | Brüt PnL | Maliyet | Net PnL | Net Beklenti | Profit Factor | Maks. DD |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **15M Üretim Stopu** | **A: 1.0R BE (Baseline)** | **8** | **33** | **7** | **0** | **16,7%** | **-17,00R** | **13,21R** | **-30,21R** | **-0,629R** | **0,48** | **30,21R** |
| 15M Üretim Stopu | B: BE Yok (No-BE) | 11 | 37 | 0 | 0 | 22,9% | -15,00R | 13,21R | -28,21R | -0,588R | 0,59 | 28,79R |
| 15M Üretim Stopu | C: 1.5R BE | 10 | 37 | 1 | 0 | 20,8% | -17,00R | 13,21R | -30,21R | -0,629R | 0,54 | 30,79R |
| **1H Yapısal Stop** | **A: 1.0R BE** | **12** | **28** | **8** | **0** | **25,0%** | **-4,00R** | **7,75R** | **-11,75R** | **-0,245R** | **0,86** | **16,60R** |
| 1H Yapısal Stop | B: BE Yok (No-BE) | 15 | 33 | 0 | 0 | 31,3% | -3,00R | 7,75R | -10,75R | -0,224R | 0,91 | 18,10R |
| 1H Yapısal Stop | C: 1.5R BE | 13 | 29 | 6 | 0 | 27,1% | -3,00R | 7,75R | -10,75R | -0,224R | 0,90 | 15,60R |

---

## 6. Sembol Bazında Dağılım Analizi (Üretim 15M Stop, 1.0R BE @ 1.0x Maliyet)

| Sembol | Üretilen Sinyal | Dolan İşlem | İptal / Süresi Dolan | TP | SL | BE | Brüt PnL | Net PnL | İşlem Başına Beklenti |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **BTCUSD** | 27 | 5 | 22 | 3 | 2 | 0 | +4,00R | **+1,78R** | +0,355R |
| **ETHUSD** | 22 | 11 | 11 | 0 | 9 | 2 | -9,00R | **-11,54R** | -1,049R |
| **SOLUSD** | 27 | 12 | 15 | 2 | 8 | 2 | -4,00R | **-7,80R** | -0,650R |
| **EURUSD** | 11 | 3 | 8 | 1 | 2 | 0 | 0,00R | **-0,74R** | -0,248R |
| **GBPUSD** | 30 | 12 | 18 | 2 | 8 | 2 | -4,00R | **-7,03R** | -0,586R |
| **XAUUSD** | 14 | 5 | 9 | 0 | 4 | 1 | -4,00R | **-4,88R** | -0,975R |
| **TOPLAM** | **131** | **48** | **83** | **8** | **33** | **7** | **-17,00R** | **-30,21R** | **-0,629R** |

### Sembol Bulguları:
- **Sepet Çöküşü:** 6 enstrümanın 5'inde (ETH, SOL, EUR, GBP, XAU) sonuç kesin olarak negatif beklentidedir.
- **ETHUSD ve GBPUSD Ağır Kayıp:** Özellikle ETHUSD'de 11 işlemde sıfır TP (%0 kazanma oranı) ve -11,54R kayıp gerçekleşmiştir.
- **BTCUSD Yetersiz Örneklemi:** BTCUSD'de 5 işlemde görülen +1,78R kâr istatistiksel bir gürültüdür; 5 işlem üzerinden bir stratejinin edge taşıdığı iddia edilemez.

---

## 7. Veri ve Örneklem Boyutu Sınırlamaları

1. **Örneklem:** 5 aylık sepet testinde 48 dolan işlem elde edilmiştir (minimum 50 kuralının hemen altındadır; sembol başına ortalama 8 işlem düşmektedir).
2. **Sinyal Dolum Oranı:** 131 sinyalin %63,4'ü (83 sinyal) 16 bar içinde dolmadan iptal olmuştur. Limit emirlerin dolum oranı %36,6'dır.
3. **Maliyet Baskısı:** 15M dar stoplarda kasanın %27,5'i (13,21R) sadece aracı kurum maliyetlerine (spread + komisyon + slippage) gitmektedir.

---

## 8. Kesin Karar ve Stratejik Sonuç

1. **Edge Yoktur:** Begonya'nın dondurulmuş SMC üretim stratejisi, bağımsız out-of-sample veri kümesinde net **-30,21R** zarar ve **-0,629R/işlem** negatif beklenti vermiştir. Sistemin temelinde pozitif bir matematiksel avantaj (edge) **yoktur**.
2. **BE Kuralı ile Çözülemez:** BE kuralı kaldırılarak (No-BE) yapılan testte de sonuç -28,21R zarardır. Problem çıkış kuralı değil, giriş sinyallerinin tahmin gücünün yetersizliğidir.
3. **Üretim Korunmuştur:** Üretim koduna dokunulmamış, canlı emirler kesin olarak kapalı tutulmuştur (`LIVE_ORDERS = false`).

```text
========================================================================================
RESMİ KARAR:
EDGE NOT ESTABLISHED — DO NOT DEPLOY
========================================================================================
```
Mevcut strateji sürümü canlıya aktarılmaya uygun değildir; hiçbir canlı emir yetkilendirmesi yapılmamalıdır.
