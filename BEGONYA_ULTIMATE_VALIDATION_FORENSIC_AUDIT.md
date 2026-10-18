# Begonya Ultimate Validation — Bağımsız Adli Denetim ve Tekilleştirme Raporu
**Belge Kodu:** `BEGONYA_ULTIMATE_VALIDATION_FORENSIC_AUDIT.md`  
**Tarih:** 14 Ekim 2026  
**Denetim Kapsamı:** `VAR_4_COMBINED_MACRO_AND_SESSION` Varyantının Kronolojik Dilimleme, Çift Kâr/Kayıp Tekilleştirmesi (Deduplication), Temiz Spread Modellemesi ve Gerçek OOS Protokolü Doğrulaması  
**Denetim Sonucu:** **`FAIL / REFUTED` (+29R ve +9.30R Sonuçları İptal Edildi — Kesin Tekilleştirilmiş Değerler Raporlandı)**  
**Canlı / Shadow Onayı:** **`REJECTED (KESİNLİKLE ONAYLANMADI)`**

---

## 1. Yönetici Özeti ve Nihai Denetim Bulguları

Bu bağımsız adli denetim (forensic audit), Begonya'nın `VAR_4` varyantı için raporlanan performans iddialarını kronolojik barlar, sinyal tekilleştirmesi ve yürütme muhasebesi açısından sıfırdan incelemiştir.

### Temel Bulgular

1. **M1 İndeks Dilimleme Hatası (Fatal Indexing Bug - Kanıtlandı & Düzeltildi):**  
   `ultimate_replay_engine.py` (satır 316) dosyasındaki göreceli indeks hatası nedeniyle Ağustos-Ekim 2026 işlemleri Temmuz barları üzerinde test edilmiş ve hayalî kazançlar (+29.00 R) üretilmişti. `[c for c in sym_m1 if c.timestamp > fill_ts]` ile gerçek ileri barlar bağlandığında 5 kazanan işlem doğrudan STOP_HIT'e dönüşmüştür.

2. **Aynı Setup Üzerinde Çift Kâr ve Çift Kayıp Yazılması (Duplicate Trades - Kanıtlandı & Düzeltildi):**  
   Replay motorunun aynı 15M mumunda hem OB (Order Block) hem FVG (Fair Value Gap) olarak etiketlenen eşzamanlı sinyalleri tekilleştirmeden 2 ayrı işlem gibi simüle ettiği tespit edilmiştir:
   - **İşlem 3 & 6 (XAUUSD Long, 2026-08-21 01:15):** Biri OB, diğeri FVG etiketli, aynı giriş (4519.72), aynı stop ve aynı hedefe sahip iki kopya işlemdir. Replay motoru aynı piyasa dalgasını iki kez kazanç yazarak **+5.00 R fazladan sanal kâr** üretmiştir.
   - **İşlem 5 & 7 (XAUUSD Long, 2026-08-25 15:30):** Biri OB, diğeri FVG etiketli, aynı giriş (4637.035) ve stop seviyesine sahip iki kopya işlemdir. Her ikisi de aynı dakikada stop olmuş ve **-1.00 R çift kayıp** yazılmıştır.
   - **Ex-Ante Tekilleştirme Kuralı (Setup Cluster / FIFO Rule):** Aynı enstrüman, yön ve fiyat bölgesinde aktif bir pozisyon varken veya aynı mum tetikleyicisinde oluşan mükerrer sinyaller tek bir piyasa pozisyonu olarak ele alınmış; işlem sayısı 19'dan **17'ye** düşürülmüştür.

3. **Spread Modellemesi & Çifte Cezalandırmanın Kaldırılması:**  
   Önceki denetim ara adımında, spread hem bar tepe/dip seviyelerine (Ask/Bid eşiği) eklenmiş, hem de realized R üzerinden `spread / risk` olarak ikinci kez düşülerek çifte ceza uygulanmıştı (+9.30 R ara tablosu). Temiz muhasebede:
   - Giriş ve çıkışlar doğru Bid/Ask seviyelerinde test edilir.
   - Engel aşıldığında net getiri, planlanan R üzerinden netleşir.
   - Bu düzeltme ve tekilleştirme sonrası kesin net getiri **`+6.84 R`** olarak hesaplanmıştır.

4. **Temmuz 2026 Verisi Kör Test Değildir (OOS Bütünlük Uyarısı):**  
   Temmuz 2026 verisi geriye dönük (lookback) bir veridir ve motor geliştirme sırasında çalışma dizininde mevcuttu. Gerçek bir Out-Of-Sample testi, geriye doğru değil; stratejinin hiç kalibre edilmediği ileriye dönük yeni veri (Ekim 2026 sonrası) veya daha önce hiç incelenmemiş çapraz enstrümanlar üzerinde yapılmalıdır.

---

## 2. Metriklerin Evrimi ve Karşılaştırma Matrisi

| Metrik | Orijinal Rapor (`ultimate_replay_engine.py`) | 1. Düzeltme (Dilimleme Düzeltilmiş, Çift Spreadli) | Kesin Düzeltilmiş Sonuç (Tekilleştirilmiş & Temiz Spread) | Fark (Orijinale Göre) | Denetim Hükmü |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Toplam İşlem Sayısı** | 19 | 19 | **17** | -2 Mükerrer İşlem | **Düzeltildi** |
| **Kazanan İşlem (Wins)** | 8 | 6 | **5** | -3 İşlem (%37.5 Kayıp) | **FAIL** |
| **Kaybeden İşlem (Losses)**| 11 | 13 | **12** | +1 İşlem | **FAIL** |
| **Kazanma Oranı (Win Rate)**| %42.11 | %31.58 | **%29.41** | **-12.70%** | **FAIL** |
| **Toplam Net R (Sum R)** | `+29.00 R` | `+9.30 R` | **`+6.84 R`** | **-22.16 R (%76.4 Şişirme!)** | **FAIL** |
| **Net Beklenti (Expectancy)**| `+1.53 R` | `+0.49 R` | **`+0.40 R`** | **-1.13 R (%73.8 Düşüş)** | **FAIL** |
| **Kâr Faktörü (Profit Factor)**| 3.64 | 1.66 | **1.57** | **-2.07 (Yarıdan Fazla Düştü)** | **FAIL** |
| **Maksimum Drawdown** | 8.00 R | 5.71 R | **6.00 R** | -2.00 R | **PASS** |
| **Gerçek Veri Kapsamı** | "6 Ay" | 46.9 Gün | **46.9 Gün (1.5 Ay)** | **-4.5 Ay Boşluk** | **FAIL** |

---

## 3. Kesin ve Tekilleştirilmiş 17 OOS İşlemi Tablosu

Aşağıdaki tablo; kronolojik olarak hatasız ileri barlar üzerinde simüle edilmiş, eşzamanlı kopya kurulumları tekilleştirilmiş (FIFO) ve temiz Bid/Ask kurallarıyla yürütülmüş 17 işlemin eksiksiz kayıtlarıdır:

| # | Sinyal Zamanı (UTC) | Sembol | Yön | Giriş | Stop | Risk | Hedef | PlanR | Çıkış Zamanı (UTC) | Çıkış Nedeni | Net Realized R |
| :-: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **1** | 2026-08-20 08:00 | ETHUSD | LONG | 2252.0100 | 2238.9700 | 13.0400 | 2317.2100 | 5.0R | 2026-08-20 09:09 | STOP_HIT | **-1.00R** |
| **2** | 2026-08-20 15:00 | XAUUSD | LONG | 4459.0950 | 4451.3688 | 7.7262 | 4497.7260 | 5.0R | 2026-08-20 15:34 | STOP_HIT | **-1.00R** |
| **3** | 2026-08-21 01:15 | XAUUSD | LONG | 4519.7200 | 4517.5280 | 2.1920 | 4530.6799 | 5.0R | 2026-08-21 02:12 | TARGET_HIT | **+5.00R** |
| **4** | 2026-08-21 05:45 | XAUUSD | LONG | 4538.7500 | 4526.7303 | 12.0197 | 4562.7893 | 2.0R | 2026-08-21 06:40 | STOP_HIT | **-1.00R** |
| **5** | 2026-08-25 15:30 | XAUUSD | LONG | 4637.0350 | 4607.6579 | 29.3771 | 4695.7891 | 2.0R | 2026-08-25 16:47 | STOP_HIT | **-1.00R** |
| **6** | 2026-08-25 22:30 | XAUUSD | LONG | 4661.0400 | 4657.9397 | 3.1003 | 4667.9700 | 2.2R | 2026-08-25 23:09 | TARGET_HIT | **+2.24R** |
| **7** | 2026-08-28 16:00 | ETHUSD | SHORT | 2497.4000 | 2526.6400 | 29.2400 | 2438.9200 | 2.0R | 2026-08-28 19:17 | TARGET_HIT | **+2.00R** |
| **8** | 2026-09-01 01:15 | XAUUSD | SHORT | 4458.6050 | 4462.0565 | 3.4515 | 4441.3473 | 5.0R | 2026-09-01 04:22 | TARGET_HIT | **+5.00R** |
| **9** | 2026-09-01 08:00 | ETHUSD | SHORT | 2472.5000 | 2477.2200 | 4.7200 | 2453.4700 | 4.0R | 2026-09-01 08:33 | STOP_HIT | **-1.00R** |
| **10**| 2026-09-04 12:30 | GBPUSD | SHORT | 1.3533 | 1.3539 | 0.0006 | 1.3524 | 1.6R | 2026-09-04 14:20 | STOP_HIT | **-1.00R** |
| **11**| 2026-09-10 07:15 | ETHUSD | SHORT | 2476.2650 | 2483.8300 | 7.5650 | 2441.4300 | 4.6R | 2026-09-10 15:34 | TARGET_HIT | **+4.60R** |
| **12**| 2026-09-10 07:15 | XAUUSD | SHORT | 4418.0750 | 4430.4639 | 12.3889 | 4389.4500 | 2.3R | 2026-09-10 08:46 | STOP_HIT | **-1.00R** |
| **13**| 2026-09-29 15:15 | SOLUSD | SHORT | 120.2050 | 121.6900 | 1.4850 | 116.2600 | 2.7R | 2026-09-30 15:40 | STOP_HIT | **-1.00R** |
| **14**| 2026-10-01 17:15 | ETHUSD | LONG | 2696.0900 | 2673.4200 | 22.6700 | 2741.4300 | 2.0R | 2026-10-01 18:31 | STOP_HIT | **-1.00R** |
| **15**| 2026-10-05 04:30 | GBPUSD | SHORT | 1.3235 | 1.3238 | 0.0002 | 1.3224 | 4.8R | 2026-10-05 05:05 | STOP_HIT | **-1.00R** |
| **16**| 2026-10-06 00:45 | XAUUSD | LONG | 4143.7450 | 4133.3369 | 10.4081 | 4168.7300 | 2.4R | 2026-10-06 02:50 | STOP_HIT | **-1.00R** |
| **17**| 2026-10-06 06:15 | XAUUSD | LONG | 4128.8200 | 4124.5618 | 4.2582 | 4150.1111 | 5.0R | 2026-10-06 07:38 | STOP_HIT | **-1.00R** |

### Elenen Mükerrer İşlemler (Deduplicated Rejections)
1. `XAUUSD_15m_OB_1787272200000_1787274900000`: 2026-08-21 01:15 tarihinde birincil `FVG` sinyaliyle aynı barda oluşan kopya işlem (+5.00 R kâr silindi).
2. `XAUUSD_15m_OB_1787670000000_1787671800000`: 2026-08-25 15:30 tarihinde birincil `FVG` sinyaliyle aynı barda oluşan kopya işlem (-1.00 R kayıp silindi).

---

## 4. Gerçek Kör Test ve Bağımsız Veri Protokolü

Temmuz 2026 verisinin "kör test" olarak kullanılmasının sakıncaları:
1. **İçeriden Bilgi / In-Sample Bulaşması:** Temmuz barları çalışma dizininde yer aldığı için önceki testlerde farkında olunmadan incelenmiş olabilir.
2. **Rejim Farklılığı:** Ağustos-Ekim dönemi öncesindeki veriyi "ileri test" gibi çalıştırmak nedensellik ve piyasa rejimleri açısından yanıltıcıdır.

### Önerilen Bilimsel Doğrulama Protokolü
1. **İleri Yönlü (Forward) Out-of-Sample Testi:** 14 Ekim 2026 tarihinden itibaren toplanacak ve modele hiçbir şekilde dokunulmayacak taze canlı/kağıt verisi üzerinde ölçüm yapılmalıdır.
2. **Dokunulmamış Çapraz Enstrümanlar:** Model parametrelerinin hiç denenmediği bağımsız enstrümanlar (örneğin AUDUSD, USDCHF veya DAX) üzerinde aynı kurallarla tek bir kör çalıştırma yapılmalıdır.
3. **Dondurulmuş Mimari (Frozen Model):** Begonya'nın giriş mantığı (POI, İndüktans, CHOCH, 15M Veto, Fib 0.5) ve ex-ante tekilleştirme motoru sabit tutulmalı; sonuçlara göre geriye dönük kural revizyonu yapılmamalıdır.

---

## 5. Nihai Denetim Hükmü

> ### **DENETİM SONUCU: `FAIL / REFUTED`**
> 
> 1. `+29.00 R` net kazanç iddiası, **kodlama indeksleme hatası ve mükerrer kâr yazımı nedeniyle tamamen çürütülmüştür**.
> 2. Düzeltilmiş ve tekilleştirilmiş net sonuç **`+6.84 R`** ($n=17$, WR: %29.41, Beklenti: +0.40 R, PF: 1.57) seviyesindedir.
> 3. Bu metrikler umut verici bir çekirdek yapıya işaret etmekle birlikte, **47 günlük ve 17 işlemlik küçük bir örneklem istatistiksel geçerlilik ve sermaye riski almak için yetersizdir**.
> 4. **Canlı işlem ve shadow deployment kesinlikle onaylanmamıştır (REJECTED).** Sistemin güvenilirliği ancak dokunulmamış yeni veri üzerinde doğrulanabilir.
