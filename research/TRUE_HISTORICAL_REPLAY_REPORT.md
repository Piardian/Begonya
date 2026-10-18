# BEGONYA — GERÇEK TARİHSEL REPLAY RAPORU (TRUE HISTORICAL REPLAY)
**Dönem:** 1 Nisan 2026 00:00 UTC – 30 Eylül 2026 23:59 UTC (6 Tam Ay / 183 Gün)  
**Tarih:** 14 Ekim 2026  
**Kapsam:** BTCUSD, ETHUSD, SOLUSD, EURUSD, GBPUSD, XAUUSD  
**Motor:** Gerçek SMC Tespit Motoru (`swing-bos-core/dist` — `runPipeline`)  
**Veri Kaynağı:** Ham 15M/1H/4H OHLC Tarihsel Mumlar (`../swing-bos-core/data/replay_1year/`)  
**Bağımsızlık Güvencesi:** `signal_delivery_queue.json` ve `signal-evidence.jsonl` logları sinyal kaynağı olarak KULLANILMAMIŞTIR. Tüm sinyaller geçmiş mumlardan kronolojik olarak üretilmiştir.

---

## 1. YÖNETİCİ ÖZETİ VE RESMİ HÜKÜM

> [!WARNING]
> ### RESMİ KARAR: YETERSİZ ÖRNEKLEM BOYUTU (INSUFFICIENT SAMPLE SIZE)
> 6 aylık ham OHLC mum verisi üzerinden dondurulmuş kurallarla baştan üretilen testte **toplam 94 tekilleştirilmiş sinyal** üretilmiş; bunlardan **65'i (%69,1) limit giriş seviyesine geri çekilme gerçekleşmediği için süresi dolarak iptal olmuş (expired)** ve yalnızca **23 geçerli işlem** gerçekleşmiştir.
> 
> Önceden dondurulan **minimum 50 geçerli işlem barajı AŞILAMAMIŞTIR (23 < 50)**.
> İstatistiki olarak 23 işlem üzerinden kesin bir strateji üstünlüğü (edge) ilan edilemez. **Sistem kesinlikle canlı üretime aktarılmamalıdır.**

### Temel Performans Göstergeleri (23 Gerçekleşen İşlem)

| Metrik | Senaryo B (Yapısal Stop + 2.0R Hedef) | Senaryo C (Yapısal Stop + Orijinal Hedef) | Fark / Değerlendirme |
| :--- | :---: | :---: | :--- |
| **Toplam Sinyal Sayısı** | 94 | 94 | Tamamen aynı sinyaller |
| **C/R Filtresi (>0.25)** | 0 elenen (%0) | 0 elenen (%0) | Yapısal stopların tümü C/R $\le 0.25$ |
| **Süresi Dolan (Expired)** | 65 (%69,1) | 65 (%69,1) | 16 bar içinde POI'ye dönüş olmadı |
| **Gerçekleşen İşlem** | **23** | **23** | Baraj: $\ge 50$ (**BAŞARISIZ**) |
| **Sonuç Dağılımı (TP / SL / BE)** | 5 TP / 9 SL / 9 BE | 8 TP / 8 SL / 7 BE | Senaryo C'de TP sayısı yüksek ama kâr R'ı düşük |
| **Kazanma Oranı (Win Rate)** | %21,7 | %34,8 | Senaryo B daha düşük WR fakat 2R asimetrisi |
| **Brüt PnL (R)** | **+1,00R** | **-4,60R** | Senaryo B brütte pozitif, C negatif |
| **Toplam Maliyet (R)** | **1,934R** | **1,934R** | İşlem başına ~0,084R maliyet |
| **Net PnL (R)** | **-0,93R** | **-6,53R** | Senaryo B maliyet sonrası hafif eksi, C ağır zararda |
| **Net Beklenti (Expectancy)** | **-0,041R / işlem** | **-0,284R / işlem** | Senaryo B başabaşa yakın (-0.04R) |
| **Profit Factor (PF)** | **1,11** | **0,43** | Senaryo B brüt kâr/zarar > 1, C başarısız |
| **Maksimum Düşüş (Max DD)** | **4,91R** | **6,53R** | Senaryo B'de düşüş daha sınırlı |

---

## 2. KRONOLOJİK VE DENGELİ SİNYAL DAĞILIMI

Önceki denetimde (`6_MONTH_ADVERSARIAL_AUDIT.md`) tespit edilen en büyük problem, log dosyalarında 1 Nisan–19 Temmuz arasında 110 günlük "ölü veri boşluğu" olmasıydı.

Gerçek tarihsel mum replay'inde bu yapay boşluk tamamen ortadan kalkmış ve motorun 6 ay boyunca düzenli olarak sinyal ürettiği ispatlanmıştır:

| Ay | Üretilen Sinyal | Limit Emir İptal (Expired) | Gerçekleşen İşlem (Filled) | Dönüşüm Oranı (Fill Rate) |
| :--- | :---: | :---: | :---: | :---: |
| **Nisan 2026** | 19 | 14 | 5 | %26,3 |
| **Mayıs 2026** | 13 | 12 | 1 | %7,7 |
| **Haziran 2026** | 13 | 7 | 6 | %46,2 |
| **Temmuz 2026** | 16 | 13 | 3 | %18,8 |
| **Ağustos 2026** | 16 | 11 | 5 | %31,3 |
| **Eylül 2026** | 17 | 14 | 3 | %17,6 |
| **TOPLAM** | **94** | **65** | **23** | **%24,5** |

> [!NOTE]
> Sinyaller aylara son derece homojen dağılmıştır (aylık ortalama 15,7 sinyal). Ancak sinyallerin ortalama **%75,5'i limit emrin temas almaması (unfilled)** nedeniyle 16 bar (4 saat) sonunda zaman aşımına uğramıştır.

---

## 3. SEMBOL BAZINDA DETAYLI PERFORMANS

| Sembol | Sinyal | Expired | Filled | Senaryo B Sonuç (TP/SL/BE) | Senaryo B Net R | Senaryo B PF | Senaryo C Net R | Senaryo C PF |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **BTCUSD** | 29 | 18 | 8 | 2 TP / 2 SL / 4 BE | **+1,08R** | 2,00 | -0,06R | 1,85 |
| **ETHUSD** | 18 | 12 | 5 | 3 TP / 0 SL / 2 BE | **+5,61R** | $\infty$ | +0,63R | $\infty$ |
| **SOLUSD** | 18 | 13 | 4 | 0 TP / 2 SL / 2 BE | **-2,25R** | 0,00 | -1,72R | 0,27 |
| **EURUSD** | 8 | 8 | 0 | 0 TP / 0 SL / 0 BE | **0,00R** | N/A | 0,00R | N/A |
| **GBPUSD** | 9 | 8 | 1 | 0 TP / 1 SL / 0 BE | **-1,17R** | 0,00 | -1,17R | 0,00 |
| **XAUUSD** | 12 | 6 | 5 | 0 TP / 4 SL / 1 BE | **-4,21R** | 0,00 | -4,21R | 0,00 |
| **TOPLAM** | **94** | **65** | **23** | **5 TP / 9 SL / 9 BE** | **-0,93R** | **1,11** | **-6,53R** | **0,43** |

---

## 4. VARLIK SINIFI KARŞILAŞTIRMASI (KRİPTO vs. FOREX & ALTIN)

Test evreni iki ana varlık grubuna ayrıldığında dramatik bir ayrışma görülmektedir:

### A. Kripto Pariteler (BTCUSD, ETHUSD, SOLUSD)
* **İşlem Sayısı:** 17 işlem
* **Senaryo B:** 5 TP / 4 SL / 8 BE  
  * Brüt PnL: **+6,00R**
  * Maliyetler: **1,554R**
  * Net PnL: **+4,45R**
  * Beklenti: **+0,262R / işlem**
  * Profit Factor: **2,50**
  * Maksimum Düşüş: **2,59R**
* **Senaryo C:** 8 TP / 3 SL / 6 BE  
  * Brüt PnL: **+0,40R**
  * Maliyetler: **1,554R**
  * Net PnL: **-1,15R**
  * Beklenti: **-0,068R / işlem**

### B. Forex ve Emtia (EURUSD, GBPUSD, XAUUSD)
* **İşlem Sayısı:** 6 işlem
* **Senaryo B:** 0 TP / 5 SL / 1 BE  
  * Brüt PnL: **-5,00R**
  * Maliyetler: **0,380R**
  * Net PnL: **-5,38R**
  * Beklenti: **-0,897R / işlem**
  * Profit Factor: **0,00**
  * Maksimum Düşüş: **5,38R**
* **Senaryo C:** 0 TP / 5 SL / 1 BE  
  * Net PnL: **-5,38R**

> [!IMPORTANT]
> **Kritik Çıkarım:**
> 1. Kripto varlıklar (özellikle ETH ve BTC), 1H yapısal stop ve 2R sabit hedef (Senaryo B) altında pozitif net R üretmektedir (+4,45R).
> 2. Forex ve XAUUSD tarafında ise SMC konsepti 15M zaman diliminde ciddi bir kayıp yaşamıştır (6 işlemde 5 SL, -5,38R). EURUSD'de ise 8 sinyalin hiçbirinde fiyat limit seviyesine geri çekilmemiştir.

---

## 5. GBPUSD VE EURUSD DÜŞÜK İŞLEM SAYISI VE "GHOST İŞLEM" ANALİZİ

Önceki log tabanlı raporda (`simulate_6month_basket.py`) GBPUSD'de tam **29 işlem** ve **-15,71R** zarar raporlanmıştı. Gerçek replay'de ise GBPUSD yalnızca **9 sinyal** üretmiş ve bunlardan sadece **1 tanesi dolmuştur**.

Bu farkın kesin nedenleri:
1. **Mükerrer Sinyal İptali (Deduplication):** Önceki loglarda aynı 15 dakikalık mumda hem OB hem FVG sinyali bağımsız emir açıyordu. Replay motorunda aynı mum/yöndeki sinyaller tekilleştirildi.
2. **Limit Emir Zaman Aşımı (Limit Expiration):** Gerçek üretim stratejisinde bir sinyal oluştuktan sonra emir bekletilir; eğer 16 bar (4 saat) içinde POI'nin %50 seviyesine (CE) veya FVG proximal sınırına fiyat değmezse emir iptal edilir. Temmuz 2026'daki 220 piplik GBPUSD boğa rallisinde fiyat hiç geri çekilmeden yukarı gitmiş; eski simülasyon piyasa emriyle tepeye short açmışken, gerçek strateji temas olmadığı için işlem açmamıştır.
3. **Tek Gerçekleşen İşlem:** 14 Ağustos 2026 05:15'teki Short sinyali, saat 07:00'de 1.3500 seviyesinden dolmuş ve 08:00'de stop olmuştur (-1.17R).

---

## 6. GERÇEKLEŞEN 23 İŞLEMİN EKSİKSİZ DÖKÜMÜ (TRADE LEDGER)

Aşağıdaki tüm işlemler ham 15M mumlar üzerinden adım adım simüle edilmiş, MFE/MAE değerleri yalnızca pozisyon açık kaldığı süre boyunca hesaplanmıştır:

| # | Sembol | Yön | Sinyal Zamanı | Giriş Zamanı | Giriş Fiyatı | 1H Stop | Çıkış Zamanı | Senaryo B Sonuç | Senaryo B Net R | Senaryo C Sonuç | Senaryo C Net R | MAE (R) | MFE (R) |
| :-: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **1** | XAUUSD | SHORT | 2026-04-06 01:00 | 2026-04-06 01:00 | 4639.68 | 4679.41 | 2026-04-06 07:45 | **SL** | -1.01R | **SL** | -1.01R | 1.19R | 0.47R |
| **2** | ETHUSD | LONG | 2026-04-09 22:45 | 2026-04-09 23:00 | 2189.21 | 2155.31 | 2026-04-10 15:15 | **TP** | **+1.95R** | **TP** | +0.37R | 0.39R | 2.00R |
| **3** | BTCUSD | LONG | 2026-04-11 23:00 | 2026-04-12 01:30 | 72154.46 | 71879.51 | 2026-04-12 01:30 | **BE** | -0.17R | **BE** | -0.17R | 2.18R | 3.14R |
| **4** | ETHUSD | LONG | 2026-04-16 21:15 | 2026-04-16 21:15 | 2340.24 | 2283.10 | 2026-04-17 14:30 | **TP** | **+1.97R** | **TP** | +0.23R | 0.40R | 2.00R |
| **5** | BTCUSD | LONG | 2026-04-23 17:30 | 2026-04-23 17:30 | 77531.90 | 77154.01 | 2026-04-23 17:30 | **SL** | -1.13R | **SL** | -1.13R | 1.45R | 0.51R |
| **6** | SOLUSD | LONG | 2026-05-22 14:15 | 2026-05-22 15:15 | 86.31 | 85.07 | 2026-05-22 18:45 | **SL** | -1.08R | **SL** | -1.08R | 1.36R | 0.71R |
| **7** | ETHUSD | SHORT | 2026-06-06 23:30 | 2026-06-07 01:00 | 1582.18 | 1595.04 | 2026-06-07 01:00 | **BE** | -0.09R | **BE** | -0.09R | 0.43R | 1.40R |
| **8** | BTCUSD | SHORT | 2026-06-07 22:00 | 2026-06-07 22:00 | 62564.00 | 62980.00 | 2026-06-07 22:00 | **BE** | -0.10R | **BE** | -0.10R | 2.82R | 2.01R |
| **9** | ETHUSD | LONG | 2026-06-21 20:45 | 2026-06-21 21:00 | 1712.84 | 1706.11 | 2026-06-21 21:00 | **BE** | -0.19R | **BE** | -0.19R | 1.61R | 1.42R |
| **10** | ETHUSD | SHORT | 2026-06-25 04:45 | 2026-06-25 05:00 | 1644.92 | 1695.67 | 2026-06-25 13:45 | **TP** | **+1.98R** | **TP** | +0.30R | 0.31R | 2.00R |
| **11** | SOLUSD | SHORT | 2026-06-25 23:15 | 2026-06-25 23:15 | 68.28 | 69.17 | 2026-06-25 23:15 | **BE** | -0.09R | **BE** | -0.09R | 0.25R | 1.24R |
| **12** | BTCUSD | SHORT | 2026-06-29 15:30 | 2026-06-29 17:00 | 60144.40 | 60800.57 | 2026-06-30 12:15 | **TP** | **+1.94R** | **TP** | +0.60R | 0.82R | 2.00R |
| **13** | BTCUSD | LONG | 2026-07-08 00:30 | 2026-07-08 01:30 | 62955.32 | 62651.39 | 2026-07-08 01:30 | **BE** | -0.13R | **BE** | -0.13R | 0.11R | 1.63R |
| **14** | XAUUSD | SHORT | 2026-07-21 00:15 | 2026-07-21 01:15 | 4030.49 | 4040.92 | 2026-07-21 03:00 | **SL** | -1.04R | **SL** | -1.04R | 1.06R | 0.81R |
| **15** | XAUUSD | LONG | 2026-07-27 10:30 | 2026-07-27 12:15 | 4084.02 | 4010.76 | 2026-07-29 01:00 | **SL** | -1.01R | **SL** | -1.01R | 1.01R | 0.14R |
| **16** | SOLUSD | LONG | 2026-08-03 03:45 | 2026-08-03 07:15 | 72.43 | 70.33 | 2026-08-06 23:15 | **BE** | -0.04R | **TP** | +0.49R | 0.21R | 1.14R |
| **17** | BTCUSD | LONG | 2026-08-09 00:30 | 2026-08-09 02:30 | 64783.56 | 64505.00 | 2026-08-09 22:00 | **TP** | **+1.85R** | **TP** | +0.40R | 0.19R | 2.00R |
| **18** | BTCUSD | SHORT | 2026-08-13 04:30 | 2026-08-13 05:15 | 63941.48 | 64520.00 | 2026-08-13 14:30 | **BE** | -0.07R | **TP** | +0.25R | 0.12R | 1.02R |
| **19** | GBPUSD | SHORT | 2026-08-14 05:15 | 2026-08-14 07:00 | 1.35 | 1.35 | 2026-08-14 08:00 | **SL** | -1.17R | **SL** | -1.17R | 1.50R | 0.12R |
| **20** | XAUUSD | SHORT | 2026-08-17 00:15 | 2026-08-17 00:15 | 4381.56 | 4396.96 | 2026-08-17 00:45 | **SL** | -1.03R | **SL** | -1.03R | 1.24R | 0.26R |
| **21** | BTCUSD | LONG | 2026-08-26 04:45 | 2026-08-26 04:45 | 78813.82 | 78292.00 | 2026-08-26 09:45 | **SL** | -1.10R | **TP** | +0.23R | 1.09R | 0.75R |
| **22** | SOLUSD | SHORT | 2026-09-24 14:15 | 2026-09-24 16:15 | 116.86 | 120.02 | 2026-09-25 11:00 | **SL** | -1.04R | **SL** | -1.04R | 1.73R | 0.32R |
| **23** | XAUUSD | SHORT | 2026-09-25 08:00 | 2026-09-25 08:45 | 4293.14 | 4297.03 | 2026-09-25 08:45 | **BE** | -0.12R | **BE** | -0.12R | 0.76R | 1.00R |

---

## 7. SENARYO B İLE SENARYO C KARŞILAŞTIRMASI

Senaryo B (2.0R sabit hedef) ile Senaryo C (orijinal likidite hedefi) arasındaki mekanik fark şudur:
* **Senaryo C'de Hedefler Çok Yakın:** Orijinal likidite hedefleri 1H yapısal stop mesafesine göre sıklıkla $0.20R - 0.60R$ gibi çok düşük risk/ödül (R:R) oranlarına sahipti. Bu nedenle Senaryo C'de **8 işlem TP** olmasına rağmen toplam brüt getiri yalnızca $+0,40R$ olabilmiş; buna karşılık $1.934R$ maliyet kesildiğinde net getiri **-6.53R**'a çökmüştür.
* **Senaryo B'nin Asimetrisi:** Senaryo B'de kazanılan her işlem net $\sim 1.95R$ getirdiği için yalnızca 5 TP işlemi, 9 SL ve 9 BE zararını karşılayarak stratejiyi başabaş seviyesinde (-0.93R) tutabilmiştir.

---

## 8. NİHAİ STRATEJİK DEĞERLENDİRME VE SONRAKİ ADIMLAR

1. **Örneklem Yetersizliği:** 6 ayda 6 sembolden yalnızca 23 işlem üretilmesi, 15M POI limit giriş stratejisinin aşırı seçici (retrace gerçekleşmeden kaçan trendler) olduğunu göstermektedir. 50 işlem barajı geçilemediği için canlıya geçiş kesinlikle veto edilmiştir.
2. **Kripto Potansiyeli vs Forex Başarısızlığı:** Kripto sepeti (BTC + ETH) 13 işlemde $+6.69R$ net getiri üretirken, Forex ve Altın 6 işlemde $-5.38R$ kaybettirmiştir. Begonya'nın SMC yapısı Forex piyasasında killzone limit emirleriyle beklenen verimi sağlayamamıştır.
3. **Limit Emir vs Fırsat Maliyeti:** Sinyallerin %69'unun temas almadan iptal olması stratejinin en büyük darboğazıdır. Fiyatın POI'ye girmeden gitmesi kârlı hareketlerin kaçırılmasına yol açmaktadır.
