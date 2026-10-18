# BEGONYA — AŞAMA 4A: BREAK-EVEN HİPOTEZİ ADVERSARIAL DENETİM RAPORU
**Belge Kodu:** `research/PHASE4A_BE_HYPOTHESIS_AUDIT.md`  
**Tarih:** 14 Ekim 2026 23:15 UTC+3  
**Dönem:** 1 Nisan 2026 – 30 Eylül 2026 UTC (6 Tam Ay / 17.568 Adet 15M Mumu)  
**Veri Tabanı:** `research/production_parity_replay_results.json` (38 Dolan İşlemlik Üretim-Eşdeğer Kohort)  
**İlgili Test Paketi:** `research/test_phase4a_audit.js` (7/7 Passed)  
**Durum:** Tamamlandı

---

## 1. YÖNETİCİ ÖZETİ VE NİHAİ HÜKÜM

> [!CAUTION]
> ### NİHAİ KARAR: DATA INSUFFICIENT & STRATEGY REJECTED
> 
> Yapılan bağımsız adversarial denetimde, Break-Even (BE) hipotezi 38 işlemlik donmuş kohort üzerinde matematiksel ve ampirik olarak test edilmiştir (`RESEARCH AUDIT PASS`):
> 
> 1. **BE Kaldırıldığında Ne Oluyor?**  
>    Üretim 15M stopunda BE kaldırıldığında (No-BE), BE ile erken kapanan 29 işlemin **12'si TP'ye (%41,4)**, **17'si SL'ye (%58,6)** dönüşmektedir. Bu durum brüt PnL'i **-3,00R'dan +4,00R'a** yükseltmekte ve kâr faktörünü 0,57'den 1,17'ye çıkarmaktadır.
> 2. **Sistem Kârlı Hale Geliyor mu?**  
>    **HAYIR.** 15M dar stop mesafesi nedeniyle 38 işlemde kesilen toplam işlem maliyeti **10,92R**'dır (işlem başına ortalama ~0,287R). Brüt getiri +4,00R olsa dahi, net sonuç **-6,92R (ZARAR)** kalmaktadır.
> 3. **1H Yapısal Stopta Ne Oluyor?**  
>    1H yapısal stopta BE'nin kaldırılması tam tersi etki yaratarak performansı **-9,89R'dan -15,89R'a çökertmektedir**. Çünkü geniş 1H stopta +1.0R'dan dönen işlemler trendin bozulduğunu göstermekte ve BE sermayeyi korumaktadır.
> 4. **Evrensel Kural Çıkarılamaz:**  
>    BTCUSD'de No-BE zarar yazarken (-4,92R vs -3,92R), ETHUSD ve SOLUSD'de No-BE daha iyi sonuç vermiştir.
> 
> **Hüküm:** BE kuralını kaldırmak tek başına sistemi kârlı yapmamaktadır; ayrıca 38 işlem istatistiki genelleme için yetersizdir ($N=38 < 50$, **DATA INSUFFICIENT**). **Üretim stratejisinde kural değişikliği yapılmamalı, canlı emirler kesinlikle kapalı kalmalıdır.**

---

## 2. 38 İŞLEM VE 29 BE İŞLEMİNİN TAM UZLAŞTIRMASI

### 2.1. Metodolojik Bütünlük Denetimi
- **Aynı Kohort Güvencesi:** No-BE deneyi, `production_parity_replay_results.json` içerisindeki 38 dolan işlemin tamamen aynı giriş fiyatı (`entryP`), başlangıç stopu (`prodSl`/`structSl`) ve hedef seviyeleri (+2.0R) kullanılarak ham 15M mumlar üzerinden baştan çalıştırılmıştır.
- **Kronolojik Tarama:** İşlem simülasyonu yalnızca giriş anından (`entryTs`) itibaren taranmış, gelecek muma sızıntı yapılmamıştır.
- **Aynı Mumda Çakışma:** `if (hitSl && hitTp)` durumunda muhafazakâr kural (`CONFLICT_SL_FIRST`) işletilmiş ve pozisyon kesinlikle SL/BE sayılmıştır.
- **Açık Kalan İşlem Sayısı:** 0 (38 işlemin tamamı veri aralığı içinde TP, SL veya BE olarak kapanmıştır).
- **Portföy Çakışması (Overlap):** 0 (38 işlemin hiçbiri bir sonraki işlem açıkken devam etmemiştir; portföy marjini ve risk kullanımı senaryolar arasında %100 bağımsız ve karşılaştırılabilirdir).

---

### 2.2. 15M Stop Altında BE'ye Ulaşan 29 İşlemin Eksiksiz Listesi ve No-BE Akıbeti

| # | Sembol | Yön | Giriş Zamanı | Giriş Fiyatı | 15M Stop | MFE (R) | Senaryo A (+1.0R BE) | Senaryo B (No-BE) | No-BE Çıkış Barı | Senaryo C (+1.5R BE) |
| :-: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **1** | GBPUSD | SHORT | 2026-04-01 00:15 | 1.32512 | 1.32563 | 1.10R | **BE** (-0.37R) | **TP (+1.63R)** | Bar 3 | **TP (+1.63R)** |
| **2** | BTCUSD | LONG | 2026-04-02 02:00 | 67915.22 | 67844.75 | 2.73R | **BE** (-0.92R) | **TP (+1.08R)** | Bar 0 | **BE** (-0.92R) |
| **3** | XAUUSD | LONG | 2026-04-02 02:00 | 4514.86 | 4510.66 | 6.27R | **BE** (-0.11R) | **TP (+1.89R)** | Bar 0 | **BE** (-0.11R) |
| **4** | ETHUSD | LONG | 2026-04-05 05:45 | 2073.47 | 2068.79 | 1.33R | **BE** (-0.33R) | **SL (-1.33R)** | Bar 1 | **SL (-1.33R)** |
| **5** | XAUUSD | SHORT | 2026-04-06 01:00 | 4639.68 | 4647.90 | 1.28R | **BE** (-0.05R) | **SL (-1.05R)** | Bar 5 | **SL (-1.05R)** |
| **6** | BTCUSD | LONG | 2026-04-12 01:30 | 72154.46 | 71960.54 | 3.37R | **BE** (-0.24R) | **SL (-1.24R)** | Bar 0 | **BE** (-0.24R) |
| **7** | ETHUSD | LONG | 2026-04-16 21:15 | 2340.24 | 2322.02 | 2.07R | **BE** (-0.08R) | **TP (+1.92R)** | Bar 0 | **BE** (-0.08R) |
| **8** | BTCUSD | LONG | 2026-04-24 15:00 | 77114.73 | 76950.40 | 9.05R | **BE** (-0.29R) | **SL (-1.29R)** | Bar 0 | **BE** (-0.29R) |
| **9** | SOLUSD | LONG | 2026-05-04 10:15 | 80.37 | 79.94 | 1.40R | **BE** (-0.21R) | **SL (-1.21R)** | Bar 0 | **SL (-1.21R)** |
| **10** | XAUUSD | LONG | 2026-05-13 11:00 | 4452.17 | 4446.47 | 1.08R | **BE** (-0.08R) | **TP (+1.92R)** | Bar 2 | **TP (+1.92R)** |
| **11** | SOLUSD | LONG | 2026-05-22 15:15 | 86.31 | 85.83 | 1.95R | **BE** (-0.21R) | **TP (+1.79R)** | Bar 1 | **BE** (-0.21R) |
| **12** | XAUUSD | SHORT | 2026-05-28 14:45 | 4517.38 | 4522.68 | 2.04R | **BE** (-0.08R) | **TP (+1.92R)** | Bar 0 | **BE** (-0.08R) |
| **13** | ETHUSD | SHORT | 2026-06-07 01:00 | 1582.18 | 1586.29 | 3.24R | **BE** (-0.29R) | **TP (+1.71R)** | Bar 0 | **BE** (-0.29R) |
| **14** | BTCUSD | SHORT | 2026-06-07 22:00 | 62564.00 | 62657.49 | 7.14R | **BE** (-0.44R) | **SL (-1.44R)** | Bar 0 | **BE** (-0.44R) |
| **15** | XAUUSD | SHORT | 2026-06-08 15:30 | 4436.57 | 4443.14 | 1.10R | **BE** (-0.07R) | **SL (-1.07R)** | Bar 4 | **SL (-1.07R)** |
| **16** | ETHUSD | SHORT | 2026-06-11 17:30 | 1656.45 | 1660.10 | 2.45R | **BE** (-0.34R) | **SL (-1.34R)** | Bar 0 | **BE** (-0.34R) |
| **17** | XAUUSD | SHORT | 2026-06-11 19:00 | 4429.35 | 4434.90 | 2.60R | **BE** (-0.08R) | **SL (-1.08R)** | Bar 0 | **BE** (-0.08R) |
| **18** | ETHUSD | LONG | 2026-06-21 21:00 | 1712.84 | 1709.43 | 1.98R | **BE** (-0.38R) | **SL (-1.38R)** | Bar 0 | **BE** (-0.38R) |
| **19** | XAUUSD | LONG | 2026-06-22 13:45 | 4410.63 | 4404.75 | 3.21R | **BE** (-0.08R) | **TP (+1.92R)** | Bar 0 | **BE** (-0.08R) |
| **20** | SOLUSD | SHORT | 2026-06-25 23:15 | 68.28 | 68.42 | 6.11R | **BE** (-0.56R) | **SL (-1.56R)** | Bar 0 | **BE** (-0.56R) |
| **21** | BTCUSD | SHORT | 2026-06-29 17:00 | 60144.40 | 60465.13 | 1.28R | **BE** (-0.12R) | **SL (-1.12R)** | Bar 0 | **SL (-1.12R)** |
| **22** | XAUUSD | LONG | 2026-08-03 13:00 | 4252.12 | 4247.38 | 1.55R | **BE** (-0.09R) | **SL (-1.09R)** | Bar 0 | **BE** (-0.09R) |
| **23** | XAUUSD | SHORT | 2026-08-19 12:30 | 4430.73 | 4433.27 | 5.18R | **BE** (-0.18R) | **SL (-1.18R)** | Bar 0 | **BE** (-0.18R) |
| **24** | BTCUSD | LONG | 2026-08-26 04:45 | 78813.82 | 78546.59 | 2.28R | **BE** (-0.19R) | **TP (+1.81R)** | Bar 0 | **BE** (-0.19R) |
| **25** | BTCUSD | SHORT | 2026-09-14 02:15 | 68670.33 | 68910.15 | 2.84R | **BE** (-0.19R) | **SL (-1.19R)** | Bar 0 | **BE** (-0.19R) |
| **26** | XAUUSD | LONG | 2026-09-16 18:45 | 4482.90 | 4478.43 | 5.57R | **BE** (-0.10R) | **SL (-1.10R)** | Bar 0 | **BE** (-0.10R) |
| **27** | SOLUSD | SHORT | 2026-09-24 16:15 | 116.86 | 117.76 | 1.29R | **BE** (-0.15R) | **SL (-1.15R)** | Bar 0 | **SL (-1.15R)** |
| **28** | SOLUSD | LONG | 2026-09-26 03:00 | 120.30 | 119.55 | 3.44R | **BE** (-0.18R) | **TP (+1.82R)** | Bar 0 | **BE** (-0.18R) |
| **29** | SOLUSD | SHORT | 2026-09-29 22:00 | 114.73 | 113.85 | 1.26R | **BE** (-0.15R) | **TP (+1.85R)** | Bar 33 | **BE** (-0.15R) |

#### 29 BE İşleminin Dağılımı:
- **TP'ye Ulaşanlar:** **12 Adet (%41,4)** $\rightarrow$ Brüt getiriye $+24,00\text{R}$ katkı yaptı.
- **SL'ye Dönenler:** **17 Adet (%58,6)** $\rightarrow$ Brüt getiriye $-17,00\text{R}$ zarar yazdı.
- **Net Brüt Delta:** $+24,00\text{R} - 17,00\text{R} = \mathbf{+7,00R}$ brüt iyileşme.

---

## 3. ÜÇ SABİT SENARYONUN KARŞILAŞTIRMASI (38 İŞLEMLİK KOHORT)

Aynı 38 işlem üzerinde hiçbir parametre değiştirilmeden çalıştırılan 3 senaryonun genel ve yapısal stop karşılaştırması:

### 3.1. Senaryo 1: Üretim 15M Invalidation Stopu (Dar Stop)

| Metrik | Senaryo A (+1.0R BE) | Senaryo B (No-BE) | Senaryo C (+1.5R BE) | En İyi Senaryo |
| :--- | :---: | :---: | :---: | :---: |
| **TP Sayısı** | 2 (%5,3) | **14 (%36,8)** | 4 (%10,5) | Senaryo B |
| **SL Sayısı** | 7 (%18,4) | 24 (%63,2) | 13 (%34,2) | Senaryo A |
| **BE Sayısı** | 29 (%76,3) | 0 (%0,0) | 21 (%55,3) | — |
| **Kazanma Oranı (%WR)** | %5,3 | **%36,8** | %10,5 | Senaryo B |
| **Brüt PnL (R)** | -3,00R | **+4,00R** | -5,00R | Senaryo B |
| **Toplam Maliyet (R)** | 10,92R | 10,92R | 10,92R | — |
| **Net PnL (R)** | **-13,92R** | **-6,92R** | **-15,92R** | Senaryo B (-6,92R) |
| **Net Beklenti (R/işlem)** | -0,366R | **-0,182R** | -0,419R | Senaryo B |
| **Kâr Faktörü (PF)** | 0,57 | **1,17** | 0,62 | Senaryo B |
| **Maksimum Düşüş (Max DD)**| 13,92R | 15,34R | 17,55R | Senaryo A (13,92R) |

> [!NOTE]
> 15M Stop altında No-BE (Senaryo B) brüt olarak $+7,00\text{R}$ iyileşme sağlamakta ve net zararı $-13,92\text{R}$'dan $-6,92\text{R}$'a indirmektedir. Ancak işlem maliyeti ($10,92\text{R}$) brüt kârı ($+4,00\text{R}$) aştığı için **net sonuç yine de negatiftir**.  
> Senaryo C (+1.5R BE) ise hem koruyuculuğu geciktirdiği hem de hedefe ulaşımı artırmadığı için en kötü net sonucu ($-15,92\text{R}$) vermiştir.

---

### 3.2. Senaryo 2: Araştırma 1H Yapısal Swing Stopu (Geniş Stop)

| Metrik | Senaryo A (+1.0R BE) | Senaryo B (No-BE) | Senaryo C (+1.5R BE) | En İyi Senaryo |
| :--- | :---: | :---: | :---: | :---: |
| **TP Sayısı** | 4 (%10,5) | 10 (%26,3) | 7 (%18,4) | Senaryo B |
| **SL Sayısı** | 10 (%26,3) | 28 (%73,7) | 15 (%39,5) | Senaryo A |
| **BE Sayısı** | 24 (%63,2) | 0 (%0,0) | 16 (%42,1) | — |
| **Kazanma Oranı (%WR)** | %10,5 | %26,3 | %18,4 | Senaryo B |
| **Brüt PnL (R)** | -2,00R | -8,00R | **-1,00R** | Senaryo C |
| **Toplam Maliyet (R)** | 7,89R | 7,89R | 7,89R | — |
| **Net PnL (R)** | **-9,89R** | **-15,89R** | **-8,89R** | Senaryo C (-8,89R) |
| **Net Beklenti (R/işlem)** | -0,260R | -0,418R | **-0,234R** | Senaryo C |
| **Kâr Faktörü (PF)** | 0,80 | 0,71 | **0,93** | Senaryo C |
| **Maksimum Düşüş (Max DD)**| 12,07R | 18,61R | **10,75R** | Senaryo C (10,75R) |

> [!WARNING]
> 1H Yapısal Stop altında No-BE (Senaryo B) performansı dramatik şekilde **kötüleştirmektedir** ($-9,89\text{R} \rightarrow -15,89\text{R}$).  
> Geniş stopta +1.0R kâra geçtikten sonra geri çekilen işlemler, yapısal trendin çöktüğünü gösterir. BE kaldırıldığında bu işlemler tam $-1,0\text{R}$ zararla kapanarak portföyü eritmektedir.

---

## 4. MALİYET SAĞLAMLIK VE ÇARPAN DUYARLILIĞI

Gerçek broker ücret tarifesi (sözleşme spesifikasyonu) kod tabanında bulunmadığı için maliyet realizmi **INSUFFICIENT DATA**'dır. Farklı çarpanlar altındaki net R duyarlılığı:

### 4.1. Üretim 15M Stopu Maliyet Duyarlılık Tablosu
| Senaryo | 1.00x (Mevcut) | 1.25x | 1.50x | 2.00x (Perakende) |
| :--- | :---: | :---: | :---: | :---: |
| **Senaryo A (+1.0R BE)** | **-13,92R** | -16,64R | -19,37R | -24,83R |
| **Senaryo B (No-BE)** | **-6,92R** | -9,64R | -12,37R | -17,83R |
| **Senaryo C (+1.5R BE)** | **-15,92R** | -18,64R | -21,37R | -26,83R |

---

## 5. SEMBOL BAZINDA DETAYLI DÖKÜM VE AYRIŞMA

38 işlemlik sepetin sembol bazındaki tepkisi homojen değildir:

### 5.1. Üretim 15M Stop Altında Sembol Sonuçları
| Sembol | İşlem Sayısı | Senaryo A Net R | Senaryo B (No-BE) Net R | Senaryo C Net R | No-BE Faydalı mı? |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **BTCUSD** | 9 | **-3,92R** | -4,92R | -4,92R | **HAYIR (Zararı artırdı)** |
| **ETHUSD** | 5 | -1,41R | **-0,41R** | -2,41R | Evet (+1,00R iyileşme) |
| **SOLUSD** | 6 | -2,69R | **+0,31R** | -4,69R | **Evet (+3,00R kâra geçti)** |
| **EURUSD** | 0 | 0,00R | 0,00R | 0,00R | — |
| **GBPUSD** | 2 | -1,58R | **+0,42R** | +0,42R | Evet (+2,00R iyileşme) |
| **XAUUSD** | 16 | -4,31R | **-2,31R** | -4,31R | Evet (+2,00R iyileşme) |

### 5.2. Araştırma 1H Yapısal Stop Altında Sembol Sonuçları
| Sembol | İşlem Sayısı | Senaryo A Net R | Senaryo B (No-BE) Net R | Senaryo C Net R | No-BE Faydalı mı? |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **BTCUSD** | 9 | -1,20R | -2,20R | **+0,80R** | **HAYIR (Senaryo C en iyi)** |
| **ETHUSD** | 5 | **+1,13R** | -2,87R | +0,13R | **HAYIR (No-BE çökertti: -4R fark)** |
| **SOLUSD** | 6 | -5,79R | -4,79R | **-3,79R** | Kısmen |
| **EURUSD** | 0 | 0,00R | 0,00R | 0,00R | — |
| **GBPUSD** | 2 | **+1,35R** | +0,35R | +0,35R | **HAYIR (Senaryo A en iyi)** |
| **XAUUSD** | 16 | **-5,38R** | -6,38R | -6,38R | **HAYIR (Zararı artırdı)** |

> [!IMPORTANT]
> **Kritik Çıkarım:**
> Evrensel bir "BE'yi kaldırmak sistemi kurtarır" kuralı **geçersizdir**.  
> 1H stopta ETHUSD ve GBPUSD'de BE kuralı kârı korurken, No-BE bu kârları silip zarara çevirmektedir. XAUUSD ve BTCUSD'de ise stop türüne göre zıt sonuçlar çıkmaktadır.

---

## 6. ADVERSARIAL TEST ÇIKTILARI

`research/test_phase4a_audit.js` test paketinin terminal çıktısı:

```text
================================================================================
BEGONYA PHASE 4A ADVERSARIAL TEST SUITE
================================================================================
[PASS] Test 1: 1. Cohort Completeness (Exactly 38 Trades)
[PASS] Test 2: 2. 29 BE Trades Fate (15M Stop: 12 TP, 17 SL)
[PASS] Test 3: 3. Reconciliation of 15M Stop Scenarios (A, B, C)
[PASS] Test 4: 4. Trade Overlap Independence (Zero Concurrent Overlapping Trades Across Portfolio)
[PASS] Test 5: 5. Net R Formula Consistency (Net R == Gross R - C/R)
[PASS] Test 6: 6. Cost Sensitivity Invariant (Cost Scales Linearly with Multipliers)
[PASS] Test 7: 7. Sample Size Gate (38 Trades < 50 Target => INSUFFICIENT DATA)
================================================================================
SUMMARY: 7 / 7 Phase 4A Adversarial Tests Passed.
================================================================================
```

---

## 7. NİHAİ KARAR VE KORUMA SINIRLARI DOĞRULAMASI

1. **Koruma Sınırları:**  
   - Üretim stratejisi (`smc_engine`, `swing-bos-core/src`, `server/pipeline.ts`), makro kapısı ve canlı altyapı kesinlikle değiştirilmemiştir.
   - Canlı emir gönderimi kapalıdır; sıfır gerçek emir gönderilmiştir.
   - İzinsiz commit/push yapılmamıştır.
2. **Kural Değişikliği Değerlendirmesi:**  
   - Mevcut BE kuralının kaldırılması veya değiştirilmesi **ÖNERİLMEZ**.
   - No-BE 15M stopta brüt PnL'i artırsa da, net sonucu kârlı yapmaya yetmemektedir ($-6,92\text{R}$ net zarar).
   - 1H yapısal stopta ise No-BE sistemi doğrudan daha derin zarara sürüklemektedir ($-15,89\text{R}$).
   - 38 işlem istatistiki bir karar almak için yetersizdir ($N=38 < 50$, **DATA INSUFFICIENT**).

Tüm ham işlem dökümü ve her bir işlemin senaryo bazlı verileri [phase4a_be_audit_results.json](file:///c:/Users/piard/.gemini/antigravity/scratch/Begonya/research/phase4a_be_audit_results.json) dosyasında eksiksiz olarak arşivlenmiştir.
