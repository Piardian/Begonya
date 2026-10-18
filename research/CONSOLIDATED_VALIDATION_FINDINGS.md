# BEGONYA — TOPLU ADVERSARIAL DOĞRULAMA BULGULARI
**Belge Kodu:** `research/CONSOLIDATED_VALIDATION_FINDINGS.md`  
**Tarih:** 14 Ekim 2026 21:40 UTC+3  
**Durum:** Tamamlandı

---

## BULGU ENVENTERİ VE DETAYLI MATRİS

### 1. [BULGU-01] ÖRNEKLEM BOYUTU YETERSİZLİĞİ (INSUFFICIENT SAMPLE SIZE)
- **Önem Derecesi:** **KRİTİK (CRITICAL)**
- **İlgili Dosyalar:** `research/run_true_historical_replay.js` (Satır 466–475), `research/true_historical_replay_results.json`
- **Açıklama:** 1 Nisan – 30 Eylül 2026 arasındaki 6 aylık ham veride 6 sembol üzerinden dondurulmuş kurallarla üretilen gerçek replay'de yalnızca 23 geçerli işlem açılmıştır. Önceden belirlenen dondurulmuş kural barajı ($N \ge 50$) karşılanamamıştır.
- **Kanıt:** 94 sinyalden 65'i limit emir seviyesine fiyat geri çekilmediği için süresi dolarak iptal olmuş (`EXPIRED_UNFILLED`), 6'sı $C/R > 0.25$ nedeniyle elenmiş, geriye yalnızca 23 işlem kalmıştır.
- **Düzeltme Durumu:** Dondurulmuş kurallar gereği yapay işlem eklenemez veya tarih aralığı keyfi uzatılamaz. **Doğrulandı ve DATA INSUFFICIENT kararı verildi.**

---

### 2. [BULGU-02] SİNYAL SAYISI VE DURUM UZLAŞTIRMASI (ARITHMETIC RECONCILIATION)
- **Önem Derecesi:** **YÜKSEK (HIGH)**
- **İlgili Dosyalar:** `research/run_true_historical_replay.js` (Satır 438–456), `research/true_historical_replay_results.json`
- **Açıklama:** Önceki taslak metinlerde 94 sinyal bildirilirken, 65 süresi dolan ve 23 dolan işlem toplamı 88 ediyor ve 6 sinyalin durumu açıklanamıyordu.
- **Kanıt:** Yapılan ham JSON incelemesinde kodun `status === 'FILTERED_CR_EXCEEDED'` etiketi kullandığı, bu 6 sinyalin yapısal maliyet oranının ($C/R > 0.25$) aşılması sebebiyle giriş öncesinde filtrelendiği tespit edildi:
  $$\text{Toplam Sinyal (94)} = \text{Expired (65)} + \text{Filtered C/R (6)} + \text{Filled (23)}$$
- **Düzeltme Durumu:** **Giderildi (RESOLVED)**. Rapor ve adversarial testlerde tam aritmetik uzlaşma sağlandı.

---

### 3. [BULGU-03] FRAKTAL SWING SAĞ TARAF TEYİT KURALI VE NEDENSELLİK
- **Önem Derecesi:** **KRİTİK (CRITICAL - VERIFIED PASS)**
- **İlgili Dosyalar:** `swing-bos-core/src/swingDetector.ts` (Satır 17–57), `swing-bos-core/src/structureDetector.ts` (Satır 47), `research/run_true_historical_replay.js` (Satır 119–137)
- **Açıklama:** Swing tespitinde gelecekteki barların kullanılması riski denetlendi.
- **Kanıt:** 
  - `swingDetector.ts` fraktal tepe/dip için $i+2$ barının kapanışını zorunlu kılmaktadır (`confirmedAtIndex = i + 2`).
  - `structureDetector.ts` yalnızca `s.confirmedAtIndex <= idx` olan swing'leri işlemektedir.
  - 1 Temmuz 2026'da kesilen veri seti ile tam veri seti karşılaştırılmış, 2.344 olayın 2.344'ü de bit-for-bit aynı çıkmıştır (0 sızıntı).
- **Düzeltme Durumu:** **Doğrulandı (VERIFIED PASS)**.

---

### 4. [BULGU-04] ÇOKLU ZAMAN DİLİMİ VE MUM KAPANIŞ HİZALAMASI (LOOK-AHEAD GUARD)
- **Önem Derecesi:** **KRİTİK (CRITICAL - VERIFIED PASS)**
- **İlgili Dosyalar:** `swing-bos-core/server/pipeline.ts` (Satır 284–286, 1211–1224)
- **Açıklama:** Analiz anında henüz kapanmamış mumların analize dahil edilip edilmediği denetlendi.
- **Kanıt:** `filterClosedCandles` fonksiyonu `candle.timestamp + candleDurationMs <= analysisTimestamp` kuralını uygulamaktadır.
  - 15M için: `analysisTimestamp` olan $T$ anında açılan mum elenmekte, son kapalı mum $T-15\text{m}$ olmaktadır.
  - 1H için: Yalnızca $T_{\text{candle}} + 3600 \le T$ olan saatlik mumlar işlenmektedir.
  - İleri işlem simülasyonu ise tam olarak $T$ ve sonrasındaki mumları taramaktadır.
- **Düzeltme Durumu:** **Doğrulandı (VERIFIED PASS)**.

---

### 5. [BULGU-05] AYNI MUMDA SL VE TP ÇAKIŞMASI MUHAFAZAKÂR KURALI
- **Önem Derecesi:** **YÜKSEK (HIGH - VERIFIED PASS)**
- **İlgili Dosyalar:** `research/run_true_historical_replay.js` (Satır 163–171, 204–212)
- **Açıklama:** 15M mum aralığında hem SL hem TP fiyatı görüldüğünde kâr mı yoksa zarar mı yazıldığı denetlendi.
- **Kanıt:** Kodda `if (hitSl && hitTp)` bloğu tanımlanmış ve doğrudan `reason: 'CONFLICT_SL_FIRST'` ile pozisyon SL veya BE olarak kapatılmıştır. Asla kâr yazılmamıştır.
- **Düzeltme Durumu:** **Doğrulandı (VERIFIED PASS)**.

---

### 6. [BULGU-06] MAKRO GATE GERİYE DÖNÜK VERİ SIZINTISI İZOLASYONU
- **Önem Derecesi:** **KRİTİK (CRITICAL - VERIFIED PASS)**
- **İlgili Dosyalar:** `research/run_true_historical_replay.js`, `shared/macro_bias_gate.json`
- **Açıklama:** Statik Ekim 2026 makro rejim dosyasının Nisan–Eylül 2026 işlemlerine geriye dönük uygulanıp uygulanmadığı denetlendi.
- **Kanıt:** Replay motorunda `macro_bias_gate.json` çağrılmamış, test saf SMC olarak izole edilmiştir.
- **Düzeltme Durumu:** **Doğrulandı (VERIFIED PASS)**.

---

### 7. [BULGU-07] MÜKERRER SİNYAL VE POZİSYON AÇILIŞLARI (DEDUPLICATION)
- **Önem Derecesi:** **YÜKSEK (HIGH - VERIFIED PASS)**
- **İlgili Dosyalar:** `research/run_true_historical_replay.js` (Satır 340–369)
- **Açıklama:** Aynı 15M mumda ve aynı yönde hem OB hem FVG oluştuğunda mükerrer emir açılması engellendi mi?
- **Kanıt:** `key = ${sig.symbol}_${sig.signalTs}_${sig.direction}` bazında gruplama yapılmış; önceden belirlenen dondurulmuş kural uyarınca (A+ > A; eşitse OB > FVG) tek bir sinyal seçilmiş ve mükerrer kayıtlar elenmiştir.
- **Düzeltme Durumu:** **Doğrulandı (VERIFIED PASS)**.

---

## DOĞRULAMA ÖZETİ

| Bulgu No | Kategori | Önem | Doğrulama Sonucu | Canlıya Etki |
| :---: | :--- | :---: | :---: | :--- |
| **01** | Örneklem Boyutu | Kritik | **FAIL (N=23 < 50)** | **Canlıya geçiş VETO edildi** |
| **02** | Sinyal Uzlaştırması | Yüksek | **PASS (94 = 65+6+23)** | Muhasebe tam |
| **03** | Swing Look-Ahead | Kritik | **PASS (0 sızıntı)** | Nedensellik tam |
| **04** | Çoklu TF Hizalama | Kritik | **PASS (Closed bar only)** | Nedensellik tam |
| **05** | Çakışma Mantığı | Yüksek | **PASS (SL First)** | Muhafazakâr |
| **06** | Makro İzolasyon | Kritik | **PASS (No leakage)** | Bağımsız |
| **07** | Tekilleştirme | Yüksek | **PASS (1 bar = 1 trade)** | Gerçekçi |
