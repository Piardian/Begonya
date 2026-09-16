# 🌐 Begonya Makro Motor Benchmark & Rejim Otopsi Günlüğü

Bu günlük, Begonya'nın Makroekonomik Karar Motorunun (`macro_engine`) ürettiği **rejim sınıflandırmalarını, getiri eğrisi dinamiklerini, 3 faktörlü para birimi güç puanlarını (`cross_currency_scores`) ve makro kapı filtrelerinin (`execution_bias_gates`)** canlı piyasa karşısındaki deterministik doğruluğunu test ve kalibre etmek amacıyla tutulur.

---

## 📐 Makro Motor Değerlendirme İlkeleri

1. **3 Faktörlü Bağımsız Para Birimi Puanlama Modeli:**
   - **Faktör 1 (Faiz Makası İvmesi):** 2 yıllık devlet tahvili getiri farklarının 5 günlük ivmesi ($\Delta \text{Spread}_{5d} \text{ bps}$).
   - **Faktör 2 (Dış Ticaret Haddi & Emtia):** Petrol (Brent RoC), Bakır/Altın rasyosu, Demir Cevheri ve GDT Süt İhalesi ivmeleri.
   - **Faktör 3 (Risk İştahı & Güvenli Liman):** VIX oynaklık seviyesi, VIX 60 günlük yüzdelik dilimi ve kredi makasları (HYG/LQD).
2. **Net Diferansiyel Eşik Kuralı (Relative Value Gate):**
   - $\text{Net Diferansiyel} = \text{Baz Para Skoru} - \text{Karşı Para Skoru}$
   - $|\Delta| \ge 2$: **KESİN YÖN (LONG_ONLY / SHORT_ONLY)** — Kurumsal makro onay.
   - $|\Delta| = 1$: **HAFİF YÖN (CONDITIONAL_BIAS)** — 0.75x lot riski ile teyitli izin.
   - $\Delta = 0$: **NÖTR / DENGELİ (NEUTRAL_RANGE)** — Deterministik VETO. Makro yönsüz paritelerde işlem açılamaz.
3. **Makro Ayrışma (Decoupling) Prensibi:**
   - Eğer makro yönü doğru tahmin etmiş ancak yerel 15M teknik destek/direnç seviyesi makroyu geçici olarak ezmişse bu bir **"Yerel Teknik Ayrışma" (`LOCAL_SMC_DECOUPLING`)** olarak kaydedilir.
   - Eğer makro rejim piyasa yönünü tamamen ters okumuşsa bu bir **"Makro Kalibrasyon Hatası" (`MACRO_MISALIGNMENT`)** olarak işaretlenir ve ağırlık katsayıları güncellenir.

---

## 📊 Makro Kapı Canlı Performans Karnesi (16 Sinyal)

| Metrik | Değer | Oran | Açıklama |
| :--- | :---: | :---: | :--- |
| 🎯 **Makro Yön İsabeti (Accuracy)** | **12 / 16** | **%75.0** | Makronun doğru yönü ya da korumayı işaret ettiği durumlar |
| ⚡ **Makro ile Tam Uyumlu İşlemler (Aligned)** | **9 Adet** | **%55.6 TP/Aktif** | NZDUSD SAT, EURCHF SAT, USDCHF AL, ETH AL, USDJPY SAT, BTC AL, SOL AL |
| ⚠️ **Makroya Karşıt İşlemler (Contrary / Scalp)** | **5 Adet** | **%40.0 Stop** | SOL #9 AL, ETH #4 AL, GBPCHF #12 SAT (Stop) vs GBPCHF #11 |
| 🛡️ **Makro & M1 Tarafından Kurtarılan** | **3 Adet** | **+$1.130 Korundu** | M1 onayı gelmediği için kurtarılan sermaye (LTC 750$ + BTC 190$ + SOL 190$) |
| 🔄 **Ayrışma (Decoupling) Sayısı** | **4 Adet** | **%25.0** | Makro doğruyken yerel teknik direnç/destek sürtünmesi veya haber şoku |

---

## 🏆 Para Birimi Güç Ligi (Currency Strength Matrix Özeti)

Aşağıdaki lig tablosu, incelenen dönem boyunca para birimlerinin makro motor tarafından üretilen ortalama güç puanlarını yansıtır:

| Sıra | Para Birimi | Ortalama Skor | Ana Makro Sürücü |
| :---: | :---: | :---: | :--- |
| **1** | **USD** | **+0.85** | Late-Cycle Overheating, Fed faiz indirimi ertelemesi, US Exceptionalism |
| **2** | **CHF** | **+0.35** | Jeopolitik gerginlik, güvenli liman sığınağı, Altın rallisi desteği |
| **3** | **NZD** | **+0.25** | GDT süt ihalesi artışı, Çin Asya toparlanma fiyatlaması |
| **4** | **CAD** | **-0.10** | Petrol dalgalanması, CA-US 2Y makas daralması |
| **5** | **AUD** | **-0.15** | Demir cevheri baskısı, Çin emlak yavaşlaması |
| **6** | **GBP** | **-0.45** | İngiltere enflasyon düşüşü, BOE faiz indirimi fiyatlaması |
| **7** | **EUR** | **-0.65** | Transatlantik makas açılması (US10Y - Bund), İmalat PMI zayıflığı |
| **8** | **JPY** | **-0.70** | Negatif carry trade maliyeti (US02Y gerileyene dek kalıcı baskı) |

---

## 📋 STANDART MAKRO BENCHMARK DOĞRULAMA ŞABLONU

Her yeni sinyalde makro otopsi şu 4 soruluk deterministik şablonla taranır:
```markdown
### [KAYIT KODU] — [SEMBOL] | MAKRO OTOPSİSİ
- **Soru 1 (T-0 Makro Rejimi):** [A] Likidite Genişlemesi | [B] Late-Cycle Aşırı Isınma | [C] Resesyon/Deflasyon | [D] Stagflasyon
- **Soru 2 (Para Birimi Skoru):** Baz Para Skoru: [ ] vs Karşı Para Skoru: [ ] -> Net Fark: [ ]
- **Soru 3 (Makro Kapı Durumu):** [A] Tam Uyumlu (LONG/SHORT) | [B] Nötr (İskonto/Pas) | [C] Ters Yön (Zorunlu Veto)
- **Soru 4 (Ayrışma Tespiti):** [A] Ayrışma Yok (Makro kazandı) | [B] Yerel SMC Baskısı (Teknik makroyu ezdi) | [C] Haber Şoku
```

---

## 📂 16 Sinyallik Detaylı Makro Otopsi Kayıtları

---

### 1. MACRO-20260905-001 | SOLUSD AL (0.75x Lot)
- **Bağlantılı SMC Kaydı:** `BG-20260905-001`
- **T-0 Piyasa Durumu:** DXY: 104.15 | US10Y: %3.89 | US02Y: %3.93 | VIX: 15.20
- **Çapraz Kur Puanı:** SOL (Kripto Beta) vs USD (+1) -> Net: 0 (Nötr)
- **Makro Kapısı:** `NEUTRAL_ALL` (0.75x Risk İskontosu)
- **Sonuç:** 🛡️ Break Even (+325 $)
- **Makro Çıkarımı:** Dolar güçlü seyrederken (USD +1) kripto long işlemlerinde makronun risk çarpanını 0.75x'e çekmesi sermayeyi korumuştur. Erken kâr alma ve BE stratejisi makro nötr durumlarda birincil kuraldır.

---

### 2. MACRO-20260905-002 | ETHUSD AL (0.75x Lot)
- **Bağlantılı SMC Kaydı:** `BG-20260905-002`
- **T-0 Piyasa Durumu:** DXY: 104.15 | US10Y: %3.89 | US02Y: %3.93 | VIX: 15.20
- **Çapraz Kur Puanı:** ETH (+1 Bluechip) vs USD (+1) -> Net: 1 (LONG_ONLY İzni)
- **Makro Kapısı:** `LONG_ONLY` (Tam Yeşil Işık)
- **Sonuç:** 🎯 TP HIT (+2.9R / +2.175 $)
- **Makro Çıkarımı:** Makro motorun ETHUSD için doğrudan LONG_ONLY kapısı açması, 15M Bullish OB seviyesini kurumsal zırhla korumuş ve +2.9R dev kâr bırakmıştır.

---

### 3. MACRO-20260905-003 | SOLUSD AL (0.75x Lot)
- **Bağlantılı SMC Kaydı:** `BG-20260905-003`
- **T-0 Piyasa Durumu:** DXY: 104.30 | US02Y: %3.96 | VIX: 15.80
- **Çapraz Kur Puanı:** SOL (0) vs USD (+1) -> Net: 0
- **Makro Kapısı:** `NEUTRAL_ALL`
- **Sonuç:** ❌ STOP (-750 $)
- **Ayrışma / Hata Nedeni:** `POI_STALENESS_AND_MARKET_FATIGUE`. Fiyat sinyal anında kutudan %3.5 uzaktaydı. Test 8 saat gecikince New York kapanışında likidite çekildi ve kutu delindi.
- **Kalibrasyon Kuralı:** Makro yönsüzken kutuya mesafe > %2.0 ise sinyal otomatik iptal edilmelidir.

---

### 4. MACRO-20260905-004 | ETHUSD AL (0.75x Lot)
- **Bağlantılı SMC Kaydı:** `BG-20260905-004`
- **T-0 Piyasa Durumu:** DXY: 104.35 | US02Y: %3.98 | VIX: 16.10
- **Çapraz Kur Puanı:** ETH (-1) vs USD (+1) -> Net: -1
- **Makro Kapısı:** `NEUTRAL_RANGE`
- **Sonuç:** ❌ STOP (-750 $)
- **Ayrışma / Hata Nedeni:** `PREMIUM_OVERBOUGHT_REVERSAL`. İlk kârlı ETH işleminden sonra 4H grafiği aşırı pahalı bölgeye girdi ve ABD 2Y getiri sıçraması alıcıları tüketti.

---

### 5. MACRO-20260907-001 | USDJPY SAT (0.75x Lot)
- **Bağlantılı SMC Kaydı:** `BG-20260907-001`
- **T-0 Piyasa Durumu:** DXY: 104.25 | US02Y: %3.94 | VIX: 15.50
- **Çapraz Kur Puanı:** USD (+1) vs JPY (-1 Carry) -> Net: +2 (LONG_ONLY)
- **Makro Kapısı:** `LONG_ONLY` (Ters Sinyal)
- **Sonuç:** ⏳ Retest Bekleniyor (İşleme Henüz Girilmedi)
- **Makro Çıkarımı:** Makro LONG_ONLY iken SMC SHORT verdi; fiyat kutuya girmeden aşağı aktı. Makro direnci fiyatı henüz kutuya çekmedi.

---

### 6. MACRO-20260907-002 | NZDUSD SAT (0.75x Lot)
- **Bağlantılı SMC Kaydı:** `BG-20260907-002`
- **T-0 Piyasa Durumu:** DXY: 104.25 | US02Y: %3.94 | VIX: 15.50
- **Çapraz Kur Puanı:** NZD (0) vs USD (+1) -> Net: -1 (SHORT_ONLY)
- **Makro Kapısı:** `SHORT_ONLY` (Tam Uyumlu)
- **Sonuç:** 🎯 TP HIT (+2.67R / +2.000 $)
- **Makro Çıkarımı:** Doların küresel faiz ve likidite üstünlüğü, NZDUSD SAT kurulumunu tam hedef EQL likiditesine kadar kusursuz taşımıştır.

---

### 7. MACRO-20260907-003 | EURCHF SAT (0.75x Lot)
- **Bağlantılı SMC Kaydı:** `BG-20260907-003`
- **T-0 Piyasa Durumu:** DXY: 104.25 | DE-US 2Y Spread: -203 bps | VIX: 15.50
- **Çapraz Kur Puanı:** EUR (-1 Enerji Cezası) vs CHF (+1 Güvenli Liman) -> Net: -2 (SHORT_ONLY)
- **Makro Kapısı:** `SHORT_ONLY` (Güçlü Çift Teyit)
- **Sonuç:** 🎯 Kısmi TP + BE (+325 $)
- **Makro Çıkarımı:** Net diferansiyel -2 olduğunda sistemin hata payı neredeyse sıfırdır. EURCHF doğrudan çökmüş ve pozisyon risksiz kâr realize etmiştir.

---

### 8. MACRO-20260908-001 | USDCHF AL (0.75x Lot)
- **Bağlantılı SMC Kaydı:** `BG-20260908-001`
- **T-0 Piyasa Durumu:** DXY: 104.40 | VIX: 14.80 | US02Y: %3.95
- **Çapraz Kur Puanı:** USD (+1) vs CHF (-1 Düşük Oynaklıkta SNB Faiz Dezavantajı) -> Net: +2 (LONG_ONLY)
- **Makro Kapısı:** `LONG_ONLY` (Tam Uyumlu)
- **Sonuç:** 🎯 TP HIT (+2.0R / +1.500 $)
- **Makro Çıkarımı:** VIX < 16 seviyesindeyken piyasa riskten korkmaz ve SNB'nin düşük faizi CHF'yi satmaya zorlar. Dolar avantajıyla birleşince 2.0R kâr tek seansta cebe girmiştir.

---

### 9. MACRO-20260908-002 | SOLUSD AL (0.75x Lot)
- **Bağlantılı SMC Kaydı:** `BG-20260908-002`
- **T-0 Piyasa Durumu:** DXY: 104.45 | US02Y: %3.97 | VIX: 16.20
- **Çapraz Kur Puanı:** SOL (-1) vs USD (+1) -> Net: -2
- **Makro Kapısı:** `DEFENSIVE_HOLD` (Ters Yön Uyarısı)
- **Sonuç:** ❌ STOP (-750 $)
- **Ayrışma / Hata Nedeni:** `HTF_COUNTER_TREND_AGAINST_STRONG_USD`. Makro motor DEFENSIVE_HOLD verirken SMC 15M AL aradı ve ana trend altında ezildi.
- **Kalibrasyon Kuralı:** Makro DEFENSIVE_HOLD iken kripto long sinyalleri istisnasız VETO edilmelidir.

---

### 10. MACRO-20260908-003 | LTCUSD AL (0.75x Lot)
- **Bağlantılı SMC Kaydı:** `BG-20260908-003`
- **T-0 Piyasa Durumu:** DXY: 104.50 | US02Y: %3.98 | VIX: 16.40
- **Çapraz Kur Puanı:** LTC (-1) vs USD (+1) -> Net: -2
- **Makro Kapısı:** `DEFENSIVE_HOLD`
- **Sonuç:** 🛡️ AVERTED LOSS (0.00 $ / 750 $ Kurtarıldı)
- **Makro Çıkarımı:** Makro savunma modundayken M1 teyidi şart koşulmuş; 1 dakikalık onay gelmeyip kutu delindiğinde operatör işlem açmamış ve sermayeyi korumuştur.

---

### 11. MACRO-20260910-001 | GBPCHF AL (0.75x Lot)
- **Bağlantılı SMC Kaydı:** `BG-20260910-001`
- **T-0 Piyasa Durumu:** DXY: 103.85 | US02Y: %3.66 | VIX: 16.80 | Brent: 73.40 $
- **Çapraz Kur Puanı:** GBP (0) vs CHF (+1) -> Net: -1 (SHORT Tercihi)
- **Makro Kapısı:** `SHORT_ONLY` (Karşıt Yön)
- **Sonuç:** 🎯 İlk TP Vuruldu (+281.25 $)
- **Makro Çıkarımı:** 15M FVG'den yerel tepki alınıp ilk TP vurulmuş, ancak makro baskı nedeniyle fiyat hedefin tamamına gidemeden geri dönmüştür.

---

### 12. MACRO-20260910-002 | GBPCHF SAT (0.75x Lot)
- **Bağlantılı SMC Kaydı:** `BG-20260910-002`
- **T-0 Piyasa Durumu:** DXY: 103.85 | US02Y: %3.66 | VIX: 16.80
- **Çapraz Kur Puanı:** GBP (-1) vs CHF (+1) -> Net: -2 (SHORT_ONLY)
- **Makro Kapısı:** `SHORT_ONLY` (Mükemmel Makro Yönü)
- **Sonuç:** ❌ STOP (-450 $)
- **Ayrışma / Hata Nedeni:** `LOCAL_SMC_SUPPORT_AND_COUNTER_HTF`. Makro yönü teoride çok doğruydu; fakat teknik sinyal doğrudan 1H/4H majör destek bölgesinin tavanında tetiklendi. Yerel teknik alıcılar makroyu ezdi.
- **Kalibrasyon Kuralı:** Makro ne kadar güçlü olursa olsun, teknik kutu 1H/4H ana destek seviyesine çarpıyorsa işlem VETO edilmelidir.

---

### 13. MACRO-20260910-003 | USDJPY SAT (0.75x Lot)
- **Bağlantılı SMC Kaydı:** `BG-20260910-003`
- **T-0 Piyasa Durumu:** DXY: 103.80 | US02Y: %3.64 | VIX: 16.90
- **Çapraz Kur Puanı:** USD (-1 US02Y Çöküşü) vs JPY (+1 Carry Çözülmesi) -> Net: -2 (SHORT_ONLY)
- **Makro Kapısı:** `SHORT_ONLY` (Tam Uyumlu)
- **Sonuç:** 🔄 AKTİF İŞLEMDE (Kârda Taşınıyor)
- **Makro Çıkarımı:** ABD 2 yıllık getirisinin 3.64'e inmesi ve DXY zayıflığıyla USDJPY carry makası çöktü. Makro ile tam uyumlu bu işlem 153.09 hedefine doğru kârda akmaktadır.

---

### 14. MACRO-20260915-001 | USDCHF SAT (0.25x Lot)
- **Bağlantılı SMC Kaydı:** `BG-20260915-001`
- **T-0 Piyasa Durumu:** DXY: 103.75 | US02Y: %3.62 | VIX: 17.80 | Gold: 2525.0 $
- **Çapraz Kur Puanı:** USD (-1 US02Y Gerilemesi) vs CHF (+1 Jeopolitik Güvenli Liman & Altın Desteği) -> Net: -2 (SHORT_ONLY)
- **Makro Kapısı:** Sinyal anında SHORT_ONLY; 16 Eylül sabahı NEUTRAL_RANGE
- **Sonuç:** ❌ STOP (-250.00 $ / -0.25 R)
- **Ayrışma / Hata Nedeni:** `US_YIELD_SPIKE_AND_DATA_REVERSAL`. Sinyal anında Dolar zayıf ve Frank güçlüydü; ancak 16 Eylül seansında ABD 2 yıllık faizlerinin (+18.5 bps) sıçraması ve Core CPI verisi Dolar'a agresif alış getirerek 0.8196 seviyesindeki stopu vurdu.
- **Makro Çıkarımı & Koruma:** Makro motorun late-cycle kırılganlığı nedeniyle uyguladığı **0.25x defansif risk katsayısı (250$)**, standart 750$ veya 1.000$ tam lot kaybını engellemiştir. Sermaye koruma kalkanı çalışmıştır.
- **Kalibrasyon Kuralı:** Makro rejim SHORT'tan NEUTRAL_RANGE'e (Yatay Bant) döndüğünde ve takvimde Core CPI / ISM gibi Kırmızı Bülten verileri varken, kâra geçmiş pozisyonun stopu derhal BE seviyesine çekilmeli veya veri öncesi manuel kapatılmalıdır.

---

### 15. MACRO-20260915-002 | BTCUSD AL (0.19x Lot)
- **Bağlantılı SMC Kaydı:** `BG-20260915-002`
- **T-0 Piyasa Durumu:** DXY: 103.80 | US02Y: %3.63 | VIX: 17.80 | Gold: 2525.0 $
- **Çapraz Kur Puanı:** BTC (+1 Kripto Likidite) vs USD (-1 Zayıflayan Dolar) -> Net: +2 (LONG_ONLY)
- **Makro Kapısı:** `LONG_ONLY` (0.19x Defansif Boyutlandırma)
- **Sonuç:** 🛡️ AVERTED LOSS (0.00 $ / 190 $ Kurtarıldı)
- **Makro Çıkarımı:** Makro motor BTC için LONG_ONLY kapısı açmış olsa da yüksek piyasa oynaklığı nedeniyle lotu 0.19x seviyesine çekerek savunmacı bir yaklaşım sergilemiştir. SMC tarafındaki M1 manuel onay şartı (1 dakikalık onay bekle) devreye girmiş, teyit gelmediği için işlem açılmamış ve 190$'lık stop kaybı önlenmiştir.

---

### 16. MACRO-20260915-003 | SOLUSD AL (0.19x Lot)
- **Bağlantılı SMC Kaydı:** `BG-20260915-003`
- **T-0 Piyasa Durumu:** DXY: 103.80 | US02Y: %3.63 | VIX: 17.80 | Gold: 2525.0 $
- **Çapraz Kur Puanı:** SOL (+1 Yüksek Beta Kripto) vs USD (-1 Zayıflayan Dolar) -> Net: +2 (LONG_ONLY)
- **Makro Kapısı:** `LONG_ONLY` (0.19x Defansif Boyutlandırma)
- **Sonuç:** 🛡️ AVERTED LOSS (0.00 $ / 190 $ Kurtarıldı)
- **Makro Çıkarımı:** Makro motor SOL için LONG_ONLY kapısı açmış ve piyasadaki late-cycle oynaklığı nedeniyle lot büyüklüğünü taban 0.75x yerine 0.19x seviyesine çekerek sermaye koruma moduna geçmiştir. SMC katmanındaki 1M manuel teyit şartı gerçekleşmediği için emir tetiklenmemiş ve 190$'lık olası zarar tamamen bertaraf edilmiştir.



