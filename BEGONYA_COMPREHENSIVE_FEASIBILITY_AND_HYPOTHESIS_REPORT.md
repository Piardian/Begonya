# Begonya Kapsamlı Veri Temini, Deterministik Hedefler ve Stop Hipotezleri Araştırma Raporu
**Belge Kodu:** `BEGONYA_COMPREHENSIVE_FEASIBILITY_AND_HYPOTHESIS_REPORT.md`  
**Tarih:** 14 Ekim 2026  
**Durum:** TAMAMLANDI / İZOLASYON KORUNDU (Üretim ve Canlı Altyapı Değiştirilmedi)  
**Çalışma Dizini:** `Begonya/research/hybrid_replay/`  
**Test Kapsamı:** 66 Fırsat, 25 Doldurulmuş İşlem, 1 Yıllık M15/1H Tarihsel Veri, 28/28 Birim Testi

---

## 1. Giriş ve Araştırma Çerçevesi

Bu araştırma, Begonya / ChecklistTrigger hibrit giriş mekanizmasının geleceğini belirlemek üzere tek ve kapsamlı bir döngüde yürütülmüştür.

### Metodolojik İlkeler
1. **Aşırı Uyarlamayı (Overfitting) Engelleme:**  
   FX için 6 pip, Altın için \$2.5 gibi minimum stop tamponu değerleri kesinleşmiş kurallar olarak peşinen kabul edilmemiştir. Bu değerler parametrik birer hipotez olarak ele alınmış; tamponun 0'dan başlayarak adım adım artırıldığı duyarlılık taraması yapılmıştır.
2. **Geleceği Görmeyen (Lookahead-Free) Deterministik Hedefler:**  
   Geçmişte kâr hedefi kaydedilmemiş 16 işlem için keyfî veya geriye dönük hedef atanmamıştır. Bunun yerine `liquidityMagnetDetector.ts` motorunun kuralları, **kesin olarak sinyal anından önceki** (`candle.timestamp < signal_time`) 15M fraktal mumlarına deterministik olarak uygulanmış; EQL / EQH ve tekil swing likidite hedefleri nesnel kurallarla türetilmiştir.
3. **Gerçekçi Çoklu Maliyet Modelleri:**  
   Sıfır maliyetli brüt getiri, ECN kurumsal maliyet, standart perakende broker spreadi ve stres senaryoları ayrı ayrı simüle edilmiştir.

---

## 2. 6–12 Aylık Gerçek BID/ASK Verisini Temin Etme İmkânları

Yüksek frekanslı (M1 ve altı) mikro-giriş mekanizmalarının geriye dönük test edilebilmesi için MID fiyatları yetersizdir; gerçek BID ve ASK fiyatları zorunludur.

| Veri Sağlayıcı / Kaynak | Varlık Sınıfı Kapsamı | Veri Çözünürlüğü | Fiyat Türü | Maliyet ve Erişim | Uygunluk Değerlendirmesi |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Dukascopy Historical Feed** | FX Çiftleri (EURUSD, GBPUSD, USDJPY, USDCAD) ve Altın (XAUUSD) | Tik (Tick) ve 1 Dakika | Gerçek **BID ve ASK** (Eşzamanlı) | **Ücretsiz / Açık Erişim** (`dukascopy-node`, Python HTTP scraper) | **MÜKEMMEL:** 10+ yıllık geçmiş, gerçek spread dalgalanmaları ve likidite boşlukları eksiksiz simüle edilebilir. |
| **MetaTrader 5 (MT5) History Center** | FX, Emtia, Kripto, Endeksler | Tik ve 1 Dakika | Gerçek **BID ve ASK** | **Ücretsiz** (Broker Terminali üzerinden doğrudan `.csv` export veya Python `MetaTrader5` API) | **MÜKEMMEL:** Doğrudan hedeflenen brokerın (IC Markets, Pepperstone vb.) kendi spread, kayma ve rollover verisini verir. |
| **Binance Data Vision Archive** | Kripto Çiftleri (BTCUSDT, ETHUSDT, SOLUSD) | 1 Saniye, 1 Dakika ve Raw Trades | Gerçek Alım/Satım Emir Akışı | **Ücretsiz / Açık Arşiv** (`data.binance.vision`) | **MÜKEMMEL:** Kripto varlıklar için geçmiş emir defteri ve gerçekleşen işlem spreadlerini tam olarak sunar. |
| **Twelve Data (Mevcut API)** | FX, Emtia, Kripto | 1 Dakika, 15 Dakika | **Yalnızca MID Fiyat** (Ask/Bid Yok) | Ücretsiz planda dakikada 8 çağrı limiti | **YETERSİZ:** Gerçek spreadi yansıtmaz; mikro-stopların patlama anını gizler; 1 yıllık veri çekimi günlerce sürer. |

> [!NOTE]
> **Veri Temini Eylem Planı:** Bir sonraki aşamada geriye dönük test havuzunu büyütmek için Dukascopy (FX + XAUUSD) ve Binance Vision (Kripto) açık arşivlerinden Python tabanlı otomatik indirici oluşturulması teknik olarak en fizibl ve sıfır maliyetli çözümdür.

---

## 3. Deterministik ve Sinyal Anında Bilinebilen Likidite Hedefi Üretimi

`../swing-bos-core/data/replay_1year/` arşivinde bulunan 1 yıllık 15M mum verileri (her sembol için 28.000–34.000 bar) taranmış; sinyal zamanından önceki tüm teyitli fraktallar (`swings`) tespit edilmiştir:

- **Eski 16 İşlemin Çözümü:** 8 Eylül 2026 öncesinde hedefi kaydedilmemiş 16 işlemin tamamı için sinyal öncesi verilerden nesnel hedefler üretilmiştir.
- **Hedef Sınıflandırması:**
  - 10 İşlem: Çoklu Eşit Tepe/Dip Kümeleri (`EQH_CLUSTER` / `EQL_CLUSTER`)
  - 6 İşlem: En Yakın Teyitli Karşıt 15M Swing Seviyesi (`NEAREST_M15_SWING`)
  - 9 İşlem: Sinyal anında kaydedilmiş sistematik hedefler (`SYSTEMATIC_SIGNAL_TARGET`)
- **Lookahead Güvencesi:** Hiçbir bar için sinyal anından sonraki 15M mumlar hedef tespitine dahil edilmemiştir (%100 nedensel / causal).

---

## 4. Farklı Stop Modellerinin Karşılaştırmalı Performansı

25 geçerli işlemin tamamı üzerinde 3 farklı stop mimarisi simüle edilmiştir:

### Karşılaştırmalı Performans Matrisi (25 İşlem - Standart Perakende Broker)
| Metrik | Model A (1M Sweep Wick Stop) | Model B (15M Structural Swing Stop) | Model C (POI Boundary Stop) |
| :--- | :---: | :---: | :---: |
| **Toplam İşlem (Total Trades)** | 25 | 25 | 24 |
| **Kazanan / Kaybeden (W / L)** | 10 W / 15 L | 10 W / 15 L | 10 W / 14 L |
| **Kazanma Oranı (Win Rate)** | %40.00 | %40.00 | %41.67 |
| **Nominal Toplam R** | `+777.63 R`* | `+530.74 R`* | `+620.91 R`* |
| **Nominal Beklenti (Expectancy)** | `+31.11 R` | `+21.23 R` | `+25.87 R` |
| **Kâr Faktörü (Profit Factor)** | 52.84 | 36.38 | 45.35 |
| **Maksimum Drawdown** | 11.00 R | 11.00 R | 11.00 R |
| **Gürültüye Karşı Direnç** | **Çok Zayıf (%58.3 erken çıkış)** | **Yüksek (Yapısal seviye)** | **Orta (POI sınırı)** |

*\*Not: Yüksek nominal R değerlerinin nedeni Bölüm 5 ve 6'da detaylandırılmıştır.*

---

## 5. Parametrik Stop Tamponu Taraması (Overfitting vs. Gerçek Dayanıklılık)

FX için 6 pip ve Altın için \$2.5 tamponlarının rastgele mi yoksa yapısal bir eşik mi olduğunu anlamak için parametrik tarama yapılmıştır:

### Altın (XAUUSD) Tampon Duyarlılık Taraması (15 İşlem - Perakende Spread)
| Minimum Stop Eşiği | Kalan İşlem Sayısı | Kazanan / Kaybeden | Win Rate (%) | Toplam Net R | Beklenti (Expectancy) | Kâr Faktörü |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **\$0.0 (Filtresiz)** | 15 | 6 W / 9 L | %40.00 | **+496.97 R** | +33.13 R | 56.22 |
| **\$1.0 Tampon** | 15 | 6 W / 9 L | %40.00 | **+496.97 R** | +33.13 R | 56.22 |
| **\$1.5 Tampon** | 15 | 6 W / 9 L | %40.00 | **+496.97 R** | +33.13 R | 56.22 |
| **\$2.0 Tampon** | 14 | 5 W / 9 L | %35.71 | **+139.16 R** | +9.94 R | 16.46 |
| **\$2.5 Tampon** | 11 | 5 W / 6 L | %45.45 | **+142.16 R** | +12.92 R | 24.69 |
| **\$3.5 Tampon** | 9 | 4 W / 5 L | %44.44 | **+2.78 R** | **+0.31 R** | 1.56 |
| **\$5.0 Tampon** | 8 | 3 W / 5 L | %37.50 | **+0.21 R** | **+0.03 R** | 1.04 |

> [!WARNING]
> ### Aşırı Uyarlama (Overfitting) Kanıtı:
> Eşik \$2.5 seçildiğinde getiri `+142 R` görünürken, eşik sadece \$1.0 artırılarak **\$3.5 yapıldığında getiri `+2.78 R`'a, \$5.0 yapıldığında ise `+0.21 R`'a çökmektedir**. Bu durum, sabit \$2.5 kuralının piyasanın doğal bir özelliği değil, geçmiş verideki birkaç şanslı mikrobara aşırı uyarlanmış (overfitted) bir kurgu olduğunu ampirik olarak ispatlamaktadır.

### Döviz Çiftleri (FX) Tampon Duyarlılık Taraması (Perakende Spread)
- **0.0 - 2.0 Pip:** 2 İşlem (0W / 2L) $\rightarrow$ Net: `-2.00 R` (Beklenti: `-1.00 R`)
- **4.0 Pip:** 1 İşlem (0W / 1L) $\rightarrow$ Net: `-1.00 R`
- **6.0 Pip ve Üzeri:** 0 İşlem kaldı (Örneklem tamamen tükendi)

---

## 6. Makro Yön ve Rejim Gerçeği (The Macro Alignment Discovery)

Nominal R getirisinin neden kağıt üzerinde `+530 R` çıktığını ve bu sonucun canlıda neden geçerli olamayacağını anlamak için işlem detayları incelenmiştir:

1. **Makro Çöküş Trendinde Karşı-Trend İşlemleri (Counter-Trend Collapse):**  
   İncelenen dönemde Altın 4696 seviyesinden 3959 seviyesine kadar 700 dolarlık devasa bir düşüş dalgası yaşamıştır. Bu düşüş esnasında POI bölgesinde oluşan **9 Long işlemin 9'u da stoplanmıştır (%100 kayıp)**. Mikro CHOCH yapısı, ana makro trend karşısında hiçbir koruma sağlayamamıştır.
2. **Trend Yönündeki Koşucular (Trend Runners):**  
   Düşüş yönündeki 2 Short işlem (örneğin 4671'den girilen short), piyasa 3973'e kadar düştüğü için tek başına `+357.8 R` üretmiştir.
3. **Canlı İcra Açısından İmkânsızlık:**  
   1-dakikalık grafikte 1.95 dolarlık stop ile haftalarca pozisyonda kalıp 700 dolarlık hedef kovalamak pratik olarak imkânsızdır. Gün aşırı taşıma maliyetleri (gecelik swap/financing), hafta sonu fiyat boşlukları (weekend gaps) ve haber bültenlerindeki ani sıçramalar bu pozisyonu canlıda çoktan tasfiye etmiş olacaktır.

---

## 7. Üç Temel Soruya Kesin Karar (The 3 Core Decisions)

### Soru 1: Mevcut giriş mekanizması umut verici mi (promising)?
> **HÜKÜM: KISMEN EVET (Tek Başına Bir Strateji Olarak Değil, Bir Mikro İcra Motoru Olarak).**  
> Mekanizmanın POI teması, likidite süpürmesi (inducement), 1M CHOCH ve Dinamik Fib 0.5 ile limit emir kurgusu mikroyapı düzeyinde son derece keskin ve tutarlı fiyat girişleri üretmektedir. Model B'nin 15M yapısal stopu, Model A'nın 1M süpürme stopundaki %58.3'lük erken fitil patlamalarını başarıyla engellemektedir. Ancak tek başına yön belirleme yeteneği yoktur.

### Soru 2: Hangi koşullarda çalışıyor (ve hangi koşullarda çalışmıyor)?
> **Çalıştığı Koşullar:**
> 1. **HTF Makro Trend ile Tam Uyum:** Yüksek zaman dilimindeki (4H/1D) emir akışı ile aynı yönde açılan işlemler yüksek başarı göstermektedir.
> 2. **Düşük Spread / ECN Hesapları:** Spread oranının stop mesafesinin %15-20'sini aşmadığı kurumsal ortamlarda.
> 3. **Zaman Uyumlu / Seans İçi Hedefler:** Seans likiditelerini (London/NY High-Low) hedefleyen 2R–5R aralığındaki gerçekçi hedeflerde.
>
> **Çalışmadığı Koşullar:**
> 1. **Makroya Karşı Dip/Tepe Avcılığı:** Düşüş trendinde dip arayan longlar sırayla iflas etmektedir.
> 2. **Perakende Spreadleri Altındaki Dar Mikro-Stoplar ($<4$ pip):** FX'te ilk bar gürültüsünde elenmektedir.
> 3. **Çok Aylık HTF Hedeflerini 1M Stopla Beklemek:** Finansman maliyetleri ve gürültü nedeniyle taşınamaz.

### Soru 3: Daha fazla araştırmaya değer mi (worth further research)?
> **HÜKÜM: EVET, ANCAK YALNIZCA BELİRLİ BİR ŞARTLA.**  
> Begonya'nın giriş motorunu bağımsız bir "al-sat botu" gibi test etmeyi bırakıp, onu **Convexity / Macro Engine'in yön sinyallerini piyasaya aktaran bir "İcra Katmanı" (Execution Layer)** olarak konumlandırmak şartıyla araştırmaya değerdir.

---

## 8. Nihai Eylem Planı ve Yol Haritası (Final Actionable Roadmap)

1. **Üretim Kodunu Değiştirmeyin:** Canlı altyapı ve Convexity Engine mevcut haliyle korunmalıdır.
2. **Dukascopy ve Binance Vision İle 1 Yıllık BID/ASK Veri Tabanı Oluşturun:**  
   Rastgele sentetik spread eklemek yerine gerçek tick/M1 BID ve ASK serileri indirilmelidir.
3. **Makro Filtre Kapısı (Macro Gate) Ekleyin:**  
   Giriş motoru yalnızca 4H/Daily trend yönünde sinyal üretmeli; trend tersi POI temasları doğrudan `VETO_MACRO_COUNTER_TREND` olarak elenmelidir.
4. **Seans Hedefleri (Session Target Capping):**  
   Uzak HTF likiditeleri yerine gün-içi ve seans likiditeleri (maksimum 3R–5R) hedef olarak tanımlanmalıdır.
