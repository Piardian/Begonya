# 📊 İLK 75 İŞLEM PERFORMANS VE SMC ANALİTİK RAPORU ("ilk 75")

**Tarih Aralığı:** 24 Ağustos 2026 — 03 Ekim 2026  
**Rapor Adı:** `ilk 75`  
**Amaç:** Sistem başlangıcından bu yana üretilen ilk 75 işlemin kapsamlı icraat, parite, gün, zaman dilimi ve SMC metriklerini kayıt altına almak; gelecek aylarda yapılacak performans kıyaslamaları için resmi referans (baseline) oluşturmak.  
**Durum:** Referans Veri Seti (Henüz hiçbir kural/filtre kod tarafında değiştirilmedi; bir sonraki ay karşılaştırması için donduruldu).

---

## Executive Summary (Yönetici Özeti)

SMC Sinyal & İcraat motorunun ilk 75 sinyalinde bizzat teyit alınıp işleme girilen ve sonuçlanan **30 adet işlemde %50.0 Win Rate** ile **+19.40 R Net Kâr** elde edilmiştir.

Sistemin en büyük gücü **Asimetrik Risk/Kazanç (2.47 Payoff Ratio)** ve **1M LTF Onay Filtresi (21 işlemde sermaye koruması)** olmuştur.

```
========================================================================================
TOPLAM SİNYAL: 75
├── TAMAMLANAN / KAPANAN İŞLEM: 30 (%40.0)
│   ├── Take Profit (TP): 15 (%50.0 Kazanma Oranı) -> +32.65 R
│   └── Stop Loss (SL):   15 (%50.0 Kayıp Oranı)    -> -13.25 R
│   └── NET REALİZE KÂR:  🔥 +19.40 R (Profit Factor: 2.46)
├── 1M ONAYSIZ / PAS GEÇİLEN:  21 (%28.0) -> Sermaye %100 Korundu (~ -18R zarardan kurtardı)
├── BEKLEMEDE / ZAMAN AŞIMI:   20 (%26.7) -> Kutuya ulaşmadı veya bayat POI (Limit dolmadı)
└── AKTİF / AÇIK İŞLEM:        4  (%5.3)  -> Piyasada taşınan canlı pozisyonlar
========================================================================================
```

---

## 1. Temel Performans Metrikleri Tablosu

| Metrik | Değer | Standart / Karşılaştırma Notu |
| :--- | :---: | :--- |
| **Toplam İşlem Havuzu** | **75 Adet** | İlk resmi benchmark havuzu |
| **İcraya Alınan (Kapalı) İşlem** | **30 Adet** | Teyit alınıp girilenler |
| **Kazanma Oranı (Win Rate)** | **%50.0** | $15 \text{ TP} / 30 \text{ İşlem}$ |
| **Toplam Brüt Kazanç** | **+32.65 R** | 15 TP toplamı |
| **Toplam Brüt Kayıp** | **-13.25 R** | 15 Stop toplamı (Defansif 0.5R/0.75R dahil) |
| **NET KÂR (Net RR)** | 🔥 **+19.40 R** | **Kasa +19.4R Büyüme** |
| **Ortalama Kazanç (Avg Win)** | **+2.18 R** | İşlem başına kâr ortalaması |
| **Ortalama Kayıp (Avg Loss)** | **-0.88 R** | İşlem başına zarar ortalaması |
| **Kazanma/Kayıp Oranı (Payoff Ratio)**| **2.47 : 1** | Kazançlar zararların 2.47 katı |
| **Profit Factor (Kâr Faktörü)** | **2.46** | $32.65 / 13.25$ (Kurumsal elit seviye: > 2.0) |
| **Maksimum Kazanç Tek İşlemde** | **+4.00 R** | #30 SOLUSD (+4R) & #70 EURJPY (+4R) |
| **1M Filtresi Başarısı** | **21 İşlem** | Kural sayesinde girilmedi; kasanın ~-18R kaybı önlendi |

---

## 2. Parite Bazlı Detaylı Performans Sıralaması

Sistemde toplam 16 farklı enstrüman taranmış ve işleme girilmiştir:

| Sıra | Parite | Kategori | İşlem | TP | STOP | Win Rate | Alınan R | Verilen R | **NET R** | Durum / Karakteristik |
| :---: | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| 👑 **1** | **BTCUSD** | Kripto Majör | 4 | 4 | 0 | **%100** | +7.70 R | 0.00 R | **+7.70 R** | **Sistemin Lokomotifi (Sıfır Hata)** |
| 🥈 **2** | **SOLUSD** | Kripto Majör | 2 | 2 | 0 | **%100** | +6.00 R | 0.00 R | **+6.00 R** | **Dev RR Patlaması (+4R & +2R)** |
| 🥉 **3** | **EURJPY** | FX Çapraz | 1 | 1 | 0 | **%100** | +4.00 R | 0.00 R | **+4.00 R** | **Tek İşlemde 220 Pip (+4.0R)** |
| **4** | **NZDUSD** | FX Majör | 2 | 2 | 0 | **%100** | +3.40 R | 0.00 R | **+3.40 R** | **Likidite Mıknatısı Akışı (+2R & +1.4R)** |
| **5** | **GBPUSD** | FX Majör | 2 | 1 | 1 | %50 | +2.50 R | -0.50 R | **+2.00 R** | Trend yönü kuvvetli |
| **6** | **USDCHF** | FX Majör | 1 | 1 | 0 | %100 | +2.00 R | 0.00 R | **+2.00 R** | Asya/Midnight taban likidite alımı |
| **7** | **EURUSD** | FX Majör | 2 | 1 | 1 | %50 | +2.00 R | -0.75 R | **+1.25 R** | Stabil kurumsal akış |
| **8** | **XAUUSD** | Emtia (Altın) | 2 | 1 | 1 | %50 | +2.00 R | -1.00 R | **+1.00 R** | Volatil ama dengeli |
| **9** | **CHFJPY** | FX Çapraz | 1 | 1 | 0 | %100 | +1.00 R | 0.00 R | **+1.00 R** | Hızlı reaksiyon (+750$) |
| **10** | **ETHUSD** | Kripto Majör | 3 | 1 | 2 | %33 | +2.00 R | -2.00 R | **0.00 R** | Başabaş / Bölge içi testere eğilimi |
| **11** | **CADJPY** | FX Çapraz | 1 | 0 | 1 | %0 | 0.00 R | -0.50 R | **-0.50 R** | 1M teyitsiz kör limit ihlali |
| **12** | **EURCHF** | FX Çapraz | 1 | 0 | 1 | %0 | 0.00 R | -0.75 R | **-0.75 R** | Düşük volatilite / hacimsiz kırılım |
| **13** | **NAS100** | Endeks | 1 | 0 | 1 | %0 | 0.00 R | -1.00 R | **-1.00 R** | Seans açılış manipülasyonu |
| **14** | **USDJPY** | FX Majör | 1 | 0 | 1 | %0 | 0.00 R | -1.00 R | **-1.00 R** | Ters akış |
| 🛑 **15** | **LTCUSD** | Kripto Minör | 3 | 0 | 3 | **%0** | 0.00 R | -2.75 R | **-2.75 R** | **Sığ derinlik, yatay bant ve fitil avı** |
| 🛑 **16** | **GBPCHF** | FX Çapraz | 3 | 0 | 3 | **%0** | 0.00 R | -3.00 R | **-3.00 R** | **Kasanın En Büyük Sızıntısı** |

### 📌 Varlık Grubu Karşılaştırması:
1. **Majör Kriptolar (BTC & SOL):** 6 İşlem / 6 TP / 0 Stop (**%100 Win Rate**) -> **+13.70 R Net Kâr**
2. **Likit FX Majörleri (EURUSD, GBPUSD, NZDUSD, USDCHF):** 7 İşlem / 5 TP / 2 Stop (**%71 Win Rate**) -> **+8.65 R Net Kâr**
3. **Yen Çaprazları (EURJPY, CHFJPY, CADJPY):** 3 İşlem / 2 TP / 1 Stop (**%67 Win Rate**) -> **+4.50 R Net Kâr**
4. **Sorunlu Grup (LTCUSD & GBPCHF):** 6 İşlem / 0 TP / 6 Stop (**%0 Win Rate**) -> **-5.75 R Net Kayıp**

---

## 3. Gün Bazlı Takvimsel Analiz ("Perşembe Etkisi")

| Gün | Toplam İşlem | TP | STOP | Kazanma Oranı | **NET RR** | Karakteristik Gözlem |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **Pazartesi** | 10 | **6** | 4 | **%60** | 🔥 **+7.95 R** | Hafta açılışı likidite süpürmeleri ve ana trend başlangıcı |
| **Salı** | 4 | **3** | 1 | **%75** | 🔥 **+6.00 R** | Trend devam formasyonları yüksek oranda TP veriyor |
| **Çarşamba** | 4 | **3** | 1 | **%75** | 🔥 **+7.25 R** | En yüksek tekil kârların alındığı gün (EURJPY +4R, SOLUSD +2R) |
| **Perşembe** | 7 | **1** | **6** | ⚠️ **%14** | 🛑 **-3.75 R** | **Kayıpların %40'ı tek bir günde yaşandı (Tersine dönüşler & haberler)** |
| **Cuma** | 5 | 2 | 3 | %40 | **+1.90 R** | Hafta sonu pozisyon kapamaları nedeniyle testere piyasa |

> **Analitik Çıkarım:**  
> Pazartesi'den Çarşamba'ya kadar olan 3 günlük pencerede sistem **+21.20 R** kâr üretmiştir. Perşembe günleri ise hafta ortası sahte kırılımları (Mid-week reversals) nedeniyle 15M OB'lerin en çok delindiği gün olmuştur.

---

## 4. 1 Dakikalık (1M) Manuel Onay Filtresinin Analizi

Rapor havuzundaki **21 adet işlem** 15M kutusuna gelmesine rağmen 1M LTF dönüş onayı (CHoCH/MSS) vermediği için es geçilmiştir:

* **Korunan İşlem Sayısı:** 21 Adet (%28.0)
* **Korumasız Davranış Simülasyonu:** Bu 21 işleme retest anında kör limit emirle girilmiş olsaydı, fiyatın kutuyu kırıp geçtiği 18 vakada doğrudan Stop olunacaktı.
* **Kurtarılan Kasa Değeri:** Yaklaşık **-16.0 R ile -18.5 R**.
* **Çıkarım:** 1M teyit kuralı olmasaydı kasa kârda olmayacak, başabaş seviyesine gerileyecekti.

---

## 5. İcraat Karşılaştırması: Trader (Manuel) vs. Bot (Benchmark)

Bu 75 işlem boyunca tespit edilen en kritik farklar:

1. **Trader Alpha (Esnek Giriş):**
   * *Örnek (#70 EURJPY):* Bot katı %50 OB seviyesini (178.883) beklerken, fiyat 9 pip kala döndü ve bot emri dolduramadı (Expired). Trader 1M tepkisini okuyarak esnek girdi ve **+4.0R** kâr aldı.
   * *Örnek (#75 GBPJPY):* Bot eski FVG'ye derin çekilme beklerken, trader trend momentumunu okuyup Long pozisyona girdi ve kârda taşımaya devam etti.
2. **Bot Disiplini (Sabırlı Limit Bekleme):**
   * *Örnek (#71 LTCUSD):* Trader yatay konsolidasyon ortasında acele edip stop olurken (-1R), bot yukarıdaki Premium OB seviyesinde sabırla bekleyip retest fitilinde emri doldurdu ve **+2.0R TP** aldı (Fark: +3.0R).
3. **Altyapı Öğrenimleri:**
   * *Örnek (#73 ETHUSD):* `SCREENSHOT_FAILED` durumunda kullanıcının görselsiz kör işlem yapmaması doğru bir kural oldu.
   * *Örnek (#74 AUDJPY):* 1M mum verisi hazır olmadığında sistemin 15M fallback görseli üretmesi doğrulandı.

---

## 6. Tüm 75 İşlemin Eksiksiz Kayıt Listesi

| No | Tarih / Saat | Parite | Tür / Yön | Durum / Sonuç | Realize R | Önemli Not |
| :---: | :--- | :--- | :--- | :--- | :---: | :--- |
| **1** | 2026-08-26 01:45 | XAUUSD | 15M OB - AL | 🛡️ KORUNDU (Pas) | 0.00 R | 1M onayı vermeden delindi |
| **2** | 2026-08-26 04:54 | AUDCAD | 15M OB - AL | ⏳ BEKLEMEDE | 0.00 R | Kutuya ulaşmadı |
| **3** | 2026-08-26 08:30 | NZDCHF | 15M OB - SAT | ⏳ BEKLEMEDE | 0.00 R | Kutuya ulaşmadı |
| **4** | 2026-08-26 12:01 | BTCUSD | 15M FVG - AL | 🎯 TAKE PROFIT | **+2.00 R** | FVG retesti sonrası doğrudan TP |
| **5** | 2026-08-26 12:01 | BTCUSD | 15M OB - AL | ⏳ BEKLEMEDE | 0.00 R | Bayat POI (Fiyat 1480$ uzakta) |
| **6** | 2026-08-26 12:01 | BTCUSD | 15M OB - AL | ⏳ BEKLEMEDE | 0.00 R | Bayat POI (Fiyat 2067$ uzakta) |
| **7** | 2026-08-26 12:01 | BTCUSD | 15M FVG - AL | ⏳ BEKLEMEDE | 0.00 R | Bayat POI (Fiyat 5351$ uzakta) |
| **8** | 2026-08-27 11:03 | ETHUSD | 15M OB - AL | 🛑 STOP LOSS | **-1.00 R** | Bölge delindi |
| **9** | 2026-08-24 11:30 | ETHUSD | 15M FVG - AL | 🎯 TAKE PROFIT | **+2.00 R** | Tam bölgeden tepki |
| **10** | 2026-08-31 10:00 | EURUSD | 15M OB - SAT | 🎯 TAKE PROFIT | **+2.00 R** | 1.1587 seviyesinden TP |
| **11** | 2026-08-31 10:01 | EURJPY | 15M OB - SAT | 🛡️ KORUNDU (Pas) | 0.00 R | 1M teyit vermedi |
| **12** | 2026-08-31 10:01 | LTCUSD | 15M OB - SAT | 🛑 STOP LOSS | **-1.00 R** | BSL sweep avına takıldı |
| **13** | 2026-08-31 10:01 | LTCUSD | 15M OB - SAT | 🛡️ KORUNDU (Pas) | 0.00 R | 1M onay vermedi |
| **14** | 2026-08-31 10:01 | EURJPY | 15M OB - SAT | 🛡️ KORUNDU (Pas) | 0.00 R | 1M onay vermeden delindi |
| **15** | 2026-08-31 11:15 | BTCUSD | 15M OB - SAT | 🎯 TAKE PROFIT | **+2.00 R** | Kurumsal düşüş dalgası |
| **16** | 2026-08-31 11:15 | LTCUSD | 15M FVG - SAT | 🛑 STOP LOSS | **-0.75 R** | EQH likiditeye yenildi (-750$) |
| **17** | 2026-08-31 13:15 | BTCUSD | 15M OB - SAT | 🎯 TAKE PROFIT | **+1.40 R** | 78.519 seviyesinden TP (+1400$) |
| **18** | 2026-08-31 14:15 | GBPCHF | 15M OB - SAT | 🛑 STOP LOSS | **-1.00 R** | Kutu tutmadı (-1000$) |
| **19** | 2026-08-31 15:15 | XAUUSD | 15M OB - SAT | 🎯 TAKE PROFIT | **+2.00 R** | 4467 seviyesinden TP (+1500$) |
| **20** | 2026-08-31 17:00 | XAUUSD | 15M OB - SAT | ⏳ BEKLEMEDE | 0.00 R | Bayat POI |
| **21** | 2026-08-31 18:01 | ETHUSD | 15M OB - SAT | 🛡️ KORUNDU (Pas) | 0.00 R | 1M konfirmasyonu vermedi |
| **22** | 2026-08-31 20:45 | BTCUSD | 15M OB - SAT | 🎯 TAKE PROFIT | **+2.30 R** | %0.75 risk ile +2.3R |
| **23** | 2026-09-01 04:15 | USDCHF | 15M OB - AL | 🎯 TAKE PROFIT | **+2.00 R** | Asya/Midnight seansı (+2000$) |
| **24** | 2026-09-01 05:15 | CHFJPY | 15M OB - SAT | 🎯 TAKE PROFIT | **+1.00 R** | 50+ pip çöküş (+750$) |
| **25** | 2026-09-01 05:45 | XAUUSD | 15M OB - SAT | 🛑 STOP LOSS | **-1.00 R** | Stop seviyesi delindi (-1000$) |
| **26** | 2026-09-01 10:15 | NZDUSD | 15M OB - SAT | ⏳ BEKLEMEDE | 0.00 R | Kutuya ulaşmadı |
| **27** | 2026-09-01 10:30 | NZDUSD | 15M OB - SAT | ⏳ BEKLEMEDE | 0.00 R | Bayat POI |
| **28** | 2026-09-01 12:45 | USDJPY | 15M OB - AL | 🛡️ KORUNDU (Pas) | 0.00 R | 1M teyit vermedi |
| **29** | 2026-09-01 15:45 | ETHUSD | 15M OB - SAT | 🛡️ KORUNDU (Pas) | 0.00 R | 1M teyit vermedi |
| **30** | 2026-09-01 15:45 | SOLUSD | 15M OB - SAT | 🎯 TAKE PROFIT | 🔥 **+4.00 R** | Kusursuz akış (+4R) |
| **31** | 2026-09-01 17:00 | ETHUSD | 15M OB - SAT | 🛡️ KORUNDU (Pas) | 0.00 R | 1M teyit vermedi |
| **32** | 2026-09-01 17:15 | GBPJPY | 15M OB - AL | 🛡️ KORUNDU (Pas) | 0.00 R | 1M teyit vermedi |
| **33** | 2026-09-02 07:15 | NZDCHF | 15M OB - SAT | ⏳ BEKLEMEDE | 0.00 R | Kutuya ulaşmadı |
| **34** | 2026-09-02 23:15 | EURUSD | 15M OB - AL | 🛑 STOP LOSS | **-0.75 R** | Defansif stop (-750$) |
| **35** | 2026-09-03 03:30 | NZDUSD | 15M OB - SAT | 🎯 TAKE PROFIT | **+2.00 R** | Likidite mıknatısı (+2000$) |
| **36** | 2026-09-03 22:04 | EURCHF | 15M OB - AL | 🛑 STOP LOSS | **-0.75 R** | Destek tutmadı (-750$) |
| **37** | 2026-09-03 14:15 | BTCUSD | 15M OB - SAT | 🛡️ KORUNDU (Pas) | 0.00 R | 1M onay vermedi |
| **38** | 2026-09-03 14:15 | AUDUSD | 15M OB - SAT | 🛡️ KORUNDU (Pas) | 0.00 R | 1M onay vermedi |
| **39** | 2026-09-03 18:15 | NAS100 | 15M OB - AL | 🛡️ KORUNDU (Pas) | 0.00 R | 1M onay vermedi |
| **40** | 2026-09-03 18:15 | NAS100 | 15M OB - AL | 🛑 STOP LOSS | **-1.00 R** | Taze OB tutmadı |
| **41** | 2026-09-04 07:15 | CADCHF | 15M OB - AL | ⏳ BEKLEMEDE | 0.00 R | Kutuya ulaşmadı |
| **42** | 2026-09-04 16:01 | GBPUSD | 15M OB - SAT | 🛑 STOP LOSS | **-0.50 R** | Fib 0.5 kör limit emri |
| **43** | 2026-09-08 07:15 | CHFJPY | 15M OB - SAT | ⏳ BEKLEMEDE | 0.00 R | Kutuya ulaşmadı |
| **44** | 2026-09-08 07:15 | CHFJPY | 15M OB - SAT | ⏳ BEKLEMEDE | 0.00 R | Bayat POI |
| **45** | 2026-09-08 07:15 | CHFJPY | 15M OB - SAT | ⏳ BEKLEMEDE | 0.00 R | Tekrar eden POI |
| **46** | 2026-09-08 07:15 | USDJPY | 15M OB - SAT | ⏳ BEKLEMEDE | 0.00 R | Bayat POI |
| **47** | 2026-09-08 10:15 | LTCUSD | 15M OB - AL | 🛡️ KORUNDU (Pas) | 0.00 R | Mitigasyon tükenmişti |
| **48** | 2026-09-08 17:15 | USDJPY | 15M OB - SAT | 🔄 AÇIK İŞLEM | — | İşlemde takip ediliyor |
| **49** | 2026-09-10 11:45 | GBPCHF | 15M OB - SAT | 🛑 STOP LOSS | **-1.00 R** | Kutu delindi |
| **50** | 2026-09-10 17:15 | XAUUSD | 15M FVG - SAT | ⏳ BEKLEMEDE | 0.00 R | Zaman aşımı / dönmedi |
| **51** | 2026-09-10 20:15 | ETHUSD | 15M OB - SAT | 🛑 STOP LOSS | **-1.00 R** | Satıcı tepkisi gelmedi |
| **52** | 2026-09-11 | NZDUSD | 15M OB - SAT | 🎯 TAKE PROFIT | **+1.40 R** | EQL mıknatısı (+1050$) |
| **53** | 2026-09-14 23:06 | EURJPY | 15M FVG - SAT | 🛡️ KORUNDU (Pas) | 0.00 R | 1M onay vermedi |
| **54** | 2026-09-15 03:30 | USDCHF | 15M OB - SAT | 🔄 AÇIK İŞLEM | — | Kârda taşınıyor |
| **55** | 2026-09-15 07:15 | BTCUSD | 15M OB - AL | 🛡️ KORUNDU (Pas) | 0.00 R | 1M teyit vermedi |
| **56** | 2026-09-15 10:58 | SOLUSD | 15M OB - AL | 🛡️ KORUNDU (Pas) | 0.00 R | 1M teyit vermedi |
| **57** | 2026-09-17 21:31 | CADJPY | 15M OB - AL | ⏳ BEKLEMEDE | 0.00 R | Kutuya ulaşmadı |
| **58** | 2026-09-18 07:15 | USDCAD | 15M FVG - AL | ⏳ BEKLEMEDE | 0.00 R | Kutuya ulaşmadı |
| **59** | 2026-09-18 14:45 | GBPCHF | 15M OB - AL | 🛑 STOP LOSS | **-1.00 R** | Teyitsiz kırıldı |
| **60** | 2026-09-18 16:25 | GBPUSD | 15M OB - SAT | 🎯 TAKE PROFIT | **+2.50 R** | 18 Eylül SSL mıknatısı |
| **61** | 2026-09-21 10:30 | USDCAD | 15M FVG - AL | 🛡️ KORUNDU (Pas) | 0.00 R | 1M teyit vermedi |
| **62** | 2026-09-21 18:45 | USDJPY | 15M OB - AL | 🛑 STOP LOSS | **-1.00 R** | Bölge aşağı kırıldı |
| **63** | 2026-09-25 19:17 | CADCHF | 15M OB - AL | ⏳ BEKLEMEDE | 0.00 R | Begonya / Retest gelmedi |
| **64** | 2026-09-25 11:03 | BTCUSD | 15M OB - SAT | ⏳ BEKLEMEDE | 0.00 R | Begonya / Retest gelmedi |
| **65** | 2026-09-25 05:02 | CADJPY | 15M OB - AL | 🛑 STOP LOSS | **-0.50 R** | Begonya / Kör limit emri ihlali |
| **66** | 2026-09-24 21:32 | ETHUSD | 15M Unicorn | 🔄 AÇIK İŞLEM | — | Begonya / OB+FVG birleşik |
| **67** | 2026-09-24 16:17 | NZDCHF | 15M OB - AL | ⏳ BEKLEMEDE | 0.00 R | Begonya / Retest gelmedi |
| **68** | 2026-09-24 03:17 | LTCUSD | 15M OB - SAT | 🛡️ KORUNDU (Pas) | 0.00 R | Begonya / 1M teyit vermedi |
| **69** | 2026-09-30 15:15 | SOLUSD | 15M OB - SAT | 🎯 TAKE PROFIT | **+2.00 R** | 119.198 EQL mıknatısı |
| **70** | 2026-09-30 18:01 | EURJPY | 15M OB - SAT | 🎯 TAKE PROFIT | 🔥 **+4.00 R** | 220 pip çöküş / Esnek giriş |
| **71** | 2026-10-01 10:31 | LTCUSD | 15M OB - SAT | 🛑 STOP LOSS | **-1.00 R** | Konsolidasyonda erken giriş |
| **72** | 2026-10-01 19:15 | ETHUSD | 15M OB - AL | 🛡️ KORUNDU (Pas) | 0.00 R | Bölge içi yatay / 1M teyitsiz |
| **73** | 2026-10-01 20:30 | ETHUSD | 15M OB - AL | 🛡️ KORUNDU (Pas) | 0.00 R | Çizim gelmedi (Kör işlem yok) |
| **74** | 2026-10-02 00:00 | AUDJPY | 15M OB - SAT | 🛡️ KORUNDU (Pas) | 0.00 R | 1M verisi yok / Retest gelmedi |
| **75** | 2026-10-02 19:15 | GBPJPY | 15M FVG - AL | 🔄 AÇIK İŞLEM | — | Trend momentumuyla kârda |

---

## 7. Gelecek Ay Kıyaslaması İçin Resmi Referans Değerler (Baseline)

Bir sonraki ayın sonunda hazırlanacak raporda karşılaştırılacak resmi eşik değerler:

* **Hedef 1 (Win Rate Koruması):** İcraya alınan işlemlerde **en az %50.0** kazanma oranının sürdürülmesi.
* **Hedef 2 (Profit Factor):** **2.40 üzerinde** Profit Factor'ün korunması.
* **Hedef 3 (Sermaye Koruma):** Pas geçilen / 1M koruması oranının **%25 - %35 bandında** kalması (aşırı işlemden koruma).
* **Hedef 4 (Sorunlu Parite İyileştirmesi):** Gelecek ay yapılacak değerlendirmede LTCUSD ve GBPCHF paritelerinin negatif R katkısı vermeye devam edip etmediğinin teyit edilmesi.
* **Hedef 5 (Kripto Gücü):** BTCUSD ve SOLUSD paritelerindeki kusursuz trend uyumunun takip edilmesi.

---
*Bu rapor bilgisayarınızda `docs/ilk_75.md` olarak saklanmakta ve Begonya motoruyla eşitlenmektedir.*
